/**
 * `enqueueJob` / `claimJob` / `releaseJob` — the typed command surface's job operations (issue #205
 * AC1, epic #195's "enqueuing and claiming jobs" — thin orchestration shells over
 * `src/production-queue/job-store.ts`).
 *
 * `releaseJob` is not literally named by AC1's own phrasing ("enqueuing and claiming"), but is included
 * as a deliberate, minimal, necessary companion: a command surface that can enqueue and claim a job but
 * never let a caller mark it `done`/`failed`/`awaiting_pick` would make AC2 ("nothing above it writes to
 * a store directly") impossible to honor the moment a real caller (the worker, issue #208) needed to
 * finish a job — mirroring how issue #223 added a minimal `TrendStore` beyond `IdeaStore` alone when the
 * AC's own needs required it. `requeueJob` (reviving a `failed` job back to `queued`) is deliberately
 * NOT wrapped here — it is not needed to prove any of this ticket's own acceptance criteria, and is left
 * for the worker slice to add if/when it needs that specific retry shape.
 */

import type { DatabaseSync } from "node:sqlite";

import {
  createJob,
  claimJob as claimJobRow,
  releaseJob as releaseJobRow,
  type JobInput,
  type JobRecord,
  type ReleaseStatus,
} from "../production-queue/job-store.ts";

export type { JobInput, JobRecord, ReleaseStatus };

/** Enqueues one job for `input.assetId`, always at `status: 'queued'`, `attempt: 0`. Returns its
 *  generated id. Throws (SQLite FOREIGN KEY error) for an unknown `assetId`/`brandId`. */
export function enqueueJob(
  db: DatabaseSync,
  input: JobInput,
  now: () => string = () => new Date().toISOString(),
): string {
  return createJob(db, input, now);
}

/**
 * Atomically claims `jobId` for `ownerId`, if currently eligible (`queued`, or `running` with an
 * expired lease). Returns the claimed `JobRecord`, or `null` when the job does not exist, is not
 * eligible, or was lost to a concurrent winner. See `src/production-queue/job-store.ts`'s `claimJob`
 * for the full concurrency contract.
 */
export function claimJob(
  db: DatabaseSync,
  jobId: string,
  ownerId: string,
  leaseMs: number,
  now: () => string = () => new Date().toISOString(),
): JobRecord | null {
  return claimJobRow(db, jobId, ownerId, leaseMs, now);
}

/**
 * Atomically moves `jobId` from `running` to `toStatus`, clearing its claim. Returns the updated
 * `JobRecord`, or `null` when the job does not exist or is not currently `running`.
 */
export function releaseJob(
  db: DatabaseSync,
  jobId: string,
  toStatus: ReleaseStatus,
  now: () => string = () => new Date().toISOString(),
): JobRecord | null {
  return releaseJobRow(db, jobId, toStatus, now);
}
