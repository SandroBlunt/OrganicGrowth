/**
 * Tests for PostStore (`src/post/store.ts`) — issue #203, ADR-0028.
 *
 * `{ db }`-only, genuinely new. Every test opens a real, throwaway SQLite file via `withTempDb` —
 * never `:memory:`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { seedAssetAndChannel } from "../db/fixtures/seed-chain.ts";
import { createChannel } from "../channel/store.ts";
import {
  recordPost,
  getPost,
  getPostForAssetAndChannel,
  listPostsForAsset,
  updatePostTrackingState,
  type PostRecord,
} from "./store.ts";

describe("recordPost — a keyed upsert on (asset_id, channel_id)", () => {
  it("inserts a new Post row and returns its id", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId, channelId } = await seedAssetAndChannel(db);
      const id = recordPost(db, { assetId, channelId, postUrl: "https://facebook.com/p/1", postedAt: "2026-06-05T10:00:00.000Z" });
      const post = getPost(db, id) as PostRecord;
      assert.equal(post.assetId, assetId);
      assert.equal(post.channelId, channelId);
      assert.equal(post.postUrl, "https://facebook.com/p/1");
      assert.equal(post.postedAt, "2026-06-05T10:00:00.000Z");
      assert.equal("trackingState" in post, false);
    });
  });

  it("re-recording the SAME (asset, channel) UPDATES the one row, never adds a second", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId, channelId } = await seedAssetAndChannel(db);
      const first = recordPost(db, { assetId, channelId, postUrl: "https://facebook.com/p/typo", postedAt: "2026-06-05T10:00:00.000Z" });
      const second = recordPost(db, { assetId, channelId, postUrl: "https://facebook.com/p/corrected", postedAt: "2026-06-05T10:00:00.000Z" });
      assert.equal(first, second, "the SAME row id is returned — a re-log updates in place");
      const post = getPost(db, first) as PostRecord;
      assert.equal(post.postUrl, "https://facebook.com/p/corrected");
      assert.equal(listPostsForAsset(db, assetId).length, 1);
    });
  });

  it("throws a FOREIGN KEY error for an unknown assetId/channelId", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { channelId } = await seedAssetAndChannel(db);
      assert.throws(
        () => recordPost(db, { assetId: "does-not-exist", channelId, postUrl: "https://facebook.com/p/1", postedAt: "2026-06-05T10:00:00.000Z" }),
        /FOREIGN KEY/,
      );
    });
  });
});

describe("one Asset, more than one Channel — CONTEXT.md \"Post\": each measured separately (issue #203)", () => {
  it("publishing the SAME Asset to a SECOND Channel yields a SECOND, independent Post row", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId, channelId: facebook } = await seedAssetAndChannel(db);
      const linkedin = createChannel(db, { brandId, platform: "linkedin" });

      const facebookPostId = recordPost(db, { assetId, channelId: facebook, postUrl: "https://facebook.com/p/1", postedAt: "2026-06-05T10:00:00.000Z" });
      const linkedinPostId = recordPost(db, { assetId, channelId: linkedin, postUrl: "https://linkedin.com/p/1", postedAt: "2026-06-05T11:00:00.000Z" });

      assert.notEqual(facebookPostId, linkedinPostId);
      const posts = listPostsForAsset(db, assetId);
      assert.equal(posts.length, 2);
      assert.deepEqual(posts.map((p) => p.channelId).sort(), [facebook, linkedin].sort());
    });
  });
});

describe("Reads", () => {
  it("getPost returns null for an unknown id — never throws", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.equal(getPost(db, "does-not-exist"), null);
    });
  });

  it("getPostForAssetAndChannel returns null when no Post has been logged yet", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId, channelId } = await seedAssetAndChannel(db);
      assert.equal(getPostForAssetAndChannel(db, assetId, channelId), null);
    });
  });

  it("getPostForAssetAndChannel finds the exact (asset, channel) pair's Post", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId, channelId } = await seedAssetAndChannel(db);
      const id = recordPost(db, { assetId, channelId, postUrl: "https://facebook.com/p/1", postedAt: "2026-06-05T10:00:00.000Z" });
      const post = getPostForAssetAndChannel(db, assetId, channelId) as PostRecord;
      assert.equal(post.id, id);
    });
  });

  it("listPostsForAsset returns [] for an Asset with no logged Post", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAssetAndChannel(db);
      assert.deepEqual(listPostsForAsset(db, assetId), []);
    });
  });
});

describe("updatePostTrackingState", () => {
  it("updates the tracking_state field in place", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId, channelId } = await seedAssetAndChannel(db);
      const id = recordPost(db, { assetId, channelId, postUrl: "https://facebook.com/p/1", postedAt: "2026-06-05T10:00:00.000Z" });
      updatePostTrackingState(db, id, "tracking");
      const post = getPost(db, id) as PostRecord;
      assert.equal(post.trackingState, "tracking");
    });
  });

  it("throws a named error for an unknown postId, changing nothing", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.throws(() => updatePostTrackingState(db, "does-not-exist", "tracking"), /not found/);
    });
  });
});
