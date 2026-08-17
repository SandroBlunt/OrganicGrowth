/**
 * `listTrends` — the typed command surface's Trend-listing operation (issue #205 AC1, epic #195's
 * "listing Trends" — the thin orchestration shell over `src/trend/store.ts`).
 *
 * The command surface is the ONLY thing above the store layer permitted to write (AC2); a read-only
 * operation like this one carries no atomicity concerns of its own, but lives here anyway so a future
 * caller (the worker, the viewer, an agent — issue #208/#210/#211) reaches every pipeline operation,
 * read or write, through ONE surface rather than importing `src/trend/store.ts` directly.
 */

import type { DatabaseSync } from "node:sqlite";

import { listTrendsForRun, listBriefableTrends, type TrendRecord } from "../trend/store.ts";

export interface ListTrendsOptions {
  /** When `true`, returns only Trends that are NOT paywalled-only (`TrendStore.listBriefableTrends`) —
   *  the openly-readable-source rule (2026-08-11) made queryable. Defaults to `false` (every Trend for
   *  the Run, paywalled or not). */
  readonly briefableOnly?: boolean;
}

/**
 * Every Trend for `runId`, ordered `momentum DESC` (a momentum-less Trend sorts last). `[]` for a Run
 * with none (or an unknown Run) — never throws.
 */
export function listTrends(
  db: DatabaseSync,
  runId: string,
  options: ListTrendsOptions = {},
): readonly TrendRecord[] {
  return options.briefableOnly === true ? listBriefableTrends(db, runId) : listTrendsForRun(db, runId);
}
