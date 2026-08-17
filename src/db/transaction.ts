/**
 * The shared transaction helper (issue #222) — the ONE place a multi-row write is wrapped in
 * `BEGIN`/`COMMIT`/`ROLLBACK`, so a partial write can never land.
 *
 * Factored out of `migrate.ts`'s own inline `BEGIN`/`COMMIT`/`ROLLBACK` pattern (`runMigrations`
 * already did this, one migration at a time, before this helper existed) so every store built on top
 * of `{ db }` — starting with the seven stores this ticket swaps from files to SQL, and reused
 * unchanged by `IdeaStore` (issue #223) — gets the SAME atomicity guarantee from ONE tested seam,
 * rather than each store hand-rolling its own `BEGIN`/`COMMIT` pair.
 *
 * `node:sqlite`'s `DatabaseSync` is synchronous, so `fn` is synchronous too — there is no I/O to await
 * inside a database transaction in this codebase (mirrors `runMigrations`'s own convention). Nesting
 * (`withTransaction` called again from inside an active transaction) is NOT silently supported: SQLite
 * itself rejects a `BEGIN` issued while a transaction is already open, so a nested call throws loudly
 * rather than silently starting a second, independent transaction.
 */

import type { DatabaseSync } from "node:sqlite";

/**
 * Runs `fn` inside `BEGIN` / `COMMIT`. If `fn` throws, the transaction is rolled back and the ORIGINAL
 * error is re-thrown unchanged (never wrapped or swallowed) — so a caller's `catch` sees exactly what
 * `fn` threw. On success, returns `fn`'s own return value.
 */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN");
  let result: T;
  try {
    result = fn();
  } catch (err: unknown) {
    db.exec("ROLLBACK");
    throw err;
  }
  db.exec("COMMIT");
  return result;
}
