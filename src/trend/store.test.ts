/**
 * Tests for TrendStore (`src/trend/store.ts`) — issue #223.
 *
 * `{ db }`-only, genuinely new (mirrors `src/brand/store.ts`/`src/channel/store.ts`'s own test shape,
 * issue #222): no pre-existing `{ ledgerPath }`-taking "Trend store" to bridge. Every test opens a real,
 * throwaway SQLite file via `withTempDb` — never `:memory:`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { createBrand } from "../brand/store.ts";
import { createFormat } from "../format/store.ts";
import { createTrend, getTrend, listTrendsForRun, listBriefableTrends } from "./store.ts";

/** Minimal brand -> format -> run fixture chain a `trend` row needs (no RunStore exists — mirrors
 *  `src/asset/db-store.test.ts`'s own `seedIdea` convention: seed the row this ticket doesn't own
 *  directly via raw SQL). Returns the Run id. */
function seedRun(db: DatabaseSync): string {
  const brandId = createBrand(db, { slug: `straw-motion-${randomUUID()}`, name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
  const formatId = createFormat(db, { brandId, slug: "unhypped-news", name: "Unhypped News", voice: "plain" });
  const runId = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO run (id, brand_id, format_id, run_key, cadence, started_at, created_at, updated_at)
     VALUES (?, ?, ?, '2026-W33', 'weekly', ?, ?, ?)`,
  ).run(runId, brandId, formatId, now, now, now);
  return runId;
}

describe("createTrend — inserts one trend row (issue #223)", () => {
  it("with only the required fields, defaults the optional ones", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const runId = seedRun(db);
      const id = createTrend(db, { runId, label: "Gemini 3.7 Flash launches at half price" });
      const trend = getTrend(db, id)!;
      assert.equal(trend.runId, runId);
      assert.equal(trend.label, "Gemini 3.7 Flash launches at half price");
      assert.deepEqual(trend.sourceUrls, []);
      assert.equal(trend.isPaywalled, false);
      assert.equal("momentum" in trend, false);
      assert.equal("platform" in trend, false);
    });
  });

  it("stores every optional field when given", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const runId = seedRun(db);
      const id = createTrend(db, {
        runId,
        label: "FT reports a private valuation leak",
        momentum: 0.82,
        sourceUrls: ["https://ft.com/some-article"],
        platform: "facebook",
        isPaywalled: true,
      });
      const trend = getTrend(db, id)!;
      assert.equal(trend.momentum, 0.82);
      assert.deepEqual(trend.sourceUrls, ["https://ft.com/some-article"]);
      assert.equal(trend.platform, "facebook");
      assert.equal(trend.isPaywalled, true);
    });
  });

  it("rejects an unknown runId", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.throws(() => createTrend(db, { runId: "does-not-exist", label: "x" }), /FOREIGN KEY/);
    });
  });
});

describe("getTrend — null for unknown", () => {
  it("returns null for an unknown id", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.equal(getTrend(db, "does-not-exist"), null);
    });
  });
});

describe("listTrendsForRun — ordered by momentum descending, scoped to one Run", () => {
  it("orders three Trends by momentum, highest first", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const runId = seedRun(db);
      createTrend(db, { runId, label: "mid", momentum: 0.5 });
      createTrend(db, { runId, label: "high", momentum: 0.9 });
      createTrend(db, { runId, label: "low", momentum: 0.7 });
      const trends = listTrendsForRun(db, runId);
      assert.deepEqual(trends.map((t) => t.momentum), [0.9, 0.7, 0.5]);
    });
  });

  it("sorts a momentum-less Trend last", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const runId = seedRun(db);
      createTrend(db, { runId, label: "no momentum recorded" });
      createTrend(db, { runId, label: "has momentum", momentum: 0.5 });
      const trends = listTrendsForRun(db, runId);
      assert.equal(trends.length, 2);
      assert.equal(trends[trends.length - 1]!.label, "no momentum recorded");
    });
  });

  it("returns [] for a Run with no Trends yet", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const runId = seedRun(db);
      assert.deepEqual(listTrendsForRun(db, runId), []);
    });
  });

  it("is scoped to its own Run — never leaks a sibling Run's Trend", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const runIdA = seedRun(db);
      const runIdB = seedRun(db);
      createTrend(db, { runId: runIdA, label: "run A's trend" });
      createTrend(db, { runId: runIdB, label: "run B's trend" });
      const trendsA = listTrendsForRun(db, runIdA);
      assert.equal(trendsA.length, 1);
      assert.equal(trendsA[0]!.label, "run A's trend");
    });
  });
});

describe("listBriefableTrends — makes an unbriefable (paywalled-only) Trend visible by data (issue #223)", () => {
  it("excludes paywalled-only Trends", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const runId = seedRun(db);
      createTrend(db, { runId, label: "openly readable", isPaywalled: false });
      createTrend(db, { runId, label: "paywalled only", isPaywalled: true });
      const briefable = listBriefableTrends(db, runId);
      assert.equal(briefable.length, 1);
      assert.equal(briefable[0]!.label, "openly readable");
    });
  });

  it("returns [] when every Trend for a Run is paywalled", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const runId = seedRun(db);
      createTrend(db, { runId, label: "ft only", isPaywalled: true });
      createTrend(db, { runId, label: "wired only", isPaywalled: true });
      assert.deepEqual(listBriefableTrends(db, runId), []);
    });
  });
});
