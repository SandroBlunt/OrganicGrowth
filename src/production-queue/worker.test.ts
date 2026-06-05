import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { drain, tick, type WorkerDeps } from "./worker.ts";
import {
  emptyQueue,
  enqueue,
  enqueueRender,
  type QueueState,
} from "./queue.ts";
import {
  FakeSpaceSession,
  type FakeSpaceSessionOptions,
} from "../space-driver/fixtures/fake-space.ts";
import type { LedgerCastCandidate, LedgerAsset } from "../ledger/ledger.ts";

/** An in-memory QueuePersistence so the worker is exercised without touching disk. */
function memQueue(initial: QueueState) {
  let state = initial;
  return {
    persistence: {
      load: async () => state,
      save: async (s: QueueState) => {
        state = s;
      },
    },
    get: () => state,
  };
}

/** A capturing LedgerWrites + notifier so tests assert what the worker wrote/notified (no disk). */
function captures() {
  const casts: Array<{ ideaId: string; cast: readonly LedgerCastCandidate[] }> = [];
  const assets: Array<{ ideaId: string; asset: LedgerAsset }> = [];
  const statuses: Array<{ ideaId: string; status: "casting" | "produced" }> = [];
  const notifications: string[] = [];
  return {
    ledger: {
      writeCast: async (ideaId: string, cast: readonly LedgerCastCandidate[]) => {
        casts.push({ ideaId, cast });
      },
      writeAsset: async (ideaId: string, asset: LedgerAsset) => {
        assets.push({ ideaId, asset });
      },
      writeStatus: async (ideaId: string, status: "casting" | "produced") => {
        statuses.push({ ideaId, status });
      },
    },
    notify: (m: string) => notifications.push(m),
    casts,
    assets,
    statuses,
    notifications,
  };
}

/** Assemble WorkerDeps over an in-memory queue, capturing ledger/notifier, and a FakeSpaceSession. */
function makeDeps(
  initial: QueueState,
  sessionOpts: FakeSpaceSessionOptions = {},
  nowSeq: string[] = ["2026-06-05T12:00:00.000Z"],
) {
  const q = memQueue(initial);
  const cap = captures();
  const session = new FakeSpaceSession(sessionOpts);
  let i = 0;
  const deps: WorkerDeps = {
    queue: q.persistence,
    ledger: cap.ledger,
    space: session,
    notify: cap.notify,
    now: () => nowSeq[Math.min(i++, nowSeq.length - 1)]!,
  };
  return { deps, queue: q, session, cap };
}

const T0 = "2026-06-05T10:00:00.000Z";
const T1 = "2026-06-05T10:01:00.000Z";

describe("drain — serialized, at most one Space op (AC1)", () => {
  it("starts exactly one ready cast-gen, takes the lock, and exits", async () => {
    const initial = enqueue(emptyQueue(), "idea-A", T0);
    const { deps, queue, session } = makeDeps(initial);

    const result = await drain(deps);

    assert.equal(result.started?.idea_id, "idea-A");
    assert.equal(session.started.length, 1); // exactly one Space op started
    assert.equal(session.inFlight(), true); // the op is in flight (Space busy)
    const job = queue.get().jobs.find((j) => j.idea_id === "idea-A")!;
    assert.equal(job.status, "running");
    assert.equal(queue.get().lock.active_job, "idea-A"); // single-Space lock held
  });

  it("never starts a second op while one is running (FIFO picks the earliest)", async () => {
    let s = enqueue(emptyQueue(), "idea-late", T1);
    s = enqueue(s, "idea-early", T0); // array order != acceptance order
    const { deps, session } = makeDeps(s);

    await drain(deps); // starts idea-early (earliest enqueued_at)
    const second = await drain(deps); // Space busy → no-op

    assert.equal(session.started.length, 1);
    assert.equal(session.started[0]!.ideaId, "idea-early");
    assert.equal(second.started, null);
  });

  it("is a clean no-op when nothing is ready", async () => {
    const { deps, session } = makeDeps(emptyQueue());
    const result = await drain(deps);
    assert.equal(result.started, null);
    assert.equal(session.started.length, 0);
  });
});

describe("tick — reap a completed op and advance unattended (AC4)", () => {
  it("does nothing while the op is still in flight", async () => {
    const initial = enqueue(emptyQueue(), "idea-A", T0);
    const { deps, session } = makeDeps(initial);
    await drain(deps); // op in flight, NOT advanced

    const result = await tick(deps); // poll returns running

    assert.equal(result.reaped, null);
    assert.equal(session.inFlight(), true);
  });

  it("reaps a render that completed while idle and STARTS the next queued job, no Operator action", async () => {
    // A render job (Cast picked) plus a later queued cast-gen; Space free.
    let s = enqueueRender(emptyQueue(), "idea-A", T0);
    s = enqueue(s, "idea-B", T1); // a different Idea's cast-gen, queued behind the render
    const { deps, queue, session, cap } = makeDeps(s, {}, ["2026-06-05T12:00:00.000Z"]);

    await drain(deps); // starts idea-A's render (earliest enqueued_at)
    session.advance(); // the render completes WHILE the Operator is idle
    const result = await tick(deps); // the periodic tick reaps it AND advances the queue

    assert.equal(result.reaped, "render");
    const render = queue.get().jobs.find((j) => j.idea_id === "idea-A")!;
    assert.equal(render.status, "done");
    // the tick started the NEXT queued job with no Operator action
    assert.equal(result.drain.started?.idea_id, "idea-B");
    const next = queue.get().jobs.find((j) => j.idea_id === "idea-B")!;
    assert.equal(next.status, "running");
    assert.equal(queue.get().lock.active_job, "idea-B");
    // ledger: produced + the Asset fields, derived from the render→done transition
    assert.deepEqual(cap.statuses, [{ ideaId: "idea-A", status: "produced" }]);
    assert.equal(cap.assets.length, 1);
    assert.equal(cap.assets[0]!.asset.asset_url.length > 0, true);
    assert.equal(cap.assets[0]!.asset.produced_at, "2026-06-05T12:00:00.000Z"); // injected clock
    // generate-never-publish: no publish notification, no post action
    assert.equal(cap.notifications.length, 0);
  });
});

describe("gate releases the Space — a later cast-gen proceeds while a gated Idea waits (AC2)", () => {
  it("reaps the first cast-gen to awaiting_cast and starts the second while the first waits", async () => {
    let s = enqueue(emptyQueue(), "idea-1", T0);
    s = enqueue(s, "idea-2", T1);
    const { deps, queue, session, cap } = makeDeps(s);

    await drain(deps); // starts idea-1's cast-gen
    assert.equal(session.started.length, 1);
    assert.equal(session.started[0]!.ideaId, "idea-1");

    session.advance(); // idea-1 reaches the Cast gate
    const result = await tick(deps); // reap idea-1 → awaiting_cast (lock freed), then start idea-2

    assert.equal(result.reaped, "cast");
    const j1 = queue.get().jobs.find((j) => j.idea_id === "idea-1")!;
    const j2 = queue.get().jobs.find((j) => j.idea_id === "idea-2")!;
    assert.equal(j1.status, "awaiting_cast"); // first waits at its gate
    assert.equal(j2.status, "running"); // second proceeds while the first waits
    // ledger: idea-1 recorded its Cast + casting status
    assert.deepEqual(cap.statuses, [{ ideaId: "idea-1", status: "casting" }]);
    assert.equal(cap.casts[0]!.ideaId, "idea-1");
    assert.equal(cap.casts[0]!.cast.length, 6);

    // The gated idea-1 is never re-run; exactly one op is ever in flight.
    assert.equal(session.started.length, 2);
    assert.deepEqual(session.started.map((o) => o.ideaId), ["idea-1", "idea-2"]);
    assert.equal(session.inFlight(), true); // idea-2 in flight; idea-1 NOT re-started
  });
});

describe("pick-cast enqueues the render and the worker renders it (AC3)", () => {
  it("a render job queued after a cast gate is started and reaped to produced", async () => {
    // idea-A's cast is at the gate; picking the Cast enqueued a render.
    let s: QueueState = {
      jobs: [{ idea_id: "idea-A", phase: "cast", status: "awaiting_cast", enqueued_at: T0 }],
      lock: { active_job: null },
    };
    s = enqueueRender(s, "idea-A", T1);
    const { deps, queue, session, cap } = makeDeps(s);

    const started = await drain(deps); // render starts (cast job is awaiting_cast, skipped)
    assert.equal(started.started?.phase, "render");
    session.advance();
    await tick(deps);

    const render = queue.get().jobs.find((j) => j.phase === "render")!;
    assert.equal(render.status, "done");
    assert.deepEqual(cap.statuses, [{ ideaId: "idea-A", status: "produced" }]);
    assert.equal(cap.assets.length, 1);
  });
});

describe("failure isolation + notification (AC6)", () => {
  it("marks a failed op failed, releases the lock, notifies when+why, and continues", async () => {
    let s = enqueue(emptyQueue(), "idea-bad", T0);
    s = enqueue(s, "idea-good", T1);
    const when = "2026-06-05T13:30:00.000Z";
    const { deps, queue, session, cap } = makeDeps(s, { castFails: true }, [when]);

    await drain(deps); // starts idea-bad's cast-gen (which will fail)
    session.advance();
    const result = await tick(deps); // reap the failure, then continue

    assert.equal(result.reaped, "failed");
    const bad = queue.get().jobs.find((j) => j.idea_id === "idea-bad")!;
    assert.equal(bad.status, "failed"); // stays in the queue, surfaced to the Operator
    assert.equal(queue.get().lock.active_job, "idea-good"); // lock freed, then good started
    // failure isolation: the queue continued with the next job
    const good = queue.get().jobs.find((j) => j.idea_id === "idea-good")!;
    assert.equal(good.status, "running");
    // notification carries WHEN (the injected timestamp) and WHY (the driver's code)
    assert.equal(cap.notifications.length, 1);
    assert.ok(cap.notifications[0]!.includes(when), "notification must state WHEN");
    assert.ok(cap.notifications[0]!.includes("idea-bad"), "notification must name the Idea");
    assert.match(cap.notifications[0]!, /inject_unconfirmed|inject_edit_failed/); // WHY (driver code)
    // a failed Idea's ledger status is NOT advanced — no fabricated Cast/Asset
    assert.equal(cap.casts.find((c) => c.ideaId === "idea-bad"), undefined);
    assert.equal(cap.statuses.find((st) => st.ideaId === "idea-bad"), undefined);
  });
});
