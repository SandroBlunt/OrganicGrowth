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
 *
 * `{ readOnly: true }` (issue #210, the local read-only Library): opens the SAME file with SQLite's own
 * read-only connection mode, via `node:sqlite`'s own `readOnly` constructor option — verified by hand
 * against Node 22.23.0 that a write attempted through a handle opened this way THROWS
 * ("attempt to write a readonly database"), a guarantee enforced by SQLite itself at the connection
 * level, not merely a convention the caller promises to respect. The file must already exist (and
 * already carry a schema a caller can query) — this function never creates or migrates one when
 * `readOnly` is set: no `mkdir`, since there is nothing this call could legitimately write. Still
 * enables `PRAGMA foreign_keys = ON`/`PRAGMA busy_timeout = 5000` — both are read-only-safe pragmas
 * (verified by hand), so a read-only caller enables the SAME connection-level settings every other
 * caller of this function does.
 */

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { DatabaseSync } from "node:sqlite";

/** Options `openDatabase` accepts, additive to the plain `(path)` call every existing caller keeps
 *  making unchanged. */
export interface OpenDatabaseOptions {
  /** Opens the connection read-only (issue #210) — the file must already exist; every write through
   *  the returned handle throws. Defaults to `false` (the existing read-write behavior). */
  readonly readOnly?: boolean;
}

/**
 * Opens (creating the file and any missing parent directories if absent, unless `options.readOnly`) a
 * SQLite database at `path` with foreign-key enforcement turned on. `path` may be `:memory:` for a
 * throwaway in-process database — but per this epic's own Testing Decisions, production tests never use
 * that; they open a real, empty file per test (see `test-support.ts`'s `withTempDb`).
 */
export async function openDatabase(path: string, options: OpenDatabaseOptions = {}): Promise<DatabaseSync> {
  const readOnly = options.readOnly ?? false;
  if (path !== ":memory:" && !readOnly) {
    await mkdir(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path, { readOnly });
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  return db;
}
