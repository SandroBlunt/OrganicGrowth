/**
 * Production Queue scheduler — pure deep module (ADR-0004).
 *
 * The decision logic the background worker (a later slice) drives: given a `QueueState`, decide which
 * job runs next under the Magnific Space's single-concurrency constraint, and move jobs through their
 * lifecycle while keeping the single-active-run lock in step. Like `queue.ts` this module is *pure and
 * deterministic*: it never touches the filesystem, the network, the Magnific Space, or the clock. FIFO
 * ordering is by each job's injected `enqueued_at`, never by `Date.now()`. I/O lives in `store.ts`;
 * orchestration (the actual drain, the periodic tick) lives in the worker slice — NOT here.
 *
 * --- The four ADR-0004 rules encoded here ---
 *
 *   • FIFO by acceptance order — the earliest-`enqueued_at` `queued` job runs first.
 *   • Single Space concurrency — at most one job is ever `running`; the lock is held around a run.
 *   • Gates do not hold the Space — an `awaiting_cast` job releases the lock and is skipped by
 *     `nextReady`, so the next queued cast-gen proceeds while the Operator picks the Character.
 *   • Failure is isolated per job — a `failed` job releases the lock and never blocks its successors.
 *
 * The lifecycle is `queued → running → (awaiting_cast | done | failed)`. The `mark*` transitions are the
 * only way a job changes status; each returns a NEW state and never mutates the input.
 */

import type { JobStatus, QueueJob, QueueState } from "./queue.ts";

/** Stable, machine-checkable reason a `mark*` transition was refused. */
export type TransitionCode =
  /** No job in the queue for the given `idea_id`. */
  | "unknown_job"
  /** A run was requested while the Space is busy (lock held / a job already `running`). */
  | "space_busy"
  /** The job's current status does not permit the requested transition. */
  | "invalid_transition";

/** The result of a `mark*` transition: success carries the NEW state; refusal carries a reason. */
export interface TransitionResult {
  /** Whether the transition was applied. */
  readonly ok: boolean;
  /** Why the transition was refused, when `ok` is false. */
  readonly code?: TransitionCode;
  /** The queue state after the attempt (unchanged on refusal). */
  readonly state: QueueState;
}

/** Whether the Space is busy: a held lock, or any job currently `running`. */
function spaceBusy(state: QueueState): boolean {
  return state.lock.active_job !== null || state.jobs.some((j) => j.status === "running");
}

/**
 * The single next job to run, or `null` when nothing is ready.
 *
 * Pure. Returns `null` while the Space is busy (single-Space lock — at most one `running` job). When the
 * Space is free, returns the `queued` job with the earliest `enqueued_at` (FIFO by acceptance time, not
 * array position). `awaiting_cast`, `done`, and `failed` jobs are skipped, so a job paused at its Cast
 * gate does not hold the Space and a failed job never blocks its successors.
 *
 * @param state  current queue state
 */
export function nextReady(state: QueueState): QueueJob | null {
  if (spaceBusy(state)) {
    return null;
  }
  let best: QueueJob | null = null;
  for (const job of state.jobs) {
    if (job.status !== "queued") continue; // skip awaiting_cast / running / done / failed
    if (best === null || job.enqueued_at < best.enqueued_at) {
      best = job;
    }
  }
  return best;
}

/** Find the index of the job for `ideaId`, or -1 if absent. */
function indexOfJob(state: QueueState, ideaId: string): number {
  return state.jobs.findIndex((j) => j.idea_id === ideaId);
}

/**
 * Find the index of the job for `ideaId` whose status is `status`, or -1 if there is none.
 *
 * An Idea can hold TWO jobs at once — its `cast` job (which may already be `awaiting_cast` / `done`) and a
 * later `render` job — so a transition must target the job in the EXPECTED source status, not merely the
 * first job for the Idea. For an Idea with a single job this resolves identically to `indexOfJob`.
 */
function indexOfJobInStatus(state: QueueState, ideaId: string, status: JobStatus): number {
  return state.jobs.findIndex((j) => j.idea_id === ideaId && j.status === status);
}

/**
 * Return a NEW state with the job at `index` set to `status` and the lock set to `lockHolder`.
 * Pure: copies the jobs array and the target job; never mutates the input.
 */
function transition(
  state: QueueState,
  index: number,
  status: JobStatus,
  lockHolder: string | null,
): QueueState {
  const jobs = state.jobs.map((job, i) => (i === index ? { ...job, status } : job));
  return { jobs, lock: { active_job: lockHolder } };
}

/**
 * Move a `queued` job to `running` and take the single-Space lock.
 *
 * Refuses with `space_busy` if the lock is held or another job is already `running` (≤1 running),
 * `unknown_job` if no job exists for `ideaId`, and `invalid_transition` if the job is not `queued`.
 * Pure: returns a NEW state on success; the input is unchanged either way.
 */
export function markRunning(state: QueueState, ideaId: string): TransitionResult {
  if (indexOfJob(state, ideaId) === -1) return { ok: false, code: "unknown_job", state };
  if (spaceBusy(state)) return { ok: false, code: "space_busy", state };
  // Target the Idea's `queued` job specifically — an Idea may also hold a gated/done cast job alongside
  // a queued render job, so we must not pick the wrong one.
  const i = indexOfJobInStatus(state, ideaId, "queued");
  if (i === -1) {
    return { ok: false, code: "invalid_transition", state };
  }
  return { ok: true, state: transition(state, i, "running", ideaId) };
}

/**
 * Move a `running` **cast** job to `awaiting_cast` (it reached the Cast gate) and RELEASE the lock — the
 * gate does not hold the Space (ADR-0004). Refuses `unknown_job` / `invalid_transition`. Pure.
 */
export function markAwaitingCast(state: QueueState, ideaId: string): TransitionResult {
  return release(state, ideaId, "awaiting_cast");
}

/**
 * Move a `running` job to `done` (its Space generation finished) and RELEASE the lock. Refuses
 * `unknown_job` / `invalid_transition`. Pure.
 */
export function markDone(state: QueueState, ideaId: string): TransitionResult {
  return release(state, ideaId, "done");
}

/**
 * Move a `running` job to `failed` and RELEASE the lock — failure is isolated, so the queue continues
 * with the next job (ADR-0004). The job stays in the queue for the Operator to see. Refuses
 * `unknown_job` / `invalid_transition`. Pure.
 */
export function markFailed(state: QueueState, ideaId: string): TransitionResult {
  return release(state, ideaId, "failed");
}

/** Shared body for the lock-releasing transitions (awaiting_cast / done / failed), all from `running`. */
function release(state: QueueState, ideaId: string, to: JobStatus): TransitionResult {
  if (indexOfJob(state, ideaId) === -1) return { ok: false, code: "unknown_job", state };
  // Target the Idea's `running` job specifically (it is the one holding the single-Space lock).
  const i = indexOfJobInStatus(state, ideaId, "running");
  if (i === -1) {
    return { ok: false, code: "invalid_transition", state };
  }
  return { ok: true, state: transition(state, i, to, null) };
}
