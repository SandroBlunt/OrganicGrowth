import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { runMigrations } from "./migrate.ts";
import { withTempDb } from "./test-support.ts";
import { insertAssetMedia, insertBrandAsset } from "./media-ref.ts";
import { StorageKeyError } from "./storage-key.ts";
import { HOOK_TYPES } from "../vocabulary/hook-type.ts";
import { THEMES } from "../vocabulary/theme.ts";
import { listWiredRecipeSlugs } from "../recipe/registry.ts";

/** A full brand -> format -> run -> idea -> asset fixture chain, since `asset_media` requires a real
 *  `asset_id`. Returns the ids `insertAssetMedia`'s tests need. */
function insertAssetFixture(db: DatabaseSync): { readonly brandId: string; readonly assetId: string } {
  const now = new Date().toISOString();
  const brandId = randomUUID();
  db.prepare(
    `INSERT INTO brand (id, slug, name, timezone, media_root, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(brandId, "test-brand", "Test Brand", "UTC", "data/brands/test-brand", now, now);

  const formatId = randomUUID();
  db.prepare(
    `INSERT INTO format (id, brand_id, slug, name, voice, cadence, ideas_per_run, source_mode, created_at, updated_at)
     VALUES (?, ?, 'unhypped-news', 'Unhypped News', 'plain', 'weekly', 10, 'peer', ?, ?)`,
  ).run(formatId, brandId, now, now);

  const runId = randomUUID();
  db.prepare(
    `INSERT INTO run (id, brand_id, format_id, run_key, cadence, started_at, created_at, updated_at)
     VALUES (?, ?, ?, '2026-W32', 'weekly', ?, ?, ?)`,
  ).run(runId, brandId, formatId, now, now, now);

  const ideaId = randomUUID();
  db.prepare(
    `INSERT INTO idea (id, run_id, brand_id, format_id, title, brief, status, hook_type, theme, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Test Idea', 'A brief.', 'suggested', ?, ?, ?, ?)`,
  ).run(ideaId, runId, brandId, formatId, HOOK_TYPES[0].value, THEMES[0].value, now, now);

  const assetId = randomUUID();
  const [recipeSlug] = listWiredRecipeSlugs();
  db.prepare(
    `INSERT INTO asset (id, idea_id, recipe_slug, status, created_at, updated_at) VALUES (?, ?, ?, 'queued', ?, ?)`,
  ).run(assetId, ideaId, recipeSlug, now, now);

  return { brandId, assetId };
}

describe("insertAssetMedia — the storage-key rule enforced against a REAL asset_media insert", () => {
  it("inserts successfully with a well-formed root-relative storage key", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const { assetId } = insertAssetFixture(db);
      const id = insertAssetMedia(db, {
        assetId,
        ordinal: 0,
        kind: "image",
        storageKey: "straw-motion/2026-W32/idea-01/0-hook.jpg",
        mime: "image/jpeg",
        bytes: 12345,
        checksum: "deadbeef",
      });
      const row = db.prepare("SELECT * FROM asset_media WHERE id = ?").get(id);
      assert.equal(row?.storage_key, "straw-motion/2026-W32/idea-01/0-hook.jpg");
      assert.equal(row?.kind, "image");
    });
  });

  it("rejects an absolute storage key BEFORE any row is written — no partial insert", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const { assetId } = insertAssetFixture(db);
      assert.throws(
        () =>
          insertAssetMedia(db, {
            assetId,
            ordinal: 0,
            kind: "image",
            storageKey: "/Users/CaxtonTaylor/Developer/OrganicGrowth/data/x.jpg",
            mime: "image/jpeg",
            bytes: 1,
            checksum: "x",
          }),
        StorageKeyError,
      );
      const count = db.prepare("SELECT COUNT(*) AS n FROM asset_media").get()?.n;
      assert.equal(count, 0, "a rejected storage key must leave no row behind");
    });
  });
});

describe("insertBrandAsset — the storage-key rule enforced against a REAL brand_asset insert", () => {
  it("inserts successfully with a well-formed root-relative storage key", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const now = new Date().toISOString();
      const brandId = randomUUID();
      db.prepare(
        `INSERT INTO brand (id, slug, name, timezone, media_root, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(brandId, "test-brand", "Test Brand", "UTC", "data/brands/test-brand", now, now);

      const id = insertBrandAsset(db, {
        brandId,
        key: "Brand_Logo",
        storageKey: "data/brands/test-brand/assets/Brand_Logo.png",
        mime: "image/png",
        bytes: 999,
        checksum: "cafebabe",
      });
      const row = db.prepare("SELECT * FROM brand_asset WHERE id = ?").get(id);
      assert.equal(row?.key, "Brand_Logo");
    });
  });

  it("rejects a home-directory-shorthand storage key", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const now = new Date().toISOString();
      const brandId = randomUUID();
      db.prepare(
        `INSERT INTO brand (id, slug, name, timezone, media_root, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(brandId, "test-brand", "Test Brand", "UTC", "data/brands/test-brand", now, now);

      assert.throws(
        () =>
          insertBrandAsset(db, {
            brandId,
            key: "Brand_Logo",
            storageKey: "~/OrganicGrowth-Backups/Brand_Logo.png",
            mime: "image/png",
            bytes: 1,
            checksum: "x",
          }),
        StorageKeyError,
      );
    });
  });
});
