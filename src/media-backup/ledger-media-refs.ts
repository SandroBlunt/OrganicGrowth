/**
 * Ledger media references — the pure deep module that reads a Brand's already-loaded `LedgerIdea[]`
 * (from `src/ledger/ledger.ts`'s `loadIdeas`) and lists every media file path the ledger itself
 * points at (issue #197): a `LedgerAssetRecord.asset_paths` entry, and a `LedgerCastCandidate.path`
 * entry (`src/asset/asset.ts`).
 *
 * Pure and defensive: takes an already-parsed `LedgerIdea[]` (no file I/O of its own — the caller
 * already went through `loadIdeas`, which is itself defensive against a garbled ledger), and simply
 * folds over it. A ref's `path` is carried through EXACTLY as recorded in the ledger — relative
 * (`data/brands/<slug>/...`) or, for a handful of older records, absolute — never normalized here;
 * `path-resolve.ts` is where that gets resolved to an absolute filesystem path.
 */

import type { LedgerIdea } from "../ledger/ledger.ts";

/** One media file the ledger points at, and where it came from. */
export interface LedgerMediaRef {
  readonly brand: string;
  readonly ideaId: string;
  readonly recipe: string;
  /** The raw path exactly as recorded in the ledger — never normalized here. */
  readonly path: string;
  readonly source: "asset_paths" | "cast_path";
}

/**
 * Fold every Asset's `asset_paths` and every Cast candidate's `path` across `ideas` into a flat list
 * of `LedgerMediaRef`s, tagged with `brand`. Order: Ideas in input order, then Assets in input order,
 * then `asset_paths` entries in order, then `cast` entries in order. May contain duplicate `path`
 * values (e.g. the same file referenced twice) — callers that need a deduplicated file SET (to copy
 * each file once) key on the resolved absolute path instead of relying on this list being unique.
 */
export function collectLedgerMediaRefs(
  ideas: readonly LedgerIdea[],
  brand: string,
): LedgerMediaRef[] {
  const refs: LedgerMediaRef[] = [];
  for (const idea of ideas) {
    for (const asset of idea.assets ?? []) {
      for (const path of asset.asset_paths ?? []) {
        refs.push({ brand, ideaId: idea.id, recipe: asset.recipe, path, source: "asset_paths" });
      }
      for (const candidate of asset.cast ?? []) {
        if (candidate.path === undefined) continue;
        refs.push({
          brand,
          ideaId: idea.id,
          recipe: asset.recipe,
          path: candidate.path,
          source: "cast_path",
        });
      }
    }
  }
  return refs;
}
