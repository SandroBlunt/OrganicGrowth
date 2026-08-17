/**
 * AssetStore — the typed store boundary for a Brand's per-Idea Assets (ADR-0011, ADR-0014, ADR-0029).
 *
 * Per ADR-0014, canonical state stays in plain files for the MVP, but every entity sits behind a
 * typed store — no stray file I/O elsewhere. Assets live INSIDE a Brand's `ledger.json` (nested under
 * each Idea, keyed by Recipe — ADR-0011), so `AssetStore` reads/writes that same file directly (its
 * own I/O, mirroring `ledger/ledger.ts`'s Cast/Asset write shells) rather than routing through
 * `ledger.ts`'s Idea-status API, which this store does not depend on.
 *
 * Reads are TRANSPARENTLY tolerant of an un-migrated ledger: `loadIdeaAssets` runs every record
 * through `normalizeIdeaStatus` (the same normalizer `ledger.ts`'s `loadIdeas`/`loadReport` use), so
 * a legacy `status: "casting"` Idea's Cast/production fields are folded into an Asset in memory even
 * before the one-time migration (`ledger/migrate-assets.ts`) has run. `writeAsset` normalizes too,
 * BEFORE upserting, so writing to a not-yet-migrated Idea never silently drops its legacy production
 * data (it is folded onto disk as part of the same write).
 *
 * --- The SQL-backed branch (issue #222) ---
 *
 * `loadIdeaAssets`/`writeAsset` gain a SECOND, additive way to be called: pass `{ db }` (a real,
 * migrated `DatabaseSync`) instead of a `ledgerPath` string, and they read/write the `asset` SQL table
 * instead of `ledger.json`. Every EXISTING caller (still passing a `ledgerPath` string) is completely
 * unaffected — same branch, same code, same behavior — because the two branches are additive overloads
 * on the SAME function names, not a replacement. This is a deliberate bridge, not an oversight: `asset`
 * rows key on `idea_id` (an `idea` table row `IdeaStore`, issue #223, does not exist yet to create), and
 * ~14 production modules (`track-performance.ts`, `export-schedule.ts`, `schedule-via-zoho-mcp.ts`,
 * `upload-camera-hub-scripts.ts`, `report.ts`, `pick-cast.ts`, `ledger.ts`, and others) read the SAME
 * ledger.json for Idea-level data that stays file-based until #223 lands — forcing them onto `{ db }`
 * today, before Idea has a SQL home, would either break their Idea-side reads or force a half-migrated
 * dual-write no one asked for. See this ticket's Build Report for the full reasoning.
 *
 * The SQL-backed return shape (`DbAssetRecord`) is DELIBERATELY narrower than `LedgerAssetRecord`: the
 * `asset` table (`src/db/schema.ts`, frozen from issue #201) carries `status`, `pending_gate`,
 * `spec_json`, `produced_at`, `scheduled_at`, `camera_hub_uploaded_at`, `zoho_schedule_ref` — it has NO
 * column for `cast`/`character` (the *Character Explainer with Cast* Recipe's own gate-local fields,
 * whose fate is an explicitly OPEN epic question — "does the Character Explainer Recipe survive?"),
 * `has_video_slide` (the News Carousel Recipe's own extension flag), or
 * `metrics`/`tracked_at`/`history`/`post_url`/`posted_at`/`performance_score` (ADR-0028 moves these
 * OFF the Asset entirely, onto the new `post`/`metric_snapshot`/`performance_score` tables, keyed by
 * Channel — not built by this ticket). `asset_paths`/`asset_url` become `asset_media` ROWS
 * (`addAssetMedia`/`listAssetMedia` below), and `copy` becomes `copy_variant` ROWS, keyed to a Channel
 * (`src/copy/store.ts`) — both per this ticket's own AC, not a narrowing I invented.
 */

import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { readJsonFile, writeFileAtomic } from "../fs/safe-io.ts";
import { normalizeIdeaStatus } from "./migrate.ts";
import {
  upsertAsset,
  parseZohoScheduleReference,
  type AssetStatus,
  type LedgerAssetRecord,
  type ZohoScheduleReference,
} from "./asset.ts";
import { withTransaction } from "../db/transaction.ts";
import { insertAssetMedia, type AssetMediaInput } from "../db/media-ref.ts";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Options for the AssetStore's write shell — mirrors `ledger.ts`'s `WriteIdeaStatusOptions` shape. */
export interface AssetStoreOptions {
  /** REQUIRED: the Brand's ledger path. There is no ambient/brand-scoped default. */
  readonly ledgerPath: string;
}

/** The SQL-backed option, additive to `AssetStoreOptions` above (issue #222). */
export interface AssetStoreDbOptions {
  readonly db: DatabaseSync;
}

function isDbOptions(value: string | AssetStoreDbOptions): value is AssetStoreDbOptions {
  return typeof value === "object" && value !== null && "db" in value;
}

// ---------------------------------------------------------------------------
// loadIdeaAssets — file-backed (unchanged) + SQL-backed (issue #222) overloads
// ---------------------------------------------------------------------------

/**
 * Read one Idea's Assets from the Brand's ledger, normalized to the canonical grain. Returns `null`
 * when the Idea is not found at all (distinct from a known Idea with no Assets yet, which returns
 * `[]`) — mirrors `ledger.ts`'s `loadIdeaCast` null-vs-empty convention.
 */
export async function loadIdeaAssets(
  ideaId: string,
  ledgerPath: string,
): Promise<readonly LedgerAssetRecord[] | null>;
/** SQL-backed overload (issue #222): reads from the `asset` table instead of `ledger.json`. Same
 *  null-vs-[] convention: `null` when no `idea` row exists for `ideaId`, `[]` for a known Idea with no
 *  Assets yet. */
export async function loadIdeaAssets(
  ideaId: string,
  options: AssetStoreDbOptions,
): Promise<readonly DbAssetRecord[] | null>;
export async function loadIdeaAssets(
  ideaId: string,
  source: string | AssetStoreDbOptions,
): Promise<readonly LedgerAssetRecord[] | null | readonly DbAssetRecord[]> {
  if (isDbOptions(source)) {
    return loadIdeaAssetsDb(source.db, ideaId);
  }
  const raw: unknown = await readJsonFile(source);
  if (!isObject(raw) || !Array.isArray(raw.ideas)) return null;
  const record = raw.ideas.find((r) => isObject(r) && r.id === ideaId);
  if (!isObject(record)) return null;
  return normalizeIdeaStatus(record).assets;
}

// ---------------------------------------------------------------------------
// writeAsset — file-backed (unchanged) + SQL-backed (issue #222) overloads
// ---------------------------------------------------------------------------

/**
 * Thin write shell: load the full ledger, upsert `recipe`'s Asset on `ideaId` (insert if the Idea has
 * none for that Recipe yet, merge-update if it does), and save. The target Idea's OTHER fields are
 * preserved by editing the raw record in place; other Ideas are untouched. Before upserting, the
 * target Idea's existing assets are read through `normalizeIdeaStatus` so a not-yet-migrated
 * (legacy-status) Idea is folded onto the grain as part of this same write, never silently dropped.
 * An unknown `ideaId` leaves the file untouched (the ledger stays canonical — never invents a record).
 */
export async function writeAsset(
  ideaId: string,
  recipe: string,
  patch: Partial<Omit<LedgerAssetRecord, "recipe">> & { readonly status: AssetStatus },
  options: AssetStoreOptions,
): Promise<void>;
/** SQL-backed overload (issue #222): upserts one `asset` row, keyed on `(idea_id, recipe_slug)` — the
 *  SAME UNIQUE constraint the file-based grain enforces logically. An unknown `ideaId` (no `idea` row)
 *  leaves the database untouched, mirroring the file branch's own convention. */
export async function writeAsset(
  ideaId: string,
  recipe: string,
  patch: DbAssetPatch,
  options: AssetStoreDbOptions,
): Promise<void>;
export async function writeAsset(
  ideaId: string,
  recipe: string,
  patch: (Partial<Omit<LedgerAssetRecord, "recipe">> & { readonly status: AssetStatus }) | DbAssetPatch,
  options: AssetStoreOptions | AssetStoreDbOptions,
): Promise<void> {
  if ("db" in options) {
    writeAssetDb(options.db, ideaId, recipe, patch as DbAssetPatch);
    return;
  }
  const path = options.ledgerPath;
  const raw: unknown = await readJsonFile(path);
  if (!isObject(raw) || !Array.isArray(raw.ideas)) return;

  let changed = false;
  const ideas = raw.ideas.map((record) => {
    if (!isObject(record) || record.id !== ideaId) return record;
    changed = true;
    const normalized = normalizeIdeaStatus(record);
    return {
      ...record,
      status: normalized.status,
      assets: upsertAsset(normalized.assets, recipe, patch as Partial<Omit<LedgerAssetRecord, "recipe">> & { readonly status: AssetStatus }),
    };
  });
  if (!changed) return;

  const next = { ...raw, ideas };
  await writeFileAtomic(path, JSON.stringify(next, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// SQL-backed implementation (issue #222)
// ---------------------------------------------------------------------------

/** One `asset` row, fully typed — the SQL-backed sibling of `LedgerAssetRecord` (see this module's own
 *  doc comment for exactly which legacy fields have no home here, and why). */
export interface DbAssetRecord {
  readonly id: string;
  readonly ideaId: string;
  readonly recipe: string;
  readonly status: AssetStatus;
  readonly pending_gate?: string;
  /** The Production Spec JSON (`asset.spec_json`) — see also `src/production-spec/store.ts`'s
   *  `saveProductionSpec`/`loadProductionSpec`, a narrower, assetId-keyed sibling of this same column. */
  readonly spec?: Record<string, unknown>;
  readonly produced_at?: string;
  readonly scheduled_at?: string;
  readonly camera_hub_uploaded_at?: string;
  readonly zoho_schedule_reference?: ZohoScheduleReference;
  readonly created_at: string;
  readonly updated_at: string;
}

/** The patch `writeAsset`'s SQL-backed overload accepts — mirrors the file branch's patch shape, minus
 *  the fields the `asset` table has no column for. */
export type DbAssetPatch = Partial<
  Pick<DbAssetRecord, "pending_gate" | "spec" | "produced_at" | "scheduled_at" | "camera_hub_uploaded_at" | "zoho_schedule_reference">
> & { readonly status: AssetStatus };

interface AssetRow {
  readonly id: string;
  readonly idea_id: string;
  readonly recipe_slug: string;
  readonly status: string;
  readonly pending_gate: string | null;
  readonly spec_json: string | null;
  readonly produced_at: string | null;
  readonly scheduled_at: string | null;
  readonly camera_hub_uploaded_at: string | null;
  readonly zoho_schedule_ref: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

function toDbAssetRecord(row: AssetRow): DbAssetRecord {
  const zohoRaw: unknown = row.zoho_schedule_ref !== null ? JSON.parse(row.zoho_schedule_ref) : null;
  const zoho = parseZohoScheduleReference(zohoRaw);
  return {
    id: row.id,
    ideaId: row.idea_id,
    recipe: row.recipe_slug,
    status: row.status as AssetStatus,
    ...(row.pending_gate !== null ? { pending_gate: row.pending_gate } : {}),
    ...(row.spec_json !== null ? { spec: JSON.parse(row.spec_json) as Record<string, unknown> } : {}),
    ...(row.produced_at !== null ? { produced_at: row.produced_at } : {}),
    ...(row.scheduled_at !== null ? { scheduled_at: row.scheduled_at } : {}),
    ...(row.camera_hub_uploaded_at !== null ? { camera_hub_uploaded_at: row.camera_hub_uploaded_at } : {}),
    ...(zoho !== null ? { zoho_schedule_reference: zoho } : {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Looks up one Asset by its own stable id — returns `null` for an unknown id, never throws. A `job` row
 * carries only `asset_id`, never `(idea_id, recipe_slug)` directly, so a caller holding a claimed job
 * cannot reach its Asset's Production Spec/status through `loadIdeaAssets` (keyed by Idea) without first
 * resolving the Asset by id (issue #208).
 */
export function getAssetById(db: DatabaseSync, id: string): DbAssetRecord | null {
  const row = db.prepare(`SELECT * FROM asset WHERE id = ?`).get(id) as unknown as AssetRow | undefined;
  return row ? toDbAssetRecord(row) : null;
}

async function loadIdeaAssetsDb(db: DatabaseSync, ideaId: string): Promise<readonly DbAssetRecord[] | null> {
  const idea = db.prepare(`SELECT id FROM idea WHERE id = ?`).get(ideaId);
  if (idea === undefined) return null;
  const rows = db
    .prepare(`SELECT * FROM asset WHERE idea_id = ? ORDER BY created_at ASC`)
    .all(ideaId) as unknown as AssetRow[];
  return rows.map(toDbAssetRecord);
}

function writeAssetDb(db: DatabaseSync, ideaId: string, recipe: string, patch: DbAssetPatch, now: () => string = () => new Date().toISOString()): void {
  const idea = db.prepare(`SELECT id FROM idea WHERE id = ?`).get(ideaId);
  if (idea === undefined) return; // unknown Idea — database stays untouched (mirrors the file branch)

  withTransaction(db, () => {
    const existing = db
      .prepare(`SELECT * FROM asset WHERE idea_id = ? AND recipe_slug = ?`)
      .get(ideaId, recipe) as unknown as AssetRow | undefined;
    const timestamp = now();

    const pendingGate = "pending_gate" in patch ? (patch.pending_gate ?? null) : (existing?.pending_gate ?? null);
    const specJson = "spec" in patch ? JSON.stringify(patch.spec ?? null) : existing?.spec_json ?? null;
    const producedAt = "produced_at" in patch ? (patch.produced_at ?? null) : (existing?.produced_at ?? null);
    const scheduledAt = "scheduled_at" in patch ? (patch.scheduled_at ?? null) : (existing?.scheduled_at ?? null);
    const cameraHubUploadedAt =
      "camera_hub_uploaded_at" in patch ? (patch.camera_hub_uploaded_at ?? null) : (existing?.camera_hub_uploaded_at ?? null);
    const zohoRef =
      "zoho_schedule_reference" in patch
        ? patch.zoho_schedule_reference !== undefined
          ? JSON.stringify(patch.zoho_schedule_reference)
          : null
        : (existing?.zoho_schedule_ref ?? null);

    if (existing === undefined) {
      db.prepare(
        `INSERT INTO asset
           (id, idea_id, recipe_slug, status, pending_gate, spec_json, produced_at, scheduled_at, camera_hub_uploaded_at, zoho_schedule_ref, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(randomUUID(), ideaId, recipe, patch.status, pendingGate, specJson, producedAt, scheduledAt, cameraHubUploadedAt, zohoRef, timestamp, timestamp);
    } else {
      db.prepare(
        `UPDATE asset
           SET status = ?, pending_gate = ?, spec_json = ?, produced_at = ?, scheduled_at = ?,
               camera_hub_uploaded_at = ?, zoho_schedule_ref = ?, updated_at = ?
         WHERE id = ?`,
      ).run(patch.status, pendingGate, specJson, producedAt, scheduledAt, cameraHubUploadedAt, zohoRef, timestamp, existing.id);
    }
  });
}

// ---------------------------------------------------------------------------
// asset_media — stored as rows (issue #222 AC)
// ---------------------------------------------------------------------------

/** One `asset_media` row, fully typed. */
export interface AssetMediaRecord {
  readonly id: string;
  readonly assetId: string;
  readonly ordinal: number;
  readonly kind: "image" | "video" | "audio";
  readonly storageKey: string;
  readonly mime: string;
  readonly bytes: number;
  readonly checksum: string;
  readonly magnificCreationId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface AssetMediaRow {
  readonly id: string;
  readonly asset_id: string;
  readonly ordinal: number;
  readonly kind: string;
  readonly storage_key: string;
  readonly mime: string;
  readonly bytes: number;
  readonly checksum: string;
  readonly magnific_creation_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

function toAssetMediaRecord(row: AssetMediaRow): AssetMediaRecord {
  return {
    id: row.id,
    assetId: row.asset_id,
    ordinal: row.ordinal,
    kind: row.kind as "image" | "video" | "audio",
    storageKey: row.storage_key,
    mime: row.mime,
    bytes: row.bytes,
    checksum: row.checksum,
    ...(row.magnific_creation_id !== null ? { magnificCreationId: row.magnific_creation_id } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** One media item to add, minus the `assetId` (supplied separately) `insertAssetMedia` requires. */
export type AssetMediaItem = Omit<AssetMediaInput, "assetId">;

/**
 * Inserts one `asset_media` row for `assetId`. Delegates to `src/db/media-ref.ts`'s `insertAssetMedia`,
 * so an absolute/home-shorthand/traversal `storageKey` is rejected (`StorageKeyError`) BEFORE any row
 * is written. Returns the generated row id.
 */
export function addAssetMedia(
  db: DatabaseSync,
  assetId: string,
  item: AssetMediaItem,
  now: () => string = () => new Date().toISOString(),
): string {
  return insertAssetMedia(db, { ...item, assetId }, now);
}

/**
 * Inserts several `asset_media` rows for `assetId` inside ONE transaction (issue #222's transaction
 * requirement): a News Carousel Asset's 7 slides, for example, land all-or-nothing. If any item fails
 * (an absolute storage key, a duplicate `ordinal` on this Asset — `UNIQUE (asset_id, ordinal)`), the
 * WHOLE batch rolls back, including items that individually would have succeeded. Returns the generated
 * row ids, in the same order as `items`.
 */
export function addAssetMediaBatch(
  db: DatabaseSync,
  assetId: string,
  items: readonly AssetMediaItem[],
  now: () => string = () => new Date().toISOString(),
): readonly string[] {
  return withTransaction(db, () => items.map((item) => addAssetMedia(db, assetId, item, now)));
}

/** Every `asset_media` row for one Asset, in ordinal order. */
export function listAssetMedia(db: DatabaseSync, assetId: string): readonly AssetMediaRecord[] {
  const rows = db
    .prepare(`SELECT * FROM asset_media WHERE asset_id = ? ORDER BY ordinal ASC`)
    .all(assetId) as unknown as AssetMediaRow[];
  return rows.map(toAssetMediaRecord);
}
