/**
 * Tests for the Performance time-series stores (`src/performance/store.ts`) — issue #203, ADR-0028.
 *
 * `{ db }`-only, genuinely new. Every test opens a real, throwaway SQLite file via `withTempDb` —
 * never `:memory:`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { seedAssetAndChannel } from "../db/fixtures/seed-chain.ts";
import { recordPost } from "../post/store.ts";
import type { AssetMetrics } from "../asset/asset.ts";
import { computePerformanceScore } from "./score.ts";
import { recomputeBaseline, type BaselineMedians } from "./metrics.ts";
import {
  recordMetricSnapshot,
  listMetricSnapshotsForPost,
  latestMetricSnapshotForPost,
  recordChannelBaseline,
  getChannelBaseline,
  getLatestChannelBaseline,
  listChannelBaselinesForChannel,
  recordPerformanceScore,
  getPerformanceScore,
  listPerformanceScoresForPost,
  latestPerformanceScoreForPost,
  type MetricSnapshotRecord,
  type ChannelBaselineRecord,
  type PerformanceScoreRecord,
} from "./store.ts";

/** Seeds an Asset + Channel + one logged Post, returning the ids `metric_snapshot`/`performance_score`
 *  fixtures need. */
async function seedPost(db: Parameters<typeof seedAssetAndChannel>[0]) {
  const { assetId, channelId } = await seedAssetAndChannel(db);
  const postId = recordPost(db, { assetId, channelId, postUrl: "https://facebook.com/p/1", postedAt: "2026-06-05T09:00:00.000Z" });
  return { assetId, channelId, postId };
}

describe("recordMetricSnapshot — dated captures, NEVER overwritten (issue #203 AC)", () => {
  it("records reactions/comments/shares/views, source, and raw payload", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { postId } = await seedPost(db);
      const id = recordMetricSnapshot(db, {
        postId,
        capturedAt: "2026-06-06T10:00:00.000Z",
        reactions: 120,
        comments: 8,
        shares: 4,
        views: 900,
        source: "apify",
        raw: { actor: "facebook-post-scraper", reactions: 120 },
      });
      const snapshots = listMetricSnapshotsForPost(db, postId);
      assert.equal(snapshots.length, 1);
      const s = snapshots[0]! as MetricSnapshotRecord;
      assert.equal(s.id, id);
      assert.equal(s.reactions, 120);
      assert.equal(s.comments, 8);
      assert.equal(s.shares, 4);
      assert.equal(s.views, 900);
      assert.equal(s.source, "apify");
      assert.deepEqual(s.raw, { actor: "facebook-post-scraper", reactions: 120 });
    });
  });

  it("a SECOND capture for the SAME Post is a SECOND row — history is never overwritten", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { postId } = await seedPost(db);
      recordMetricSnapshot(db, { postId, capturedAt: "2026-06-06T10:00:00.000Z", reactions: 100, comments: 5, shares: 2, views: 500, source: "apify" });
      recordMetricSnapshot(db, { postId, capturedAt: "2026-06-08T10:00:00.000Z", reactions: 300, comments: 20, shares: 10, views: 2000, source: "apify" });
      const snapshots = listMetricSnapshotsForPost(db, postId);
      assert.equal(snapshots.length, 2, "the SECOND capture must not overwrite the first");
      assert.equal(snapshots[0]!.reactions, 100, "the first (earlier) capture's own reading is intact");
      assert.equal(snapshots[1]!.reactions, 300);
    });
  });

  it("listMetricSnapshotsForPost is ordered oldest-first by captured_at, not insertion order", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { postId } = await seedPost(db);
      recordMetricSnapshot(db, { postId, capturedAt: "2026-06-10T00:00:00.000Z", source: "apify" });
      recordMetricSnapshot(db, { postId, capturedAt: "2026-06-06T00:00:00.000Z", source: "apify" });
      const snapshots = listMetricSnapshotsForPost(db, postId);
      assert.deepEqual(snapshots.map((s) => s.capturedAt), ["2026-06-06T00:00:00.000Z", "2026-06-10T00:00:00.000Z"]);
    });
  });

  it("a metric with no reading is omitted, not fabricated as 0 (rule 8)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { postId } = await seedPost(db);
      recordMetricSnapshot(db, { postId, capturedAt: "2026-06-06T00:00:00.000Z", reactions: 50, source: "apify" });
      const s = listMetricSnapshotsForPost(db, postId)[0]!;
      assert.equal(s.reactions, 50);
      assert.equal("comments" in s, false);
      assert.equal("shares" in s, false);
      assert.equal("views" in s, false);
    });
  });

  it("latestMetricSnapshotForPost returns the most RECENTLY CAPTURED reading, or null with none", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { postId } = await seedPost(db);
      assert.equal(latestMetricSnapshotForPost(db, postId), null);
      recordMetricSnapshot(db, { postId, capturedAt: "2026-06-06T00:00:00.000Z", reactions: 50, source: "apify" });
      recordMetricSnapshot(db, { postId, capturedAt: "2026-06-12T00:00:00.000Z", reactions: 500, source: "apify" });
      const latest = latestMetricSnapshotForPost(db, postId) as MetricSnapshotRecord;
      assert.equal(latest.reactions, 500);
    });
  });

  it("throws a FOREIGN KEY error for an unknown postId", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.throws(() => recordMetricSnapshot(db, { postId: "does-not-exist", capturedAt: "2026-06-06T00:00:00.000Z", source: "apify" }), /FOREIGN KEY/);
    });
  });
});

describe("recordChannelBaseline — a new row per recompute, never an overwrite", () => {
  it("records medians and a window", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { channelId } = await seedAssetAndChannel(db);
      const id = recordChannelBaseline(db, { channelId, medianReactions: 80, medianComments: 6, medianShares: 3, medianViews: 700, window: "trailing-30" });
      const baseline = getChannelBaseline(db, id) as ChannelBaselineRecord;
      assert.equal(baseline.medianReactions, 80);
      assert.equal(baseline.medianComments, 6);
      assert.equal(baseline.medianShares, 3);
      assert.equal(baseline.medianViews, 700);
      assert.equal(baseline.window, "trailing-30");
    });
  });

  it("a recompute is a NEW row — the prior baseline row is never touched", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { channelId } = await seedAssetAndChannel(db);
      const first = recordChannelBaseline(db, { channelId, medianReactions: 80 });
      const second = recordChannelBaseline(db, { channelId, medianReactions: 150 });
      assert.notEqual(first, second);
      assert.equal((getChannelBaseline(db, first) as ChannelBaselineRecord).medianReactions, 80, "the OLD baseline row is untouched");
      assert.equal(listChannelBaselinesForChannel(db, channelId).length, 2);
    });
  });

  it("getLatestChannelBaseline returns the most RECENTLY recorded baseline, or null with none", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { channelId } = await seedAssetAndChannel(db);
      assert.equal(getLatestChannelBaseline(db, channelId), null);
      recordChannelBaseline(db, { channelId, medianReactions: 80 }, () => "2026-06-05T00:00:00.000Z");
      recordChannelBaseline(db, { channelId, medianReactions: 150 }, () => "2026-06-12T00:00:00.000Z");
      const latest = getLatestChannelBaseline(db, channelId) as ChannelBaselineRecord;
      assert.equal(latest.medianReactions, 150);
    });
  });

  it("a metric with no established median yet is omitted, not fabricated (rule 8)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { channelId } = await seedAssetAndChannel(db);
      const id = recordChannelBaseline(db, { channelId });
      const baseline = getChannelBaseline(db, id) as ChannelBaselineRecord;
      assert.equal("medianReactions" in baseline, false);
      assert.equal("medianComments" in baseline, false);
      assert.equal("medianShares" in baseline, false);
      assert.equal("medianViews" in baseline, false);
    });
  });

  it("throws a FOREIGN KEY error for an unknown channelId", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.throws(() => recordChannelBaseline(db, { channelId: "does-not-exist" }), /FOREIGN KEY/);
    });
  });
});

describe("recordPerformanceScore — computed per Post against a channel_baseline, stamped with when (issue #203 AC)", () => {
  it("records the score, the baseline it was computed against, and computedAt", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { channelId, postId } = await seedPost(db);
      const baselineId = recordChannelBaseline(db, { channelId, medianReactions: 100, medianComments: 10, medianShares: 5, medianViews: 1000 });
      const id = recordPerformanceScore(db, { postId, baselineId, score: 0.62, computedAt: "2026-06-12T00:00:00.000Z" });
      const record = getPerformanceScore(db, id) as PerformanceScoreRecord;
      assert.equal(record.postId, postId);
      assert.equal(record.baselineId, baselineId);
      assert.equal(record.score, 0.62);
      assert.equal(record.computedAt, "2026-06-12T00:00:00.000Z");
    });
  });

  it("a RE-SCORE is a NEW row — the earlier score is never lost (issue #203 AC)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { postId } = await seedPost(db);
      const first = recordPerformanceScore(db, { postId, score: 0.4, computedAt: "2026-06-06T00:00:00.000Z" });
      const second = recordPerformanceScore(db, { postId, score: 0.71, computedAt: "2026-06-13T00:00:00.000Z" });
      assert.notEqual(first, second);
      assert.equal((getPerformanceScore(db, first) as PerformanceScoreRecord).score, 0.4, "the first score row is untouched by the re-score");
      const history = listPerformanceScoresForPost(db, postId);
      assert.equal(history.length, 2);
      assert.deepEqual(history.map((r) => r.score), [0.4, 0.71]);
    });
  });

  it("latestPerformanceScoreForPost returns the most RECENTLY computed score, or null when never scored", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { postId } = await seedPost(db);
      assert.equal(latestPerformanceScoreForPost(db, postId), null);
      recordPerformanceScore(db, { postId, score: 0.4, computedAt: "2026-06-06T00:00:00.000Z" });
      recordPerformanceScore(db, { postId, score: 0.9, computedAt: "2026-06-13T00:00:00.000Z" });
      const latest = latestPerformanceScoreForPost(db, postId) as PerformanceScoreRecord;
      assert.equal(latest.score, 0.9);
    });
  });

  it("a score with no baseline (none established yet) omits baselineId, never fabricates one", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { postId } = await seedPost(db);
      const id = recordPerformanceScore(db, { postId, score: 0.5, computedAt: "2026-06-06T00:00:00.000Z" });
      const record = getPerformanceScore(db, id) as PerformanceScoreRecord;
      assert.equal("baselineId" in record, false);
    });
  });

  it("throws a FOREIGN KEY error for an unknown postId", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.throws(() => recordPerformanceScore(db, { postId: "does-not-exist", score: 0.5, computedAt: "2026-06-06T00:00:00.000Z" }), /FOREIGN KEY/);
    });
  });
});

describe("AC11 — scores and baselines produced by the measurement-loop (issue #200) round-trip UNCHANGED", () => {
  it("computePerformanceScore's real output, and recomputeBaseline's real medians, survive a write + read through these tables", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { channelId, postId } = await seedPost(db);

      // The REAL shapes issue #200's measurement loop actually produces — not a hand-picked stand-in.
      const priorReadings: readonly AssetMetrics[] = [
        { shares: 10, comments: 20, reactions: 100, views: 1000 },
        { shares: 14, comments: 24, reactions: 140, views: 1400 },
        { shares: 12, comments: 22, reactions: 120, views: 1200 },
      ];
      const medians: BaselineMedians = recomputeBaseline(priorReadings);
      const baselineId = recordChannelBaseline(
        db,
        {
          channelId,
          ...(medians.shares !== null ? { medianShares: medians.shares } : {}),
          ...(medians.comments !== null ? { medianComments: medians.comments } : {}),
          ...(medians.reactions !== null ? { medianReactions: medians.reactions } : {}),
          ...(medians.views !== null ? { medianViews: medians.views } : {}),
        },
        () => "2026-06-10T00:00:00.000Z",
      );

      const freshReading: AssetMetrics = { shares: 24, comments: 44, reactions: 240, views: 2400 };
      const realScore = computePerformanceScore(freshReading, medians);
      const scoreId = recordPerformanceScore(db, { postId, baselineId, score: realScore, computedAt: "2026-06-12T00:00:00.000Z" });

      // Round-trip: read both back and confirm they are BYTE-IDENTICAL to what #200's real functions produced.
      const roundTrippedBaseline = getChannelBaseline(db, baselineId) as ChannelBaselineRecord;
      assert.equal(roundTrippedBaseline.medianShares, medians.shares);
      assert.equal(roundTrippedBaseline.medianComments, medians.comments);
      assert.equal(roundTrippedBaseline.medianReactions, medians.reactions);
      assert.equal(roundTrippedBaseline.medianViews, medians.views);

      const roundTrippedScore = getPerformanceScore(db, scoreId) as PerformanceScoreRecord;
      assert.equal(roundTrippedScore.score, realScore);
      assert.equal(roundTrippedScore.baselineId, baselineId);
      assert.ok(realScore >= 0 && realScore <= 1, "sanity: computePerformanceScore's own [0,1] contract held on the value we round-tripped");
    });
  });
});
