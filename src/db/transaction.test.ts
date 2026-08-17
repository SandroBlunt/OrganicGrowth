/**
 * Tests for the shared transaction helper (`src/db/transaction.ts`) — issue #222.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { runMigrations } from "./migrate.ts";
import { withTempDb } from "./test-support.ts";
import { withTransaction } from "./transaction.ts";

/** Inserts a minimal valid Brand row and returns its id. */
function insertBrand(db: Parameters<typeof withTransaction>[0]): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO brand (id, slug, name, timezone, media_root, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, `brand-${id}`, "Test Brand", "UTC", `data/brands/brand-${id}`, now, now);
  return id;
}

describe("withTransaction — runs a callback inside BEGIN/COMMIT, rolling back cleanly on failure", () => {
  it("commits every write when the callback succeeds", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const now = new Date().toISOString();
      withTransaction(db, () => {
        db.prepare(
          `INSERT INTO brand (id, slug, name, timezone, media_root, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run("b1", "brand-one", "Brand One", "UTC", "data/brands/brand-one", now, now);
        db.prepare(
          `INSERT INTO brand (id, slug, name, timezone, media_root, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run("b2", "brand-two", "Brand Two", "UTC", "data/brands/brand-two", now, now);
      });
      const count = db.prepare("SELECT COUNT(*) AS n FROM brand").get()?.n;
      assert.equal(count, 2);
    });
  });

  it("returns the callback's return value", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const result = withTransaction(db, () => 42);
      assert.equal(result, 42);
    });
  });

  it("a multi-row write that fails PARTWAY THROUGH leaves NOTHING behind — the second row never lands", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandId = insertBrand(db);
      const now = new Date().toISOString();

      assert.throws(() => {
        withTransaction(db, () => {
          // First insert succeeds...
          db.prepare(
            `INSERT INTO channel (id, brand_id, platform, is_primary, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`,
          ).run(randomUUID(), brandId, "facebook", now, now);
          // ...second insert violates the one-primary-per-brand partial unique index.
          db.prepare(
            `INSERT INTO channel (id, brand_id, platform, is_primary, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`,
          ).run(randomUUID(), brandId, "instagram", now, now);
        });
      }, /UNIQUE/);

      const count = db.prepare("SELECT COUNT(*) AS n FROM channel WHERE brand_id = ?").get(brandId)?.n;
      assert.equal(count, 0, "neither channel row may survive — not even the one that individually succeeded");
    });
  });

  it("rolls back a raw db.exec failure too, not just a prepared-statement failure", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const now = new Date().toISOString();
      assert.throws(() => {
        withTransaction(db, () => {
          db.prepare(
            `INSERT INTO brand (id, slug, name, timezone, media_root, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ).run("b3", "brand-three", "Brand Three", "UTC", "data/brands/brand-three", now, now);
          db.exec("INSERT INTO not_a_real_table (x) VALUES (1)");
        });
      });
      const row = db.prepare("SELECT id FROM brand WHERE id = 'b3'").get();
      assert.equal(row, undefined, "the brand insert before the failing statement must not survive");
    });
  });

  it("re-throws the original error, unchanged, after rolling back", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const marker = new Error("a distinctive marker error");
      assert.throws(() => {
        withTransaction(db, () => {
          throw marker;
        });
      }, (err: unknown) => err === marker);
    });
  });

  it("nesting is rejected loudly rather than silently starting a second transaction", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      assert.throws(() => {
        withTransaction(db, () => {
          withTransaction(db, () => {
            // never reached
          });
        });
      });
    });
  });
});
