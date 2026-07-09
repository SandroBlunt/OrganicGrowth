import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  drain,
  tick,
  type WorkerDeps,
  type LedgerWrites,
  type SpaceSession,
  type SpaceOpResult,
} from "./worker.ts";
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
    assert.deepEqual(queue.get().lock.active_job, { brand: BRAND_A, idea_id: "idea-A" }); // single-Space lock held
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
    let s = enqueueRender(emptyQueue(), "idea-A", T0, BRAND_A, "cast-3");
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
    assert.deepEqual(queue.get().lock.active_job, { brand: BRAND_B, idea_id: "idea-B" });
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
    const s = enqueueRender(emptyQueue(), "idea-B", T0, BRAND_B, "cast-2");
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
    s = enqueueRender(s, "idea-A", T1, BRAND_A, "cast-4");
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
    // C1: the Operator's chosen Character on the render job reaches the render and the Asset — no default.
    assert.equal(cap.assets[0]!.asset.character, "cast-4", "the render must pin the picked Character");
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
    assert.deepEqual(queue.get().lock.active_job, { brand: BRAND_B, idea_id: "idea-good" }); // lock freed, then good started
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

// --- Crash-safety, correlation, and multi-process robustness (C3/C14/C15/C16/C17) -------------------

/** Build WorkerDeps over an in-memory queue with a CUSTOM SpaceSession/QueuePersistence for edge cases. */
function makeCustomDeps(opts: {
  persistence: WorkerDeps["queue"];
  session: SpaceSession;
  now: () => string;
  makeLedger?: (brand: string) => LedgerWrites;
}) {
  const cap = brandCaptures();
  const { notify, notifications } = makeNotifier();
  const deps: WorkerDeps = {
    queue: opts.persistence,
    resolveLedger: opts.makeLedger ?? ((brand: string) => cap.makeLedger(brand)),
    space: opts.session,
    notify,
    now: opts.now,
  };
  return { deps, cap, notifications };
}

describe("C3 — restart recovery: a job stranded `running` by a crash is reset, not deadlocked", () => {
  it("marks a stranded running job failed on tick, releases the lock, notifies, and advances", async () => {
    // A fresh process: the queue file says idea-stranded is running+locked (a crash left it so), but the
    // in-memory session knows nothing about it (inFlight === false, poll === null).
    const s: QueueState = {
      jobs: [
        { idea_id: "idea-stranded", brand: BRAND_A, phase: "cast", status: "running", enqueued_at: T0 },
        { idea_id: "idea-next", brand: BRAND_B, phase: "cast", status: "queued", enqueued_at: T1 },
      ],
      lock: { active_job: { brand: BRAND_A, idea_id: "idea-stranded" } },
    };
    const when = "2026-06-05T15:00:00.000Z";
    const { deps, queue, session, notifications } = makeDeps(s, {}, [when]);
    assert.equal(session.inFlight(), false); // a fresh session — the running job is orphaned

    const result = await tick(deps);

    // The stranded job was recovered to failed (lock released) and the notification explains WHEN + WHY.
    assert.equal(result.reaped, "failed");
    const stranded = queue.get().jobs.find((j) => j.idea_id === "idea-stranded")!;
    assert.equal(stranded.status, "failed");
    assert.equal(notifications.length, 1);
    assert.ok(notifications[0]!.includes("idea-stranded"));
    assert.ok(notifications[0]!.includes(when), "notification must state WHEN");
    assert.ok(/STRANDED/i.test(notifications[0]!), "notification must flag the stranded job");
    assert.ok(notifications[0]!.includes("requeueFailed"), "notification must point to the escape hatch");
    // With the lock freed, the next queued job proceeds unattended — no permanent deadlock.
    assert.equal(result.drain.started?.idea_id, "idea-next");
    const next = queue.get().jobs.find((j) => j.idea_id === "idea-next")!;
    assert.equal(next.status, "running");
    assert.deepEqual(queue.get().lock.active_job, { brand: BRAND_B, idea_id: "idea-next" });
  });
});

describe("C3 — a `space.start` that throws is rolled back (job failed, lock released)", () => {
  it("does not strand the job when start throws: marks it failed, frees the lock, notifies", async () => {
    const q = memQueue(enqueue(emptyQueue(), "idea-A", T0, BRAND_A));
    const when = "2026-06-05T15:30:00.000Z";
    const session: SpaceSession = {
      inFlight: () => false,
      start: async () => {
        throw new Error("MCP connect failed");
      },
      poll: async () => null,
    };
    const { deps, notifications } = makeCustomDeps({
      persistence: q.persistence,
      session,
      now: () => when,
    });

    const result = await drain(deps);

    assert.equal(result.started, null); // the op was not (cannot be) considered started
    const job = q.get().jobs.find((j) => j.idea_id === "idea-A")!;
    assert.equal(job.status, "failed"); // rolled back, not left `running`
    assert.equal(q.get().lock.active_job, null); // lock released — the queue is not deadlocked
    assert.equal(notifications.length, 1);
    assert.ok(notifications[0]!.includes("idea-A"));
    assert.ok(notifications[0]!.includes(when));
    assert.ok(notifications[0]!.includes("requeueFailed"));
  });
});

describe("C17/C14 — a result is bound by its stamped (brand, idea_id), never to 'whichever is running'", () => {
  it("notifies and writes NO ledger when a terminal result matches no running job", async () => {
    // The session surfaces a completed CAST stamped for idea-A, but the only running job is idea-B — a
    // misbinding scenario (hand-edited queue / broken ≤1-running invariant). The result must NOT be
    // written into idea-B's ledger, and the finished outcome must not vanish silently.
    const s: QueueState = {
      jobs: [{ idea_id: "idea-B", brand: BRAND_B, phase: "cast", status: "running", enqueued_at: T0 }],
      lock: { active_job: { brand: BRAND_B, idea_id: "idea-B" } },
    };
    const q = memQueue(s);
    const when = "2026-06-05T16:00:00.000Z";
    const orphan: SpaceOpResult = {
      ok: true,
      idea_id: "idea-A",
      brand: BRAND_A,
      outcome: { phase: "cast", cast: [{ identifier: "cast-1", url: "https://x/1.png" }] },
    };
    let handed = false;
    const session: SpaceSession = {
      inFlight: () => false,
      start: async () => {},
      poll: async () => {
        if (handed) return null;
        handed = true;
        return orphan;
      },
    };
    const { deps, cap, notifications } = makeCustomDeps({
      persistence: q.persistence,
      session,
      now: () => when,
    });

    const result = await tick(deps);

    assert.equal(result.reaped, null); // nothing was reaped — the result had no home
    // idea-B's ledger was NOT written from idea-A's result (no misbinding, C17).
    assert.equal(cap.casts.length, 0);
    assert.equal(cap.statuses.length, 0);
    assert.equal(cap.assets.length, 0);
    // idea-B is left untouched (still running) — we did not steal its slot.
    const idB = q.get().jobs.find((j) => j.idea_id === "idea-B")!;
    assert.equal(idB.status, "running");
    // C14: the orphaned finished outcome is surfaced, not dropped silently.
    assert.equal(notifications.length, 1);
    assert.ok(notifications[0]!.includes("idea-A"), "notification must name the orphaned Idea");
    assert.ok(notifications[0]!.includes(when));
    assert.ok(/could NOT be recorded|no matching/i.test(notifications[0]!));
  });
});

describe("C15 — a ledger-write failure during reap does not deadlock or lose the Asset silently", () => {
  it("cast reap: writeCast throws → job failed, lock released, Operator notified", async () => {
    const q = memQueue(enqueue(emptyQueue(), "idea-A", T0, BRAND_A));
    const when = "2026-06-05T16:30:00.000Z";
    const session = new FakeSpaceSession();
    const { deps, notifications } = makeCustomDeps({
      persistence: q.persistence,
      session,
      now: () => when,
      makeLedger: () => ({
        writeCast: async () => {
          throw new Error("brand dir deleted");
        },
        writeAsset: async () => {},
        writeStatus: async () => {},
      }),
    });

    await drain(deps); // starts idea-A's cast-gen
    session.advance();
    const result = await tick(deps); // reap → writeCast throws

    assert.equal(result.reaped, "failed");
    const job = q.get().jobs.find((j) => j.idea_id === "idea-A")!;
    assert.equal(job.status, "failed"); // not left `running`
    assert.equal(q.get().lock.active_job, null); // lock released — no C3-style deadlock
    assert.equal(notifications.length, 1);
    assert.ok(notifications[0]!.includes("idea-A"));
    assert.ok(notifications[0]!.includes(when));
    assert.ok(notifications[0]!.includes("requeueFailed"));
  });

  it("render reap: writeAsset throws → job failed, lock released, Operator notified", async () => {
    const q = memQueue(enqueueRender(emptyQueue(), "idea-A", T0, BRAND_A, "cast-2"));
    const when = "2026-06-05T16:45:00.000Z";
    const session = new FakeSpaceSession();
    const { deps, notifications } = makeCustomDeps({
      persistence: q.persistence,
      session,
      now: () => when,
      makeLedger: () => ({
        writeCast: async () => {},
        writeAsset: async () => {
          throw new Error("disk full");
        },
        writeStatus: async () => {},
      }),
    });

    await drain(deps); // starts idea-A's render
    session.advance();
    const result = await tick(deps); // reap → writeAsset throws

    assert.equal(result.reaped, "failed");
    const job = q.get().jobs.find((j) => j.idea_id === "idea-A")!;
    assert.equal(job.status, "failed");
    assert.equal(q.get().lock.active_job, null);
    assert.equal(notifications.length, 1);
    assert.ok(notifications[0]!.includes("idea-A"));
    assert.ok(notifications[0]!.includes("requeueFailed"));
  });
});

describe("C16 — best-effort lock re-read: abort the start if a concurrent writer took the lock", () => {
  it("does not start a second Space op when the re-read lock names a different job", async () => {
    const initial = enqueue(emptyQueue(), "idea-A", T0, BRAND_A);
    let loads = 0;
    let saved: QueueState | null = null;
    const persistence = {
      load: async (): Promise<QueueState> => {
        loads++;
        if (loads === 1) return initial; // first load: lock free, idea-A queued
        // The C16 re-read (immediately before start): a concurrent process already grabbed the lock.
        return {
          jobs: [
            { idea_id: "idea-A", brand: BRAND_A, phase: "cast", status: "queued", enqueued_at: T0 },
            { idea_id: "idea-Z", brand: BRAND_B, phase: "cast", status: "running", enqueued_at: T1 },
          ],
          lock: { active_job: { brand: BRAND_B, idea_id: "idea-Z" } },
        };
      },
      save: async (st: QueueState) => {
        saved = st;
      },
    };
    const session = new FakeSpaceSession();
    const { deps, notifications } = makeCustomDeps({
      persistence,
      session,
      now: () => "2026-06-05T17:00:00.000Z",
    });

    const result = await drain(deps);

    assert.equal(result.started, null); // aborted — we did not double-drive the Space
    assert.equal(session.started.length, 0); // the Space op was NEVER started
    assert.equal(notifications.length, 0); // a race-abort is silent (not a failure)
    assert.notEqual(saved, null); // our markRunning save did happen (best-effort, not airtight)
  });

  it("starts normally when the re-read lock still names our own job (no race)", async () => {
    const initial = enqueue(emptyQueue(), "idea-A", T0, BRAND_A);
    const { deps, session } = makeDeps(initial);

    const result = await drain(deps);

    assert.equal(result.started?.idea_id, "idea-A");
    assert.equal(session.started.length, 1); // the re-read confirmed our lock → the op started
  });
});
