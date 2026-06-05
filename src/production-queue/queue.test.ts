import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  emptyQueue,
  enqueue,
  enqueueRender,
  hasJobFor,
  hasJobOfPhase,
  type QueueState,
} from "./queue.ts";
import { renderQueue } from "./render.ts";

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

describe("enqueueRender (picking a Cast enqueues the render)", () => {
  /** An Idea whose cast job has reached its gate, ready for the render to be enqueued. */
  function castAtGate(): QueueState {
    return {
      jobs: [
        {
          idea_id: "idea-2026-W22-01",
          phase: "cast",
          status: "awaiting_cast",
          enqueued_at: "2026-06-05T10:00:00.000Z",
        },
      ],
      lock: { active_job: null },
    };
  }

  it("appends exactly one queued render-phase job for the idea_id", () => {
    const after = enqueueRender(castAtGate(), "idea-2026-W22-01", "2026-06-05T12:00:00.000Z");
    const renders = after.jobs.filter((j) => j.phase === "render");
    assert.equal(renders.length, 1);
    const job = renders[0]!;
    assert.equal(job.idea_id, "idea-2026-W22-01");
    assert.equal(job.status, "queued");
    assert.equal(job.enqueued_at, "2026-06-05T12:00:00.000Z");
    assert.match(job.enqueued_at, ISO_8601);
  });

  it("preserves the Idea's prior cast job (a render is distinct from the cast)", () => {
    const after = enqueueRender(castAtGate(), "idea-2026-W22-01", "2026-06-05T12:00:00.000Z");
    assert.equal(after.jobs.filter((j) => j.phase === "cast").length, 1);
    assert.equal(after.jobs.length, 2);
  });

  it("does NOT duplicate the render job when called again for the same Idea", () => {
    const once = enqueueRender(castAtGate(), "idea-2026-W22-01", "2026-06-05T12:00:00.000Z");
    const twice = enqueueRender(once, "idea-2026-W22-01", "2026-06-05T13:00:00.000Z");
    assert.equal(twice.jobs.filter((j) => j.phase === "render").length, 1);
    assert.equal(twice, once); // idempotent: same reference, no work
  });

  it("is pure: it never mutates the input state", () => {
    const before = castAtGate();
    const snapshot = JSON.stringify(before);
    enqueueRender(before, "idea-2026-W22-01", "2026-06-05T12:00:00.000Z");
    assert.equal(JSON.stringify(before), snapshot);
  });
});

describe("hasJobOfPhase", () => {
  it("distinguishes a cast job from a render job for the same Idea", () => {
    const q = enqueueRender(
      {
        jobs: [
          {
            idea_id: "idea-X",
            phase: "cast",
            status: "awaiting_cast",
            enqueued_at: "2026-06-05T10:00:00.000Z",
          },
        ],
        lock: { active_job: null },
      },
      "idea-X",
      "2026-06-05T12:00:00.000Z",
    );
    assert.equal(hasJobOfPhase(q, "idea-X", "cast"), true);
    assert.equal(hasJobOfPhase(q, "idea-X", "render"), true);
    assert.equal(hasJobOfPhase(q, "idea-Y", "render"), false);
  });
});

describe("/queue renderer reflects all five worker statuses", () => {
  it("shows queued, running, awaiting_cast, done, and failed jobs", () => {
    const state: QueueState = {
      jobs: [
        { idea_id: "idea-q", phase: "cast", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
        { idea_id: "idea-r", phase: "cast", status: "running", enqueued_at: "2026-06-05T10:01:00.000Z" },
        {
          idea_id: "idea-a",
          phase: "cast",
          status: "awaiting_cast",
          enqueued_at: "2026-06-05T10:02:00.000Z",
        },
        { idea_id: "idea-d", phase: "render", status: "done", enqueued_at: "2026-06-05T10:03:00.000Z" },
        { idea_id: "idea-f", phase: "render", status: "failed", enqueued_at: "2026-06-05T10:04:00.000Z" },
      ],
      lock: { active_job: "idea-r" },
    };
    const out = renderQueue(state);
    for (const status of ["queued", "running", "awaiting_cast", "done", "failed"]) {
      assert.ok(out.includes(status), `expected /queue output to include status "${status}"`);
    }
  });
});
