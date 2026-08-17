/**
 * Tests for `loadQueueStrict` (`src/importer/load-queue-strict.ts`) — issue #204.
 *
 * `src/production-queue/store.ts`'s `loadQueue` is the existing loader for `data/queue.json` — but it
 * is deliberately TOLERANT (a malformed job is dropped with a `console.warn`, never crashes the live
 * queue read). The one-shot importer needs a STRICTER guarantee ("anything it cannot parse causes a
 * refusal... never a silent drop") — this module reuses `loadQueue` unchanged and simply CAPTURES any
 * warning it emits, so the importer's planner can refuse (naming what was dropped) instead of silently
 * proceeding with fewer jobs than the file actually held.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadQueueStrict } from "./load-queue-strict.ts";

async function withQueueFile(seed: unknown, fn: (path: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-queue-strict-"));
  const path = join(dir, "queue.json");
  try {
    await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");
    await fn(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("loadQueueStrict — captures any drop-warning the tolerant loader emits", () => {
  it("returns every well-formed job with zero warnings", async () => {
    const seed = {
      jobs: [{ idea_id: "idea-01", brand: "straw-motion", recipe: "news-carousel", gate: null, status: "done", enqueued_at: "2026-07-18T07:33:16.547Z" }],
    };
    await withQueueFile(seed, async (path) => {
      const result = await loadQueueStrict(path);
      assert.equal(result.state.jobs.length, 1);
      assert.deepEqual(result.warnings, []);
    });
  });

  it("captures a warning (and the dropped job is absent) for a malformed job", async () => {
    const seed = {
      jobs: [
        { idea_id: "idea-01", brand: "straw-motion", recipe: "news-carousel", gate: null, status: "done", enqueued_at: "2026-07-18T07:33:16.547Z" },
        { idea_id: "idea-02", brand: "straw-motion", recipe: "news-carousel", gate: null, status: "not-a-real-status", enqueued_at: "2026-07-18T07:33:16.547Z" },
      ],
    };
    await withQueueFile(seed, async (path) => {
      const result = await loadQueueStrict(path);
      assert.equal(result.state.jobs.length, 1);
      assert.equal(result.warnings.length, 1);
      assert.match(result.warnings[0]!, /idea-02/);
    });
  });

  it("loads a missing file as an empty queue with zero warnings", async () => {
    const result = await loadQueueStrict(join("/tmp", "og-nonexistent-queue-file-for-test.json"));
    assert.deepEqual(result.state.jobs, []);
    assert.deepEqual(result.warnings, []);
  });

  it("captures a warning for a malformed top-level shape too (issue #204 QA round 1's Defect 2 — a genuinely malformed file used to load as an empty queue with zero warnings)", async () => {
    await withQueueFile("not the expected shape at all", async (path) => {
      const result = await loadQueueStrict(path);
      assert.deepEqual(result.state.jobs, []);
      assert.equal(result.warnings.length, 1);
      assert.match(result.warnings[0]!, /non-object/);
    });
  });

  it("captures a warning when the top-level \"jobs\" key is not an array", async () => {
    await withQueueFile({ jobs: "not an array" }, async (path) => {
      const result = await loadQueueStrict(path);
      assert.deepEqual(result.state.jobs, []);
      assert.equal(result.warnings.length, 1);
      assert.match(result.warnings[0]!, /jobs/);
    });
  });
});
