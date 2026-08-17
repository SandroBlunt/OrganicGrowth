/**
 * BrandStore — the SQL-backed typed store for the `brand` table (issue #222, ADR-0029).
 *
 * Genuinely NEW: unlike `AssetStore`/`FormatStore`/`BrandAssetStore`, there was no pre-existing
 * `{ ledgerPath }`-taking "Brand store" module to port — `brand-profile.yaml` was read ad hoc by
 * `src/brand/resolver.ts`/`scaffolder.ts`. This module is the first typed store for the `brand` table
 * the SQLite foundation (issue #201) shipped, `{ db }`-only from the start — it establishes the SAME
 * `{ db }` option shape and result-object conventions the other six stores in this ticket, and
 * `IdeaStore` (issue #223) after them, follow.
 *
 * Pure, deterministic SQL against an already-open, already-migrated `DatabaseSync` — no file I/O, no
 * network, no clock (except the injectable `now` parameter, mirroring `insertAssetMedia`/
 * `insertBrandAsset` in `src/db/media-ref.ts`). Does NOT read/write `brand-profile.yaml` — that stays
 * the Operator-authored document (ADR-0029: "documents a human authors or reads directly stay files").
 */

import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The fields `createBrand` requires/accepts, minus id/timestamps (assigned by this module). */
export interface BrandInput {
  readonly slug: string;
  readonly name: string;
  readonly timezone: string;
  readonly mediaRoot: string;
  readonly bannedWords?: readonly string[];
  readonly requiredCta?: string;
  readonly requiredHashtags?: readonly string[];
  readonly watermarkHandle?: string;
}

/** One `brand` row, fully typed. */
export interface BrandRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly timezone: string;
  readonly mediaRoot: string;
  readonly bannedWords: readonly string[];
  readonly requiredCta?: string;
  readonly requiredHashtags: readonly string[];
  readonly watermarkHandle?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A patch `updateBrand` accepts — every field optional; only the given ones are written. */
export type BrandPatch = Partial<BrandInput>;

// ---------------------------------------------------------------------------
// Row <-> record mapping
// ---------------------------------------------------------------------------

interface BrandRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly timezone: string;
  readonly media_root: string;
  readonly banned_words_json: string;
  readonly required_cta: string | null;
  readonly required_hashtags_json: string;
  readonly watermark_handle: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

function toRecord(row: BrandRow): BrandRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    timezone: row.timezone,
    mediaRoot: row.media_root,
    bannedWords: JSON.parse(row.banned_words_json) as string[],
    ...(row.required_cta !== null ? { requiredCta: row.required_cta } : {}),
    requiredHashtags: JSON.parse(row.required_hashtags_json) as string[],
    ...(row.watermark_handle !== null ? { watermarkHandle: row.watermark_handle } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// createBrand
// ---------------------------------------------------------------------------

/** Inserts one `brand` row and returns its generated id. Throws (SQLite UNIQUE error) for a slug
 *  already committed — `brand.slug` is unique. */
export function createBrand(
  db: DatabaseSync,
  input: BrandInput,
  now: () => string = () => new Date().toISOString(),
): string {
  const id = randomUUID();
  const timestamp = now();
  db.prepare(
    `INSERT INTO brand
       (id, slug, name, timezone, banned_words_json, required_cta, required_hashtags_json, watermark_handle, media_root, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.slug,
    input.name,
    input.timezone,
    JSON.stringify(input.bannedWords ?? []),
    input.requiredCta ?? null,
    JSON.stringify(input.requiredHashtags ?? []),
    input.watermarkHandle ?? null,
    input.mediaRoot,
    timestamp,
    timestamp,
  );
  return id;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Looks up one Brand by its stable id. Returns `null` for an unknown id — never throws. */
export function getBrandById(db: DatabaseSync, id: string): BrandRecord | null {
  const row = db.prepare(`SELECT * FROM brand WHERE id = ?`).get(id) as BrandRow | undefined;
  return row ? toRecord(row) : null;
}

/** Looks up one Brand by its unique slug. Returns `null` for an unknown slug — never throws. */
export function getBrandBySlug(db: DatabaseSync, slug: string): BrandRecord | null {
  const row = db.prepare(`SELECT * FROM brand WHERE slug = ?`).get(slug) as BrandRow | undefined;
  return row ? toRecord(row) : null;
}

/** Every committed Brand, sorted by slug. `[]` for an empty database. */
export function listBrands(db: DatabaseSync): readonly BrandRecord[] {
  const rows = db.prepare(`SELECT * FROM brand ORDER BY slug ASC`).all() as unknown as BrandRow[];
  return rows.map(toRecord);
}

// ---------------------------------------------------------------------------
// updateBrand
// ---------------------------------------------------------------------------

/**
 * Merges `patch` onto the Brand at `id` — only the given fields are written; every other column
 * (including `created_at`) is left untouched. `updated_at` is always bumped to `now()`. Throws a clear,
 * actionable error naming the id for an unknown Brand — a Brand row is a required anchor for Channels/
 * Formats/Runs/Ideas, so a silent no-op here would let a caller believe an update landed when it did not.
 */
export function updateBrand(
  db: DatabaseSync,
  id: string,
  patch: BrandPatch,
  now: () => string = () => new Date().toISOString(),
): void {
  const existing = getBrandById(db, id);
  if (existing === null) {
    throw new Error(`Brand "${id}" not found — cannot update a Brand that does not exist.`);
  }
  const merged: BrandRecord = { ...existing, ...patch, updatedAt: now() };
  db.prepare(
    `UPDATE brand
       SET slug = ?, name = ?, timezone = ?, banned_words_json = ?, required_cta = ?,
           required_hashtags_json = ?, watermark_handle = ?, media_root = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    merged.slug,
    merged.name,
    merged.timezone,
    JSON.stringify(merged.bannedWords),
    merged.requiredCta ?? null,
    JSON.stringify(merged.requiredHashtags),
    merged.watermarkHandle ?? null,
    merged.mediaRoot,
    merged.updatedAt,
    id,
  );
}
