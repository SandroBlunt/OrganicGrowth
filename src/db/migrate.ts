/**
 * The migration runner — creates and upgrades a SQLite database's schema, and records which version it
 * is at (issue #201 AC9, epic #195 story 15).
 *
 * Applies every migration in `schema.ts`'s `MIGRATIONS` (ascending, by version) that a given database
 * has not yet seen, each inside its OWN transaction (`BEGIN` / `COMMIT`, rolled back on any failure —
 * "constraints, transactions and locks are exactly the new machinery this epic must not leave
 * untested", epic #195's Testing Decisions), then records it in the bookkeeping `schema_migrations`
 * table. Idempotent: running it again against an already-current database is a safe no-op — this is
 * how a fresh `data/organicgrowth.db` and an already-migrated one are handled by the SAME call.
 */

import type { DatabaseSync } from "node:sqlite";

import { MIGRATIONS } from "./schema.ts";

/** Ensures the bookkeeping table exists. Safe to call on every open — `CREATE TABLE IF NOT EXISTS`. */
function ensureMigrationsTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
}

/** The highest migration version recorded as applied, or `0` for a database with none applied yet. */
export function getSchemaVersion(db: DatabaseSync): number {
  ensureMigrationsTable(db);
  const row = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get();
  const v = row?.v;
  return typeof v === "number" ? v : 0;
}

/**
 * Applies every not-yet-applied migration, in order, each in its own transaction. Returns the
 * database's resulting schema version (equal to `getSchemaVersion(db)` afterward). A migration whose
 * SQL fails rolls back cleanly (leaving the database at its PRE-migration version) and re-throws, so a
 * partially-applied migration is never recorded as applied.
 */
export function runMigrations(db: DatabaseSync, now: () => string = () => new Date().toISOString()): number {
  ensureMigrationsTable(db);
  const current = getSchemaVersion(db);
  const pending = [...MIGRATIONS].filter((m) => m.version > current).sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        migration.version,
        now(),
      );
      db.exec("COMMIT");
    } catch (err: unknown) {
      db.exec("ROLLBACK");
      throw err;
    }
  }

  return getSchemaVersion(db);
}
