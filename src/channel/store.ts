/**
 * ChannelStore — the SQL-backed typed store for the `channel` table (issue #222, ADR-0019, ADR-0029).
 *
 * Genuinely NEW, mirroring `src/brand/store.ts` (see that module's own doc comment for why): there was
 * no pre-existing `{ ledgerPath }`-taking "Channel store" to port — a Brand's Channel list lived as a
 * plain array field on `brand-profile.yaml`. `{ db }`-only from the start.
 *
 * `setPrimaryChannel` is the one operation that must be ATOMIC (issue #222's transaction requirement):
 * moving primary from one Channel to another is a two-row write (demote the old, promote the new) that
 * must never land half-done, so it runs inside `withTransaction`.
 */

import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { withTransaction } from "../db/transaction.ts";
import type { KnownPlatform } from "../copy/platform-shape.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The fields `createChannel` requires/accepts, minus id/timestamps (assigned by this module). */
export interface ChannelInput {
  readonly brandId: string;
  readonly platform: KnownPlatform;
  readonly url?: string;
  readonly handle?: string;
  readonly isPrimary?: boolean;
  readonly isTracked?: boolean;
}

/** One `channel` row, fully typed. */
export interface ChannelRecord {
  readonly id: string;
  readonly brandId: string;
  readonly platform: KnownPlatform;
  readonly url: string;
  readonly handle?: string;
  readonly isPrimary: boolean;
  readonly isTracked: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ChannelRow {
  readonly id: string;
  readonly brand_id: string;
  readonly platform: string;
  readonly url: string;
  readonly handle: string | null;
  readonly is_primary: number;
  readonly is_tracked: number;
  readonly created_at: string;
  readonly updated_at: string;
}

function toRecord(row: ChannelRow): ChannelRecord {
  return {
    id: row.id,
    brandId: row.brand_id,
    platform: row.platform as KnownPlatform,
    url: row.url,
    ...(row.handle !== null ? { handle: row.handle } : {}),
    isPrimary: row.is_primary === 1,
    isTracked: row.is_tracked === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// createChannel
// ---------------------------------------------------------------------------

/**
 * Inserts one `channel` row and returns its generated id. Throws (SQLite FOREIGN KEY error) for an
 * unknown `brandId`, (CHECK error) for a `platform` outside `KNOWN_PLATFORMS`, and (UNIQUE error) for
 * a SECOND `isPrimary: true` Channel on the same Brand — the schema's own partial unique index
 * (`idx_channel_one_primary_per_brand`, ADR-0019) enforces this without any application-level check.
 */
export function createChannel(
  db: DatabaseSync,
  input: ChannelInput,
  now: () => string = () => new Date().toISOString(),
): string {
  const id = randomUUID();
  const timestamp = now();
  db.prepare(
    `INSERT INTO channel (id, brand_id, platform, url, handle, is_primary, is_tracked, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.brandId,
    input.platform,
    input.url ?? "",
    input.handle ?? null,
    input.isPrimary === true ? 1 : 0,
    input.isTracked === true ? 1 : 0,
    timestamp,
    timestamp,
  );
  return id;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Looks up one Channel by its stable id. Returns `null` for an unknown id — never throws. */
export function getChannel(db: DatabaseSync, id: string): ChannelRecord | null {
  const row = db.prepare(`SELECT * FROM channel WHERE id = ?`).get(id) as unknown as ChannelRow | undefined;
  return row ? toRecord(row) : null;
}

/** Looks up one Brand's Channel for a given platform. Returns `null` when that Brand has none for that
 *  platform (or the Brand itself is unknown) — never throws. */
export function getChannelByPlatform(db: DatabaseSync, brandId: string, platform: string): ChannelRecord | null {
  const row = db
    .prepare(`SELECT * FROM channel WHERE brand_id = ? AND platform = ?`)
    .get(brandId, platform) as unknown as ChannelRow | undefined;
  return row ? toRecord(row) : null;
}

/** Every Channel for one Brand, sorted by platform. `[]` for a Brand with none (or an unknown Brand). */
export function listChannelsForBrand(db: DatabaseSync, brandId: string): readonly ChannelRecord[] {
  const rows = db
    .prepare(`SELECT * FROM channel WHERE brand_id = ? ORDER BY platform ASC`)
    .all(brandId) as unknown as ChannelRow[];
  return rows.map(toRecord);
}

/** The Brand's one primary Channel (ADR-0019), or `null` when none is marked primary yet. */
export function getPrimaryChannel(db: DatabaseSync, brandId: string): ChannelRecord | null {
  const row = db
    .prepare(`SELECT * FROM channel WHERE brand_id = ? AND is_primary = 1`)
    .get(brandId) as unknown as ChannelRow | undefined;
  return row ? toRecord(row) : null;
}

// ---------------------------------------------------------------------------
// setPrimaryChannel — atomic two-row move
// ---------------------------------------------------------------------------

/**
 * Marks `channelId` as its Brand's ONE primary Channel, demoting whichever Channel (if any) was
 * previously primary — a two-row write (demote + promote) run inside `withTransaction` so it can never
 * land half-done. Throws a clear error naming the id for an unknown `channelId`, changing nothing.
 */
export function setPrimaryChannel(db: DatabaseSync, channelId: string): void {
  const channel = getChannel(db, channelId);
  if (channel === null) {
    throw new Error(`Channel "${channelId}" not found — cannot set an unknown Channel as primary.`);
  }
  withTransaction(db, () => {
    db.prepare(`UPDATE channel SET is_primary = 0 WHERE brand_id = ? AND is_primary = 1`).run(channel.brandId);
    db.prepare(`UPDATE channel SET is_primary = 1 WHERE id = ?`).run(channelId);
  });
}
