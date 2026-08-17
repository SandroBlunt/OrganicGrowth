/**
 * The one place this codebase opens a `node:sqlite` connection (issue #201, docs/adr/0029).
 *
 * Deliberately thin — an orchestration shell, not a deep module. It exists so every caller enables the
 * SAME pragmas in the SAME way: `PRAGMA foreign_keys = ON`. SQLite does NOT enforce foreign keys by
 * default; every FK constraint this schema declares (`schema.ts`'s `REFERENCES` clauses, including the
 * three closed-vocabulary reference tables) is inert unless this pragma is set on the connection that
 * runs the statement — verified against the real `node:sqlite` build this repo targets. Local SQLite,
 * opened in-process, no service (ADR-0029) — this file IS that "in-process" boundary.
 *
 * `PRAGMA busy_timeout = 5000` (issue #203): `node:sqlite` defaults this to `0`, meaning a SECOND
 * connection's write while another connection holds the write lock fails IMMEDIATELY with
 * `SQLITE_BUSY` rather than waiting. That default is wrong for THIS repo's own documented reality — the
 * Operator runs two concurrent sessions against the same folder — so every connection this function
 * opens instead WAITS (up to 5s) for the lock to free, letting SQLite's own serialized-writer guarantee
 * do its job instead of surfacing a spurious contention error. This is what makes `job-store.ts`'s
 * atomic `claimJob` safe under genuinely concurrent callers (see `claim-concurrency.test.ts`), not a
 * general-purpose retry policy.
 */

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { DatabaseSync } from "node:sqlite";

/**
 * Opens (creating the file and any missing parent directories if absent) a SQLite database at `path`
 * with foreign-key enforcement turned on. `path` may be `:memory:` for a throwaway in-process database
 * — but per this epic's own Testing Decisions, production tests never use that; they open a real,
 * empty file per test (see `test-support.ts`'s `withTempDb`).
 */
export async function openDatabase(path: string): Promise<DatabaseSync> {
  if (path !== ":memory:") {
    await mkdir(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  return db;
}
