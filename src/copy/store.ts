/**
 * The SQL-backed Copy Variant store (issue #222 AC: "asset_media and copy_variant are stored as rows,
 * with Copy variants keyed to a Channel").
 *
 * Genuinely NEW: before this ticket, an Asset's Copy (`src/copy/contract.ts`'s `Copy`) lived as a
 * single nested JSON object on the file-based `LedgerAssetRecord.copy`, with `Copy.variants[]`
 * platform-LABELED (a bare string, e.g. `"linkedin"`). `copy_variant` (`src/db/schema.ts`) instead
 * keys each variant to a real `channel_id` FK — the relational form of the same fact, now able to
 * distinguish "this Brand's LinkedIn Channel" from any other Brand's, and to enforce (via the FK) that
 * a variant can only be written for a Channel that actually exists.
 *
 * `cta` (`copy_variant.cta`) is left unpopulated by this module: today's `Copy`/`CopyVariant`
 * (`src/copy/contract.ts`) folds the CTA into `caption` rather than carrying it as its own field
 * (documented there — "Mentions/CTA are folded into caption"), so there is nothing to map it from yet;
 * the column exists for a future Copy shape, unused today, same as `asset.pending_gate` was room-to-grow
 * before ADR-0011 needed it. `mentions_json` is populated from `CopyVariant.unresolvedMentions` — the
 * one "mentions" list the current Copy shape carries.
 */

import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { withTransaction } from "../db/transaction.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The fields `upsertCopyVariant` requires/accepts, minus id/timestamps. */
export interface CopyVariantInput {
  readonly assetId: string;
  readonly channelId: string;
  readonly caption: string;
  readonly hashtags?: readonly string[];
  readonly unresolvedMentions?: readonly string[];
  readonly title?: string;
  readonly cta?: string;
}

/** One item in a batch write to `upsertCopyVariants` — `assetId` supplied separately. */
export type CopyVariantItem = Omit<CopyVariantInput, "assetId">;

/** One `copy_variant` row, fully typed. */
export interface CopyVariantRecord {
  readonly id: string;
  readonly assetId: string;
  readonly channelId: string;
  readonly caption: string;
  readonly hashtags: readonly string[];
  readonly unresolvedMentions?: readonly string[];
  readonly title?: string;
  readonly cta?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface CopyVariantRow {
  readonly id: string;
  readonly asset_id: string;
  readonly channel_id: string;
  readonly caption: string;
  readonly hashtags_json: string;
  readonly mentions_json: string;
  readonly title: string | null;
  readonly cta: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

function toRecord(row: CopyVariantRow): CopyVariantRecord {
  const mentions = JSON.parse(row.mentions_json) as string[];
  return {
    id: row.id,
    assetId: row.asset_id,
    channelId: row.channel_id,
    caption: row.caption,
    hashtags: JSON.parse(row.hashtags_json) as string[],
    ...(mentions.length > 0 ? { unresolvedMentions: mentions } : {}),
    ...(row.title !== null ? { title: row.title } : {}),
    ...(row.cta !== null ? { cta: row.cta } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// upsertCopyVariant / upsertCopyVariants
// ---------------------------------------------------------------------------

/**
 * Inserts or updates one `copy_variant` row, keyed on `(asset_id, channel_id)` (the schema's own
 * `UNIQUE` constraint — `src/db/schema.ts`). Throws (SQLite FOREIGN KEY error) for an unknown
 * `assetId`/`channelId`. Returns the row's id (generated on insert, unchanged on update).
 */
export function upsertCopyVariant(
  db: DatabaseSync,
  input: CopyVariantInput,
  now: () => string = () => new Date().toISOString(),
): string {
  const existing = db
    .prepare(`SELECT id FROM copy_variant WHERE asset_id = ? AND channel_id = ?`)
    .get(input.assetId, input.channelId) as unknown as { readonly id: string } | undefined;
  const timestamp = now();
  const hashtagsJson = JSON.stringify(input.hashtags ?? []);
  const mentionsJson = JSON.stringify(input.unresolvedMentions ?? []);

  if (existing === undefined) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO copy_variant (id, asset_id, channel_id, caption, hashtags_json, mentions_json, title, cta, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.assetId, input.channelId, input.caption, hashtagsJson, mentionsJson, input.title ?? null, input.cta ?? null, timestamp, timestamp);
    return id;
  }

  db.prepare(
    `UPDATE copy_variant SET caption = ?, hashtags_json = ?, mentions_json = ?, title = ?, cta = ?, updated_at = ? WHERE id = ?`,
  ).run(input.caption, hashtagsJson, mentionsJson, input.title ?? null, input.cta ?? null, timestamp, existing.id);
  return existing.id;
}

/**
 * Writes several Copy variants for one Asset inside ONE transaction (issue #222's transaction
 * requirement) — e.g. one variant per targeted Channel platform (ADR-0025), composed together. If any
 * item fails (an unknown `channelId`), the WHOLE batch rolls back, including variants that individually
 * would have succeeded. Returns the row ids, in the same order as `variants`.
 */
export function upsertCopyVariants(
  db: DatabaseSync,
  assetId: string,
  variants: readonly CopyVariantItem[],
  now: () => string = () => new Date().toISOString(),
): readonly string[] {
  return withTransaction(db, () => variants.map((v) => upsertCopyVariant(db, { ...v, assetId }, now)));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every Copy variant for one Asset. `[]` when none has been composed yet. */
export function listCopyVariants(db: DatabaseSync, assetId: string): readonly CopyVariantRecord[] {
  const rows = db
    .prepare(`SELECT * FROM copy_variant WHERE asset_id = ? ORDER BY created_at ASC`)
    .all(assetId) as unknown as CopyVariantRow[];
  return rows.map(toRecord);
}

/** One Asset's Copy variant for a specific Channel. `null` when none exists yet. */
export function getCopyVariantForChannel(db: DatabaseSync, assetId: string, channelId: string): CopyVariantRecord | null {
  const row = db
    .prepare(`SELECT * FROM copy_variant WHERE asset_id = ? AND channel_id = ?`)
    .get(assetId, channelId) as unknown as CopyVariantRow | undefined;
  return row ? toRecord(row) : null;
}
