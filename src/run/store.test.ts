/**
 * Tests for RunStore (`src/run/store.ts`) — issue #204.
 *
 * `{ db }`-only, genuinely new: no ticket before this one built a `run` store (`idea`/`trend`'s own
 * tests seeded a `run` row directly via raw SQL — `src/trend/store.test.ts`'s `seedRun`). The importer
 * needs a real, typed way to create Run rows (one per Brand/Format/legacy-run-id combination it meets),
 * so this ticket builds the store issue #223's own tasks.md explicitly deferred. Every test opens a
 * real, throwaway SQLite file via `withTempDb` — never `:memory:`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { createBrand } from "../brand/store.ts";
import { createFormat } from "../format/store.ts";
import { createRun, getRun, getRunByKey } from "./store.ts";

/** Minimal brand -> format fixture chain a `run` row needs. Returns the Format id. */
function seedFormat(db: DatabaseSync): string {
  const brandId = createBrand(db, {
    slug: `straw-motion-${randomUUID()}`,
    name: "Straw Motion",
    timezone: "UTC",
    mediaRoot: "data/brands/straw-motion",
  });
  return createFormat(db, { brandId, slug: "unhypped-news", name: "Unhypped News", voice: "plain" });
}

describe("createRun — inserts one run row (issue #204)", () => {
  it("with only the required fields, stores them verbatim", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const formatId = seedFormat(db);
      const brandRow = db.prepare(`SELECT brand_id FROM format WHERE id = ?`).get(formatId) as unknown as {
        brand_id: string;
      };
      const id = createRun(db, {
        brandId: brandRow.brand_id,
        formatId,
        runKey: "2026-W30",
        cadence: "weekly",
        startedAt: "2026-07-20T00:00:00Z",
      });
      const run = getRun(db, id)!;
      assert.equal(run.brandId, brandRow.brand_id);
      assert.equal(run.formatId, formatId);
      assert.equal(run.runKey, "2026-W30");
      assert.equal(run.cadence, "weekly");
      assert.equal(run.startedAt, "2026-07-20T00:00:00Z");
    });
  });

  it("rejects an unknown formatId", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.throws(
        () =>
          createRun(db, {
            brandId: "does-not-exist",
            formatId: "does-not-exist",
            runKey: "2026-W30",
            cadence: "weekly",
            startedAt: "2026-07-20T00:00:00Z",
          }),
        /FOREIGN KEY/,
      );
    });
  });

  it("rejects a second Run with the same (formatId, runKey) pair", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const formatId = seedFormat(db);
      const brandRow = db.prepare(`SELECT brand_id FROM format WHERE id = ?`).get(formatId) as unknown as {
        brand_id: string;
      };
      createRun(db, {
        brandId: brandRow.brand_id,
        formatId,
        runKey: "2026-W30",
        cadence: "weekly",
        startedAt: "2026-07-20T00:00:00Z",
      });
      assert.throws(
        () =>
          createRun(db, {
            brandId: brandRow.brand_id,
            formatId,
            runKey: "2026-W30",
            cadence: "weekly",
            startedAt: "2026-07-21T00:00:00Z",
          }),
        /UNIQUE/,
      );
    });
  });
});

describe("getRun — null for unknown", () => {
  it("returns null for an unknown id", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.equal(getRun(db, "does-not-exist"), null);
    });
  });
});

describe("getRunByKey — looks up a Run by (formatId, runKey)", () => {
  it("finds an existing Run", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const formatId = seedFormat(db);
      const brandRow = db.prepare(`SELECT brand_id FROM format WHERE id = ?`).get(formatId) as unknown as {
        brand_id: string;
      };
      const id = createRun(db, {
        brandId: brandRow.brand_id,
        formatId,
        runKey: "2026-W30",
        cadence: "weekly",
        startedAt: "2026-07-20T00:00:00Z",
      });
      const run = getRunByKey(db, formatId, "2026-W30")!;
      assert.equal(run.id, id);
    });
  });

  it("returns null for an unknown (formatId, runKey) pair", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const formatId = seedFormat(db);
      assert.equal(getRunByKey(db, formatId, "does-not-exist"), null);
    });
  });
});
