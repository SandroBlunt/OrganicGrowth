/**
 * `saveAssetSpec` / `refreshSpecFile` — the typed command surface's Production Spec operations
 * (ADR-0031, issue #264).
 *
 * `saveAssetSpec` is a thin orchestration shell over `src/production-spec/store.ts`'s SQL-backed
 * `saveProductionSpec` — this is that function's FIRST production caller (`acceptIdeaCommand`, via
 * `src/production-spec/author-at-review.ts`'s `authorSpecForRecipe`). `refreshSpecFile` is the
 * "generated view" companion (mirroring `src/asset/output-bundle.ts`'s `refreshPostJson` relationship to
 * the ledger's own Asset, ADR-0028): it reads the Spec back OFF the SQL row via `loadProductionSpec`,
 * then writes it to the human-readable per-Idea file via the file-backed `saveSpec` — so the on-disk
 * Spec can never independently drift from what SQL actually holds, because it is never authored a second
 * time; it is only ever re-derived from the SAME row.
 *
 * Both live inside `src/command-surface/`, so `src/store-write-boundary/scan.ts`'s guard (which exempts
 * `src/command-surface/**` by design) needs no new allow-list entry for either the SQL write
 * (`saveProductionSpec`) or the file write (`saveSpec`) this module performs.
 */

import type { DatabaseSync } from "node:sqlite";

import { saveProductionSpec, loadProductionSpec, saveSpec } from "../production-spec/store.ts";
import type { ProductionSpec } from "../production-spec/contract.ts";

/**
 * Persists `spec` onto the Asset at `assetId`'s SQL row (`asset.spec_json`). Throws when no such Asset
 * exists (mirrors `saveProductionSpec`'s own contract — a genuinely missing Asset id is a caller bug).
 */
export function saveAssetSpec(
  db: DatabaseSync,
  assetId: string,
  spec: ProductionSpec | Record<string, unknown>,
  now?: () => string,
): void {
  saveProductionSpec(db, assetId, spec, now);
}

/**
 * Reads the Spec back off the Asset at `assetId`'s SQL row and writes it to `path` — a GENERATED VIEW,
 * never a second, independently-authored copy (mirrors `refreshPostJson`'s own contract). Returns
 * `false` and writes nothing when the Asset carries no Spec yet (nothing to regenerate from); `true` once
 * the file is written.
 */
export async function refreshSpecFile(db: DatabaseSync, assetId: string, path: string): Promise<boolean> {
  const spec = loadProductionSpec(db, assetId);
  if (spec === null) return false;
  await saveSpec(spec, path);
  return true;
}
