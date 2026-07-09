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
 * Every transition targets a job by its COMPOSITE `(brand, idea_id)` — never `idea_id` alone — because
 * Idea ids are not Brand-unique in the one shared queue (C6). The lock holds that same composite ref.
 *
 * --- The four ADR-0004 rules encoded here ---
 *
 *   • FIFO by acceptance order — the earliest-`enqueued_at` `queued` job runs first.
 *   • Single Space concurrency — at most one job is ever `running`; the lock is held around a run.
 *   • Gates do not hold the Space — an `awaiting_cast` job releases the lock and is skipped by
 *     `nextReady`, so the next queued cast-gen proceeds while the Operator picks the Character.
 *   • Failure is isolated per job — a `failed` job releases the lock and never blocks its successors.
 *
 * The lifecycle is `queued → running → (awaiting_cast | done | failed)`, plus the Cast-gate edge
 * `awaiting_cast → done` via `markCastConsumed` (C24 — the Operator's pick clears the gate) and the
 * recovery edge `failed → queued` via `requeueFailed` (C4). The `mark*` / `requeueFailed` transitions are
 * the only way a job changes status; each returns a NEW state and never mutates the input.
 */

import type { JobRef, JobStatus, QueueJob, QueueState } from "./queue.ts";

/** Stable, machine-checkable reason a `mark*` transition was refused. */
export type TransitionCode =
  /** No job in the queue for the given `(brand, idea_id)`. */
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

/** Find the index of the job for `(brand, ideaId)`, or -1 if absent. Composite-keyed (C6). */
function indexOfJob(state: QueueState, brand: string, ideaId: string): number {
  return state.jobs.findIndex((j) => j.brand === brand && j.idea_id === ideaId);
}

/**
 * Find the index of the job for `(brand, ideaId)` whose status is `status`, or -1 if there is none.
 *
 * An Idea can hold TWO jobs at once — its `cast` job (which may already be `awaiting_cast` / `done`) and a
 * later `render` job — so a transition must target the job in the EXPECTED source status, not merely the
 * first job for the Idea. For an Idea with a single job this resolves identically to `indexOfJob`.
 */
function indexOfJobInStatus(
  state: QueueState,
  brand: string,
  ideaId: string,
  status: JobStatus,
): number {
  return state.jobs.findIndex((j) => j.brand === brand && j.idea_id === ideaId && j.status === status);
}

/**
 * Return a NEW state with the job at `index` set to `status` and the lock set to `lockHolder`.
 * Pure: copies the jobs array and the target job; never mutates the input.
 */
function transition(
  state: QueueState,
  index: number,
  status: JobStatus,
  lockHolder: JobRef | null,
): QueueState {
  const jobs = state.jobs.map((job, i) => (i === index ? { ...job, status } : job));
  return { jobs, lock: { active_job: lockHolder } };
}

/**
 * Move a `queued` job to `running` and take the single-Space lock (which records the job's composite
 * `(brand, idea_id)` ref).
 *
 * Refuses with `space_busy` if the lock is held or another job is already `running` (≤1 running),
 * `unknown_job` if no job exists for `(brand, ideaId)`, and `invalid_transition` if the job is not
 * `queued`. Pure: returns a NEW state on success; the input is unchanged either way.
 */
export function markRunning(state: QueueState, brand: string, ideaId: string): TransitionResult {
  if (indexOfJob(state, brand, ideaId) === -1) return { ok: false, code: "unknown_job", state };
  if (spaceBusy(state)) return { ok: false, code: "space_busy", state };
  // Target the Idea's `queued` job specifically — an Idea may also hold a gated/done cast job alongside
  // a queued render job, so we must not pick the wrong one.
  const i = indexOfJobInStatus(state, brand, ideaId, "queued");
  if (i === -1) {
    return { ok: false, code: "invalid_transition", state };
  }
  return { ok: true, state: transition(state, i, "running", { brand, idea_id: ideaId }) };
}

/**
 * Move a `running` **cast** job to `awaiting_cast` (it reached the Cast gate) and RELEASE the lock — the
 * gate does not hold the Space (ADR-0004). Refuses `unknown_job` / `invalid_transition`. Pure.
 */
export function markAwaitingCast(state: QueueState, brand: string, ideaId: string): TransitionResult {
  return release(state, brand, ideaId, "awaiting_cast");
}

/**
 * Move a `running` job to `done` (its Space generation finished) and RELEASE the lock. Refuses
 * `unknown_job` / `invalid_transition`. Pure.
 */
export function markDone(state: QueueState, brand: string, ideaId: string): TransitionResult {
  return release(state, brand, ideaId, "done");
}

/**
 * Move a `running` job to `failed` and RELEASE the lock — failure is isolated, so the queue continues
 * with the next job (ADR-0004). The job stays in the queue for the Operator to see, and can later be
 * revived with `requeueFailed`. Refuses `unknown_job` / `invalid_transition`. Pure.
 */
export function markFailed(state: QueueState, brand: string, ideaId: string): TransitionResult {
  return release(state, brand, ideaId, "failed");
}

/**
 * Move a `cast` job from `awaiting_cast` to `done` — the Operator has picked the Character, so the Cast
 * gate has CLEARED (C24). Invoked by `/pick-cast` at pick time so `/queue` no longer shows a gate that is
 * already resolved. The lock is left untouched (an `awaiting_cast` job holds no lock, and clearing the
 * gate never starts a run — `nextReady` / `markRunning` do that under the single-Space constraint).
 *
 * Refuses `unknown_job` if no job exists for `(brand, ideaId)`, and `invalid_transition` if a job exists
 * but none of them is `awaiting_cast` (e.g. a re-pick after the gate already cleared). Pure: returns a NEW
 * state on success; the input is unchanged either way.
 */
export function markCastConsumed(state: QueueState, brand: string, ideaId: string): TransitionResult {
  if (indexOfJob(state, brand, ideaId) === -1) return { ok: false, code: "unknown_job", state };
  const i = indexOfJobInStatus(state, brand, ideaId, "awaiting_cast");
  if (i === -1) {
    return { ok: false, code: "invalid_transition", state };
  }
  // Preserve the current lock — clearing the Cast gate never touches the single-Space lock.
  return { ok: true, state: transition(state, i, "done", state.lock.active_job) };
}

/**
 * Revive a `failed` job back to `queued` so its Idea can be produced again (C4 — a transient Space
 * failure must not permanently strand an Idea). Targets the `failed` job for `(brand, ideaId)`; the lock
 * is left untouched (a failed job holds no lock, and reviving it does not start a run — `nextReady` /
 * `markRunning` do that under the single-Space constraint).
 *
 * Refuses `unknown_job` if no job exists for `(brand, ideaId)`, and `invalid_transition` if a job exists
 * but none of them is `failed`. Pure: returns a NEW state on success; the input is unchanged either way.
 */
export function requeueFailed(state: QueueState, brand: string, ideaId: string): TransitionResult {
  if (indexOfJob(state, brand, ideaId) === -1) return { ok: false, code: "unknown_job", state };
  const i = indexOfJobInStatus(state, brand, ideaId, "failed");
  if (i === -1) {
    return { ok: false, code: "invalid_transition", state };
  }
  // Preserve the current lock — reviving a failed job never touches the single-Space lock.
  return { ok: true, state: transition(state, i, "queued", state.lock.active_job) };
}

/** Shared body for the lock-releasing transitions (awaiting_cast / done / failed), all from `running`. */
function release(state: QueueState, brand: string, ideaId: string, to: JobStatus): TransitionResult {
  if (indexOfJob(state, brand, ideaId) === -1) return { ok: false, code: "unknown_job", state };
  // Target the Idea's `running` job specifically (it is the one holding the single-Space lock).
  const i = indexOfJobInStatus(state, brand, ideaId, "running");
  if (i === -1) {
    return { ok: false, code: "invalid_transition", state };
  }
  return { ok: true, state: transition(state, i, to, null) };
}
