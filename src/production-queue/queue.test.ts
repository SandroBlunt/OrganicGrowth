import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyQueue, enqueue, hasJobFor, type QueueState } from "./queue.ts";

/** A fixture queue state with one existing job, used to prove append + no-duplicate. */
function fixtureWithOneJob(): QueueState {
  return {
    jobs: [
      {
        idea_id: "idea-2026-W22-01",
        phase: "cast",
        status: "queued",
        enqueued_at: "2026-06-05T10:00:00.000Z",
      },
    ],
    lock: { active_job: null },
  };
}

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

describe("emptyQueue", () => {
  it("is well-formed: no jobs, lock free", () => {
    const q = emptyQueue();
    assert.deepEqual(q.jobs, []);
    assert.equal(q.lock.active_job, null);
  });
});

describe("enqueue (append + no-duplicate)", () => {
  it("appends exactly one queued cast-phase job for the idea_id", () => {
    const before = emptyQueue();
    const after = enqueue(before, "idea-2026-W22-02", "2026-06-05T11:00:00.000Z");

    assert.equal(after.jobs.length, 1);
    const job = after.jobs[0]!;
    assert.equal(job.idea_id, "idea-2026-W22-02");
    assert.equal(job.phase, "cast");
    assert.equal(job.status, "queued");
  });

  it("stamps enqueued_at as the injected ISO-8601 timestamp", () => {
    const after = enqueue(emptyQueue(), "idea-2026-W22-02", "2026-06-05T11:00:00.000Z");
    const job = after.jobs[0]!;
    assert.equal(job.enqueued_at, "2026-06-05T11:00:00.000Z");
    assert.match(job.enqueued_at, ISO_8601);
  });

  it("appends to an existing fixture queue without dropping prior jobs", () => {
    const before = fixtureWithOneJob();
    const after = enqueue(before, "idea-2026-W22-02", "2026-06-05T11:00:00.000Z");

    assert.equal(after.jobs.length, 2);
    assert.equal(after.jobs[0]!.idea_id, "idea-2026-W22-01");
    assert.equal(after.jobs[1]!.idea_id, "idea-2026-W22-02");
  });

  it("does NOT duplicate a job when the same idea_id is enqueued again", () => {
    const before = fixtureWithOneJob();
    const after = enqueue(before, "idea-2026-W22-01", "2026-06-05T12:00:00.000Z");

    assert.equal(after.jobs.length, 1);
    assert.equal(after.jobs[0]!.idea_id, "idea-2026-W22-01");
    // unchanged: still the original enqueued_at, no second job
    assert.equal(after.jobs[0]!.enqueued_at, "2026-06-05T10:00:00.000Z");
  });

  it("is idempotent: re-enqueue returns the same state reference (no work)", () => {
    const before = fixtureWithOneJob();
    const after = enqueue(before, "idea-2026-W22-01", "2026-06-05T12:00:00.000Z");
    assert.equal(after, before);
  });

  it("is pure: it never mutates the input state", () => {
    const before = emptyQueue();
    const snapshot = JSON.stringify(before);
    enqueue(before, "idea-2026-W22-02", "2026-06-05T11:00:00.000Z");
    assert.equal(JSON.stringify(before), snapshot);
    assert.equal(before.jobs.length, 0);
  });
});

describe("hasJobFor", () => {
  it("is true for an idea already in the queue and false otherwise", () => {
    const q = fixtureWithOneJob();
    assert.equal(hasJobFor(q, "idea-2026-W22-01"), true);
    assert.equal(hasJobFor(q, "idea-2026-W22-99"), false);
  });
});
