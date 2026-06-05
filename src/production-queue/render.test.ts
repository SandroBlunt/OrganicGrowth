import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyQueue, type QueueState } from "./queue.ts";
import { renderQueue } from "./render.ts";

describe("renderQueue", () => {
  it("lists each job with its idea_id, phase, and status", () => {
    const state: QueueState = {
      jobs: [
        { idea_id: "idea-A", phase: "cast", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
        { idea_id: "idea-B", phase: "render", status: "running", enqueued_at: "2026-06-05T11:00:00.000Z" },
      ],
      lock: { active_job: "idea-B" },
    };
    const out = renderQueue(state);

    // idea-A: id, phase, status all present
    assert.match(out, /idea-A/);
    assert.match(out, /idea-A.*cast.*queued/s);
    // idea-B: id, phase, status all present
    assert.match(out, /idea-B/);
    assert.match(out, /idea-B.*render.*running/s);
  });

  it("reports an empty queue when there are no jobs", () => {
    const out = renderQueue(emptyQueue());
    assert.match(out, /empty/i);
  });
});
