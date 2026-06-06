import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { drain, tick, type WorkerDeps, type LedgerWrites } from "./worker.ts";
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

const BRAND_A = "alpha";
const BRAND_B = "beta";

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

/** A per-brand capturing LedgerWrites so tests assert which brand was written to. */
function brandCaptures() {
  const casts: Array<{ brand: string; ideaId: string; cast: readonly LedgerCastCandidate[] }> = [];
  const assets: Array<{ brand: string; ideaId: string; asset: LedgerAsset }> = [];
  const statuses: Array<{ brand: string; ideaId: string; status: "casting" | "produced" }> = [];

  function makeLedger(brand: string): LedgerWrites {
    return {
      writeCast: async (ideaId, cast) => { casts.push({ brand, ideaId, cast }); },
      writeAsset: async (ideaId, asset) => { assets.push({ brand, ideaId, asset }); },
      writeStatus: async (ideaId, status) => { statuses.push({ brand, ideaId, status }); },
    };
  }

  return { makeLedger, casts, assets, statuses };
}

/** A capturing notifier. */
function makeNotifier() {
  const notifications: string[] = [];
  return { notify: (m: string) => notifications.push(m), notifications };
}

/**
 * Assemble WorkerDeps over an in-memory queue, brand-aware capturing ledger, and a FakeSpaceSession.
 * `resolveLedger(brand)` returns a brand-scoped LedgerWrites so tests can assert per-brand writes.
 */
function makeDeps(
  initial: QueueState,
  sessionOpts: FakeSpaceSessionOptions = {},
  nowSeq: string[] = ["2026-06-05T12:00:00.000Z"],
  opts: { unresolvedBrand?: string } = {},
) {
  const q = memQueue(initial);
  const cap = brandCaptures();
  const { notify, notifications } = makeNotifier();
  const session = new FakeSpaceSession(sessionOpts);
  let i = 0;

  const deps: WorkerDeps = {
    queue: q.persistence,
    resolveLedger: (brand: string) => {
      if (opts.unresolvedBrand === brand) {
        throw new Error(`no ledger for brand "${brand}"`);
      }
      return cap.makeLedger(brand);
    },
    space: session,
    notify,
    now: () => nowSeq[Math.min(i++, nowSeq.length - 1)]!,
  };
  return { deps, queue: q, session, cap, notifications };
}

const T0 = "2026-06-05T10:00:00.000Z";
const T1 = "2026-06-05T10:01:00.000Z";

describe("drain — serialized, at most one Space op (AC1)", () => {
  it("starts exactly one ready cast-gen, takes the lock, and exits", async () => {
    const initial = enqueue(emptyQueue(), "idea-A", T0, BRAND_A);
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
    let s = enqueue(emptyQueue(), "idea-late", T1, BRAND_A);
    s = enqueue(s, "idea-early", T0, BRAND_B); // array order != acceptance order
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
    const initial = enqueue(emptyQueue(), "idea-A", T0, BRAND_A);
    const { deps, session } = makeDeps(initial);
    await drain(deps); // op in flight, NOT advanced

    const result = await tick(deps); // poll returns running

    assert.equal(result.reaped, null);
    assert.equal(session.inFlight(), true);
  });

  it("reaps a render that completed while idle and STARTS the next queued job, no Operator action", async () => {
    // A render job (Cast picked) plus a later queued cast-gen; Space free.
    let s = enqueueRender(emptyQueue(), "idea-A", T0, BRAND_A);
    s = enqueue(s, "idea-B", T1, BRAND_B); // a different Idea's cast-gen, queued behind the render
    const { deps, queue, session, cap, notifications } = makeDeps(s, {}, ["2026-06-05T12:00:00.000Z"]);

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
    assert.deepEqual(cap.statuses.map((s) => ({ ideaId: s.ideaId, status: s.status })),
      [{ ideaId: "idea-A", status: "produced" }]);
    assert.equal(cap.assets.length, 1);
    assert.equal(cap.assets[0]!.asset.asset_url.length > 0, true);
    assert.equal(cap.assets[0]!.asset.produced_at, "2026-06-05T12:00:00.000Z"); // injected clock
    // generate-never-publish: no publish notification, no post action
    assert.equal(notifications.length, 0);
  });
});

describe("brand-routed ledger writes — each job writes to its own Brand's ledger (AC3)", () => {
  it("a cast job for Brand A writes to Brand A's ledger only — Brand B is not touched", async () => {
    // Only Brand A's cast job in the queue.
    const s = enqueue(emptyQueue(), "idea-A", T0, BRAND_A);
    const { deps, session, cap } = makeDeps(s);

    await drain(deps);
    session.advance();
    await tick(deps); // reaps the cast-gen to awaiting_cast

    assert.equal(cap.casts.length, 1);
    assert.equal(cap.casts[0]!.brand, BRAND_A);
    assert.equal(cap.statuses.length, 1);
    assert.equal(cap.statuses[0]!.brand, BRAND_A);
    // Brand B was never touched
    assert.equal(cap.casts.filter((c) => c.brand === BRAND_B).length, 0);
    assert.equal(cap.statuses.filter((s) => s.brand === BRAND_B).length, 0);
  });

  it("a render job for Brand B writes to Brand B's ledger only — Brand A is not touched", async () => {
    const s = enqueueRender(emptyQueue(), "idea-B", T0, BRAND_B);
    const { deps, session, cap } = makeDeps(s, {}, ["2026-06-05T12:00:00.000Z"]);

    await drain(deps);
    session.advance();
    await tick(deps); // reaps the render to done

    assert.equal(cap.assets.length, 1);
    assert.equal(cap.assets[0]!.brand, BRAND_B);
    assert.equal(cap.statuses.length, 1);
    assert.equal(cap.statuses[0]!.brand, BRAND_B);
    // Brand A was never touched
    assert.equal(cap.assets.filter((a) => a.brand === BRAND_A).length, 0);
  });

  it("two Brands' casts in one queue each write to the correct Brand's ledger (AC3, AC4)", async () => {
    // Brand A's cast first, Brand B's cast second.
    let s = enqueue(emptyQueue(), "idea-A1", T0, BRAND_A);
    s = enqueue(s, "idea-B1", T1, BRAND_B);
    const { deps, session, cap } = makeDeps(s);

    // Drain starts Brand A's cast-gen (earliest enqueued_at).
    await drain(deps);
    assert.equal(session.started[0]!.ideaId, "idea-A1");

    // Brand A's cast completes → awaiting_cast, lock released.
    session.advance();
    const r1 = await tick(deps); // reap A → awaiting_cast, start Brand B's cast

    assert.equal(r1.reaped, "cast");
    assert.equal(r1.drain.started?.idea_id, "idea-B1");

    // Brand A's cast write goes to BRAND_A's ledger.
    assert.equal(cap.casts.filter((c) => c.brand === BRAND_A && c.ideaId === "idea-A1").length, 1);
    assert.equal(cap.statuses.filter((s) => s.brand === BRAND_A && s.ideaId === "idea-A1").length, 1);
    // Brand B's ledger has not been written yet (B's cast is still running).
    assert.equal(cap.casts.filter((c) => c.brand === BRAND_B).length, 0);

    // Brand B's cast completes → awaiting_cast, lock released.
    session.advance();
    await tick(deps);

    // Brand B's cast write goes to BRAND_B's ledger.
    assert.equal(cap.casts.filter((c) => c.brand === BRAND_B && c.ideaId === "idea-B1").length, 1);
    assert.equal(cap.statuses.filter((s) => s.brand === BRAND_B && s.ideaId === "idea-B1").length, 1);
    // Brand A's ledger was written exactly once (no cross-contamination).
    assert.equal(cap.casts.filter((c) => c.brand === BRAND_A).length, 1);
  });
});

describe("gate releases the Space — a later cast-gen proceeds while a gated Idea waits (AC4)", () => {
  it("reaps the first cast-gen to awaiting_cast and starts the second while the first waits", async () => {
    let s = enqueue(emptyQueue(), "idea-1", T0, BRAND_A);
    s = enqueue(s, "idea-2", T1, BRAND_B);
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
    // ledger: idea-1 recorded its Cast + casting status (routed to BRAND_A)
    assert.equal(cap.statuses.filter((s) => s.ideaId === "idea-1")[0]!.brand, BRAND_A);
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
      jobs: [{ idea_id: "idea-A", brand: BRAND_A, phase: "cast", status: "awaiting_cast", enqueued_at: T0 }],
      lock: { active_job: null },
    };
    s = enqueueRender(s, "idea-A", T1, BRAND_A);
    const { deps, queue, session, cap } = makeDeps(s);

    const started = await drain(deps); // render starts (cast job is awaiting_cast, skipped)
    assert.equal(started.started?.phase, "render");
    session.advance();
    await tick(deps);

    const render = queue.get().jobs.find((j) => j.phase === "render")!;
    assert.equal(render.status, "done");
    assert.equal(cap.statuses.filter((s) => s.ideaId === "idea-A")[0]!.brand, BRAND_A);
    assert.equal(cap.assets.length, 1);
    assert.equal(cap.assets[0]!.brand, BRAND_A);
  });
});

describe("failure isolation + notification (AC1)", () => {
  it("marks a failed op failed, releases the lock, notifies when+why, and continues", async () => {
    let s = enqueue(emptyQueue(), "idea-bad", T0, BRAND_A);
    s = enqueue(s, "idea-good", T1, BRAND_B);
    const when = "2026-06-05T13:30:00.000Z";
    const { deps, queue, session, notifications } = makeDeps(s, { castFails: true }, [when]);

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
    assert.equal(notifications.length, 1);
    assert.ok(notifications[0]!.includes(when), "notification must state WHEN");
    assert.ok(notifications[0]!.includes("idea-bad"), "notification must name the Idea");
    assert.match(notifications[0]!, /inject_unconfirmed|inject_edit_failed/); // WHY (driver code)
  });
});

describe("defensive drop: unresolvable brand — drain does not crash (AC1, AC3)", () => {
  it("marks the unresolvable-brand job failed, notifies, releases lock, and continues with next job", async () => {
    // idea-X has an unresolvable brand; idea-Y has a resolvable brand and should run after.
    let s = enqueue(emptyQueue(), "idea-X", T0, "no-such-brand");
    s = enqueue(s, "idea-Y", T1, BRAND_A);
    const when = "2026-06-05T14:00:00.000Z";
    const { deps, queue, session, notifications } = makeDeps(
      s,
      {},
      [when],
      { unresolvedBrand: "no-such-brand" },
    );

    await drain(deps); // starts idea-X's cast-gen
    session.advance();
    const result = await tick(deps); // reap: brand resolution fails → failed, then drain idea-Y

    assert.equal(result.reaped, "failed");
    const badJob = queue.get().jobs.find((j) => j.idea_id === "idea-X")!;
    assert.equal(badJob.status, "failed");
    // The drain continued with idea-Y (lock released after brand failure).
    const goodJob = queue.get().jobs.find((j) => j.idea_id === "idea-Y")!;
    assert.equal(goodJob.status, "running");
    // Operator was notified about when and the bad brand.
    assert.equal(notifications.length, 1);
    assert.ok(notifications[0]!.includes(when), "notification must state WHEN");
    assert.ok(notifications[0]!.includes("idea-X"), "notification must name the Idea");
    assert.ok(notifications[0]!.includes("no-such-brand"), "notification must name the bad brand");
  });
});
