/**
 * Tests for BrandAssetStore's SQL-backed additions (`createBrandAsset`/`getBrandAssetByKey`/
 * `listBrandAssetsForBrand`, `src/brand-asset/store.ts`) — issue #222.
 *
 * The file-based `listBrandAssets`/`getBrandAsset` (over `data/brands/<slug>/assets/`) stay untouched
 * (see `store.test.ts`); these SQL operations supersede `src/db/media-ref.ts`'s `insertBrandAsset` as
 * THE typed `BrandAssetStore` that module's own doc comment said issue #202 would build.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { StorageKeyError } from "../db/storage-key.ts";
import { createBrand } from "../brand/store.ts";
import { createBrandAsset, getBrandAssetByKey, listBrandAssetsForBrand } from "./store.ts";

function seedBrand(db: Parameters<typeof createBrand>[0]): string {
  return createBrand(db, { slug: "straw-motion", name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
}

describe("createBrandAsset — inserts a brand_asset row, rejecting an absolute storage key", () => {
  it("creates a brand asset with a root-relative storage key", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandId = seedBrand(db);
      const id = createBrandAsset(db, {
        brandId,
        key: "brand-logo",
        storageKey: "straw-motion/assets/brand-logo.png",
        mime: "image/png",
        bytes: 4096,
        checksum: "sha256:abc123",
      });
      const row = getBrandAssetByKey(db, brandId, "brand-logo");
      assert.equal(row?.id, id);
      assert.equal(row?.storageKey, "straw-motion/assets/brand-logo.png");
      assert.equal(row?.mime, "image/png");
    });
  });

  it("rejects an absolute storage key BEFORE writing any row", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandId = seedBrand(db);
      assert.throws(() => {
        createBrandAsset(db, {
          brandId,
          key: "brand-logo",
          storageKey: "/Users/CaxtonTaylor/Developer/OrganicGrowth/data/brands/straw-motion/assets/brand-logo.png",
          mime: "image/png",
          bytes: 4096,
          checksum: "sha256:abc123",
        });
      }, StorageKeyError);
      assert.equal(getBrandAssetByKey(db, brandId, "brand-logo"), null, "no row may land");
    });
  });

  it("rejects a duplicate (brandId, key) pair", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandId = seedBrand(db);
      createBrandAsset(db, { brandId, key: "brand-logo", storageKey: "sm/logo.png", mime: "image/png", bytes: 1, checksum: "x" });
      assert.throws(() => {
        createBrandAsset(db, { brandId, key: "brand-logo", storageKey: "sm/logo2.png", mime: "image/png", bytes: 1, checksum: "y" });
      }, /UNIQUE/);
    });
  });
});

describe("listBrandAssetsForBrand — every Brand Asset for one Brand, sorted by key", () => {
  it("lists only the requested Brand's assets", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandA = seedBrand(db);
      const brandB = createBrand(db, { slug: "mundotip", name: "MundoTip", timezone: "UTC", mediaRoot: "data/brands/mundotip" });
      createBrandAsset(db, { brandId: brandA, key: "brand-logo", storageKey: "sm/logo.png", mime: "image/png", bytes: 1, checksum: "x" });
      createBrandAsset(db, { brandId: brandA, key: "cover", storageKey: "sm/cover.png", mime: "image/png", bytes: 1, checksum: "y" });
      createBrandAsset(db, { brandId: brandB, key: "brand-logo", storageKey: "mt/logo.png", mime: "image/png", bytes: 1, checksum: "z" });
      const rows = listBrandAssetsForBrand(db, brandA);
      assert.deepEqual(rows.map((r) => r.key), ["brand-logo", "cover"]);
    });
  });

  it("returns [] for a Brand with none", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandId = seedBrand(db);
      assert.deepEqual(listBrandAssetsForBrand(db, brandId), []);
    });
  });
});

describe("getBrandAssetByKey — null for an unknown key", () => {
  it("returns null when the Brand has no asset for that key", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandId = seedBrand(db);
      assert.equal(getBrandAssetByKey(db, brandId, "does-not-exist"), null);
    });
  });
});
