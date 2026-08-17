/**
 * RunStore — the SQL-backed typed store for the `run` table (issue #204, ADR-0029).
 *
 * Genuinely NEW, `{ db }`-only, mirroring `src/trend/store.ts`/`src/idea/store.ts` (issue #223): no
 * ticket before this one built a Run store — `idea`/`trend`'s own test suites seeded a `run` row
 * directly via raw SQL (`src/trend/store.test.ts`'s `seedRun`), and #223's own `tasks.md` recorded this
 * explicitly as a deferred gap ("No `RunStore` is built... no ticket in the epic names a Run store").
 * The one-shot importer (#204) is the first real caller that needs to create Run rows for data it did
 * not itself seed as a test fixture — one Run per (Brand, Format, legacy-run-id) triple it meets in a
 * Brand's ledger/Format's `ideas/<run>/` folder — so it is the ticket that finally builds this store.
 *
 * Minimal by design, mirroring `TrendStore`'s own "minimal and read-oriented" scoping: `createRun`,
 * `getRun`, `getRunByKey`. No `updateRun` — nothing in this codebase mutates a Run once created (a Run
 * is a fixed record of "this Format was launched on this cadence, at this Run id", CONTEXT.md "Run").
 *
 * Pure, deterministic SQL against an already-open, already-migrated `DatabaseSync` — no file I/O, no
 * network, no clock (except the injectable `now` parameter, matching every other store in this repo).
 */

import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The `run.cadence` vocabulary — the SAME two values `format.cadence` uses (ADR-0022): a Run's own
 *  cadence is copied from its owning Format at creation time, never independently chosen. */
export type RunCadence = "weekly" | "daily";

/** The fields `createRun` requires, minus id/timestamps (assigned by this module). Every field is
 *  required — a Run has no optional/defaulted fields (contrast `TrendInput`/`IdeaInput`). */
export interface RunInput {
  readonly brandId: string;
  readonly formatId: string;
  /** The Run's own label (e.g. `"2026-W30"`, `"2026-08-11"`) — an opaque string everywhere outside
   *  `src/format/run-id.ts`; this store never parses week/date semantics out of it. */
  readonly runKey: string;
  readonly cadence: RunCadence;
  readonly startedAt: string;
}

/** One `run` row, fully typed. */
export interface RunRecord {
  readonly id: string;
  readonly brandId: string;
  readonly formatId: string;
  readonly runKey: string;
  readonly cadence: RunCadence;
  readonly startedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface RunRow {
  readonly id: string;
  readonly brand_id: string;
  readonly format_id: string;
  readonly run_key: string;
  readonly cadence: string;
  readonly started_at: string;
  readonly created_at: string;
  readonly updated_at: string;
}

function toRecord(row: RunRow): RunRecord {
  return {
    id: row.id,
    brandId: row.brand_id,
    formatId: row.format_id,
    runKey: row.run_key,
    cadence: row.cadence as RunCadence,
    startedAt: row.started_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// createRun
// ---------------------------------------------------------------------------

/** Inserts one `run` row and returns its generated id. Throws (SQLite FOREIGN KEY error) for an
 *  unknown `brandId`/`formatId`, and (UNIQUE error) for a `(formatId, runKey)` pair already committed
 *  (`run`'s own `UNIQUE (format_id, run_key)`, `src/db/schema.ts`). */
export function createRun(
  db: DatabaseSync,
  input: RunInput,
  now: () => string = () => new Date().toISOString(),
): string {
  const id = randomUUID();
  const timestamp = now();
  db.prepare(
    `INSERT INTO run (id, brand_id, format_id, run_key, cadence, started_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.brandId, input.formatId, input.runKey, input.cadence, input.startedAt, timestamp, timestamp);
  return id;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Looks up one Run by its stable id. Returns `null` for an unknown id — never throws. */
export function getRun(db: DatabaseSync, id: string): RunRecord | null {
  const row = db.prepare(`SELECT * FROM run WHERE id = ?`).get(id) as unknown as RunRow | undefined;
  return row ? toRecord(row) : null;
}

/** Looks up one Format's Run by its `runKey`. Returns `null` when that Format has none for that key. */
export function getRunByKey(db: DatabaseSync, formatId: string, runKey: string): RunRecord | null {
  const row = db
    .prepare(`SELECT * FROM run WHERE format_id = ? AND run_key = ?`)
    .get(formatId, runKey) as unknown as RunRow | undefined;
  return row ? toRecord(row) : null;
}
