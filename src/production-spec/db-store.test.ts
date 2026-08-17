/**
 * Tests for the SQL-backed Production Spec persistence (`saveProductionSpec`/`loadProductionSpec`,
 * `src/production-spec/store.ts`) — issue #222.
 *
 * The Production Spec no longer sits BESIDE the Brief as its own `.spec.json` file when SQL-backed —
 * it lives inline on `asset.spec_json` (`src/db/schema.ts`, frozen from issue #201). The existing
 * `specPathFor`/`saveSpec`/`briefShortName` file-based functions stay untouched (see `store.test.ts`).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { HOOK_TYPES } from "../vocabulary/hook-type.ts";
import { THEMES } from "../vocabulary/theme.ts";
import { createBrand } from "../brand/store.ts";
import { createFormat } from "../format/store.ts";
import { writeAsset, loadIdeaAssets } from "../asset/store.ts";
import { saveProductionSpec, loadProductionSpec } from "./store.ts";

const VALID_HOOK_TYPE = HOOK_TYPES[0]!.value;
const VALID_THEME = THEMES[0]!.value;

async function seedAsset(db: DatabaseSync): Promise<string> {
  const brandId = createBrand(db, { slug: "straw-motion", name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
  const formatId = createFormat(db, { brandId, slug: "unhypped-news", name: "Unhypped News", voice: "plain" });
  const runId = randomUUID();
  const ideaId = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO run (id, brand_id, format_id, run_key, cadence, started_at, created_at, updated_at)
     VALUES (?, ?, ?, '2026-W33', 'weekly', ?, ?, ?)`,
  ).run(runId, brandId, formatId, now, now, now);
  db.prepare(
    `INSERT INTO idea (id, run_id, brand_id, format_id, title, brief, status, hook_type, theme, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Test Idea', 'A brief.', 'accepted', ?, ?, ?, ?)`,
  ).run(ideaId, runId, brandId, formatId, VALID_HOOK_TYPE, VALID_THEME, now, now);
  await writeAsset(ideaId, "character-explainer-with-cast", { status: "in_production" }, { db });
  return (await loadIdeaAssets(ideaId, { db }))![0]!.id;
}

describe("saveProductionSpec / loadProductionSpec — the Production Spec lives on asset.spec_json", () => {
  it("returns null before any spec has been saved", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const assetId = await seedAsset(db);
      assert.equal(loadProductionSpec(db, assetId), null);
    });
  });

  it("round-trips a Production Spec verbatim", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const assetId = await seedAsset(db);
      const spec = {
        character_concepts: ["a", "b", "c"],
        clips: [{ id: "c1", clip_id: 1, concept_title: "t", image_prompt: "p Aspect Ratio 9:16.", video_prompt: "v" }],
        thumbnails: ["t1", "t2", "t3"],
      };
      saveProductionSpec(db, assetId, spec);
      assert.deepEqual(loadProductionSpec(db, assetId), spec);
    });
  });

  it("overwrites a previously saved spec", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const assetId = await seedAsset(db);
      saveProductionSpec(db, assetId, { a: 1 });
      saveProductionSpec(db, assetId, { b: 2 });
      assert.deepEqual(loadProductionSpec(db, assetId), { b: 2 });
    });
  });

  it("throws a clear error when saving to an unknown Asset id", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      assert.throws(() => saveProductionSpec(db, "does-not-exist", { a: 1 }), /Asset.*does-not-exist/i);
    });
  });

  it("returns null (not a throw) when loading from an unknown Asset id", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      assert.equal(loadProductionSpec(db, "does-not-exist"), null);
    });
  });
});
