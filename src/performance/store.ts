/**
 * Performance time-series stores — the SQL-backed `{ db }`-only stores for `metric_snapshot`,
 * `channel_baseline`, and `performance_score` (issue #203, ADR-0028, ADR-0029).
 *
 * Genuinely NEW, sitting alongside this directory's existing PURE deep modules (`score.ts`'s
 * `computePerformanceScore`, `metrics.ts`'s `recomputeBaseline`/`median`, `maturity.ts`,
 * `selection.ts`) — those stay untouched; this file is the store BOUNDARY that persists their outputs,
 * mirroring how `src/asset/store.ts` keeps a pure computation module (`asset.ts`) separate from its own
 * I/O. Grouped in ONE file (rather than three separate directories) because the three tables are one
 * coherent unit — "the feedback loop", `schema.ts`'s own section heading — and, unlike `job`/
 * `gate_request`/`post`, none of `metric_snapshot`/`channel_baseline`/`performance_score` is itself a
 * CONTEXT.md-named term with its own directory elsewhere in this codebase.
 *
 * CONTEXT.md already says Performance is "a moving number, not a snapshot" — the file-ledger model
 * (`src/asset/asset.ts`'s `metrics`/`performance_score`/`tracked_at` scalar fields, plus a bolted-on
 * `history` array only populated retroactively at re-track time) only ever had one CURRENT slot for it.
 * This module is the real fix: every `metric_snapshot` a caller records STAYS — there is deliberately NO
 * update/delete function for it anywhere in this file, so the only way to add a reading is
 * `recordMetricSnapshot`, which always INSERTs a fresh row. Likewise `recordChannelBaseline` and
 * `recordPerformanceScore` always INSERT a new row rather than overwriting the previous one — a Post's
 * `performance_score` history survives a re-score, and a Channel's baseline history survives a
 * recompute, because the OLD row's `id` (and any `performance_score.baseline_id` that already points at
 * it) is never touched, only ever added alongside.
 *
 * Per this ticket's own brief: "No SQL table holds real data yet — the importer is #204" — the round-
 * trip proof below (`store.test.ts`'s AC11 test) is about the SHAPES this module accepts matching what
 * #200's real computation functions (`computePerformanceScore`, `recomputeBaseline`) actually produce,
 * not about migrating any live ledger data.
 */

import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

// ---------------------------------------------------------------------------
// metric_snapshot — dated captures per Post, NEVER overwritten
// ---------------------------------------------------------------------------

/** The fields `recordMetricSnapshot` requires/accepts, minus id/timestamps (assigned by this module).
 *  Mirrors `AssetMetrics`'s four fields (`src/asset/asset.ts`), each optional here because a given
 *  scrape may not resolve every metric (rule 8: never fabricate a missing reading as `0`). */
export interface MetricSnapshotInput {
  readonly postId: string;
  readonly capturedAt: string;
  readonly reactions?: number;
  readonly comments?: number;
  readonly shares?: number;
  readonly views?: number;
  readonly source: string;
  readonly raw?: unknown;
}

/** One `metric_snapshot` row, fully typed. */
export interface MetricSnapshotRecord {
  readonly id: string;
  readonly postId: string;
  readonly capturedAt: string;
  readonly reactions?: number;
  readonly comments?: number;
  readonly shares?: number;
  readonly views?: number;
  readonly source: string;
  readonly raw?: unknown;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface MetricSnapshotRow {
  readonly id: string;
  readonly post_id: string;
  readonly captured_at: string;
  readonly reactions: number | null;
  readonly comments: number | null;
  readonly shares: number | null;
  readonly views: number | null;
  readonly source: string;
  readonly raw_json: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

function toMetricSnapshotRecord(row: MetricSnapshotRow): MetricSnapshotRecord {
  return {
    id: row.id,
    postId: row.post_id,
    capturedAt: row.captured_at,
    ...(row.reactions !== null ? { reactions: row.reactions } : {}),
    ...(row.comments !== null ? { comments: row.comments } : {}),
    ...(row.shares !== null ? { shares: row.shares } : {}),
    ...(row.views !== null ? { views: row.views } : {}),
    source: row.source,
    ...(row.raw_json !== null ? { raw: JSON.parse(row.raw_json) as unknown } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Records ONE dated metric capture for a Post. ALWAYS inserts a fresh row — there is no update path,
 *  so history is never overwritten (issue #203 AC). Throws (SQLite FOREIGN KEY error) for an unknown
 *  `postId`. */
export function recordMetricSnapshot(
  db: DatabaseSync,
  input: MetricSnapshotInput,
  now: () => string = () => new Date().toISOString(),
): string {
  const id = randomUUID();
  const timestamp = now();
  db.prepare(
    `INSERT INTO metric_snapshot (id, post_id, captured_at, reactions, comments, shares, views, source, raw_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.postId,
    input.capturedAt,
    input.reactions ?? null,
    input.comments ?? null,
    input.shares ?? null,
    input.views ?? null,
    input.source,
    input.raw !== undefined ? JSON.stringify(input.raw) : null,
    timestamp,
    timestamp,
  );
  return id;
}

/** Every metric snapshot recorded for a Post, oldest first — the Post's full measured history. `[]`
 *  for a Post with none yet. */
export function listMetricSnapshotsForPost(db: DatabaseSync, postId: string): readonly MetricSnapshotRecord[] {
  const rows = db
    .prepare(`SELECT * FROM metric_snapshot WHERE post_id = ? ORDER BY captured_at ASC`)
    .all(postId) as unknown as MetricSnapshotRow[];
  return rows.map(toMetricSnapshotRecord);
}

/** The Post's most recently CAPTURED metric snapshot (by `captured_at`, not insertion order), or
 *  `null` when none exists yet. */
export function latestMetricSnapshotForPost(db: DatabaseSync, postId: string): MetricSnapshotRecord | null {
  const row = db
    .prepare(`SELECT * FROM metric_snapshot WHERE post_id = ? ORDER BY captured_at DESC LIMIT 1`)
    .get(postId) as unknown as MetricSnapshotRow | undefined;
  return row ? toMetricSnapshotRecord(row) : null;
}

// ---------------------------------------------------------------------------
// channel_baseline — a new row per recompute, never an overwrite of the old one
// ---------------------------------------------------------------------------

/** The fields `recordChannelBaseline` requires/accepts, minus id/timestamps. Mirrors
 *  `BaselineMedians`'s four fields (`src/performance/metrics.ts`). */
export interface ChannelBaselineInput {
  readonly channelId: string;
  readonly medianReactions?: number;
  readonly medianComments?: number;
  readonly medianShares?: number;
  readonly medianViews?: number;
  readonly window?: string;
}

/** One `channel_baseline` row, fully typed. */
export interface ChannelBaselineRecord {
  readonly id: string;
  readonly channelId: string;
  readonly medianReactions?: number;
  readonly medianComments?: number;
  readonly medianShares?: number;
  readonly medianViews?: number;
  readonly window?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ChannelBaselineRow {
  readonly id: string;
  readonly channel_id: string;
  readonly median_reactions: number | null;
  readonly median_comments: number | null;
  readonly median_shares: number | null;
  readonly median_views: number | null;
  readonly window: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

function toChannelBaselineRecord(row: ChannelBaselineRow): ChannelBaselineRecord {
  return {
    id: row.id,
    channelId: row.channel_id,
    ...(row.median_reactions !== null ? { medianReactions: row.median_reactions } : {}),
    ...(row.median_comments !== null ? { medianComments: row.median_comments } : {}),
    ...(row.median_shares !== null ? { medianShares: row.median_shares } : {}),
    ...(row.median_views !== null ? { medianViews: row.median_views } : {}),
    ...(row.window !== null ? { window: row.window } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Records ONE Channel baseline recompute. ALWAYS inserts a fresh row — a recompute never overwrites
 *  the previous baseline, so a `performance_score` computed against an earlier baseline keeps a valid
 *  `baseline_id` to point at even after the Channel's baseline has since moved on. Throws (SQLite
 *  FOREIGN KEY error) for an unknown `channelId`. */
export function recordChannelBaseline(
  db: DatabaseSync,
  input: ChannelBaselineInput,
  now: () => string = () => new Date().toISOString(),
): string {
  const id = randomUUID();
  const timestamp = now();
  db.prepare(
    `INSERT INTO channel_baseline (id, channel_id, median_reactions, median_comments, median_shares, median_views, window, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.channelId,
    input.medianReactions ?? null,
    input.medianComments ?? null,
    input.medianShares ?? null,
    input.medianViews ?? null,
    input.window ?? null,
    timestamp,
    timestamp,
  );
  return id;
}

/** Looks up one Channel baseline by its stable id. Returns `null` for an unknown id — never throws. */
export function getChannelBaseline(db: DatabaseSync, id: string): ChannelBaselineRecord | null {
  const row = db.prepare(`SELECT * FROM channel_baseline WHERE id = ?`).get(id) as unknown as ChannelBaselineRow | undefined;
  return row ? toChannelBaselineRecord(row) : null;
}

/** The Channel's MOST RECENTLY recorded baseline (by `created_at`), or `null` when none has ever been
 *  recorded. */
export function getLatestChannelBaseline(db: DatabaseSync, channelId: string): ChannelBaselineRecord | null {
  const row = db
    .prepare(`SELECT * FROM channel_baseline WHERE channel_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(channelId) as unknown as ChannelBaselineRow | undefined;
  return row ? toChannelBaselineRecord(row) : null;
}

/** Every baseline ever recorded for a Channel, oldest first — its full recompute history. `[]` for a
 *  Channel with none yet. */
export function listChannelBaselinesForChannel(db: DatabaseSync, channelId: string): readonly ChannelBaselineRecord[] {
  const rows = db
    .prepare(`SELECT * FROM channel_baseline WHERE channel_id = ? ORDER BY created_at ASC`)
    .all(channelId) as unknown as ChannelBaselineRow[];
  return rows.map(toChannelBaselineRecord);
}

// ---------------------------------------------------------------------------
// performance_score — a new row per computation, keeping every prior score
// ---------------------------------------------------------------------------

/** The fields `recordPerformanceScore` requires/accepts, minus id/timestamps. */
export interface PerformanceScoreInput {
  readonly postId: string;
  readonly baselineId?: string;
  readonly score: number;
  readonly computedAt: string;
}

/** One `performance_score` row, fully typed. */
export interface PerformanceScoreRecord {
  readonly id: string;
  readonly postId: string;
  readonly baselineId?: string;
  readonly score: number;
  readonly computedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface PerformanceScoreRow {
  readonly id: string;
  readonly post_id: string;
  readonly baseline_id: string | null;
  readonly score: number;
  readonly computed_at: string;
  readonly created_at: string;
  readonly updated_at: string;
}

function toPerformanceScoreRecord(row: PerformanceScoreRow): PerformanceScoreRecord {
  return {
    id: row.id,
    postId: row.post_id,
    ...(row.baseline_id !== null ? { baselineId: row.baseline_id } : {}),
    score: row.score,
    computedAt: row.computed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Records ONE computed Performance Score for a Post, against the `channel_baseline` it was computed
 * against, stamped with the TIME it was computed (`computedAt` — a caller-supplied value, so a
 * historical re-import can backdate it; defaults are never assumed here). ALWAYS inserts a fresh row:
 * a Post can be RE-SCORED later (CONTEXT.md "Performance": "a moving number") without losing what came
 * before — every prior `performance_score` row for that Post stays exactly as it was. Throws (SQLite
 * FOREIGN KEY error) for an unknown `postId`/`baselineId`.
 */
export function recordPerformanceScore(
  db: DatabaseSync,
  input: PerformanceScoreInput,
  now: () => string = () => new Date().toISOString(),
): string {
  const id = randomUUID();
  const timestamp = now();
  db.prepare(
    `INSERT INTO performance_score (id, post_id, baseline_id, score, computed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.postId, input.baselineId ?? null, input.score, input.computedAt, timestamp, timestamp);
  return id;
}

/** Looks up one Performance Score by its stable id. Returns `null` for an unknown id — never throws. */
export function getPerformanceScore(db: DatabaseSync, id: string): PerformanceScoreRecord | null {
  const row = db.prepare(`SELECT * FROM performance_score WHERE id = ?`).get(id) as unknown as PerformanceScoreRow | undefined;
  return row ? toPerformanceScoreRecord(row) : null;
}

/** Every Performance Score ever computed for a Post, oldest first — the Post's full scoring history
 *  (never destroyed by a re-score). `[]` for a Post with none yet. */
export function listPerformanceScoresForPost(db: DatabaseSync, postId: string): readonly PerformanceScoreRecord[] {
  const rows = db
    .prepare(`SELECT * FROM performance_score WHERE post_id = ? ORDER BY computed_at ASC`)
    .all(postId) as unknown as PerformanceScoreRow[];
  return rows.map(toPerformanceScoreRecord);
}

/** The Post's MOST RECENTLY computed Performance Score (by `computed_at`), or `null` when it has never
 *  been scored. */
export function latestPerformanceScoreForPost(db: DatabaseSync, postId: string): PerformanceScoreRecord | null {
  const row = db
    .prepare(`SELECT * FROM performance_score WHERE post_id = ? ORDER BY computed_at DESC LIMIT 1`)
    .get(postId) as unknown as PerformanceScoreRow | undefined;
  return row ? toPerformanceScoreRecord(row) : null;
}
