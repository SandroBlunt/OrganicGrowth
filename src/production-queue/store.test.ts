import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyQueue, enqueue } from "./queue.ts";
import { loadQueue, saveQueue, parseQueueState } from "./store.ts";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "og-queue-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("loadQueue / saveQueue", () => {
  it("round-trips a queue state through disk", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "queue.json");
      const state = enqueue(emptyQueue(), "idea-2026-W22-01", "2026-06-05T10:00:00.000Z", "mundotip");
      await saveQueue(state, path);
      const loaded = await loadQueue(path);
      assert.deepEqual(loaded, state);
    });
  });

  it("loads a missing file as the empty queue (fresh repo)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "does-not-exist.json");
      const loaded = await loadQueue(path);
      assert.deepEqual(loaded, emptyQueue());
    });
  });

  it("writes valid JSON with the documented shape including brand", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "queue.json");
      await saveQueue(enqueue(emptyQueue(), "idea-X", "2026-06-05T10:00:00.000Z", "alpha"), path);
      const reloaded = await loadQueue(path);
      assert.equal(reloaded.jobs.length, 1);
      assert.equal(reloaded.jobs[0]!.phase, "cast");
      assert.equal(reloaded.jobs[0]!.status, "queued");
      assert.equal(reloaded.jobs[0]!.brand, "alpha");
      assert.equal(reloaded.lock.active_job, null);
    });
  });
});

describe("parseQueueState (defensive)", () => {
  it("returns the empty queue for non-object input", () => {
    assert.deepEqual(parseQueueState(null), emptyQueue());
    assert.deepEqual(parseQueueState("nope"), emptyQueue());
  });

  it("round-trips the brand field for a well-formed job (AC1)", () => {
    const raw = {
      jobs: [
        { idea_id: "idea-A", brand: "mundotip", phase: "cast", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
      ],
      lock: { active_job: null },
    };
    const state = parseQueueState(raw);
    assert.equal(state.jobs.length, 1);
    assert.equal(state.jobs[0]!.brand, "mundotip");
  });

  it("drops a job with a missing brand field — does not crash the drain (AC1)", () => {
    const raw = {
      jobs: [
        // brand field is absent
        { idea_id: "idea-no-brand", phase: "cast", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
        // valid job for comparison
        { idea_id: "idea-good", brand: "alpha", phase: "render", status: "queued", enqueued_at: "2026-06-05T11:00:00.000Z" },
      ],
      lock: { active_job: null },
    };
    const state = parseQueueState(raw);
    assert.equal(state.jobs.length, 1, "brandless job must be dropped");
    assert.equal(state.jobs[0]!.idea_id, "idea-good");
  });

  it("drops a job with an empty-string brand — does not crash the drain (AC1)", () => {
    const raw = {
      jobs: [
        { idea_id: "idea-empty-brand", brand: "", phase: "cast", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
        { idea_id: "idea-good", brand: "beta", phase: "cast", status: "queued", enqueued_at: "2026-06-05T11:00:00.000Z" },
      ],
      lock: { active_job: null },
    };
    const state = parseQueueState(raw);
    assert.equal(state.jobs.length, 1, "empty-brand job must be dropped");
    assert.equal(state.jobs[0]!.brand, "beta");
  });

  it("drops malformed jobs but keeps well-formed ones", () => {
    const raw = {
      jobs: [
        { idea_id: "idea-good", brand: "alpha", phase: "cast", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
        { idea_id: "idea-bad-phase", brand: "alpha", phase: "wat", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
        { brand: "alpha", phase: "cast", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
      ],
      lock: { active_job: null },
    };
    const state = parseQueueState(raw);
    assert.equal(state.jobs.length, 1);
    assert.equal(state.jobs[0]!.idea_id, "idea-good");
  });
});
