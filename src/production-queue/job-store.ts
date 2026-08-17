/**
 * JobStore — the SQL-backed store for the `job` table's real, atomic claiming (issue #203, ADR-0029).
 *
 * Genuinely NEW, `{ db }`-only, mirroring `src/idea/store.ts`/`src/channel/store.ts` (issue #222/#223):
 * there is no pre-existing `{ queuePath }`-taking "Job store" to bridge — the file-based Production
 * Queue (`queue.ts`/`store.ts`/`scheduler.ts`) keeps its own composite-keyed `(brand, idea_id, recipe)`
 * jobs, untouched by this module, and stays the one thing real production callers actually use until a
 * later importer wires SQL onto a live command (mirroring `IdeaStore`'s own bridging note). This store
 * exists to PROVE the new claiming primitive against the schema #201 already shipped; it is not wired
 * into `/queue`/`/pick`/`/pick-cast` by this ticket.
 *
 * --- Job identity is the surrogate `id` (issue #203 AC1) ---
 *
 * A `job` row's identity is its own `id` — never the `(brand, idea, recipe)` triple the file-based
 * queue used. That triple becomes a NON-UNIQUE lookup here (`listJobsForComposite`, joined through
 * `asset`, since `job` carries only `asset_id` — `asset` itself is already unique on
 * `(idea_id, recipe_slug)`, per `src/db/schema.ts`'s migration 1): several `job` rows (separate legs,
 * separate attempts, a requeue after a failure) can legitimately share one `(brand, idea, recipe)`, so
 * this lookup returns an ARRAY, never assumes at most one.
 *
 * --- Atomic claim-with-owner-and-expiry (issue #203 AC2) ---
 *
 * `claimJob` is ONE SQL `UPDATE ... WHERE id = ? AND (eligible) RETURNING *` statement — SQLite's
 * equivalent of `SELECT ... FOR UPDATE SKIP LOCKED`: a row is "eligible" when it is `queued`, OR
 * `running` with an EXPIRED lease (`locked_until < now`, so a crashed worker's job does not stay stuck
 * forever). Because SQLite serializes writers (one write transaction holds the database's write lock at
 * a time; `PRAGMA busy_timeout` on every connection, `connection.ts`, makes a second writer WAIT for
 * that lock rather than fail immediately), two genuinely concurrent callers — even from separate
 * processes, each with their OWN `DatabaseSync` connection to the SAME file — can never both see the
 * row as eligible and both win: the WHERE clause is re-evaluated against whatever the row actually
 * holds at the moment each writer's turn comes, so the loser's `UPDATE` simply matches zero rows and its
 * `RETURNING` yields nothing. `claimJob` returns the claimed `JobRecord` on success, or `null` when the
 * job does not exist, is not currently eligible (already claimed by a live lease, or terminal), or was
 * lost to a concurrent winner. See `claim-concurrency.test.ts` for the tests that actually PROVE this
 * against real, concurrent OS processes — not merely sequential calls that could not distinguish an
 * atomic claim from a naive read-then-write one.
 *
 * --- No separate lock field (contrast with the deleted file-based one) ---
 *
 * The claim state (`locked_by`, `locked_until`) lives ON the job row itself — columns issue #201/#202
 * already reserved on `job` ("these columns exist so that slice has room, per this ticket's own brief").
 * This is NOT the old `data/queue.json` `lock: { active_job }` pointer (deleted, not ported — see
 * `queue.ts`'s own doc comment): there is no second, independently-writable structure that could drift
 * out of sync with the jobs it describes, because SQLite's own transactional guarantees make the row
 * ITSELF the single source of truth for its own claim state.
 */

import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

/** The `job.status` lifecycle — the SAME five values the file-based queue's `JobStatus` uses. */
export type JobStatus = "queued" | "running" | "awaiting_pick" | "done" | "failed";

/** The fields `createJob` requires/accepts, minus id/status/timestamps (assigned by this module). */
export interface JobInput {
  readonly assetId: string;
  readonly brandId: string;
  /** The gate this job's run works toward, or omitted for a gateless/final leg. */
  readonly gate?: string;
  readonly idempotencyKey?: string;
}

/** One `job` row, fully typed. */
export interface JobRecord {
  readonly id: string;
  readonly assetId: string;
  readonly brandId: string;
  readonly gate?: string;
  readonly status: JobStatus;
  readonly attempt: number;
  readonly enqueuedAt: string;
  readonly startedAt?: string;
  readonly idempotencyKey?: string;
  readonly lockedBy?: string;
  readonly lockedUntil?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface JobRow {
  readonly id: string;
  readonly asset_id: string;
  readonly brand_id: string;
  readonly gate: string | null;
  readonly status: string;
  readonly attempt: number;
  readonly enqueued_at: string;
  readonly started_at: string | null;
  readonly idempotency_key: string | null;
  readonly locked_by: string | null;
  readonly locked_until: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

function toJobRecord(row: JobRow): JobRecord {
  return {
    id: row.id,
    assetId: row.asset_id,
    brandId: row.brand_id,
    ...(row.gate !== null ? { gate: row.gate } : {}),
    status: row.status as JobStatus,
    attempt: row.attempt,
    enqueuedAt: row.enqueued_at,
    ...(row.started_at !== null ? { startedAt: row.started_at } : {}),
    ...(row.idempotency_key !== null ? { idempotencyKey: row.idempotency_key } : {}),
    ...(row.locked_by !== null ? { lockedBy: row.locked_by } : {}),
    ...(row.locked_until !== null ? { lockedUntil: row.locked_until } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// createJob / getJob
// ---------------------------------------------------------------------------

/** Inserts one `job` row, always at `status: 'queued'`, `attempt: 0`, and returns its generated id.
 *  Throws (SQLite FOREIGN KEY error) for an unknown `assetId`/`brandId`. */
export function createJob(
  db: DatabaseSync,
  input: JobInput,
  now: () => string = () => new Date().toISOString(),
): string {
  const id = randomUUID();
  const timestamp = now();
  db.prepare(
    `INSERT INTO job (id, asset_id, brand_id, gate, status, attempt, enqueued_at, idempotency_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'queued', 0, ?, ?, ?, ?)`,
  ).run(id, input.assetId, input.brandId, input.gate ?? null, timestamp, input.idempotencyKey ?? null, timestamp, timestamp);
  return id;
}

/** Looks up one Job by its stable surrogate id. Returns `null` for an unknown id — never throws. */
export function getJob(db: DatabaseSync, id: string): JobRecord | null {
  const row = db.prepare(`SELECT * FROM job WHERE id = ?`).get(id) as unknown as JobRow | undefined;
  return row ? toJobRecord(row) : null;
}

/**
 * Every `job` row for one `(brand, idea, recipe)` composite, oldest-first — a NON-UNIQUE lookup (issue
 * #203 AC1): several legs/attempts can share one composite. `[]` for a composite with no jobs (or an
 * unknown Idea/Recipe/Brand combination) — never throws. Joins through `asset` (the table that actually
 * carries `idea_id`/`recipe_slug`; `job` itself only carries `asset_id`).
 */
export function listJobsForComposite(
  db: DatabaseSync,
  brandId: string,
  ideaId: string,
  recipeSlug: string,
): readonly JobRecord[] {
  const rows = db
    .prepare(
      `SELECT job.* FROM job
       JOIN asset ON asset.id = job.asset_id
       WHERE job.brand_id = ? AND asset.idea_id = ? AND asset.recipe_slug = ?
       ORDER BY job.enqueued_at ASC`,
    )
    .all(brandId, ideaId, recipeSlug) as unknown as JobRow[];
  return rows.map(toJobRecord);
}

// ---------------------------------------------------------------------------
// claimJob — the atomic claim-with-owner-and-expiry primitive
// ---------------------------------------------------------------------------

/**
 * Atomically claims `jobId` for `ownerId`, if and only if it is currently eligible — `queued`, or
 * `running` with an EXPIRED lease (`locked_until` in the past). On success: `status` becomes `running`,
 * `locked_by`/`locked_until` are set (the lease runs `leaseMs` from `now()`), `attempt` increments, and
 * `started_at` is stamped the FIRST time only (`COALESCE`, so a re-claimed/retried job keeps its
 * original start time). Returns the claimed `JobRecord`, or `null` when the job does not exist, is not
 * eligible (already claimed by a live lease, or in a terminal/gated status), or was lost to a
 * concurrent winner — see this module's own doc comment for why this is safe under genuine concurrent
 * callers, not just sequential ones.
 */
export function claimJob(
  db: DatabaseSync,
  jobId: string,
  ownerId: string,
  leaseMs: number,
  now: () => string = () => new Date().toISOString(),
): JobRecord | null {
  const nowIso = now();
  const untilIso = new Date(new Date(nowIso).getTime() + leaseMs).toISOString();
  const row = db
    .prepare(
      `UPDATE job
       SET status = 'running',
           locked_by = ?,
           locked_until = ?,
           attempt = attempt + 1,
           started_at = COALESCE(started_at, ?),
           updated_at = ?
       WHERE id = ?
         AND (
           status = 'queued'
           OR (status = 'running' AND locked_until IS NOT NULL AND locked_until < ?)
         )
       RETURNING *`,
    )
    .get(ownerId, untilIso, nowIso, nowIso, jobId, nowIso) as unknown as JobRow | undefined;
  return row ? toJobRecord(row) : null;
}

// ---------------------------------------------------------------------------
// releaseJob — the counterpart that ends a claim
// ---------------------------------------------------------------------------

/** The statuses a claimed (`running`) job can be released into. */
export type ReleaseStatus = "awaiting_pick" | "done" | "failed";

/**
 * Atomically moves `jobId` from `running` to `toStatus`, clearing its claim (`locked_by`/
 * `locked_until` both become `null`). Returns the updated `JobRecord` on success, or `null` when the
 * job does not exist or is not currently `running` (so a release can never silently "complete" a job
 * someone else has already moved on).
 */
export function releaseJob(
  db: DatabaseSync,
  jobId: string,
  toStatus: ReleaseStatus,
  now: () => string = () => new Date().toISOString(),
): JobRecord | null {
  const row = db
    .prepare(
      `UPDATE job
       SET status = ?, locked_by = NULL, locked_until = NULL, updated_at = ?
       WHERE id = ? AND status = 'running'
       RETURNING *`,
    )
    .get(toStatus, now(), jobId) as unknown as JobRow | undefined;
  return row ? toJobRecord(row) : null;
}

// ---------------------------------------------------------------------------
// findNextQueuedJob — the FIFO-oldest-queued read the worker's drain loop uses (issue #208)
// ---------------------------------------------------------------------------

/**
 * Returns the `queued` job with the earliest `enqueued_at`, or `null` when no job is `queued`. A
 * `running`, `awaiting_pick`, `done`, or `failed` job is never returned — a parked or already-finished
 * job never blocks the next queued one from being found. This is a plain READ (no claim, no lock); the
 * caller is expected to `claimJob` the returned id next.
 */
export function findNextQueuedJob(db: DatabaseSync): JobRecord | null {
  const row = db
    .prepare(`SELECT * FROM job WHERE status = 'queued' ORDER BY enqueued_at ASC LIMIT 1`)
    .get() as unknown as JobRow | undefined;
  return row ? toJobRecord(row) : null;
}

/**
 * Atomically revives a `failed` job back to `queued` (C4's SQL-backed sibling — a transient failure
 * must not permanently strand production), clearing any stale claim. Returns the updated `JobRecord` on
 * success, or `null` when the job does not exist or is not currently `failed`.
 */
export function requeueJob(
  db: DatabaseSync,
  jobId: string,
  now: () => string = () => new Date().toISOString(),
): JobRecord | null {
  const row = db
    .prepare(
      `UPDATE job
       SET status = 'queued', locked_by = NULL, locked_until = NULL, updated_at = ?
       WHERE id = ? AND status = 'failed'
       RETURNING *`,
    )
    .get(now(), jobId) as unknown as JobRow | undefined;
  return row ? toJobRecord(row) : null;
}
