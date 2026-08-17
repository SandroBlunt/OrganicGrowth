/**
 * Tests for the typed command surface's Post logging (`logPost`, issue #205 AC1/AC3).
 *
 * In-process against a real, throwaway SQLite file (`withTempDb`, never `:memory:`).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { seedAssetAndChannel } from "../db/fixtures/seed-chain.ts";
import { getPostForAssetAndChannel } from "../post/store.ts";

import { logPost } from "./posts.ts";

describe("logPost — the command surface's write over PostStore (issue #205)", () => {
  it("records a Post keyed (asset, channel), readable back through getPostForAssetAndChannel", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId, channelId } = await seedAssetAndChannel(db);

      const id = logPost(db, {
        assetId,
        channelId,
        postUrl: "https://www.facebook.com/strawmotion/posts/123",
        postedAt: "2026-08-17T09:00:00.000Z",
      });

      const post = getPostForAssetAndChannel(db, assetId, channelId);
      assert.ok(post);
      assert.equal(post.id, id);
      assert.equal(post.postUrl, "https://www.facebook.com/strawmotion/posts/123");
    });
  });

  it("re-logging for the SAME (asset, channel) updates the row in place — a corrected URL", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId, channelId } = await seedAssetAndChannel(db);

      const firstId = logPost(db, {
        assetId,
        channelId,
        postUrl: "https://www.facebook.com/strawmotion/posts/wrong",
        postedAt: "2026-08-17T09:00:00.000Z",
      });
      const secondId = logPost(db, {
        assetId,
        channelId,
        postUrl: "https://www.facebook.com/strawmotion/posts/corrected",
        postedAt: "2026-08-17T09:05:00.000Z",
      });

      assert.equal(secondId, firstId);
      const post = getPostForAssetAndChannel(db, assetId, channelId);
      assert.equal(post?.postUrl, "https://www.facebook.com/strawmotion/posts/corrected");
    });
  });
});
