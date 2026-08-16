/**
 * Shared test support for the SQLite foundation — NOT a `*.test.ts` file itself (so `npm test`'s glob
 * never runs it directly), imported by every `src/db/**` test.
 *
 * Per this epic's own Testing Decisions: "Tests open a real, empty SQLite file per test and drop it
 * afterwards. There is no in-memory database double... an in-memory double would leave every
 * constraint, transaction and lock — precisely the new machinery — untested." `withTempDb` is the one
 * place that discipline is implemented, mirroring `src/asset/store.test.ts`'s existing `withLedger`
 * helper (a fresh `mkdtemp` directory per call, `finally`-cleaned-up).
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DatabaseSync } from "node:sqlite";

import { openDatabase } from "./connection.ts";

/**
 * Opens a REAL, empty SQLite file (never `:memory:`) inside a fresh temp directory, hands it to `fn`,
 * then closes the connection and removes the temp directory (and its file) — even if `fn` throws.
 */
export async function withTempDb(fn: (db: DatabaseSync, path: string) => Promise<void> | void): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-sqlite-"));
  const path = join(dir, "test.db");
  const db = await openDatabase(path);
  try {
    await fn(db, path);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
}
