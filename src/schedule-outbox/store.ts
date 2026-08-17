/**
 * ScheduleOutboxStore — the SQL-backed CRUD for `schedule_outbox` (issue #209, `src/db/schema.ts`
 * migration 3).
 *
 * Two primitives only, mirroring `src/production-queue/job-store.ts`'s own "genuinely new, `{ db
 * }`-only" posture (issue #203):
 *
 *   - `reserveScheduleOutboxEntry` — insert-or-find, keyed on `idempotencyKey` (`UNIQUE` in the schema).
 *     A FRESH key inserts a new `'reserved'` row; an ALREADY-SEEN key returns the EXISTING row instead
 *     of throwing or inserting a second one — this is what makes "reserve" itself safe to call again
 *     after a crash: the caller learns (`alreadyReserved`) whether it just created this reservation for
 *     the first time, or is resuming one a previous attempt already made. Race-safe under genuinely
 *     concurrent writers the SAME way `claimJob` is (issue #203's own doc comment): SQLite serializes
 *     writers, so of two simultaneous `INSERT OR IGNORE` attempts for the SAME key, exactly one's row
 *     survives, and BOTH callers' subsequent `SELECT` sees that SAME winning row.
 *   - `confirmScheduleOutboxEntry` — atomically moves a `'reserved'` row to `'confirmed'`, recording the
 *     reference Zoho returned. Idempotent: confirming an ALREADY-`'confirmed'` key is a safe no-op that
 *     returns the existing (unchanged) record rather than throwing.
 *
 * Plus two small reads: `getScheduleOutboxEntry` (by key) and `listReservedScheduleOutboxEntries` (every
 * `'reserved'`-but-not-yet-`'confirmed'` row — the set a worker sweeps on restart to reconcile, issue
 * #209's own AC).
 *
 * `reserveScheduleOutboxEntry`/`confirmScheduleOutboxEntry` are registered in
 * `src/store-write-boundary/scan.ts`'s `STORE_WRITE_FUNCTIONS` (issue #233's guard) — the ONLY
 * production caller is `src/command-surface/schedule-outbox.ts`; the one other direct importer,
 * `fixtures/crash-schedule-worker.ts`, is individually allow-listed (a genuine crash-simulation
 * fixture, not a bypass).
 */

import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { parseZohoScheduleReference, type ZohoScheduleReference } from "../asset/asset.ts";
import type { ZohoPostRequest } from "../schedule-batch/mcp-schedule-port.ts";

export type ScheduleOutboxStatus = "reserved" | "confirmed";

/** One `schedule_outbox` row, fully typed. */
export interface ScheduleOutboxRecord {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly assetId: string;
  readonly platform: string;
  readonly request: ZohoPostRequest;
  readonly status: ScheduleOutboxStatus;
  readonly reference?: ZohoScheduleReference;
  readonly reservedAt: string;
  readonly confirmedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** What `reserveScheduleOutboxEntry` needs — everything a `createSchedule` call for one Channel target
 *  will eventually need, so a resumed attempt never has to ask the caller for it again. */
export interface ScheduleOutboxReserveInput {
  readonly idempotencyKey: string;
  readonly assetId: string;
  readonly request: ZohoPostRequest;
}

export interface ScheduleOutboxReserveResult {
  readonly record: ScheduleOutboxRecord;
  /** `false` when THIS call created the reservation for the first time; `true` when `idempotencyKey`
   *  already existed — a resumed attempt (a prior crash, or a genuine retry), NOT a fresh one. The
   *  caller (`src/command-surface/schedule-outbox.ts`'s `scheduleViaOutbox`) uses this to decide whether
   *  it is safe to call Zoho directly or must reconcile first. */
  readonly alreadyReserved: boolean;
}

interface ScheduleOutboxRow {
  readonly id: string;
  readonly idempotency_key: string;
  readonly asset_id: string;
  readonly platform: string;
  readonly request_json: string;
  readonly status: string;
  readonly reference_json: string | null;
  readonly reserved_at: string;
  readonly confirmed_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

function toRecord(row: ScheduleOutboxRow): ScheduleOutboxRecord {
  const referenceRaw: unknown = row.reference_json !== null ? JSON.parse(row.reference_json) : null;
  const reference = parseZohoScheduleReference(referenceRaw);
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    assetId: row.asset_id,
    platform: row.platform,
    request: JSON.parse(row.request_json) as ZohoPostRequest,
    status: row.status as ScheduleOutboxStatus,
    ...(reference !== null ? { reference } : {}),
    reservedAt: row.reserved_at,
    ...(row.confirmed_at !== null ? { confirmedAt: row.confirmed_at } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Looks up one `schedule_outbox` row by its `idempotencyKey`. `null` for an unknown key — never throws. */
export function getScheduleOutboxEntry(db: DatabaseSync, idempotencyKey: string): ScheduleOutboxRecord | null {
  const row = db.prepare(`SELECT * FROM schedule_outbox WHERE idempotency_key = ?`).get(idempotencyKey) as
    | ScheduleOutboxRow
    | undefined;
  return row ? toRecord(row) : null;
}

/**
 * Reserves `input.idempotencyKey`, BEFORE any Zoho call is made (issue #209's own ordering). Insert-or-
 * find: a fresh key inserts a new `'reserved'` row; an already-seen key returns the EXISTING row
 * unchanged (never a second row, never an overwrite of the first attempt's own `request`). Throws
 * (SQLite FOREIGN KEY error) for an unknown `assetId`.
 */
export function reserveScheduleOutboxEntry(
  db: DatabaseSync,
  input: ScheduleOutboxReserveInput,
  now: () => string = () => new Date().toISOString(),
): ScheduleOutboxReserveResult {
  const candidateId = randomUUID();
  const timestamp = now();
  db.prepare(
    `INSERT OR IGNORE INTO schedule_outbox
       (id, idempotency_key, asset_id, platform, request_json, status, reserved_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?, ?)`,
  ).run(
    candidateId,
    input.idempotencyKey,
    input.assetId,
    input.request.target.platform,
    JSON.stringify(input.request),
    timestamp,
    timestamp,
    timestamp,
  );

  const row = db.prepare(`SELECT * FROM schedule_outbox WHERE idempotency_key = ?`).get(input.idempotencyKey) as
    | ScheduleOutboxRow
    | undefined;
  if (row === undefined) {
    // Unreachable: the INSERT above either lands the row itself or a UNIQUE conflict means a row with
    // this exact key already existed — either way a row now exists. Named defensively rather than
    // silently returning something wrong.
    throw new Error(`reserveScheduleOutboxEntry: no row found for "${input.idempotencyKey}" immediately after reserving it`);
  }
  const record = toRecord(row);
  return { record, alreadyReserved: record.id !== candidateId };
}

/**
 * Atomically confirms `idempotencyKey`: moves a `'reserved'` row to `'confirmed'`, recording `reference`
 * and `confirmedAt`. Idempotent: confirming an ALREADY-`'confirmed'` key changes nothing and returns the
 * existing record unchanged (never re-writes `reference` to a different value silently — the caller
 * decides what to do if that would ever legitimately differ, which `scheduleViaOutbox` never allows). Returns
 * `null` only for a genuinely unknown `idempotencyKey` (never reserved at all).
 */
export function confirmScheduleOutboxEntry(
  db: DatabaseSync,
  idempotencyKey: string,
  reference: ZohoScheduleReference,
  now: () => string = () => new Date().toISOString(),
): ScheduleOutboxRecord | null {
  const timestamp = now();
  const updated = db
    .prepare(
      `UPDATE schedule_outbox
         SET status = 'confirmed', reference_json = ?, confirmed_at = ?, updated_at = ?
       WHERE idempotency_key = ? AND status = 'reserved'
       RETURNING *`,
    )
    .get(JSON.stringify(reference), timestamp, timestamp, idempotencyKey) as ScheduleOutboxRow | undefined;
  if (updated !== undefined) return toRecord(updated);

  // Not eligible for the UPDATE above — either already confirmed (idempotent no-op: return it unchanged)
  // or genuinely unknown (return null).
  return getScheduleOutboxEntry(db, idempotencyKey);
}

/** Every `'reserved'`-but-not-yet-`'confirmed'` row, oldest first — the set a worker sweeps on restart
 *  to reconcile against Zoho (issue #209's own AC: "reconcilable ... rather than left ambiguous"). */
export function listReservedScheduleOutboxEntries(db: DatabaseSync): readonly ScheduleOutboxRecord[] {
  const rows = db
    .prepare(`SELECT * FROM schedule_outbox WHERE status = 'reserved' ORDER BY reserved_at ASC`)
    .all() as unknown as ScheduleOutboxRow[];
  return rows.map(toRecord);
}
