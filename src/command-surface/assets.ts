/**
 * `saveAsset` / `attachAssetMedia` — the typed command surface's Asset operations (issue #205 AC1,
 * epic #195's "saving an Asset" — thin orchestration shells over `src/asset/store.ts`'s SQL-backed
 * branch).
 *
 * `saveAsset` always calls `writeAsset`'s `{ db }` overload — never the file-backed `{ ledgerPath }`
 * one; a caller that needs the file-backed ledger continues to call `src/asset/store.ts` directly (that
 * is still the real, live path until issue #204's importer runs — this command surface is additive, not
 * a replacement for it).
 *
 * `attachAssetMedia` is a deliberate, minimal companion beyond `saveAsset` alone: CONTEXT.md's own
 * "Asset" definition is "the media ... plus its tailored Copy" — a command surface that could save an
 * Asset's status/spec but never record the media rows it produced would leave half of what "saving an
 * Asset" means with no legal write path (AC2).
 *
 * `getAssetByRecipe` (issue #204) is a read, added for the SAME reason `trends.ts`'s `listTrends` was —
 * "a future caller reaches every pipeline operation, read or write, through ONE surface rather than
 * importing a store directly". The one-shot importer needs it: `saveAsset` returns `void`, so after
 * saving a new Asset the importer needs its generated id before it can call `attachAssetMedia`.
 */

import type { DatabaseSync } from "node:sqlite";

import { writeAsset, addAssetMediaBatch, loadIdeaAssets, type DbAssetPatch, type AssetMediaItem, type DbAssetRecord } from "../asset/store.ts";

export type { DbAssetPatch, AssetMediaItem, DbAssetRecord };

/** Looks up one Idea's Asset for a given Recipe. Returns `null` when the Idea is unknown, or has no
 *  Asset for that Recipe yet. */
export async function getAssetByRecipe(db: DatabaseSync, ideaId: string, recipe: string): Promise<DbAssetRecord | null> {
  const assets = (await loadIdeaAssets(ideaId, { db })) as readonly DbAssetRecord[] | null;
  if (assets === null) return null;
  return assets.find((a) => a.recipe === recipe) ?? null;
}

/** Upserts one Asset for `(ideaId, recipe)` — insert if the Idea has no Asset for that Recipe yet,
 *  merge-update if it does. An unknown `ideaId` (no `idea` row) leaves the database untouched. See
 *  `src/asset/store.ts`'s SQL-backed `writeAsset` overload for the full patch/merge contract. */
export async function saveAsset(
  db: DatabaseSync,
  ideaId: string,
  recipe: string,
  patch: DbAssetPatch,
): Promise<void> {
  await writeAsset(ideaId, recipe, patch, { db });
}

/**
 * Inserts several `asset_media` rows for `assetId` inside ONE transaction — all-or-nothing (a News
 * Carousel Asset's 7 slides land together, or not at all). Returns the generated row ids, in the same
 * order as `items`. Throws `StorageKeyError` for an absolute/traversal `storageKey`, or a SQLite
 * constraint error for a duplicate `ordinal` on this Asset — either way, the WHOLE batch rolls back.
 */
export function attachAssetMedia(
  db: DatabaseSync,
  assetId: string,
  items: readonly AssetMediaItem[],
  now: () => string = () => new Date().toISOString(),
): readonly string[] {
  return addAssetMediaBatch(db, assetId, items, now);
}
