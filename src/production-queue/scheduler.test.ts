import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  nextReady,
  markRunning,
  markAwaitingCast,
  markDone,
  markFailed,
} from "./scheduler.ts";
import type { QueueJob, QueueState } from "./queue.ts";

/** Build a job with overridable fields. */
function job(over: Partial<QueueJob> & Pick<QueueJob, "idea_id">): QueueJob {
  return {
    phase: "cast",
    status: "queued",
    enqueued_at: "2026-06-05T10:00:00.000Z",
    ...over,
  };
}

/** Build a queue state from jobs + an optional active lock. */
function queue(jobs: QueueJob[], active: string | null = null): QueueState {
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
      "idea-run",
    );
    assert.equal(nextReady(state), null);
  });

  it("returns nothing when the lock is held even if no job is marked running", () => {
    // Defensive: a held lock alone bars a new start.
    const state = queue([job({ idea_id: "idea-wait" })], "idea-some-active");
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
    const result = markRunning(before, "idea-A");
    assert.equal(result.ok, true);
    const after = result.state;
    const a = after.jobs.find((j) => j.idea_id === "idea-A")!;
    assert.equal(a.status, "running");
    assert.equal(after.lock.active_job, "idea-A");
    // exactly one running job
    assert.equal(after.jobs.filter((j) => j.status === "running").length, 1);
  });

  it("refuses to start a second run while the lock is held", () => {
    const before = queue(
      [job({ idea_id: "idea-A", status: "running" }), job({ idea_id: "idea-B", enqueued_at: "2026-06-05T11:00:00.000Z" })],
      "idea-A",
    );
    const result = markRunning(before, "idea-B");
    assert.equal(result.ok, false);
    assert.equal(result.code, "space_busy");
    // queue unchanged on refusal
    assert.equal(JSON.stringify(result.state), JSON.stringify(before));
  });

  it("refuses an unknown Idea", () => {
    const before = queue([job({ idea_id: "idea-A" })]);
    const result = markRunning(before, "idea-ZZZ");
    assert.equal(result.ok, false);
    assert.equal(result.code, "unknown_job");
  });

  it("refuses to run a job that is not queued", () => {
    const before = queue([job({ idea_id: "idea-A", status: "done" })]);
    const result = markRunning(before, "idea-A");
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_transition");
  });

  it("is pure: it never mutates the input state", () => {
    const before = queue([job({ idea_id: "idea-A" })]);
    const snapshot = JSON.stringify(before);
    markRunning(before, "idea-A");
    assert.equal(JSON.stringify(before), snapshot);
  });
});

describe("markAwaitingCast", () => {
  it("moves a running cast job to awaiting_cast and releases the lock", () => {
    const before = queue([job({ idea_id: "idea-A", phase: "cast", status: "running" })], "idea-A");
    const result = markAwaitingCast(before, "idea-A");
    assert.equal(result.ok, true);
    const a = result.state.jobs.find((j) => j.idea_id === "idea-A")!;
    assert.equal(a.status, "awaiting_cast");
    assert.equal(result.state.lock.active_job, null);
  });

  it("refuses when the job is not running", () => {
    const before = queue([job({ idea_id: "idea-A", phase: "cast", status: "queued" })]);
    const result = markAwaitingCast(before, "idea-A");
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_transition");
    assert.equal(JSON.stringify(result.state), JSON.stringify(before));
  });
});

describe("markDone", () => {
  it("moves a running job to done and releases the lock", () => {
    const before = queue([job({ idea_id: "idea-A", phase: "render", status: "running" })], "idea-A");
    const result = markDone(before, "idea-A");
    assert.equal(result.ok, true);
    const a = result.state.jobs.find((j) => j.idea_id === "idea-A")!;
    assert.equal(a.status, "done");
    assert.equal(result.state.lock.active_job, null);
  });

  it("refuses to complete a job that is not running", () => {
    const before = queue([job({ idea_id: "idea-A", status: "queued" })]);
    const result = markDone(before, "idea-A");
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_transition");
    assert.equal(JSON.stringify(result.state), JSON.stringify(before));
  });
});

describe("markFailed", () => {
  it("moves a running job to failed and releases the lock", () => {
    const before = queue([job({ idea_id: "idea-A", status: "running" })], "idea-A");
    const result = markFailed(before, "idea-A");
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
      "idea-A",
    );
    const result = markFailed(before, "idea-A");
    assert.equal(result.ok, true);
    // after the failure, nextReady returns the later queued job
    assert.equal(nextReady(result.state)?.idea_id, "idea-B");
  });
});

describe("lifecycle integration — queued → running → done", () => {
  it("advances a job end to end, keeping the lock in step", () => {
    let state = queue([job({ idea_id: "idea-A", phase: "render" })]);
    const run = markRunning(state, "idea-A");
    assert.equal(run.ok, true);
    assert.equal(run.state.lock.active_job, "idea-A");
    state = run.state;
    const done = markDone(state, "idea-A");
    assert.equal(done.ok, true);
    assert.equal(done.state.jobs[0]!.status, "done");
    assert.equal(done.state.lock.active_job, null);
  });
});
