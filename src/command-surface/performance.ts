/**
 * `readPerformance` / `recordPerformanceSnapshot` / `recordPerformanceScore` — the typed command
 * surface's Performance operations (issue #205 AC1, epic #195's "reading Performance" — thin
 * orchestration shells over `src/performance/store.ts`'s time-series stores).
 *
 * AC1's own phrasing names only the READ ("reading Performance"), unlike every other operation in its
 * list (all writes). `recordPerformanceSnapshot`/`recordPerformanceScore` are included anyway, as
 * deliberate, minimal, necessary companions: with no legal write path, Performance data could never
 * enter the system through this surface at all, which would make AC2 ("nothing above it writes to a
 * store directly") impossible to honor the moment a real caller (a SQL-backed `/track-performance`,
 * once wired) needed to record a scrape result — the same reasoning `jobs.ts`'s `releaseJob` and
 * `assets.ts`'s `attachAssetMedia` already state for their own domains.
 */

import type { DatabaseSync } from "node:sqlite";

import {
  recordMetricSnapshot,
  listMetricSnapshotsForPost,
  latestPerformanceScoreForPost,
  recordPerformanceScore as recordPerformanceScoreRow,
  type MetricSnapshotInput,
  type MetricSnapshotRecord,
  type PerformanceScoreInput,
  type PerformanceScoreRecord,
} from "../performance/store.ts";

export type { MetricSnapshotInput, MetricSnapshotRecord, PerformanceScoreInput, PerformanceScoreRecord };

/** What `readPerformance` returns: a Post's full measured history plus its most recently computed
 *  score. */
export interface PerformanceSummary {
  /** Every metric snapshot recorded for the Post, oldest first. `[]` when never measured. */
  readonly snapshots: readonly MetricSnapshotRecord[];
  /** The Post's most recently computed Performance Score, or `null` when it has never been scored. */
  readonly latestScore: PerformanceScoreRecord | null;
}

/** Reads a Post's full measured Performance: every metric snapshot ever captured, plus its latest
 *  computed score. Never throws — an unmeasured Post reads as `{ snapshots: [], latestScore: null }`. */
export function readPerformance(db: DatabaseSync, postId: string): PerformanceSummary {
  return {
    snapshots: listMetricSnapshotsForPost(db, postId),
    latestScore: latestPerformanceScoreForPost(db, postId),
  };
}

/** Records ONE dated metric capture for a Post. Always inserts a fresh row — history is never
 *  overwritten. Throws (SQLite FOREIGN KEY error) for an unknown `postId`. */
export function recordPerformanceSnapshot(
  db: DatabaseSync,
  input: MetricSnapshotInput,
  now: () => string = () => new Date().toISOString(),
): string {
  return recordMetricSnapshot(db, input, now);
}

/** Records ONE computed Performance Score for a Post. Always inserts a fresh row — a re-score never
 *  destroys the prior history. Throws (SQLite FOREIGN KEY error) for an unknown `postId`/`baselineId`. */
export function recordPerformanceScore(
  db: DatabaseSync,
  input: PerformanceScoreInput,
  now: () => string = () => new Date().toISOString(),
): string {
  return recordPerformanceScoreRow(db, input, now);
}
