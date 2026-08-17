/**
 * Tests for ChannelStore (`src/channel/store.ts`) — issue #222: the SQL-backed `channel` table CRUD,
 * the second genuinely NEW store this ticket adds.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { createBrand } from "../brand/store.ts";
import {
  createChannel,
  getChannel,
  getChannelByPlatform,
  getPrimaryChannel,
  listChannelsForBrand,
  setPrimaryChannel,
} from "./store.ts";

describe("createChannel — inserts a channel row scoped to a Brand", () => {
  it("creates a channel with defaults (not primary, not tracked)", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandId = createBrand(db, { slug: "straw-motion", name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      const id = createChannel(db, { brandId, platform: "facebook" });
      const row = getChannel(db, id);
      assert.equal(row?.platform, "facebook");
      assert.equal(row?.isPrimary, false);
      assert.equal(row?.isTracked, false);
      assert.equal(row?.brandId, brandId);
    });
  });

  it("rejects a platform outside KNOWN_PLATFORMS", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandId = createBrand(db, { slug: "straw-motion", name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      assert.throws(() => createChannel(db, { brandId, platform: "myspace" as never }), /CHECK/);
    });
  });

  it("rejects a channel for an unknown brand", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      assert.throws(() => createChannel(db, { brandId: "does-not-exist", platform: "facebook" }), /FOREIGN KEY/);
    });
  });

  it("rejects a SECOND primary channel for the same Brand (schema's own partial unique index)", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandId = createBrand(db, { slug: "straw-motion", name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      createChannel(db, { brandId, platform: "facebook", isPrimary: true });
      assert.throws(() => createChannel(db, { brandId, platform: "instagram", isPrimary: true }), /UNIQUE/);
    });
  });
});

describe("getChannel / getChannelByPlatform — typed lookup, null for unknown", () => {
  it("finds a channel by platform, scoped to its Brand", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandA = createBrand(db, { slug: "straw-motion", name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      const brandB = createBrand(db, { slug: "mundotip", name: "MundoTip", timezone: "UTC", mediaRoot: "data/brands/mundotip" });
      createChannel(db, { brandId: brandA, platform: "facebook" });
      createChannel(db, { brandId: brandB, platform: "instagram" });
      assert.equal(getChannelByPlatform(db, brandA, "facebook")?.brandId, brandA);
      assert.equal(getChannelByPlatform(db, brandA, "instagram"), null, "instagram belongs to the OTHER brand");
    });
  });

  it("returns null for an unknown id", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      assert.equal(getChannel(db, "does-not-exist"), null);
    });
  });
});

describe("listChannelsForBrand — every Channel for one Brand, sorted by platform", () => {
  it("lists only the requested Brand's Channels", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandA = createBrand(db, { slug: "straw-motion", name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      const brandB = createBrand(db, { slug: "mundotip", name: "MundoTip", timezone: "UTC", mediaRoot: "data/brands/mundotip" });
      createChannel(db, { brandId: brandA, platform: "linkedin" });
      createChannel(db, { brandId: brandA, platform: "facebook" });
      createChannel(db, { brandId: brandB, platform: "instagram" });
      const rows = listChannelsForBrand(db, brandA);
      assert.deepEqual(rows.map((r) => r.platform), ["facebook", "linkedin"]);
    });
  });
});

describe("getPrimaryChannel / setPrimaryChannel", () => {
  it("returns null when no Channel is primary yet", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandId = createBrand(db, { slug: "straw-motion", name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      createChannel(db, { brandId, platform: "facebook" });
      assert.equal(getPrimaryChannel(db, brandId), null);
    });
  });

  it("setPrimaryChannel atomically moves primary from one Channel to another", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandId = createBrand(db, { slug: "straw-motion", name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      const fb = createChannel(db, { brandId, platform: "facebook", isPrimary: true });
      const ig = createChannel(db, { brandId, platform: "instagram" });

      assert.equal(getPrimaryChannel(db, brandId)?.id, fb);
      setPrimaryChannel(db, ig);
      assert.equal(getPrimaryChannel(db, brandId)?.id, ig);
      assert.equal(getChannel(db, fb)?.isPrimary, false, "the old primary must be demoted");
    });
  });

  it("setPrimaryChannel on an unknown channel id throws and changes nothing", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandId = createBrand(db, { slug: "straw-motion", name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      const fb = createChannel(db, { brandId, platform: "facebook", isPrimary: true });
      assert.throws(() => setPrimaryChannel(db, "does-not-exist"), /Channel.*does-not-exist/i);
      assert.equal(getChannel(db, fb)?.isPrimary, true, "the real primary must be unaffected by the failed call");
    });
  });
});
