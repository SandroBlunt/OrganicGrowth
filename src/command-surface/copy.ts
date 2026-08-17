/**
 * `saveCopyVariant` — the typed command surface's Copy Variant write (issue #208, mirroring `assets.ts`'s
 * own shape for `src/copy/store.ts`'s SQL-backed `upsertCopyVariant`).
 */

import type { DatabaseSync } from "node:sqlite";

import { upsertCopyVariant, type CopyVariantInput, type CopyVariantRecord } from "../copy/store.ts";

export type { CopyVariantInput, CopyVariantRecord };

/** Inserts or updates one `copy_variant` row, keyed on `(assetId, channelId)`. Throws (SQLite FOREIGN
 *  KEY error) for an unknown `assetId`/`channelId`. Returns the row's id. */
export function saveCopyVariant(
  db: DatabaseSync,
  input: CopyVariantInput,
  now: () => string = () => new Date().toISOString(),
): string {
  return upsertCopyVariant(db, input, now);
}
