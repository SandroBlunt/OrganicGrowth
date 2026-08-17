/**
 * Tests for AssetStore's SQL-backed branch (`src/asset/store.ts`) — issue #222.
 *
 * `loadIdeaAssets`/`writeAsset` keep their exact names and arity; the injected option becomes
 * `{ db }` (a real, migrated `DatabaseSync`) instead of a `ledgerPath` string — proven here against a
 * real throwaway SQLite file, mirroring `store.test.ts`'s existing ledger-based suite (which stays
 * green, untouched, for every EXISTING caller still passing `ledgerPath`).
 *
 * The SQL-backed return shape (`DbAssetRecord`) is DELIBERATELY narrower than the file-based
 * `LedgerAssetRecord` — see this ticket's Build Report "Known Limits" for exactly which fields have no
 * home in the schema #201 landed (cast/character/metrics/history/post_url/posted_at/performance_score/
 * has_video_slide) and why.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { StorageKeyError } from "../db/storage-key.ts";
import { HOOK_TYPES } from "../vocabulary/hook-type.ts";
import { THEMES } from "../vocabulary/theme.ts";
import { createBrand } from "../brand/store.ts";
import { createFormat } from "../format/store.ts";
import {
  loadIdeaAssets,
  writeAsset,
  addAssetMedia,
  addAssetMediaBatch,
  listAssetMedia,
  type DbAssetRecord,
} from "./store.ts";

const VALID_HOOK_TYPE = HOOK_TYPES[0]!.value;
const VALID_THEME = THEMES[0]!.value;

/** Seeds brand -> format -> run -> idea, returning the idea id. Mirrors `schema.test.ts`'s own fixture
 *  chain — IdeaStore doesn't exist yet (issue #223), so tests seed the row directly. */
function seedIdea(db: DatabaseSync): string {
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
  return ideaId;
}

describe("loadIdeaAssets({ db }) — reads one Idea's Assets from the asset table", () => {
  it("returns null for an unknown Idea", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.equal(await loadIdeaAssets("does-not-exist", { db }), null);
    });
  });

  it("returns [] for a known Idea with no Assets yet", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const ideaId = seedIdea(db);
      assert.deepEqual(await loadIdeaAssets(ideaId, { db }), []);
    });
  });

  it("returns the Assets written for that Idea", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const ideaId = seedIdea(db);
      await writeAsset(ideaId, "news-carousel", { status: "queued" }, { db });
      const assets = (await loadIdeaAssets(ideaId, { db })) as readonly DbAssetRecord[];
      assert.equal(assets.length, 1);
      assert.equal(assets[0]!.recipe, "news-carousel");
      assert.equal(assets[0]!.status, "queued");
    });
  });
});

describe("writeAsset({ db }) — upserts one Recipe's Asset row, keyed on (idea_id, recipe_slug)", () => {
  it("creates a NEW Asset for a Recipe the Idea has none of yet", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const ideaId = seedIdea(db);
      await writeAsset(ideaId, "news-carousel", { status: "queued" }, { db });
      const assets = (await loadIdeaAssets(ideaId, { db }))!;
      assert.deepEqual(
        assets.map((a) => ({ recipe: a.recipe, status: a.status })),
        [{ recipe: "news-carousel", status: "queued" }],
      );
    });
  });

  it("UPDATES an existing Asset in place (merge), leaving other fields untouched", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const ideaId = seedIdea(db);
      await writeAsset(ideaId, "character-explainer-with-cast", { status: "queued" }, { db });
      await writeAsset(
        ideaId,
        "character-explainer-with-cast",
        { status: "in_production", pending_gate: "cast" },
        { db },
      );
      const assets = (await loadIdeaAssets(ideaId, { db }))!;
      assert.equal(assets.length, 1, "must UPDATE, not duplicate, the same (idea, recipe) row");
      assert.equal(assets[0]!.status, "in_production");
      assert.equal(assets[0]!.pending_gate, "cast");
    });
  });

  it("leaves a SIBLING Asset's fields untouched when writing to another Recipe on the same Idea", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const ideaId = seedIdea(db);
      await writeAsset(ideaId, "news-carousel", { status: "produced", scheduled_at: "2026-08-05T13:23:00.000Z" }, { db });
      await writeAsset(ideaId, "character-explainer-with-cast", { status: "queued" }, { db });
      const assets = (await loadIdeaAssets(ideaId, { db }))!;
      const carousel = assets.find((a) => a.recipe === "news-carousel")!;
      assert.equal(carousel.scheduled_at, "2026-08-05T13:23:00.000Z", "must survive the sibling write");
    });
  });

  it("leaves the database untouched for an unknown Idea (mirrors the ledger's own convention)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      await writeAsset("does-not-exist", "news-carousel", { status: "queued" }, { db });
      assert.equal(await loadIdeaAssets("does-not-exist", { db }), null);
    });
  });

  it("round-trips a spec (Production Spec JSON) via the asset.spec_json column", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const ideaId = seedIdea(db);
      const spec = { character_concepts: ["a", "b", "c"], clips: [], thumbnails: [] };
      await writeAsset(ideaId, "character-explainer-with-cast", { status: "in_production", spec }, { db });
      const assets = (await loadIdeaAssets(ideaId, { db }))!;
      assert.deepEqual(assets[0]!.spec, spec);
    });
  });

  it("round-trips a zoho_schedule_reference verbatim, string or array", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const ideaId = seedIdea(db);
      await writeAsset(
        ideaId,
        "news-carousel",
        { status: "produced", zoho_schedule_reference: ["fb_post_1", "ig_post_1"] },
        { db },
      );
      const assets = (await loadIdeaAssets(ideaId, { db }))!;
      assert.deepEqual(assets[0]!.zoho_schedule_reference, ["fb_post_1", "ig_post_1"]);
    });
  });

  it("rejects an unknown recipe_slug (registry-trusted vocabulary, same FK as idea_recipe)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const ideaId = seedIdea(db);
      await assert.rejects(() => writeAsset(ideaId, "not-a-real-recipe", { status: "queued" }, { db }), /FOREIGN KEY/);
    });
  });
});

describe("addAssetMedia / addAssetMediaBatch / listAssetMedia — asset_media as rows (AC)", () => {
  it("adds one media row and lists it back, in ordinal order", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const ideaId = seedIdea(db);
      await writeAsset(ideaId, "news-carousel", { status: "produced" }, { db });
      const assets = (await loadIdeaAssets(ideaId, { db }))!;
      const assetId = assets[0]!.id;

      addAssetMedia(db, assetId, { ordinal: 1, kind: "image", storageKey: "sm/2026-W33/idea-01/1.jpg", mime: "image/jpeg", bytes: 100, checksum: "a" });
      addAssetMedia(db, assetId, { ordinal: 0, kind: "image", storageKey: "sm/2026-W33/idea-01/0.jpg", mime: "image/jpeg", bytes: 100, checksum: "b" });

      const media = listAssetMedia(db, assetId);
      assert.deepEqual(media.map((m) => m.ordinal), [0, 1]);
    });
  });

  it("rejects an absolute storage key before writing any row", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const ideaId = seedIdea(db);
      await writeAsset(ideaId, "news-carousel", { status: "produced" }, { db });
      const assetId = (await loadIdeaAssets(ideaId, { db }))![0]!.id;
      assert.throws(
        () => addAssetMedia(db, assetId, { ordinal: 0, kind: "image", storageKey: "/abs/path.jpg", mime: "image/jpeg", bytes: 1, checksum: "a" }),
        StorageKeyError,
      );
      assert.deepEqual(listAssetMedia(db, assetId), []);
    });
  });

  it("addAssetMediaBatch: a failure partway through a multi-row batch leaves NOTHING behind (transaction proof)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const ideaId = seedIdea(db);
      await writeAsset(ideaId, "news-carousel", { status: "produced" }, { db });
      const assetId = (await loadIdeaAssets(ideaId, { db }))![0]!.id;

      assert.throws(() => {
        addAssetMediaBatch(db, assetId, [
          { ordinal: 0, kind: "image", storageKey: "sm/0.jpg", mime: "image/jpeg", bytes: 1, checksum: "a" },
          { ordinal: 1, kind: "image", storageKey: "sm/1.jpg", mime: "image/jpeg", bytes: 1, checksum: "b" },
          // Duplicate ordinal 0 -> violates UNIQUE (asset_id, ordinal); must roll back the WHOLE batch.
          { ordinal: 0, kind: "image", storageKey: "sm/0-again.jpg", mime: "image/jpeg", bytes: 1, checksum: "c" },
        ]);
      }, /UNIQUE/);

      assert.deepEqual(listAssetMedia(db, assetId), [], "not even the first two individually-valid rows may survive");
    });
  });

  it("addAssetMediaBatch commits every row when the whole batch is valid", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const ideaId = seedIdea(db);
      await writeAsset(ideaId, "news-carousel", { status: "produced" }, { db });
      const assetId = (await loadIdeaAssets(ideaId, { db }))![0]!.id;

      addAssetMediaBatch(db, assetId, [
        { ordinal: 0, kind: "image", storageKey: "sm/0.jpg", mime: "image/jpeg", bytes: 1, checksum: "a" },
        { ordinal: 1, kind: "image", storageKey: "sm/1.jpg", mime: "image/jpeg", bytes: 1, checksum: "b" },
      ]);
      assert.equal(listAssetMedia(db, assetId).length, 2);
    });
  });
});
