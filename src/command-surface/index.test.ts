/**
 * A small end-to-end proof that the barrel (`index.ts`) wires a REAL pipeline turn — Trend -> Idea ->
 * Review -> Job -> Asset -> Post -> Performance — entirely through the command surface's own exported
 * names, never reaching into any store module directly (issue #205 AC1/AC2/AC3).
 *
 * In-process against a real, throwaway SQLite file (`withTempDb`, never `:memory:`).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { createBrand } from "../brand/store.ts";
import { createChannel } from "../channel/store.ts";
import { createFormat } from "../format/store.ts";
import { createTrend } from "../trend/store.ts";
import { getIdea } from "../idea/store.ts";
import { loadIdeaAssets, type DbAssetRecord } from "../asset/store.ts";
import { HOOK_TYPES } from "../vocabulary/hook-type.ts";
import { THEMES } from "../vocabulary/theme.ts";
import { FIXTURE_RECIPE } from "../db/fixtures/seed-chain.ts";

import {
  listTrends,
  createIdea,
  recordReviewDecision,
  enqueueJob,
  claimJob,
  releaseJob,
  saveAsset,
  logPost,
  readPerformance,
  recordPerformanceSnapshot,
  recordPerformanceScore,
} from "./index.ts";

const VALID_HOOK_TYPE = HOOK_TYPES[0]!.value;
const VALID_THEME = THEMES[0]!.value;

function seedRunAndChannel(db: DatabaseSync) {
  const brandId = createBrand(db, {
    slug: `straw-motion-${randomUUID()}`,
    name: "Straw Motion",
    timezone: "UTC",
    mediaRoot: "data/brands/straw-motion",
  });
  const channelId = createChannel(db, { brandId, platform: "facebook", isPrimary: true });
  const formatId = createFormat(db, { brandId, slug: "unhypped-news", name: "Unhypped News", voice: "plain" });
  const runId = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO run (id, brand_id, format_id, run_key, cadence, started_at, created_at, updated_at)
     VALUES (?, ?, ?, '2026-W33', 'weekly', ?, ?, ?)`,
  ).run(runId, brandId, formatId, now, now, now);
  return { brandId, channelId, formatId, runId };
}

describe("the command surface barrel drives one full pipeline turn (issue #205)", () => {
  it("Trend -> Idea -> Review -> Job -> Asset -> Post -> Performance, entirely through index.ts", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, channelId, formatId, runId } = seedRunAndChannel(db);

      const trendId = createTrend(db, { runId, label: "Gemini price cut", momentum: 8, isPaywalled: false });
      assert.equal(listTrends(db, runId)[0]?.id, trendId);

      const ideaId = createIdea(db, {
        runId,
        brandId,
        formatId,
        trendId,
        title: "Google cuts Gemini pricing in half",
        brief: "Google dropped Gemini 3.7 Flash and cut the price in half.",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
      });

      recordReviewDecision(db, ideaId, {
        outcome: "accepted",
        recipes: [{ recipe: FIXTURE_RECIPE, chosen: true }],
      });
      assert.equal(getIdea(db, ideaId)?.status, "accepted");

      await saveAsset(db, ideaId, FIXTURE_RECIPE, { status: "queued" });
      const assets = (await loadIdeaAssets(ideaId, { db })) as readonly DbAssetRecord[];
      const assetId = assets[0]!.id;

      const jobId = enqueueJob(db, { assetId, brandId });
      const claimed = claimJob(db, jobId, "worker-1", 60_000);
      assert.equal(claimed?.status, "running");
      const released = releaseJob(db, jobId, "done");
      assert.equal(released?.status, "done");

      await saveAsset(db, ideaId, FIXTURE_RECIPE, { status: "produced", produced_at: new Date().toISOString() });

      const postId = logPost(db, {
        assetId,
        channelId,
        postUrl: "https://www.facebook.com/strawmotion/posts/123",
        postedAt: "2026-08-17T09:00:00.000Z",
      });

      recordPerformanceSnapshot(db, { postId, capturedAt: "2026-08-18T09:00:00.000Z", reactions: 40, source: "apify" });
      recordPerformanceScore(db, { postId, score: 0.7, computedAt: "2026-08-18T09:05:00.000Z" });

      const perf = readPerformance(db, postId);
      assert.equal(perf.snapshots.length, 1);
      assert.equal(perf.latestScore?.score, 0.7);
    });
  });
});
