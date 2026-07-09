import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyQueue, type QueueState } from "./queue.ts";
import { formatQueue } from "./format.ts";

const BRAND_A = "alpha";
const BRAND_B = "beta";

describe("formatQueue — brand label in output (AC6)", () => {
  it("lists each job with its brand, idea_id, phase, and status", () => {
    const state: QueueState = {
      jobs: [
        { idea_id: "idea-A", brand: BRAND_A, phase: "cast", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
        { idea_id: "idea-B", brand: BRAND_B, phase: "render", status: "running", enqueued_at: "2026-06-05T11:00:00.000Z" },
      ],
      lock: { active_job: { brand: BRAND_B, idea_id: "idea-B" } },
    };
    const out = formatQueue(state);

    // idea-A: brand, id, phase, status all present
    assert.match(out, /alpha/);
    assert.match(out, /idea-A/);
    assert.match(out, /cast.*queued/s);
    // idea-B: brand, id, phase, status all present
    assert.match(out, /beta/);
    assert.match(out, /idea-B/);
    assert.match(out, /render.*running/s);
  });

  it("reports an empty queue when there are no jobs", () => {
    const out = formatQueue(emptyQueue());
    assert.match(out, /empty/i);
  });
});

describe("formatQueue — brand filter (AC6)", () => {
  function multiQueue(): QueueState {
    return {
      jobs: [
        { idea_id: "idea-A1", brand: BRAND_A, phase: "cast", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
        { idea_id: "idea-B1", brand: BRAND_B, phase: "cast", status: "queued", enqueued_at: "2026-06-05T10:01:00.000Z" },
        { idea_id: "idea-A2", brand: BRAND_A, phase: "render", status: "done", enqueued_at: "2026-06-05T10:02:00.000Z" },
      ],
      lock: { active_job: null },
    };
  }

  it("filtered to one Brand shows only that Brand's jobs (AC6)", () => {
    const out = formatQueue(multiQueue(), BRAND_A);
    assert.match(out, /idea-A1/);
    assert.match(out, /idea-A2/);
    assert.ok(!out.includes("idea-B1"), "Brand B jobs must not appear when filtered to Brand A");
    // Brand label appears in output
    assert.match(out, /alpha/);
  });

  it("filtered to Brand B shows only Brand B's jobs (AC6)", () => {
    const out = formatQueue(multiQueue(), BRAND_B);
    assert.match(out, /idea-B1/);
    assert.ok(!out.includes("idea-A1"), "Brand A jobs must not appear when filtered to Brand B");
  });

  it("no filter shows all jobs (AC6)", () => {
    const out = formatQueue(multiQueue());
    assert.match(out, /idea-A1/);
    assert.match(out, /idea-B1/);
    assert.match(out, /idea-A2/);
  });

  it("filtered to a Brand with no jobs reports an empty-for-brand message (AC6)", () => {
    const out = formatQueue(multiQueue(), "gamma");
    assert.match(out, /no jobs for brand/i);
    assert.ok(!out.includes("idea-A1"), "no jobs from other brands");
  });
});
