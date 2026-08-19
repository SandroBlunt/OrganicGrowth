/**
 * Shared view-model types for the local read-only Library (issue #210, epic #195's destination).
 *
 * These are RENDER-facing shapes — already joined/flattened from the several typed stores
 * `read-model.ts` composes them from (`asset`, `idea`, `format`, `brand`, `recipe_vocabulary`,
 * `channel`, `post`, `metric_snapshot`, `performance_score`, `copy_variant`, `job`). Nothing in this
 * file touches a database or the filesystem — plain data shapes only, so `render/**` can stay pure and
 * fully unit-testable without a socket or a `DatabaseSync` handle.
 */

import type { HookType } from "../vocabulary/hook-type.ts";
import type { Theme } from "../vocabulary/theme.ts";
import type { AssetStatus } from "../asset/asset.ts";
import type { JobStatus } from "../production-queue/job-store.ts";
import type { KnownPlatform } from "../copy/platform-shape.ts";

// ---------------------------------------------------------------------------
// Library screen — one row per Asset (AC: "lists every Asset")
// ---------------------------------------------------------------------------

/** One Asset's Post that has been scored at least once — carries the LATEST Performance Score only
 *  (the Asset page shows the full history; the Library row only needs "the current number"). */
export interface LibraryPostSummary {
  readonly channelPlatform: KnownPlatform;
  readonly postUrl: string;
  readonly performanceScore?: number;
}

/** One row of the Library screen — one Asset, with everything AC2/AC3 needs to list, sort, and filter
 *  it, WITHOUT a second database round-trip per row (`read-model.ts` builds this once, eagerly). */
export interface LibraryAssetRow {
  readonly assetId: string;
  readonly ideaId: string;
  readonly ideaTitle: string;
  readonly hookType: HookType;
  readonly theme: Theme;
  readonly fitScore?: number;
  readonly recipeSlug: string;
  readonly recipeName: string;
  readonly formatSlug: string;
  readonly formatName: string;
  readonly brandSlug: string;
  readonly brandName: string;
  readonly status: AssetStatus;
  readonly pendingGate?: string;
  readonly producedAt?: string;
  readonly hasSpec: boolean;
  readonly mediaCount: number;
  readonly posts: readonly LibraryPostSummary[];
  /** The BEST (highest) latest Performance Score across every Post this Asset has — `undefined` when
   *  the Asset has no Post yet, OR every Post it has has never been scored. Never fabricated as `0`
   *  (rule 8) — "no score yet" and "scored 0" are different facts and must never be confused. */
  readonly bestPerformanceScore?: number;
}

/** The distinct filter option values actually present across `LibraryAssetRow[]` — drives the Library
 *  screen's filter controls so a filter never offers a value that would return zero rows. */
export interface LibraryFilterOptions {
  readonly hookTypes: readonly HookType[];
  readonly themes: readonly Theme[];
  readonly recipes: readonly { readonly slug: string; readonly name: string }[];
  readonly formats: readonly { readonly slug: string; readonly name: string }[];
  readonly statuses: readonly AssetStatus[];
}

/** The Library screen's filter — every field optional (an absent field means "no filter on this
 *  dimension"). AC3: "filters by hook type, theme, Recipe and Format," extended to filter by the
 *  Asset's own lifecycle status too. */
export interface LibraryFilter {
  readonly hookType?: HookType;
  readonly theme?: Theme;
  readonly recipe?: string;
  readonly format?: string;
  readonly status?: AssetStatus;
}

/** How the Library screen orders its rows. `"performance"` sorts by `bestPerformanceScore` DESC, an
 *  unscored Asset always sorting AFTER every scored one (never silently interleaved as if "0" were a
 *  real, low score — that would misrepresent "not yet tracked" as "tracked and did badly"). */
export type LibrarySort = "performance" | "fit" | "produced" | "title";

// ---------------------------------------------------------------------------
// Asset page — everything about ONE Asset, together (AC4)
// ---------------------------------------------------------------------------

export interface AssetMediaView {
  readonly id: string;
  readonly ordinal: number;
  readonly kind: "image" | "video" | "audio";
  readonly mime: string;
  readonly bytes: number;
}

export interface CopyVariantView {
  readonly channelPlatform: KnownPlatform;
  readonly caption: string;
  readonly hashtags: readonly string[];
  readonly unresolvedMentions?: readonly string[];
  readonly title?: string;
  readonly cta?: string;
}

export interface MetricHistoryPoint {
  readonly capturedAt: string;
  readonly reactions?: number;
  readonly comments?: number;
  readonly shares?: number;
  readonly views?: number;
  readonly source: string;
}

export interface ScoreHistoryPoint {
  readonly computedAt: string;
  readonly score: number;
}

export interface AssetPostView {
  readonly channelPlatform: KnownPlatform;
  readonly postUrl: string;
  readonly postedAt: string;
  readonly trackingState?: string;
  readonly metricHistory: readonly MetricHistoryPoint[];
  readonly scoreHistory: readonly ScoreHistoryPoint[];
}

/** Everything AC4 asks to be shown TOGETHER on one Asset page. */
export interface AssetDetailView {
  readonly assetId: string;
  readonly recipeSlug: string;
  readonly recipeName: string;
  readonly status: AssetStatus;
  readonly pendingGate?: string;
  readonly producedAt?: string;
  readonly scheduledAt?: string;
  readonly idea: {
    readonly id: string;
    readonly title: string;
    readonly brief: string;
    readonly hookType: HookType;
    readonly theme: Theme;
    readonly fitScore?: number;
    readonly relevance?: number;
    readonly momentum?: number;
    readonly brandFit?: number;
    readonly sourceUrls: readonly string[];
  };
  readonly formatSlug: string;
  readonly formatName: string;
  readonly brandSlug: string;
  readonly brandName: string;
  /** The Production Spec, verbatim — `null` when this Asset has none saved yet. */
  readonly spec: Record<string, unknown> | null;
  readonly media: readonly AssetMediaView[];
  readonly copyVariants: readonly CopyVariantView[];
  readonly posts: readonly AssetPostView[];
}

// ---------------------------------------------------------------------------
// Run & queue state screen (AC6)
// ---------------------------------------------------------------------------

/** The bucket a queue row is classified into for the "produced, parked, or failed" question, without
 *  reading `data/queue.json` — a pure function of the Job's and Asset's own status (`read-model.ts`'s
 *  `classifyQueueRow`). */
export type QueueBucket = "produced" | "parked" | "failed" | "running" | "queued" | "done";

/** How the Run & queue screen lays out its rows — `"list"` (the original stacked-table-per-bucket
 *  layout) or `"kanban"` (one column per non-empty bucket, side by side). Purely a rendering choice over
 *  the SAME `QueueRow[]` data; never changes what is fetched or filtered. */
export type QueueView = "list" | "kanban";

export interface QueueRow {
  readonly jobId: string;
  readonly jobStatus: JobStatus;
  readonly gate?: string;
  readonly enqueuedAt: string;
  readonly startedAt?: string;
  readonly assetId: string;
  readonly assetStatus: AssetStatus;
  readonly pendingGate?: string;
  readonly ideaTitle: string;
  readonly recipeSlug: string;
  readonly recipeName: string;
  readonly brandSlug: string;
  readonly formatSlug: string;
  readonly bucket: QueueBucket;
}

// ---------------------------------------------------------------------------
// Fit Score vs Performance Score chart (AC5, Question 3)
// ---------------------------------------------------------------------------

/** One Idea plotted (or plottable) on the Fit-vs-Performance chart. `performanceScore` is `undefined`
 *  for an Idea whose best Asset has no scored Post yet — such an Idea is never silently dropped from
 *  the page (rule "never fabricate" + this epic's own reconciliation lesson): it is counted and listed
 *  separately instead of being plotted as if it scored 0. */
export interface FitPerformancePoint {
  readonly ideaId: string;
  readonly ideaTitle: string;
  readonly fitScore: number;
  readonly performanceScore?: number;
}

export interface FitPerformanceData {
  readonly points: readonly FitPerformancePoint[];
}

// ---------------------------------------------------------------------------
// Top 5 by Performance Score, Specs side by side (Question 1)
// ---------------------------------------------------------------------------

/** One column of the Top-5 comparison: a `LibraryAssetRow` plus its full Production Spec (fetched
 *  separately, since `LibraryAssetRow` only carries `hasSpec: boolean` to keep the Library index cheap
 *  to build — the Top-5 screen looks at very few Assets, so fetching each one's full Spec there is
 *  cheap). */
export interface TopAssetEntry {
  readonly row: LibraryAssetRow;
  readonly spec: Record<string, unknown> | null;
}
