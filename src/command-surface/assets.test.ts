/**
 * Tests for the typed command surface's Asset operations (`saveAsset`, `attachAssetMedia`, issue #205
 * AC1/AC3).
 *
 * In-process against a real, throwaway SQLite file (`withTempDb`, never `:memory:`).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { seedAsset, FIXTURE_RECIPE } from "../db/fixtures/seed-chain.ts";
import { loadIdeaAssets, type DbAssetRecord } from "../asset/store.ts";
import { listAssetMedia } from "../asset/store.ts";

import { saveAsset, attachAssetMedia } from "./assets.ts";

describe("saveAsset — the command surface's write over AssetStore's SQL branch (issue #205)", () => {
  it("updates the Asset's status and spec, readable back through loadIdeaAssets", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { ideaId } = await seedAsset(db);

      await saveAsset(db, ideaId, FIXTURE_RECIPE, {
        status: "produced",
        spec: { hook: "Google cuts Gemini pricing in half" },
        produced_at: "2026-08-17T00:00:00.000Z",
      });

      const assets = (await loadIdeaAssets(ideaId, { db })) as readonly DbAssetRecord[];
      const asset = assets.find((a) => a.recipe === FIXTURE_RECIPE);
      assert.ok(asset);
      assert.equal(asset.status, "produced");
      assert.deepEqual(asset.spec, { hook: "Google cuts Gemini pricing in half" });
    });
  });

  it("a second Recipe on the SAME Idea gets its own Asset row, not an overwrite", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { ideaId } = await seedAsset(db);

      await saveAsset(db, ideaId, "news-carousel", { status: "queued" });

      const assets = (await loadIdeaAssets(ideaId, { db })) as readonly DbAssetRecord[];
      assert.equal(assets.length, 2);
      assert.deepEqual(
        assets.map((a) => a.recipe).sort(),
        [FIXTURE_RECIPE, "news-carousel"].sort(),
      );
    });
  });
});

describe("attachAssetMedia — the command surface's write over AssetStore's media rows (issue #205)", () => {
  it("inserts every item in one batch, listed back in ordinal order", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { ideaId } = await seedAsset(db);
      const assets = (await loadIdeaAssets(ideaId, { db })) as readonly DbAssetRecord[];
      const assetId = assets[0]!.id;

      const ids = attachAssetMedia(db, assetId, [
        { ordinal: 0, kind: "image", storageKey: "brands/straw-motion/hook.jpg", mime: "image/jpeg", bytes: 1024, checksum: "abc" },
        { ordinal: 1, kind: "image", storageKey: "brands/straw-motion/body.jpg", mime: "image/jpeg", bytes: 2048, checksum: "def" },
      ]);

      assert.equal(ids.length, 2);
      const media = listAssetMedia(db, assetId);
      assert.deepEqual(
        media.map((m) => m.ordinal),
        [0, 1],
      );
    });
  });
});
