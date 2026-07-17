/**
 * Performance Score — pure deep module (issue #84, ADR-0001, CONTEXT.md "Performance Score").
 *
 * The single 0–1 headline number the feedback loop optimises for, distilled from the public Apify
 * metrics (shares, comments, reactions, views) by normalising each against the Channel's own recent
 * baseline median and weighting them `0.35 / 0.25 / 0.20 / 0.20` (the SAME formula for every platform
 * — `src/apify/normalize-metrics.ts` already normalized the raw platform fields into this shape).
 * Relative by design (always-rules #4): a viral outlier can't permanently redefine "good".
 *
 *   norm(metric) = clip( metric / baseline_median(metric), 0, 2 ) / 2     # 1.0 = ~2x baseline
 *   score = 0.35*norm(shares) + 0.25*norm(comments) + 0.20*norm(reactions) + 0.20*norm(views)
 *
 * A metric with no established baseline yet (`null` median — the very first tracked Posts, before a
 * baseline has been seeded) is scored NEUTRAL (`norm = 0.5`, "at baseline") rather than fabricating a
 * ratio against nothing; the caller (`src/commands/track-performance.ts`) is what seeds the baseline
 * from this batch afterwards. A baseline median of exactly `0` (every recent Post genuinely had 0 of
 * that metric) is handled explicitly, never divided-by-zero: a `0` reading stays neutral, any positive
 * reading scores the max (`1`) — it is unambiguously above an all-zero recent history.
 */

import type { AssetMetrics } from "../asset/asset.ts";
import type { BaselineMedians } from "./metrics.ts";

/** The Performance Score's per-metric weights (ADR-0001 / CONTEXT.md). Sum to exactly 1. */
export const PERFORMANCE_SCORE_WEIGHTS = {
  shares: 0.35,
  comments: 0.25,
  reactions: 0.2,
  views: 0.2,
} as const;

const NEUTRAL_NORM = 0.5;
const MAX_NORM = 1;
const CLIP_MAX_RATIO = 2;

function clip(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Normalise one metric reading against its baseline median to a 0–1 "how it compares" score. */
function normMetric(value: number, baselineMedian: number | null): number {
  if (baselineMedian === null) return NEUTRAL_NORM;
  if (baselineMedian === 0) return value === 0 ? NEUTRAL_NORM : MAX_NORM;
  const ratio = value / baselineMedian;
  return clip(ratio, 0, CLIP_MAX_RATIO) / CLIP_MAX_RATIO;
}

/**
 * Compute one Asset's Performance Score (0–1) from its measured `metrics`, relative to the Channel's
 * `baseline` medians. Pure, deterministic — no I/O, no clock. Never returns a value outside `[0, 1]`.
 */
export function computePerformanceScore(metrics: AssetMetrics, baseline: BaselineMedians): number {
  const score =
    PERFORMANCE_SCORE_WEIGHTS.shares * normMetric(metrics.shares, baseline.shares) +
    PERFORMANCE_SCORE_WEIGHTS.comments * normMetric(metrics.comments, baseline.comments) +
    PERFORMANCE_SCORE_WEIGHTS.reactions * normMetric(metrics.reactions, baseline.reactions) +
    PERFORMANCE_SCORE_WEIGHTS.views * normMetric(metrics.views, baseline.views);
  return clip(score, 0, 1);
}
