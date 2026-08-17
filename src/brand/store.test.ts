/**
 * Tests for BrandStore (`src/brand/store.ts`) — issue #222: the SQL-backed `brand` table CRUD, the
 * first of two genuinely NEW stores this ticket adds (Brand had no typed store module before this —
 * `brand-profile.yaml` was read ad hoc; see this ticket's Build Report).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { createBrand, getBrandBySlug, getBrandById, listBrands, updateBrand } from "./store.ts";

describe("createBrand — inserts a brand row and returns its id", () => {
  it("creates a brand with only the required fields", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const id = createBrand(db, { slug: "straw-motion", name: "Straw Motion", timezone: "Europe/Berlin", mediaRoot: "data/brands/straw-motion" });
      assert.ok(id.length > 0);
      const row = getBrandById(db, id);
      assert.equal(row?.slug, "straw-motion");
      assert.equal(row?.name, "Straw Motion");
      assert.equal(row?.timezone, "Europe/Berlin");
      assert.equal(row?.mediaRoot, "data/brands/straw-motion");
      assert.deepEqual(row?.bannedWords, []);
      assert.deepEqual(row?.requiredHashtags, []);
      assert.equal(row?.requiredCta, undefined);
      assert.equal(row?.watermarkHandle, undefined);
    });
  });

  it("stores bannedWords/requiredCta/requiredHashtags/watermarkHandle", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const id = createBrand(db, {
        slug: "mundotip",
        name: "MundoTip",
        timezone: "UTC",
        mediaRoot: "data/brands/mundotip",
        bannedWords: ["miracle", "guaranteed"],
        requiredCta: "Follow for more",
        requiredHashtags: ["#lifehacks"],
        watermarkHandle: "@mundotip",
      });
      const row = getBrandById(db, id);
      assert.deepEqual(row?.bannedWords, ["miracle", "guaranteed"]);
      assert.equal(row?.requiredCta, "Follow for more");
      assert.deepEqual(row?.requiredHashtags, ["#lifehacks"]);
      assert.equal(row?.watermarkHandle, "@mundotip");
    });
  });

  it("rejects a duplicate slug", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      createBrand(db, { slug: "straw-motion", name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      assert.throws(() => {
        createBrand(db, { slug: "straw-motion", name: "Straw Motion Two", timezone: "UTC", mediaRoot: "data/brands/straw-motion-2" });
      }, /UNIQUE/);
    });
  });
});

describe("getBrandBySlug / getBrandById — typed lookup, null for unknown", () => {
  it("finds a brand by slug", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const id = createBrand(db, { slug: "straw-motion", name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      const row = getBrandBySlug(db, "straw-motion");
      assert.equal(row?.id, id);
    });
  });

  it("returns null for an unknown slug or id", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      assert.equal(getBrandBySlug(db, "does-not-exist"), null);
      assert.equal(getBrandById(db, "does-not-exist"), null);
    });
  });
});

describe("listBrands — every committed brand, sorted by slug", () => {
  it("lists brands sorted by slug", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      createBrand(db, { slug: "straw-motion", name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      createBrand(db, { slug: "mundotip", name: "MundoTip", timezone: "UTC", mediaRoot: "data/brands/mundotip" });
      const rows = listBrands(db);
      assert.deepEqual(rows.map((r) => r.slug), ["mundotip", "straw-motion"]);
    });
  });

  it("returns [] for an empty database", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      assert.deepEqual(listBrands(db), []);
    });
  });
});

describe("updateBrand — merges a patch onto an existing brand", () => {
  it("updates only the given fields, leaving the rest unchanged", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const id = createBrand(db, { slug: "straw-motion", name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      updateBrand(db, id, { requiredCta: "Follow us" });
      const row = getBrandById(db, id);
      assert.equal(row?.requiredCta, "Follow us");
      assert.equal(row?.name, "Straw Motion", "untouched fields must survive the update");
    });
  });

  it("bumps updated_at but never touches created_at", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const id = createBrand(db, { slug: "straw-motion", name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      const before = getBrandById(db, id)!;
      updateBrand(db, id, { name: "Straw Motion Renamed" }, () => "2030-01-01T00:00:00.000Z");
      const after = getBrandById(db, id)!;
      assert.equal(after.createdAt, before.createdAt);
      assert.equal(after.updatedAt, "2030-01-01T00:00:00.000Z");
    });
  });

  it("throws a clear error for an unknown brand id", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      assert.throws(() => updateBrand(db, "does-not-exist", { name: "X" }), /Brand.*does-not-exist/i);
    });
  });
});
