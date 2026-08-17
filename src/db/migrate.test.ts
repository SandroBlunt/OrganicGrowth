import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { CURRENT_SCHEMA_VERSION, ENTITY_TABLES, VOCABULARY_TABLES, MIGRATIONS } from "./schema.ts";
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

  it("does NOT create mention_handle — Mention Handle deliberately stays a file, not schema (ADR-0029, issue #226)", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all();
      const names = new Set(rows.map((r) => r.name));
      assert.equal(
        names.has("mention_handle"),
        false,
        "\"mention_handle\" must NOT exist — the Mention Handle Registry stays a hand-maintained file " +
          "(data/mention-handles.yaml) per ADR-0029's carve-out, unless issue #210's Library reopens it",
      );
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

  it("a freshly-written row's schema_version defaults to the version of the migration that defined that table's DDL, without the caller specifying it", async () => {
    // NOT necessarily CURRENT_SCHEMA_VERSION (schema.ts's own doc comment on `schema_version`, and its
    // note on migration 2 / issue #219): `brand`'s DDL was written by migration 1 and untouched since —
    // migration 2 (issue #219) only seeds `hook_type_vocabulary`/`theme_vocabulary`, two tables that
    // carry no `schema_version` column at all (they are lookup data, not per-Brand records —
    // `VOCABULARY_TABLES`'s own doc comment). SQLite cannot re-point an existing column's DEFAULT
    // without a full table rebuild, so `brand`'s baked-in default honestly stays `1`.
    await withTempDb((db) => {
      runMigrations(db);
      assert.equal(
        CURRENT_SCHEMA_VERSION,
        4,
        "this assertion assumes migrations 2 (issue #219), 3 (issue #209), and 4 (issue #206) exist",
      );
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO brand (id, slug, name, timezone, media_root, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run("b1", "test-brand", "Test Brand", "UTC", "data/brands/test-brand", now, now);
      const row = db.prepare("SELECT schema_version FROM brand WHERE id = ?").get("b1");
      assert.equal(row?.schema_version, 1, "brand's own DDL has not changed since migration 1");
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

  it("migration 2 adds ONLY the 'unclassified' row to each vocabulary table, on top of an already-applied migration 1, never re-seeding or duplicating the original rows (issue #219)", async () => {
    await withTempDb((db) => {
      // Simulate a database created BEFORE issue #219 landed: only migration 1 has been applied.
      const migration1 = MIGRATIONS.find((m) => m.version === 1);
      assert.ok(migration1, "migration 1 must exist");
      db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
      db.exec("BEGIN");
      db.exec(migration1.sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)").run(new Date().toISOString());
      db.exec("COMMIT");
      assert.equal(getSchemaVersion(db), 1);
      assert.equal(
        db.prepare("SELECT COUNT(*) AS n FROM hook_type_vocabulary").get()?.n,
        HOOK_TYPES.length - 1,
        "a pre-#219 database must have only the original ten Hook Types seeded, not 'unclassified'",
      );
      assert.equal(
        db.prepare("SELECT COUNT(*) AS n FROM theme_vocabulary").get()?.n,
        THEMES.length - 1,
        "a pre-#219 database must have only the original nine Themes seeded, not 'unclassified'",
      );

      const result = runMigrations(db);

      assert.equal(result, CURRENT_SCHEMA_VERSION);
      const hookValues = db.prepare("SELECT value FROM hook_type_vocabulary").all().map((r) => r.value);
      assert.equal(hookValues.length, HOOK_TYPES.length, "exactly one new row must be added, not a re-seed");
      assert.ok(hookValues.includes("unclassified"));
      const themeValues = db.prepare("SELECT value FROM theme_vocabulary").all().map((r) => r.value);
      assert.equal(themeValues.length, THEMES.length, "exactly one new row must be added, not a re-seed");
      assert.ok(themeValues.includes("unclassified"));
    });
  });

  it("migration 3 adds ONLY schedule_outbox, on top of an already-applied migration 1+2, touching no other table (issue #209)", async () => {
    await withTempDb((db) => {
      // Simulate a database created BEFORE issue #209 landed: migrations 1 and 2 applied, not 3.
      const migration1 = MIGRATIONS.find((m) => m.version === 1);
      const migration2 = MIGRATIONS.find((m) => m.version === 2);
      assert.ok(migration1, "migration 1 must exist");
      assert.ok(migration2, "migration 2 must exist");
      db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
      db.exec("BEGIN");
      db.exec(migration1.sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)").run(new Date().toISOString());
      db.exec("COMMIT");
      db.exec("BEGIN");
      db.exec(migration2.sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)").run(new Date().toISOString());
      db.exec("COMMIT");
      assert.equal(getSchemaVersion(db), 2);
      const before = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name);
      assert.equal(before.includes("schedule_outbox"), false, "a pre-#209 database must not have schedule_outbox yet");

      const result = runMigrations(db);

      assert.equal(result, CURRENT_SCHEMA_VERSION);
      const after = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name);
      assert.ok(after.includes("schedule_outbox"), "schedule_outbox must exist once migration 3 has run");
      // Every table migration 1/2 already created is untouched — same table set plus exactly one new one.
      const added = after.filter((name) => !before.includes(name));
      assert.deepEqual(added, ["schedule_outbox"]);
    });
  });

  it("migration 4 adds ONLY idea.hook_type_source / idea.theme_source, on top of an already-applied migration 1+2+3, touching no other column or table (issue #206)", async () => {
    await withTempDb((db) => {
      // Simulate a database created BEFORE issue #206 landed: migrations 1, 2, and 3 applied, not 4.
      const migration1 = MIGRATIONS.find((m) => m.version === 1);
      const migration2 = MIGRATIONS.find((m) => m.version === 2);
      const migration3 = MIGRATIONS.find((m) => m.version === 3);
      assert.ok(migration1, "migration 1 must exist");
      assert.ok(migration2, "migration 2 must exist");
      assert.ok(migration3, "migration 3 must exist");
      db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
      for (const migration of [migration1, migration2, migration3]) {
        db.exec("BEGIN");
        db.exec(migration.sql);
        db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
          migration.version,
          new Date().toISOString(),
        );
        db.exec("COMMIT");
      }
      assert.equal(getSchemaVersion(db), 3);
      const before = db.prepare(`PRAGMA table_info(idea)`).all().map((c) => c.name);
      assert.equal(before.includes("hook_type_source"), false, "a pre-#206 database must not have hook_type_source yet");
      assert.equal(before.includes("theme_source"), false, "a pre-#206 database must not have theme_source yet");
      const tablesBefore = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name);

      const result = runMigrations(db);

      assert.equal(result, CURRENT_SCHEMA_VERSION);
      const after = db.prepare(`PRAGMA table_info(idea)`).all().map((c) => c.name);
      assert.ok(after.includes("hook_type_source"), "hook_type_source must exist once migration 4 has run");
      assert.ok(after.includes("theme_source"), "theme_source must exist once migration 4 has run");
      const tablesAfter = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name);
      assert.deepEqual(tablesAfter, tablesBefore, "migration 4 must not create or drop any table");
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
