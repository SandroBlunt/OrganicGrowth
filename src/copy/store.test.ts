/**
 * Tests for the SQL-backed Copy Variant store (`src/copy/store.ts`) — issue #222 AC: "asset_media and
 * copy_variant are stored as rows, with Copy variants keyed to a Channel."
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
import { createChannel } from "../channel/store.ts";
import { createFormat } from "../format/store.ts";
import { writeAsset, loadIdeaAssets } from "../asset/store.ts";
import { upsertCopyVariant, upsertCopyVariants, listCopyVariants, getCopyVariantForChannel } from "./store.ts";

const VALID_HOOK_TYPE = HOOK_TYPES[0]!.value;
const VALID_THEME = THEMES[0]!.value;

/** Seeds brand -> two channels -> format -> run -> idea -> asset, returning both channel ids and the
 *  asset id. */
async function seedFixture(db: DatabaseSync): Promise<{ readonly assetId: string; readonly fbChannelId: string; readonly liChannelId: string }> {
  const brandId = createBrand(db, { slug: "straw-motion", name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
  const fbChannelId = createChannel(db, { brandId, platform: "facebook", isPrimary: true });
  const liChannelId = createChannel(db, { brandId, platform: "linkedin" });
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
  await writeAsset(ideaId, "news-carousel", { status: "produced" }, { db });
  const assetId = (await loadIdeaAssets(ideaId, { db }))![0]!.id;
  return { assetId, fbChannelId, liChannelId };
}

describe("upsertCopyVariant — inserts/updates one Copy variant, keyed to (asset, channel)", () => {
  it("creates a new variant for a channel", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId, fbChannelId } = await seedFixture(db);
      upsertCopyVariant(db, { assetId, channelId: fbChannelId, caption: "Facebook body.", hashtags: ["#news"] });
      const row = getCopyVariantForChannel(db, assetId, fbChannelId);
      assert.equal(row?.caption, "Facebook body.");
      assert.deepEqual(row?.hashtags, ["#news"]);
    });
  });

  it("updates an existing variant in place rather than duplicating", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId, fbChannelId } = await seedFixture(db);
      upsertCopyVariant(db, { assetId, channelId: fbChannelId, caption: "First.", hashtags: [] });
      upsertCopyVariant(db, { assetId, channelId: fbChannelId, caption: "Second.", hashtags: ["#a"] });
      const rows = listCopyVariants(db, assetId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.caption, "Second.");
    });
  });

  it("carries unresolvedMentions in mentions_json when present", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId, liChannelId } = await seedFixture(db);
      upsertCopyVariant(db, {
        assetId,
        channelId: liChannelId,
        caption: "LinkedIn body @OpenAI.",
        hashtags: ["#news"],
        unresolvedMentions: ["Unknown Startup", "Ghost Co"],
      });
      const row = getCopyVariantForChannel(db, assetId, liChannelId);
      assert.deepEqual(row?.unresolvedMentions, ["Unknown Startup", "Ghost Co"]);
    });
  });

  it("rejects a channel id that does not exist", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedFixture(db);
      assert.throws(() => {
        upsertCopyVariant(db, { assetId, channelId: "does-not-exist", caption: "x", hashtags: [] });
      }, /FOREIGN KEY/);
    });
  });
});

describe("listCopyVariants / getCopyVariantForChannel", () => {
  it("lists every Channel's variant for one Asset", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId, fbChannelId, liChannelId } = await seedFixture(db);
      upsertCopyVariant(db, { assetId, channelId: fbChannelId, caption: "FB.", hashtags: [] });
      upsertCopyVariant(db, { assetId, channelId: liChannelId, caption: "LI.", hashtags: [] });
      const rows = listCopyVariants(db, assetId);
      assert.equal(rows.length, 2);
    });
  });

  it("getCopyVariantForChannel returns null when the Asset has no variant for that Channel", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId, liChannelId } = await seedFixture(db);
      assert.equal(getCopyVariantForChannel(db, assetId, liChannelId), null);
    });
  });
});

describe("upsertCopyVariants — batch write, atomic (issue #222 transaction requirement)", () => {
  it("commits every variant when the whole batch is valid", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId, fbChannelId, liChannelId } = await seedFixture(db);
      upsertCopyVariants(db, assetId, [
        { channelId: fbChannelId, caption: "FB.", hashtags: [] },
        { channelId: liChannelId, caption: "LI.", hashtags: [] },
      ]);
      assert.equal(listCopyVariants(db, assetId).length, 2);
    });
  });

  it("a failure partway through a multi-channel batch leaves NOTHING behind", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId, fbChannelId } = await seedFixture(db);
      assert.throws(() => {
        upsertCopyVariants(db, assetId, [
          { channelId: fbChannelId, caption: "FB.", hashtags: [] },
          { channelId: "does-not-exist", caption: "Bad.", hashtags: [] },
        ]);
      }, /FOREIGN KEY/);
      assert.deepEqual(listCopyVariants(db, assetId), [], "the valid FB variant must not survive either");
    });
  });
});
