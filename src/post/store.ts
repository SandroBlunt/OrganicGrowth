/**
 * PostStore — the SQL-backed typed store for the `post` table (issue #203, ADR-0028, ADR-0029).
 *
 * Genuinely NEW, `{ db }`-only, mirroring `src/idea/store.ts`/`src/channel/store.ts` (issue #222/#223):
 * there is no pre-existing `{ ledgerPath }`-taking "Post store" to bridge — ADR-0011's file ledger keeps
 * `post_url`/`posted_at`/`performance_score` as scalar fields ON the Asset (`src/asset/asset.ts`'s
 * `LedgerAssetRecord`), untouched by this ticket (ADR-0028's own Consequences section is explicit that
 * migrating the file ledger's writers is a LATER step, not this one).
 *
 * ADR-0028's reversal of ADR-0011's field-placement choice: a Post is `recordPost` — Post becomes its
 * own record keyed `(asset_id, channel_id)` (the schema's own `UNIQUE` constraint), so one Asset can be
 * published to more than one Channel, each with its own Post and each measured separately
 * (CONTEXT.md "Post": "at most one Post per Channel it is actually published to"). `recordPost` is a
 * keyed UPSERT (mirrors `IdeaStore.selectIdeaRecipes`'s `upsertIdeaRecipeRow` / `ChannelStore`'s own
 * upsert-shaped writes) rather than a raw insert-that-throws-on-duplicate: re-logging a corrected URL
 * for the SAME `(Asset, Channel)` (the existing `/log-post` re-log behaviour, `post-attribution` spec)
 * updates the one row in place rather than requiring a caller to branch on "does this Post already
 * exist".
 */

import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

/** The fields `recordPost` requires/accepts, minus id/timestamps (assigned by this module). */
export interface PostInput {
  readonly assetId: string;
  readonly channelId: string;
  readonly postUrl: string;
  readonly postedAt: string;
  readonly trackingState?: string;
}

/** One `post` row, fully typed. */
export interface PostRecord {
  readonly id: string;
  readonly assetId: string;
  readonly channelId: string;
  readonly postUrl: string;
  readonly postedAt: string;
  readonly trackingState?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface PostRow {
  readonly id: string;
  readonly asset_id: string;
  readonly channel_id: string;
  readonly post_url: string;
  readonly posted_at: string;
  readonly tracking_state: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

function toPostRecord(row: PostRow): PostRecord {
  return {
    id: row.id,
    assetId: row.asset_id,
    channelId: row.channel_id,
    postUrl: row.post_url,
    postedAt: row.posted_at,
    ...(row.tracking_state !== null ? { trackingState: row.tracking_state } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// recordPost — a keyed upsert on (asset_id, channel_id)
// ---------------------------------------------------------------------------

/**
 * Inserts (or updates, if one already exists for this exact `(assetId, channelId)`) one `post` row,
 * and returns its id. An Asset published to a SECOND Channel gets its OWN, independent Post row — this
 * only collapses two calls into one row when BOTH `assetId` AND `channelId` match. Throws (SQLite
 * FOREIGN KEY error) for an unknown `assetId`/`channelId`.
 */
export function recordPost(
  db: DatabaseSync,
  input: PostInput,
  now: () => string = () => new Date().toISOString(),
): string {
  const existing = db
    .prepare(`SELECT id FROM post WHERE asset_id = ? AND channel_id = ?`)
    .get(input.assetId, input.channelId) as unknown as { readonly id: string } | undefined;
  const timestamp = now();

  if (existing === undefined) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO post (id, asset_id, channel_id, post_url, posted_at, tracking_state, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.assetId, input.channelId, input.postUrl, input.postedAt, input.trackingState ?? null, timestamp, timestamp);
    return id;
  }

  db.prepare(
    `UPDATE post SET post_url = ?, posted_at = ?, tracking_state = ?, updated_at = ? WHERE id = ?`,
  ).run(input.postUrl, input.postedAt, input.trackingState ?? null, timestamp, existing.id);
  return existing.id;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Looks up one Post by its stable id. Returns `null` for an unknown id — never throws. */
export function getPost(db: DatabaseSync, id: string): PostRecord | null {
  const row = db.prepare(`SELECT * FROM post WHERE id = ?`).get(id) as unknown as PostRow | undefined;
  return row ? toPostRecord(row) : null;
}

/** Looks up the ONE Post for a given `(assetId, channelId)` pair (the schema's own `UNIQUE`
 *  constraint). Returns `null` when no Post has been logged for that pair yet — never throws. */
export function getPostForAssetAndChannel(db: DatabaseSync, assetId: string, channelId: string): PostRecord | null {
  const row = db
    .prepare(`SELECT * FROM post WHERE asset_id = ? AND channel_id = ?`)
    .get(assetId, channelId) as unknown as PostRow | undefined;
  return row ? toPostRecord(row) : null;
}

/** Every Post an Asset has been published to, across every Channel — CONTEXT.md "Post": "one Asset can
 *  be published to more than one Channel and each measured separately". `[]` for an Asset with no
 *  logged Post yet. */
export function listPostsForAsset(db: DatabaseSync, assetId: string): readonly PostRecord[] {
  const rows = db
    .prepare(`SELECT * FROM post WHERE asset_id = ? ORDER BY created_at ASC`)
    .all(assetId) as unknown as PostRow[];
  return rows.map(toPostRecord);
}

/** Every `post` row in the database, across every Asset/Channel, oldest first — `[]` for an empty
 *  database (issue #210, the local read-only Library: proving "7 posts" against the real import needs
 *  the whole table, not per-Asset lookups). */
export function listAllPosts(db: DatabaseSync): readonly PostRecord[] {
  const rows = db.prepare(`SELECT * FROM post ORDER BY created_at ASC`).all() as unknown as PostRow[];
  return rows.map(toPostRecord);
}

/** Updates ONE Post's `tracking_state` in place (e.g. as `/track-performance`'s SQL-backed sibling
 *  moves it through its own tracking lifecycle). Throws a clear, named error for an unknown `postId`,
 *  changing nothing. */
export function updatePostTrackingState(
  db: DatabaseSync,
  postId: string,
  trackingState: string,
  now: () => string = () => new Date().toISOString(),
): void {
  const existing = getPost(db, postId);
  if (existing === null) {
    throw new Error(`Post "${postId}" not found.`);
  }
  db.prepare(`UPDATE post SET tracking_state = ?, updated_at = ? WHERE id = ?`).run(trackingState, now(), postId);
}
