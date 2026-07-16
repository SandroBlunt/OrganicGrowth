import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  nextReady,
  markRunning,
  markAwaitingPick,
  markPickConsumed,
  markDone,
  markFailed,
  requeueFailed,
} from "./scheduler.ts";
import type { JobRef, QueueJob, QueueState } from "./queue.ts";

const BRAND = "test-brand";
const RECIPE = "character-explainer-with-cast";

/** Build a job with overridable fields (defaults to the shared `test-brand`/RECIPE). */
function job(over: Partial<QueueJob> & Pick<QueueJob, "idea_id">): QueueJob {
  return {
    brand: BRAND,
    recipe: RECIPE,
    gate: "cast",
    status: "queued",
    enqueued_at: "2026-06-05T10:00:00.000Z",
    ...over,
  };
}

/** The composite lock ref for an Idea/Recipe of the default `test-brand`. */
function ref(ideaId: string, brand: string = BRAND, recipe: string = RECIPE): JobRef {
  return { brand, idea_id: ideaId, recipe };
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
      job({ idea_id: "idea-C", status: "awaiting_pick" }),
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
  it("skips an awaiting_pick job and returns the next queued job", () => {
    const state = queue([
      job({ idea_id: "idea-gated", status: "awaiting_pick", enqueued_at: "2026-06-05T09:00:00.000Z" }),
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
    const result = markRunning(before, BRAND, "idea-A", RECIPE);
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
    const result = markRunning(before, BRAND, "idea-B", RECIPE);
    assert.equal(result.ok, false);
    assert.equal(result.code, "space_busy");
    // queue unchanged on refusal
    assert.equal(JSON.stringify(result.state), JSON.stringify(before));
  });

  it("refuses an unknown Idea", () => {
    const before = queue([job({ idea_id: "idea-A" })]);
    const result = markRunning(before, BRAND, "idea-ZZZ", RECIPE);
    assert.equal(result.ok, false);
    assert.equal(result.code, "unknown_job");
  });

  it("refuses a known Idea but unknown Recipe (composite key, issue #56)", () => {
    const before = queue([job({ idea_id: "idea-A" })]);
    const result = markRunning(before, BRAND, "idea-A", "carousel");
    assert.equal(result.ok, false);
    assert.equal(result.code, "unknown_job");
  });

  it("refuses to run a job that is not queued", () => {
    const before = queue([job({ idea_id: "idea-A", status: "done" })]);
    const result = markRunning(before, BRAND, "idea-A", RECIPE);
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_transition");
  });

  it("is pure: it never mutates the input state", () => {
    const before = queue([job({ idea_id: "idea-A" })]);
    const snapshot = JSON.stringify(before);
    markRunning(before, BRAND, "idea-A", RECIPE);
    assert.equal(JSON.stringify(before), snapshot);
  });
});

describe("markAwaitingPick", () => {
  it("moves a running job to awaiting_pick and releases the lock", () => {
    const before = queue([job({ idea_id: "idea-A", status: "running" })], ref("idea-A"));
    const result = markAwaitingPick(before, BRAND, "idea-A", RECIPE);
    assert.equal(result.ok, true);
    const a = result.state.jobs.find((j) => j.idea_id === "idea-A")!;
    assert.equal(a.status, "awaiting_pick");
    assert.equal(result.state.lock.active_job, null);
  });

  it("refuses when the job is not running", () => {
    const before = queue([job({ idea_id: "idea-A", status: "queued" })]);
    const result = markAwaitingPick(before, BRAND, "idea-A", RECIPE);
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_transition");
    assert.equal(JSON.stringify(result.state), JSON.stringify(before));
  });
});

describe("markPickConsumed — the gate clears when the Operator's pick is recorded (C24, generalized)", () => {
  it("moves an awaiting_pick job to done and leaves the lock untouched", () => {
    const before = queue([job({ idea_id: "idea-A", status: "awaiting_pick" })]);
    const result = markPickConsumed(before, BRAND, "idea-A", RECIPE);
    assert.equal(result.ok, true);
    const a = result.state.jobs.find((j) => j.idea_id === "idea-A")!;
    assert.equal(a.status, "done", "the cleared gate is a terminal record, not a pending gate");
    assert.equal(result.state.lock.active_job, null);
  });

  it("preserves a held lock (clearing a gate never touches the running job's lock)", () => {
    const before = queue(
      [
        job({ idea_id: "idea-run", status: "running", enqueued_at: "2026-06-05T09:00:00.000Z" }),
        job({ idea_id: "idea-gate", status: "awaiting_pick", enqueued_at: "2026-06-05T10:00:00.000Z" }),
      ],
      ref("idea-run"),
    );
    const result = markPickConsumed(before, BRAND, "idea-gate", RECIPE);
    assert.equal(result.ok, true);
    assert.deepEqual(result.state.lock.active_job, ref("idea-run"), "the running job's lock is kept");
  });

  it("refuses an unknown (brand, idea_id, recipe) with unknown_job", () => {
    const before = queue([job({ idea_id: "idea-A", status: "awaiting_pick" })]);
    assert.equal(markPickConsumed(before, "other-brand", "idea-A", RECIPE).code, "unknown_job");
    assert.equal(markPickConsumed(before, BRAND, "idea-ZZZ", RECIPE).code, "unknown_job");
    assert.equal(markPickConsumed(before, BRAND, "idea-A", "carousel").code, "unknown_job");
  });

  it("refuses when no job for the (Idea, Recipe) is awaiting_pick (e.g. a re-pick after the gate cleared)", () => {
    const before = queue([job({ idea_id: "idea-A", status: "done" })]);
    const result = markPickConsumed(before, BRAND, "idea-A", RECIPE);
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_transition");
    assert.equal(JSON.stringify(result.state), JSON.stringify(before));
  });

  it("targets the awaiting_pick job, not the (Idea, Recipe)'s separate queued next-leg job", () => {
    // An (Idea, Recipe) can hold BOTH an awaiting_pick job and a later queued next-leg job at once.
    const before = queue([
      job({ idea_id: "idea-A", gate: "cast", status: "awaiting_pick", enqueued_at: "2026-06-05T10:00:00.000Z" }),
      job({ idea_id: "idea-A", gate: null, status: "queued", enqueued_at: "2026-06-05T11:00:00.000Z", pick: "cast-2" }),
    ]);
    const result = markPickConsumed(before, BRAND, "idea-A", RECIPE);
    assert.equal(result.ok, true);
    const gatedJob = result.state.jobs.find((j) => j.gate === "cast")!;
    const nextLegJob = result.state.jobs.find((j) => j.gate === null)!;
    assert.equal(gatedJob.status, "done", "the gate cleared");
    assert.equal(nextLegJob.status, "queued", "the next-leg job is untouched and still runnable");
  });

  it("does not confuse two Recipes' jobs for the same Idea (issue #56)", () => {
    const before = queue([
      job({ idea_id: "idea-A", recipe: "character-explainer-with-cast", status: "awaiting_pick" }),
      job({ idea_id: "idea-A", recipe: "carousel", status: "awaiting_pick" }),
    ]);
    const result = markPickConsumed(before, BRAND, "idea-A", "character-explainer-with-cast");
    assert.equal(result.ok, true);
    const first = result.state.jobs.find((j) => j.recipe === "character-explainer-with-cast")!;
    const second = result.state.jobs.find((j) => j.recipe === "carousel")!;
    assert.equal(first.status, "done");
    assert.equal(second.status, "awaiting_pick", "the OTHER Recipe's gate is untouched");
  });
});

describe("markDone", () => {
  it("moves a running job to done and releases the lock", () => {
    const before = queue([job({ idea_id: "idea-A", gate: null, status: "running" })], ref("idea-A"));
    const result = markDone(before, BRAND, "idea-A", RECIPE);
    assert.equal(result.ok, true);
    const a = result.state.jobs.find((j) => j.idea_id === "idea-A")!;
    assert.equal(a.status, "done");
    assert.equal(result.state.lock.active_job, null);
  });

  it("refuses to complete a job that is not running", () => {
    const before = queue([job({ idea_id: "idea-A", status: "queued" })]);
    const result = markDone(before, BRAND, "idea-A", RECIPE);
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_transition");
    assert.equal(JSON.stringify(result.state), JSON.stringify(before));
  });
});

describe("markFailed", () => {
  it("moves a running job to failed and releases the lock", () => {
    const before = queue([job({ idea_id: "idea-A", status: "running" })], ref("idea-A"));
    const result = markFailed(before, BRAND, "idea-A", RECIPE);
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
    const result = markFailed(before, BRAND, "idea-A", RECIPE);
    assert.equal(result.ok, true);
    // after the failure, nextReady returns the later queued job
    assert.equal(nextReady(result.state)?.idea_id, "idea-B");
  });
});

describe("lifecycle integration — queued → running → done", () => {
  it("advances a job end to end, keeping the lock in step", () => {
    let state = queue([job({ idea_id: "idea-A", gate: null })]);
    const run = markRunning(state, BRAND, "idea-A", RECIPE);
    assert.equal(run.ok, true);
    assert.deepEqual(run.state.lock.active_job, ref("idea-A"));
    state = run.state;
    const done = markDone(state, BRAND, "idea-A", RECIPE);
    assert.equal(done.ok, true);
    assert.equal(done.state.jobs[0]!.status, "done");
    assert.equal(done.state.lock.active_job, null);
  });
});

describe("transitions are keyed on (brand, idea_id, recipe) — no cross-Brand/cross-Recipe collision", () => {
  it("markRunning targets the named Brand's job, not another Brand's same Idea id (C6)", () => {
    // Two Brands both hold idea-X. Only Brand alpha's job may be started, and the lock must name alpha.
    const before = queue([
      job({ idea_id: "idea-X", brand: "alpha", enqueued_at: "2026-06-05T09:00:00.000Z" }),
      job({ idea_id: "idea-X", brand: "beta", enqueued_at: "2026-06-05T10:00:00.000Z" }),
    ]);
    const result = markRunning(before, "alpha", "idea-X", RECIPE);
    assert.equal(result.ok, true);
    const alpha = result.state.jobs.find((j) => j.brand === "alpha")!;
    const beta = result.state.jobs.find((j) => j.brand === "beta")!;
    assert.equal(alpha.status, "running", "alpha's job runs");
    assert.equal(beta.status, "queued", "beta's identically-named job is untouched");
    assert.deepEqual(result.state.lock.active_job, ref("idea-X", "alpha"));
  });

  it("markRunning targets the named Recipe's job, not another Recipe of the same Idea (issue #56)", () => {
    const before = queue([
      job({ idea_id: "idea-X", recipe: "character-explainer-with-cast", enqueued_at: "2026-06-05T09:00:00.000Z" }),
      job({ idea_id: "idea-X", recipe: "carousel", enqueued_at: "2026-06-05T10:00:00.000Z" }),
    ]);
    const result = markRunning(before, BRAND, "idea-X", "character-explainer-with-cast");
    assert.equal(result.ok, true);
    const first = result.state.jobs.find((j) => j.recipe === "character-explainer-with-cast")!;
    const second = result.state.jobs.find((j) => j.recipe === "carousel")!;
    assert.equal(first.status, "running");
    assert.equal(second.status, "queued", "the OTHER Recipe's job is untouched");
  });

  it("markFailed on one Brand does not touch the other Brand's same-id job", () => {
    const before = queue(
      [
        job({ idea_id: "idea-X", brand: "alpha", status: "running", enqueued_at: "2026-06-05T09:00:00.000Z" }),
        job({ idea_id: "idea-X", brand: "beta", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" }),
      ],
      ref("idea-X", "alpha"),
    );
    const result = markFailed(before, "alpha", "idea-X", RECIPE);
    assert.equal(result.ok, true);
    assert.equal(result.state.jobs.find((j) => j.brand === "alpha")!.status, "failed");
    assert.equal(result.state.jobs.find((j) => j.brand === "beta")!.status, "queued");
  });
});

describe("requeueFailed — revive a failed job so its (Idea, Recipe) can be produced again (C4)", () => {
  it("moves a failed job back to queued and leaves the lock untouched", () => {
    const before = queue([job({ idea_id: "idea-A", status: "failed" })]);
    const result = requeueFailed(before, BRAND, "idea-A", RECIPE);
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
    const result = requeueFailed(before, BRAND, "idea-A", RECIPE);
    assert.equal(result.ok, true);
    assert.deepEqual(result.state.lock.active_job, ref("idea-run"), "the running job's lock is kept");
  });

  it("refuses an unknown (brand, idea_id, recipe) with unknown_job", () => {
    const before = queue([job({ idea_id: "idea-A", status: "failed" })]);
    assert.equal(requeueFailed(before, "other-brand", "idea-A", RECIPE).code, "unknown_job");
    assert.equal(requeueFailed(before, BRAND, "idea-ZZZ", RECIPE).code, "unknown_job");
  });

  it("refuses when the job exists but is not failed", () => {
    const before = queue([job({ idea_id: "idea-A", status: "queued" })]);
    const result = requeueFailed(before, BRAND, "idea-A", RECIPE);
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_transition");
    assert.equal(JSON.stringify(result.state), JSON.stringify(before));
  });
});
