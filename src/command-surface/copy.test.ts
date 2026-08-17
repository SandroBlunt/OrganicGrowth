/**
 * Tests for the typed command surface's Copy Variant operation (`saveCopyVariant`, issue #208).
 *
 * In-process against a real, throwaway SQLite file (`withTempDb`, never `:memory:`).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { seedAssetAndChannel } from "../db/fixtures/seed-chain.ts";
import { getCopyVariantForChannel } from "../copy/store.ts";

import { saveCopyVariant } from "./copy.ts";

describe("saveCopyVariant — the command surface's write over the Copy Variant store (issue #208)", () => {
  it("upserts one Copy Variant, keyed on (assetId, channelId), readable back through getCopyVariantForChannel", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId, channelId } = await seedAssetAndChannel(db);

      saveCopyVariant(db, { assetId, channelId, caption: "A caption.", hashtags: ["#AInews"] });

      const record = getCopyVariantForChannel(db, assetId, channelId);
      assert.ok(record);
      assert.equal(record.caption, "A caption.");
      assert.deepEqual(record.hashtags, ["#AInews"]);
    });
  });

  it("a second call for the SAME (assetId, channelId) updates in place, never a second row", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId, channelId } = await seedAssetAndChannel(db);

      saveCopyVariant(db, { assetId, channelId, caption: "First." });
      saveCopyVariant(db, { assetId, channelId, caption: "Second." });

      const record = getCopyVariantForChannel(db, assetId, channelId);
      assert.equal(record!.caption, "Second.");
    });
  });
});
