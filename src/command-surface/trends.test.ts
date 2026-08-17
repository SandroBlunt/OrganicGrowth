/**
 * Tests for the typed command surface's Trend listing (`listTrends`, issue #205 AC1/AC3).
 *
 * In-process against a real, throwaway SQLite file (`withTempDb`, never `:memory:`) — the highest seam
 * available (issue #205's own brief).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { createBrand } from "../brand/store.ts";
import { createFormat } from "../format/store.ts";
import { createTrend } from "../trend/store.ts";

import { listTrends } from "./trends.ts";

/** Minimal brand -> format -> run fixture chain a `trend` row needs. */
function seedRun(db: DatabaseSync): { readonly runId: string } {
  const brandId = createBrand(db, {
    slug: `straw-motion-${randomUUID()}`,
    name: "Straw Motion",
    timezone: "UTC",
    mediaRoot: "data/brands/straw-motion",
  });
  const formatId = createFormat(db, { brandId, slug: "unhypped-news", name: "Unhypped News", voice: "plain" });
  const runId = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO run (id, brand_id, format_id, run_key, cadence, started_at, created_at, updated_at)
     VALUES (?, ?, ?, '2026-W33', 'weekly', ?, ?, ?)`,
  ).run(runId, brandId, formatId, now, now, now);
  return { runId };
}

describe("listTrends — the command surface's read over TrendStore (issue #205)", () => {
  it("returns every Trend for a Run, momentum DESC, when called with no options", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { runId } = seedRun(db);
      createTrend(db, { runId, label: "Low momentum", momentum: 1 });
      createTrend(db, { runId, label: "High momentum", momentum: 9 });

      const trends = listTrends(db, runId);
      assert.deepEqual(
        trends.map((t) => t.label),
        ["High momentum", "Low momentum"],
      );
    });
  });

  it("returns [] for a Run with no Trends yet", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { runId } = seedRun(db);
      assert.deepEqual(listTrends(db, runId), []);
    });
  });

  it("briefableOnly: true excludes paywalled Trends (the openly-readable-source rule made visible)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { runId } = seedRun(db);
      createTrend(db, { runId, label: "Open source", momentum: 5, isPaywalled: false });
      createTrend(db, { runId, label: "Paywalled source", momentum: 8, isPaywalled: true });

      const briefable = listTrends(db, runId, { briefableOnly: true });
      assert.deepEqual(
        briefable.map((t) => t.label),
        ["Open source"],
      );

      const all = listTrends(db, runId);
      assert.equal(all.length, 2);
    });
  });
});
