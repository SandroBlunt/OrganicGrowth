/**
 * Channel baseline medians — pure deep module (issue #84, ADR-0011, ADR-0001).
 *
 * The Brand's Channel baseline is a per-metric ROLLING MEDIAN of our own recent Posts' public
 * metrics (shares, comments, reactions, views) — one baseline per Channel, never one per Recipe
 * (always-rules #4: relative, not absolute). This module holds the pure math: computing a median and
 * recomputing the four per-metric medians from a batch of `AssetMetrics` readings. It never touches
 * disk — `src/ledger/ledger.ts`'s `loadBaseline`/`writeBaseline` are the store boundary.
 */

import type { AssetMetrics } from "../asset/asset.ts";

/** The Channel's four per-metric medians. A metric is `null` until at least one reading exists for
 *  it — never fabricated as `0` (data-handling rule 8). */
export interface BaselineMedians {
  readonly shares: number | null;
  readonly comments: number | null;
  readonly reactions: number | null;
  readonly views: number | null;
}

/** The all-null baseline — no readings yet. */
export const EMPTY_BASELINE_MEDIANS: BaselineMedians = {
  shares: null,
  comments: null,
  reactions: null,
  views: null,
};

/**
 * The median of `values`. Returns `null` for an empty input (no fabricated "0 baseline"). Pure,
 * deterministic; does not mutate `values`.
 */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Recompute the Channel's per-metric baseline medians from a batch of `AssetMetrics` readings (e.g.
 * every currently `scored` Asset's `metrics` across a Brand's whole ledger). An empty `samples` list
 * yields `EMPTY_BASELINE_MEDIANS` — the caller decides whether to still write that (it should not
 * overwrite an existing real baseline with nulls just because THIS run had nothing to recompute from).
 */
export function recomputeBaseline(samples: readonly AssetMetrics[]): BaselineMedians {
  return {
    shares: median(samples.map((s) => s.shares)),
    comments: median(samples.map((s) => s.comments)),
    reactions: median(samples.map((s) => s.reactions)),
    views: median(samples.map((s) => s.views)),
  };
}
