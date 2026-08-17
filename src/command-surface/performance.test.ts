/**
 * Tests for the typed command surface's Performance operations (`readPerformance`,
 * `recordPerformanceSnapshot`, `recordPerformanceScore`, issue #205 AC1/AC3).
 *
 * In-process against a real, throwaway SQLite file (`withTempDb`, never `:memory:`).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { DatabaseSync } from "node:sqlite";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { seedAssetAndChannel } from "../db/fixtures/seed-chain.ts";
import { recordPost } from "../post/store.ts";

import { readPerformance, recordPerformanceSnapshot, recordPerformanceScore } from "./performance.ts";

async function seedPost(db: DatabaseSync) {
  const { assetId, channelId } = await seedAssetAndChannel(db);
  const postId = recordPost(db, {
    assetId,
    channelId,
    postUrl: "https://www.facebook.com/strawmotion/posts/123",
    postedAt: "2026-08-17T09:00:00.000Z",
  });
  return { postId };
}

describe("readPerformance — the command surface's read over the Performance time-series stores (issue #205)", () => {
  it("returns [] snapshots and a null latestScore for a Post never measured", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { postId } = await seedPost(db);

      const perf = readPerformance(db, postId);

      assert.deepEqual(perf.snapshots, []);
      assert.equal(perf.latestScore, null);
    });
  });

  it("returns every recorded snapshot and the MOST RECENTLY computed score", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { postId } = await seedPost(db);

      recordPerformanceSnapshot(db, {
        postId,
        capturedAt: "2026-08-17T10:00:00.000Z",
        reactions: 10,
        source: "apify",
      });
      recordPerformanceSnapshot(db, {
        postId,
        capturedAt: "2026-08-18T10:00:00.000Z",
        reactions: 25,
        source: "apify",
      });
      recordPerformanceScore(db, { postId, score: 0.4, computedAt: "2026-08-17T10:05:00.000Z" });
      recordPerformanceScore(db, { postId, score: 0.6, computedAt: "2026-08-18T10:05:00.000Z" });

      const perf = readPerformance(db, postId);

      assert.equal(perf.snapshots.length, 2);
      assert.equal(perf.latestScore?.score, 0.6);
    });
  });
});
