/**
 * TrendStore — the SQL-backed typed store for the `trend` table (issue #223, ADR-0029).
 *
 * Genuinely NEW, `{ db }`-only, mirroring `src/brand/store.ts`/`src/channel/store.ts`/`src/copy/store.ts`
 * (issue #222) — there was no pre-existing `{ ledgerPath }`-taking "Trend store" to bridge. Minimal by
 * design: #202's own acceptance criteria names only `source_urls`/`platform`/`is_paywalled` alongside
 * `IdeaStore`'s own fields, and no other tracked issue (#197-#212) claims a "Trend store" of its own — a
 * general-purpose CRUD layer beyond what `IdeaStore`'s `trend_id` foreign key and the paywall-visibility
 * ask actually need would be scope this ticket was not given.
 *
 * `listBriefableTrends` is the literal "make an unbriefable Trend VISIBLE" ask (this ticket's own brief):
 * a plain `WHERE is_paywalled = 0` read, not an enforcement gate — it never blocks/refuses anything, and
 * it never touches the Operator-rule PROSE already living in `.claude/agents/trend-scout.md`/
 * `idea-strategist.md` (2026-08-11). It just gives a future caller (idea-strategist, or issue #204's
 * importer) the query the rule needs, instead of re-deriving it from memory.
 *
 * Pure, deterministic SQL against an already-open, already-migrated `DatabaseSync` — no file I/O, no
 * network, no clock (except the injectable `now` parameter, matching every other store issue #222/#223
 * ships).
 */

import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import type { KnownPlatform } from "../copy/platform-shape.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The fields `createTrend` requires/accepts, minus id/timestamps (assigned by this module). */
export interface TrendInput {
  readonly runId: string;
  readonly label: string;
  readonly momentum?: number;
  readonly sourceUrls?: readonly string[];
  readonly platform?: KnownPlatform;
  readonly isPaywalled?: boolean;
}

/** One `trend` row, fully typed. */
export interface TrendRecord {
  readonly id: string;
  readonly runId: string;
  readonly label: string;
  readonly momentum?: number;
  readonly sourceUrls: readonly string[];
  readonly platform?: KnownPlatform;
  readonly isPaywalled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface TrendRow {
  readonly id: string;
  readonly run_id: string;
  readonly label: string;
  readonly momentum: number | null;
  readonly source_urls_json: string;
  readonly platform: string | null;
  readonly is_paywalled: number;
  readonly created_at: string;
  readonly updated_at: string;
}

function toRecord(row: TrendRow): TrendRecord {
  return {
    id: row.id,
    runId: row.run_id,
    label: row.label,
    ...(row.momentum !== null ? { momentum: row.momentum } : {}),
    sourceUrls: JSON.parse(row.source_urls_json) as string[],
    ...(row.platform !== null ? { platform: row.platform as KnownPlatform } : {}),
    isPaywalled: row.is_paywalled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// createTrend
// ---------------------------------------------------------------------------

/** Inserts one `trend` row and returns its generated id. Throws (SQLite FOREIGN KEY error) for an
 *  unknown `runId`, (CHECK error) for a `platform` outside `KNOWN_PLATFORMS`. */
export function createTrend(
  db: DatabaseSync,
  input: TrendInput,
  now: () => string = () => new Date().toISOString(),
): string {
  const id = randomUUID();
  const timestamp = now();
  db.prepare(
    `INSERT INTO trend (id, run_id, label, momentum, source_urls_json, platform, is_paywalled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.runId,
    input.label,
    input.momentum ?? null,
    JSON.stringify(input.sourceUrls ?? []),
    input.platform ?? null,
    input.isPaywalled === true ? 1 : 0,
    timestamp,
    timestamp,
  );
  return id;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Looks up one Trend by its stable id. Returns `null` for an unknown id — never throws. */
export function getTrend(db: DatabaseSync, id: string): TrendRecord | null {
  const row = db.prepare(`SELECT * FROM trend WHERE id = ?`).get(id) as unknown as TrendRow | undefined;
  return row ? toRecord(row) : null;
}

/** Every Trend for one Run, ordered `momentum DESC` (a momentum-less Trend sorts LAST — SQLite's own
 *  NULL-sorts-first-in-ASC rule, reversed by DESC). `[]` for a Run with none (or an unknown Run). */
export function listTrendsForRun(db: DatabaseSync, runId: string): readonly TrendRecord[] {
  const rows = db
    .prepare(`SELECT * FROM trend WHERE run_id = ? ORDER BY momentum DESC, created_at ASC`)
    .all(runId) as unknown as TrendRow[];
  return rows.map(toRecord);
}

/** The subset of one Run's Trends that are NOT paywalled-only (`is_paywalled = 0`) — the openly-
 *  readable-source Operator rule (2026-08-11), made queryable rather than left to prose/memory. Same
 *  ordering as `listTrendsForRun`. A pure read: never blocks or refuses anything itself. */
export function listBriefableTrends(db: DatabaseSync, runId: string): readonly TrendRecord[] {
  const rows = db
    .prepare(`SELECT * FROM trend WHERE run_id = ? AND is_paywalled = 0 ORDER BY momentum DESC, created_at ASC`)
    .all(runId) as unknown as TrendRow[];
  return rows.map(toRecord);
}
