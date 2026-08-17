/**
 * `resolveTrendInfo` — the `trend.label`/`momentum`/`source_urls` to import for one referenced legacy
 * Trend id (issue #204).
 *
 * Straw Motion's ledger carries `trend_label` INLINE on every Idea that names a `trend_id` (verified
 * against the real ledger) — the cheap, always-correct source, needing no file read at all. MundoTip's
 * pre-Format Ideas carry only the short `trend` code (e.g. `"T01"`), with the real label living in that
 * Run's `trends.json` — the one real case this module reads a file for. MundoTip never uses a
 * Format-namespaced layout (it has no Format at all — that is this ticket's own definition of "pre-
 * Format"), so its `trends.json` always lives at the legacy flat path
 * `<brandsRoot>/<brand>/ideas/<run>/trends.json`, the SAME convention `resolveBriefPathCandidates`'s own
 * legacy-flat candidate uses.
 */

import { join } from "node:path";

import { resolveBrand } from "../brand/resolver.ts";
import { loadTrendsFile } from "./load-trends.ts";

export interface ResolvedTrendInfo {
  readonly label: string;
  readonly momentum?: number;
  readonly sourceUrls: readonly string[];
}

/** The subset of a `FullLedgerIdea` this module needs. */
export interface TrendReferencingIdea {
  readonly id: string;
  readonly run?: string;
  readonly trendId?: string;
  readonly trendLabel?: string;
}

/**
 * Resolves `idea`'s referenced Trend to `{ label, momentum?, sourceUrls }`. Returns `null` when
 * `idea.trendId` is set but cannot be resolved to a real label (the caller treats this as a refusal —
 * an Idea's Trend must have a label, `trend.label` is `NOT NULL`). The caller is expected to only call
 * this when `idea.trendId !== undefined`.
 */
export async function resolveTrendInfo(idea: TrendReferencingIdea, brand: string, brandsRoot?: string): Promise<ResolvedTrendInfo | null> {
  if (idea.trendLabel !== undefined) {
    return { label: idea.trendLabel, sourceUrls: [] };
  }
  if (idea.run === undefined || idea.trendId === undefined) {
    return null;
  }
  const ideasRoot = resolveBrand(brand, brandsRoot).ideasRoot;
  const trendsPath = join(ideasRoot, idea.run, "trends.json");
  const trends = await loadTrendsFile(trendsPath);
  const match = trends.find((t) => t.id === idea.trendId);
  if (match === undefined) return null;
  return {
    label: match.label,
    ...(match.momentum !== undefined ? { momentum: match.momentum } : {}),
    sourceUrls: match.sourceUrls,
  };
}
