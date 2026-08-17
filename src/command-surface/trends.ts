/**
 * `listTrends` / `createTrend` — the typed command surface's Trend operations (issue #205 AC1, epic
 * #195's "listing Trends" — the thin orchestration shell over `src/trend/store.ts`).
 *
 * The command surface is the ONLY thing above the store layer permitted to write (AC2); a read-only
 * operation like `listTrends` carries no atomicity concerns of its own, but lives here anyway so a
 * future caller (the worker, the viewer, an agent — issue #208/#210/#211) reaches every pipeline
 * operation, read or write, through ONE surface rather than importing `src/trend/store.ts` directly.
 *
 * `createTrend` is added by issue #204: the one-shot importer is the first caller that needs to create
 * Trend rows (nothing above the store layer created one before this ticket — #205's own eight named
 * operations did not include Trend creation), and "route every write through the command surface"
 * means it cannot reach `src/trend/store.ts` directly.
 */

import type { DatabaseSync } from "node:sqlite";

import {
  listTrendsForRun,
  listBriefableTrends,
  createTrend as createTrendRow,
  type TrendRecord,
  type TrendInput,
} from "../trend/store.ts";

export type { TrendInput };

/** Creates one Trend for a Run. Returns its generated id. Throws (SQLite FOREIGN KEY error) for an
 *  unknown `runId`, (CHECK error) for a `platform` outside `KNOWN_PLATFORMS`. See
 *  `src/trend/store.ts`'s `createTrend` for the full contract. */
export function createTrend(db: DatabaseSync, input: TrendInput, now?: () => string): string {
  return now === undefined ? createTrendRow(db, input) : createTrendRow(db, input, now);
}

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
