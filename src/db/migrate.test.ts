import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { CURRENT_SCHEMA_VERSION, ENTITY_TABLES, VOCABULARY_TABLES } from "./schema.ts";
import { getSchemaVersion, runMigrations } from "./migrate.ts";
import { withTempDb } from "./test-support.ts";
import { HOOK_TYPES } from "../vocabulary/hook-type.ts";
import { THEMES } from "../vocabulary/theme.ts";
import { listWiredRecipeSlugs } from "../recipe/registry.ts";

describe("runMigrations — creates and upgrades the schema, and records the version applied", () => {
  it("a fresh database starts at schema version 0", async () => {
    await withTempDb((db) => {
      assert.equal(getSchemaVersion(db), 0);
    });
  });

  it("running migrations brings a fresh database to CURRENT_SCHEMA_VERSION", async () => {
    await withTempDb((db) => {
      const result = runMigrations(db);
      assert.equal(result, CURRENT_SCHEMA_VERSION);
      assert.equal(getSchemaVersion(db), CURRENT_SCHEMA_VERSION);
    });
  });

  it("is idempotent: running it again against an already-current database is a safe no-op", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const before = db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get()?.n;
      const result = runMigrations(db);
      const after = db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get()?.n;
      assert.equal(result, CURRENT_SCHEMA_VERSION);
      assert.equal(before, after, "re-running must not re-apply or re-record an already-applied migration");
    });
  });

  it("creates every entity table AND every vocabulary table", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all();
      const names = new Set(rows.map((r) => r.name));
      for (const table of ENTITY_TABLES) {
        assert.ok(names.has(table), `entity table "${table}" must exist after migration`);
      }
      for (const table of VOCABULARY_TABLES) {
        assert.ok(names.has(table), `vocabulary table "${table}" must exist after migration`);
      }
    });
  });

  it("does NOT create account, user, or connection — deliberately left for a later migration (epic #195 AC12)", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all();
      const names = new Set(rows.map((r) => r.name));
      for (const table of ["account", "user", "connection"]) {
        assert.equal(names.has(table), false, `"${table}" must NOT exist yet — this ticket leaves room, it does not build it`);
      }
    });
  });

  it("every entity table carries id, created_at, updated_at, and schema_version columns", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      for (const table of ENTITY_TABLES) {
        const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
        for (const required of ["id", "created_at", "updated_at", "schema_version"]) {
          assert.ok(
            columns.includes(required),
            `table "${table}" must carry a "${required}" column — has: ${columns.join(", ")}`,
          );
        }
      }
    });
  });

  it("a freshly-written row's schema_version defaults to CURRENT_SCHEMA_VERSION without the caller specifying it", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO brand (id, slug, name, timezone, media_root, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run("b1", "test-brand", "Test Brand", "UTC", "data/brands/test-brand", now, now);
      const row = db.prepare("SELECT schema_version FROM brand WHERE id = ?").get("b1");
      assert.equal(row?.schema_version, CURRENT_SCHEMA_VERSION);
    });
  });

  it("seeds hook_type_vocabulary from src/vocabulary/hook-type.ts's HOOK_TYPES, verbatim", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const rows = db.prepare("SELECT value, meaning FROM hook_type_vocabulary ORDER BY rowid").all();
      assert.equal(rows.length, HOOK_TYPES.length);
      for (const term of HOOK_TYPES) {
        const seeded = rows.find((r) => r.value === term.value);
        assert.ok(seeded, `${term.value} must be seeded`);
        assert.equal(seeded?.meaning, term.meaning);
      }
    });
  });

  it("seeds theme_vocabulary from src/vocabulary/theme.ts's THEMES, verbatim", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const rows = db.prepare("SELECT value, meaning FROM theme_vocabulary ORDER BY rowid").all();
      assert.equal(rows.length, THEMES.length);
      for (const term of THEMES) {
        const seeded = rows.find((r) => r.value === term.value);
        assert.ok(seeded, `${term.value} must be seeded`);
        assert.equal(seeded?.meaning, term.meaning);
      }
    });
  });

  it("seeds recipe_vocabulary from src/recipe/registry.ts's listWiredRecipeSlugs(), including the third wired Recipe", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const rows = db.prepare("SELECT slug FROM recipe_vocabulary").all();
      const slugs = new Set(rows.map((r) => r.slug));
      const wired = listWiredRecipeSlugs();
      assert.equal(rows.length, wired.length);
      for (const slug of wired) {
        assert.ok(slugs.has(slug), `${slug} must be seeded`);
      }
      assert.ok(slugs.has("news-short-script"), "the third wired Recipe (AC7) must be seeded, not just the first two");
    });
  });

  it("a failed migration rolls back cleanly and leaves the database at its pre-migration version", async () => {
    await withTempDb((db) => {
      db.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
      // Pre-create a table this migration also creates, so its CREATE TABLE statement fails partway
      // through the migration's larger SQL block — proving the WHOLE migration rolls back, not just
      // the one failing statement.
      db.exec("CREATE TABLE brand (id TEXT PRIMARY KEY)");
      assert.throws(() => runMigrations(db));
      assert.equal(getSchemaVersion(db), 0, "a failed migration must not be recorded as applied");
      const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'channel'`).all();
      assert.equal(rows.length, 0, "a table created later in the same failed migration must not survive the rollback");
    });
  });
});
