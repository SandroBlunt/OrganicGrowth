import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { seedAsset } from "../db/fixtures/seed-chain.ts";
import { createBrandAsset } from "../brand-asset/store.ts";
import { getRecipe } from "../recipe/registry.ts";
import { resolveMediaSlotResolutions } from "./resolve-media-slots.ts";

const NEWS_CAROUSEL = getRecipe("news-carousel")!;
const CHARACTER_EXPLAINER = getRecipe("character-explainer-with-cast")!;

describe("resolveMediaSlotResolutions — resolves a Recipe's media slots against the SQL stores (issue #208)", () => {
  it("resolves a committed brand-asset slot to its storage key", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId } = await seedAsset(db);
      createBrandAsset(db, {
        brandId,
        key: "brand-logo",
        storageKey: "brands/straw-motion/assets/brand-logo.png",
        mime: "image/png",
        bytes: 10,
        checksum: "abc",
      });

      const resolutions = resolveMediaSlotResolutions(db, brandId, NEWS_CAROUSEL, undefined);
      assert.deepEqual(resolutions, {
        Brand_Logo: {
          kind: "brand-asset",
          found: true,
          path: "brands/straw-motion/assets/brand-logo.png",
        },
      });
    });
  });

  it("resolves an UNCOMMITTED brand-asset slot as found: false, with a clear message", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId } = await seedAsset(db);
      const resolutions = resolveMediaSlotResolutions(db, brandId, NEWS_CAROUSEL, undefined);
      const slot = resolutions.Brand_Logo!;
      assert.equal(slot.kind, "brand-asset");
      assert.equal(slot.found, false);
      if (slot.kind === "brand-asset" && !slot.found) {
        assert.match(slot.message, /brand-logo/);
      }
    });
  });

  it("resolves an idea-pick slot from the supplied pick, when given", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId } = await seedAsset(db);
      const resolutions = resolveMediaSlotResolutions(db, brandId, CHARACTER_EXPLAINER, "cast-2");
      assert.deepEqual(resolutions, {
        "Selected Character": { kind: "idea-pick", found: true, pick: "cast-2" },
      });
    });
  });

  it("resolves an idea-pick slot as found: false when no pick is supplied", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId } = await seedAsset(db);
      const resolutions = resolveMediaSlotResolutions(db, brandId, CHARACTER_EXPLAINER, undefined);
      assert.deepEqual(resolutions, { "Selected Character": { kind: "idea-pick", found: false } });
    });
  });
});
