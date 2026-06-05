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
      const state = enqueue(emptyQueue(), "idea-2026-W22-01", "2026-06-05T10:00:00.000Z");
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

  it("writes valid JSON with the documented shape", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "queue.json");
      await saveQueue(enqueue(emptyQueue(), "idea-X", "2026-06-05T10:00:00.000Z"), path);
      const reloaded = await loadQueue(path);
      assert.equal(reloaded.jobs.length, 1);
      assert.equal(reloaded.jobs[0]!.phase, "cast");
      assert.equal(reloaded.jobs[0]!.status, "queued");
      assert.equal(reloaded.lock.active_job, null);
    });
  });
});

describe("parseQueueState (defensive)", () => {
  it("returns the empty queue for non-object input", () => {
    assert.deepEqual(parseQueueState(null), emptyQueue());
    assert.deepEqual(parseQueueState("nope"), emptyQueue());
  });

  it("drops malformed jobs but keeps well-formed ones", () => {
    const raw = {
      jobs: [
        { idea_id: "idea-good", phase: "cast", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
        { idea_id: "idea-bad-phase", phase: "wat", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
        { phase: "cast", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
      ],
      lock: { active_job: null },
    };
    const state = parseQueueState(raw);
    assert.equal(state.jobs.length, 1);
    assert.equal(state.jobs[0]!.idea_id, "idea-good");
  });
});
