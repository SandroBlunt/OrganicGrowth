import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  nextReady,
  markRunning,
  markAwaitingCast,
  markCastConsumed,
  markDone,
  markFailed,
  requeueFailed,
} from "./scheduler.ts";
import type { JobRef, QueueJob, QueueState } from "./queue.ts";

const BRAND = "test-brand";

/** Build a job with overridable fields (defaults to the shared `test-brand`). */
function job(over: Partial<QueueJob> & Pick<QueueJob, "idea_id">): QueueJob {
  return {
    brand: BRAND,
    phase: "cast",
    status: "queued",
    enqueued_at: "2026-06-05T10:00:00.000Z",
    ...over,
  };
}

/** The composite lock ref for an Idea of the default `test-brand`. */
function ref(ideaId: string, brand: string = BRAND): JobRef {
  return { brand, idea_id: ideaId };
}

/** Build a queue state from jobs + an optional active lock (a composite `JobRef`). */
function queue(jobs: QueueJob[], active: JobRef | null = null): QueueState {
  return { jobs, lock: { active_job: active } };
}

describe("nextReady — FIFO by acceptance time", () => {
  it("returns the earliest-enqueued queued job, not the array-first one", () => {
    // Array order is deliberately NOT acceptance order, to prove FIFO is by timestamp.
    const state = queue([
      job({ idea_id: "idea-late", enqueued_at: "2026-06-05T12:00:00.000Z" }),
      job({ idea_id: "idea-early", enqueued_at: "2026-06-05T09:00:00.000Z" }),
      job({ idea_id: "idea-mid", enqueued_at: "2026-06-05T10:30:00.000Z" }),
    ]);
    const ready = nextReady(state);
    assert.equal(ready?.idea_id, "idea-early");
  });

  it("returns nothing for an empty queue", () => {
    assert.equal(nextReady(queue([])), null);
  });

  it("returns nothing when there is no queued job (all terminal/gated)", () => {
    const state = queue([
      job({ idea_id: "idea-A", status: "done" }),
      job({ idea_id: "idea-B", status: "failed" }),
      job({ idea_id: "idea-C", status: "awaiting_cast" }),
    ]);
    assert.equal(nextReady(state), null);
  });

  it("is pure: it never mutates the input state", () => {
    const state = queue([job({ idea_id: "idea-A" })]);
    const snapshot = JSON.stringify(state);
    nextReady(state);
    assert.equal(JSON.stringify(state), snapshot);
  });
});

describe("nextReady — single-Space lock (≤1 running)", () => {
  it("returns nothing while a job is running", () => {
    const state = queue(
      [
        job({ idea_id: "idea-run", status: "running", enqueued_at: "2026-06-05T09:00:00.000Z" }),
        job({ idea_id: "idea-wait", enqueued_at: "2026-06-05T10:00:00.000Z" }),
      ],
      ref("idea-run"),
    );
    assert.equal(nextReady(state), null);
  });

  it("returns nothing when the lock is held even if no job is marked running", () => {
    // Defensive: a held lock alone bars a new start.
    const state = queue([job({ idea_id: "idea-wait" })], ref("idea-some-active"));
    assert.equal(nextReady(state), null);
  });
});

describe("nextReady — gate does not hold the Space", () => {
  it("skips an awaiting_cast job and returns the next queued job", () => {
    const state = queue([
      job({ idea_id: "idea-gated", status: "awaiting_cast", enqueued_at: "2026-06-05T09:00:00.000Z" }),
      job({ idea_id: "idea-next", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" }),
    ]);
    const ready = nextReady(state);
    assert.equal(ready?.idea_id, "idea-next");
  });
});

describe("nextReady — failure isolation", () => {
  it("skips a failed job and returns a later queued job", () => {
    const state = queue([
      job({ idea_id: "idea-broke", status: "failed", enqueued_at: "2026-06-05T09:00:00.000Z" }),
      job({ idea_id: "idea-ok", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" }),
    ]);
    const ready = nextReady(state);
    assert.equal(ready?.idea_id, "idea-ok");
  });
});

describe("markRunning", () => {
  it("moves a queued job to running and sets the lock", () => {
    const before = queue([job({ idea_id: "idea-A" }), job({ idea_id: "idea-B", enqueued_at: "2026-06-05T11:00:00.000Z" })]);
    const result = markRunning(before, BRAND, "idea-A");
    assert.equal(result.ok, true);
    const after = result.state;
    const a = after.jobs.find((j) => j.idea_id === "idea-A")!;
    assert.equal(a.status, "running");
    assert.deepEqual(after.lock.active_job, ref("idea-A"));
    // exactly one running job
    assert.equal(after.jobs.filter((j) => j.status === "running").length, 1);
  });

  it("refuses to start a second run while the lock is held", () => {
    const before = queue(
      [job({ idea_id: "idea-A", status: "running" }), job({ idea_id: "idea-B", enqueued_at: "2026-06-05T11:00:00.000Z" })],
      ref("idea-A"),
    );
    const result = markRunning(before, BRAND, "idea-B");
    assert.equal(result.ok, false);
    assert.equal(result.code, "space_busy");
    // queue unchanged on refusal
    assert.equal(JSON.stringify(result.state), JSON.stringify(before));
  });

  it("refuses an unknown Idea", () => {
    const before = queue([job({ idea_id: "idea-A" })]);
    const result = markRunning(before, BRAND, "idea-ZZZ");
    assert.equal(result.ok, false);
    assert.equal(result.code, "unknown_job");
  });

  it("refuses to run a job that is not queued", () => {
    const before = queue([job({ idea_id: "idea-A", status: "done" })]);
    const result = markRunning(before, BRAND, "idea-A");
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_transition");
  });

  it("is pure: it never mutates the input state", () => {
    const before = queue([job({ idea_id: "idea-A" })]);
    const snapshot = JSON.stringify(before);
    markRunning(before, BRAND, "idea-A");
    assert.equal(JSON.stringify(before), snapshot);
  });
});

describe("markAwaitingCast", () => {
  it("moves a running cast job to awaiting_cast and releases the lock", () => {
    const before = queue([job({ idea_id: "idea-A", phase: "cast", status: "running" })], ref("idea-A"));
    const result = markAwaitingCast(before, BRAND, "idea-A");
    assert.equal(result.ok, true);
    const a = result.state.jobs.find((j) => j.idea_id === "idea-A")!;
    assert.equal(a.status, "awaiting_cast");
    assert.equal(result.state.lock.active_job, null);
  });

  it("refuses when the job is not running", () => {
    const before = queue([job({ idea_id: "idea-A", phase: "cast", status: "queued" })]);
    const result = markAwaitingCast(before, BRAND, "idea-A");
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_transition");
    assert.equal(JSON.stringify(result.state), JSON.stringify(before));
  });
});

describe("markCastConsumed — the Cast gate clears when the Operator picks (C24)", () => {
  it("moves an awaiting_cast cast job to done and leaves the lock untouched", () => {
    const before = queue([job({ idea_id: "idea-A", phase: "cast", status: "awaiting_cast" })]);
    const result = markCastConsumed(before, BRAND, "idea-A");
    assert.equal(result.ok, true);
    const a = result.state.jobs.find((j) => j.idea_id === "idea-A")!;
    assert.equal(a.status, "done", "the cleared gate is a terminal record, not a pending gate");
    assert.equal(result.state.lock.active_job, null);
  });

  it("preserves a held lock (clearing a gate never touches the running job's lock)", () => {
    const before = queue(
      [
        job({ idea_id: "idea-run", status: "running", enqueued_at: "2026-06-05T09:00:00.000Z" }),
        job({ idea_id: "idea-gate", phase: "cast", status: "awaiting_cast", enqueued_at: "2026-06-05T10:00:00.000Z" }),
      ],
      ref("idea-run"),
    );
    const result = markCastConsumed(before, BRAND, "idea-gate");
    assert.equal(result.ok, true);
    assert.deepEqual(result.state.lock.active_job, ref("idea-run"), "the running job's lock is kept");
  });

  it("refuses an unknown (brand, idea_id) with unknown_job", () => {
    const before = queue([job({ idea_id: "idea-A", phase: "cast", status: "awaiting_cast" })]);
    assert.equal(markCastConsumed(before, "other-brand", "idea-A").code, "unknown_job");
    assert.equal(markCastConsumed(before, BRAND, "idea-ZZZ").code, "unknown_job");
  });

  it("refuses when no job for the Idea is awaiting_cast (e.g. a re-pick after the gate cleared)", () => {
    const before = queue([job({ idea_id: "idea-A", phase: "cast", status: "done" })]);
    const result = markCastConsumed(before, BRAND, "idea-A");
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_transition");
    assert.equal(JSON.stringify(result.state), JSON.stringify(before));
  });

  it("targets the awaiting_cast cast job, not the Idea's separate queued render job", () => {
    // An Idea can hold BOTH an awaiting_cast cast job and a later queued render job at once.
    const before = queue([
      job({ idea_id: "idea-A", phase: "cast", status: "awaiting_cast", enqueued_at: "2026-06-05T10:00:00.000Z" }),
      job({ idea_id: "idea-A", phase: "render", status: "queued", enqueued_at: "2026-06-05T11:00:00.000Z", character: "cast-2" }),
    ]);
    const result = markCastConsumed(before, BRAND, "idea-A");
    assert.equal(result.ok, true);
    const castJob = result.state.jobs.find((j) => j.phase === "cast")!;
    const renderJob = result.state.jobs.find((j) => j.phase === "render")!;
    assert.equal(castJob.status, "done", "the cast gate cleared");
    assert.equal(renderJob.status, "queued", "the render job is untouched and still runnable");
  });
});

describe("markDone", () => {
  it("moves a running job to done and releases the lock", () => {
    const before = queue([job({ idea_id: "idea-A", phase: "render", status: "running" })], ref("idea-A"));
    const result = markDone(before, BRAND, "idea-A");
    assert.equal(result.ok, true);
    const a = result.state.jobs.find((j) => j.idea_id === "idea-A")!;
    assert.equal(a.status, "done");
    assert.equal(result.state.lock.active_job, null);
  });

  it("refuses to complete a job that is not running", () => {
    const before = queue([job({ idea_id: "idea-A", status: "queued" })]);
    const result = markDone(before, BRAND, "idea-A");
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_transition");
    assert.equal(JSON.stringify(result.state), JSON.stringify(before));
  });
});

describe("markFailed", () => {
  it("moves a running job to failed and releases the lock", () => {
    const before = queue([job({ idea_id: "idea-A", status: "running" })], ref("idea-A"));
    const result = markFailed(before, BRAND, "idea-A");
    assert.equal(result.ok, true);
    const a = result.state.jobs.find((j) => j.idea_id === "idea-A")!;
    assert.equal(a.status, "failed");
    assert.equal(result.state.lock.active_job, null);
  });

  it("frees the Space so a later queued job becomes ready", () => {
    const before = queue(
      [
        job({ idea_id: "idea-A", status: "running", enqueued_at: "2026-06-05T09:00:00.000Z" }),
        job({ idea_id: "idea-B", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" }),
      ],
      ref("idea-A"),
    );
    const result = markFailed(before, BRAND, "idea-A");
    assert.equal(result.ok, true);
    // after the failure, nextReady returns the later queued job
    assert.equal(nextReady(result.state)?.idea_id, "idea-B");
  });
});

describe("lifecycle integration — queued → running → done", () => {
  it("advances a job end to end, keeping the lock in step", () => {
    let state = queue([job({ idea_id: "idea-A", phase: "render" })]);
    const run = markRunning(state, BRAND, "idea-A");
    assert.equal(run.ok, true);
    assert.deepEqual(run.state.lock.active_job, ref("idea-A"));
    state = run.state;
    const done = markDone(state, BRAND, "idea-A");
    assert.equal(done.ok, true);
    assert.equal(done.state.jobs[0]!.status, "done");
    assert.equal(done.state.lock.active_job, null);
  });
});

describe("transitions are keyed on (brand, idea_id) — no cross-Brand collision (C6)", () => {
  it("markRunning targets the named Brand's job, not another Brand's same Idea id", () => {
    // Two Brands both hold idea-X. Only Brand alpha's job may be started, and the lock must name alpha.
    const before = queue([
      job({ idea_id: "idea-X", brand: "alpha", enqueued_at: "2026-06-05T09:00:00.000Z" }),
      job({ idea_id: "idea-X", brand: "beta", enqueued_at: "2026-06-05T10:00:00.000Z" }),
    ]);
    const result = markRunning(before, "alpha", "idea-X");
    assert.equal(result.ok, true);
    const alpha = result.state.jobs.find((j) => j.brand === "alpha")!;
    const beta = result.state.jobs.find((j) => j.brand === "beta")!;
    assert.equal(alpha.status, "running", "alpha's job runs");
    assert.equal(beta.status, "queued", "beta's identically-named job is untouched");
    assert.deepEqual(result.state.lock.active_job, ref("idea-X", "alpha"));
  });

  it("markFailed on one Brand does not touch the other Brand's same-id job", () => {
    const before = queue(
      [
        job({ idea_id: "idea-X", brand: "alpha", status: "running", enqueued_at: "2026-06-05T09:00:00.000Z" }),
        job({ idea_id: "idea-X", brand: "beta", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" }),
      ],
      ref("idea-X", "alpha"),
    );
    const result = markFailed(before, "alpha", "idea-X");
    assert.equal(result.ok, true);
    assert.equal(result.state.jobs.find((j) => j.brand === "alpha")!.status, "failed");
    assert.equal(result.state.jobs.find((j) => j.brand === "beta")!.status, "queued");
  });
});

describe("requeueFailed — revive a failed job so its Idea can be produced again (C4)", () => {
  it("moves a failed job back to queued and leaves the lock untouched", () => {
    const before = queue([job({ idea_id: "idea-A", status: "failed" })]);
    const result = requeueFailed(before, BRAND, "idea-A");
    assert.equal(result.ok, true);
    assert.equal(result.state.jobs[0]!.status, "queued");
    assert.equal(result.state.lock.active_job, null);
    // the revived job is now startable
    assert.equal(nextReady(result.state)?.idea_id, "idea-A");
  });

  it("preserves a held lock (reviving a failed job never starts a run)", () => {
    const before = queue(
      [
        job({ idea_id: "idea-run", status: "running", enqueued_at: "2026-06-05T09:00:00.000Z" }),
        job({ idea_id: "idea-A", status: "failed", enqueued_at: "2026-06-05T10:00:00.000Z" }),
      ],
      ref("idea-run"),
    );
    const result = requeueFailed(before, BRAND, "idea-A");
    assert.equal(result.ok, true);
    assert.deepEqual(result.state.lock.active_job, ref("idea-run"), "the running job's lock is kept");
  });

  it("refuses an unknown (brand, idea_id) with unknown_job", () => {
    const before = queue([job({ idea_id: "idea-A", status: "failed" })]);
    assert.equal(requeueFailed(before, "other-brand", "idea-A").code, "unknown_job");
    assert.equal(requeueFailed(before, BRAND, "idea-ZZZ").code, "unknown_job");
  });

  it("refuses when the job exists but is not failed", () => {
    const before = queue([job({ idea_id: "idea-A", status: "queued" })]);
    const result = requeueFailed(before, BRAND, "idea-A");
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_transition");
    assert.equal(JSON.stringify(result.state), JSON.stringify(before));
  });
});
