/**
 * Tests for the typed command surface's tenancy operations — `createBrand`/`createFormat`/`createRun`
 * (issue #204), `createChannel` (issue #240) — thin shells over `src/brand/store.ts`/
 * `src/format/store.ts`/`src/run/store.ts`/`src/channel/store.ts`.
 *
 * None of these four were part of issue #205's own eight named operations (listing Trends, creating an
 * Idea, recording a Review decision, enqueuing/claiming jobs, saving an Asset, logging a Post, reading
 * Performance) — #205 scoped itself to the runtime pipeline's own eight verbs. The one-shot importer
 * (#204/#240) is the first caller that needs to create Brand/Format/Run/Channel rows at all, and "route
 * every write through the command surface, never directly through a store" (this ticket's own
 * constraint) means the importer cannot legally call these four directly — so this module adds the thin
 * shells the importer needs, following #205's own established pattern exactly.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { createBrand, createFormat, createRun, createChannel } from "./tenancy.ts";

describe("createBrand — the command surface's Brand-creation operation", () => {
  it("delegates to src/brand/store.ts and returns a real id", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const id = createBrand(db, {
        slug: "straw-motion",
        name: "Straw Motion",
        timezone: "Europe/Berlin",
        mediaRoot: "data/brands/straw-motion",
      });
      const row = db.prepare(`SELECT * FROM brand WHERE id = ?`).get(id) as unknown as { slug: string };
      assert.equal(row.slug, "straw-motion");
    });
  });
});

describe("createFormat — the command surface's Format-creation operation", () => {
  it("delegates to src/format/store.ts and returns a real id", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const brandId = createBrand(db, { slug: "straw-motion", name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      const id = createFormat(db, { brandId, slug: "unhypped-news", name: "Unhypped News", voice: "plain" });
      const row = db.prepare(`SELECT * FROM format WHERE id = ?`).get(id) as unknown as { slug: string };
      assert.equal(row.slug, "unhypped-news");
    });
  });
});

describe("createRun — the command surface's Run-creation operation", () => {
  it("delegates to src/run/store.ts and returns a real id", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const brandId = createBrand(db, { slug: "straw-motion", name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      const formatId = createFormat(db, { brandId, slug: "unhypped-news", name: "Unhypped News", voice: "plain" });
      const id = createRun(db, { brandId, formatId, runKey: "2026-W30", cadence: "weekly", startedAt: "2026-07-20T00:00:00Z" });
      const row = db.prepare(`SELECT * FROM run WHERE id = ?`).get(id) as unknown as { run_key: string };
      assert.equal(row.run_key, "2026-W30");
    });
  });
});

describe("createChannel — the command surface's Channel-creation operation", () => {
  it("delegates to src/channel/store.ts and returns a real id", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const brandId = createBrand(db, { slug: "straw-motion", name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      const id = createChannel(db, { brandId, platform: "facebook", url: "https://www.facebook.com/acme", isPrimary: true });
      const row = db.prepare(`SELECT * FROM channel WHERE id = ?`).get(id) as unknown as { platform: string; is_primary: number };
      assert.equal(row.platform, "facebook");
      assert.equal(row.is_primary, 1);
    });
  });
});
