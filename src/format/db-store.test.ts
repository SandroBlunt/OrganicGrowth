/**
 * Tests for FormatStore's SQL-backed additions (`createFormat`/`getFormatBySlug`/`listFormatsForBrand`/
 * `updateFormat`, `src/format/store.ts`) — issue #222.
 *
 * A Format's YAML file stays the Operator-authored document (untouched by this ticket — see
 * `store.test.ts` for the existing YAML-reading suite); these SQL operations are additive, feeding the
 * `format` table every other entity (`run`, `idea`, `baseline_prompt`, `asset` via `idea`) foreign-keys
 * into.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { createBrand } from "../brand/store.ts";
import { createFormat, getFormatBySlug, getFormatById, listFormatsForBrand, updateFormat } from "./store.ts";

function seedBrand(db: Parameters<typeof createBrand>[0]): string {
  return createBrand(db, { slug: "straw-motion", name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
}

describe("createFormat — inserts a format row scoped to a Brand", () => {
  it("creates a format with defaults", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandId = seedBrand(db);
      const id = createFormat(db, {
        brandId,
        slug: "unhypped-news",
        name: "Unhypped News",
        voice: "plain, curious",
      });
      const row = getFormatById(db, id);
      assert.equal(row?.slug, "unhypped-news");
      assert.equal(row?.cadence, "weekly");
      assert.equal(row?.ideasPerRun, 10);
      assert.equal(row?.sourceMode, "peer");
      assert.deepEqual(row?.defaultRecipes, []);
    });
  });

  it("stores cadence/ideasPerRun/sourceMode/defaultRecipes when given", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandId = seedBrand(db);
      const id = createFormat(db, {
        brandId,
        slug: "unhypped-daily",
        name: "Unhypped Daily",
        voice: "plain, curious",
        cadence: "daily",
        ideasPerRun: 3,
        sourceMode: "curated",
        defaultRecipes: ["news-carousel", "news-short-script"],
      });
      const row = getFormatById(db, id);
      assert.equal(row?.cadence, "daily");
      assert.equal(row?.ideasPerRun, 3);
      assert.equal(row?.sourceMode, "curated");
      assert.deepEqual(row?.defaultRecipes, ["news-carousel", "news-short-script"]);
    });
  });

  it("rejects a duplicate (brandId, slug) pair", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandId = seedBrand(db);
      createFormat(db, { brandId, slug: "unhypped-news", name: "Unhypped News", voice: "plain" });
      assert.throws(() => {
        createFormat(db, { brandId, slug: "unhypped-news", name: "Duplicate", voice: "plain" });
      }, /UNIQUE/);
    });
  });

  it("rejects a format for an unknown brand", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      assert.throws(() => {
        createFormat(db, { brandId: "does-not-exist", slug: "unhypped-news", name: "X", voice: "plain" });
      }, /FOREIGN KEY/);
    });
  });
});

describe("getFormatBySlug / listFormatsForBrand", () => {
  it("finds a format by (brandId, slug)", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandId = seedBrand(db);
      const id = createFormat(db, { brandId, slug: "unhypped-news", name: "Unhypped News", voice: "plain" });
      assert.equal(getFormatBySlug(db, brandId, "unhypped-news")?.id, id);
      assert.equal(getFormatBySlug(db, brandId, "does-not-exist"), null);
    });
  });

  it("lists only the requested Brand's Formats, sorted by slug", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandA = seedBrand(db);
      const brandB = createBrand(db, { slug: "mundotip", name: "MundoTip", timezone: "UTC", mediaRoot: "data/brands/mundotip" });
      createFormat(db, { brandId: brandA, slug: "unhypped-news", name: "Unhypped News", voice: "plain" });
      createFormat(db, { brandId: brandA, slug: "character-explainer", name: "Character Explainer", voice: "plain" });
      createFormat(db, { brandId: brandB, slug: "life-hacks", name: "Life Hacks", voice: "warm" });
      const rows = listFormatsForBrand(db, brandA);
      assert.deepEqual(rows.map((r) => r.slug), ["character-explainer", "unhypped-news"]);
    });
  });
});

describe("updateFormat — merges a patch onto an existing format", () => {
  it("updates only the given fields", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandId = seedBrand(db);
      const id = createFormat(db, { brandId, slug: "unhypped-news", name: "Unhypped News", voice: "plain", ideasPerRun: 10 });
      updateFormat(db, id, { ideasPerRun: 5 });
      const row = getFormatById(db, id);
      assert.equal(row?.ideasPerRun, 5);
      assert.equal(row?.name, "Unhypped News", "untouched fields must survive the update");
    });
  });

  it("throws a clear error for an unknown format id", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      assert.throws(() => updateFormat(db, "does-not-exist", { name: "X" }), /Format.*does-not-exist/i);
    });
  });
});
