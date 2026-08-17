/**
 * Production Queue scheduler — pure deep module.
 *
 * This is NOT ADR-0004's abandoned unattended-worker code (`worker.ts`, deleted in issue #56) — it is
 * the LIVE decision logic the generic gate-resume flow drives (`/pick` and `/pick-cast`,
 * `src/commands/pick.ts`, issue #57): given a `QueueState`, decide which job runs next under the
 * Magnific Space's single-concurrency constraint, and move jobs through their lifecycle. Like `queue.ts`
 * this module is *pure and deterministic*: it never touches the filesystem, the network, the Magnific
 * Space, or the clock. FIFO ordering is by each job's injected `enqueued_at`, never by `Date.now()`.
 * I/O lives in `store.ts`; orchestration lives in the `commands/` shell.
 *
 * Every transition targets a job by its COMPOSITE `(brand, idea_id, recipe)` — never a subset of it —
 * because Idea ids are not Brand-unique in the one shared queue (C6), and one Idea can hold several
 * Recipes' jobs at once (issue #56).
 *
 * --- The rules encoded here (ADR-0008) ---
 *
 *   • FIFO by acceptance order — the earliest-`enqueued_at` `queued` job runs first.
 *   • Single Space concurrency — at most one job is ever `running`.
 *   • Gates do not hold the Space — an `awaiting_pick` job is skipped by `nextReady`, so the next
 *     queued generation proceeds while the Operator makes a pick.
 *   • Failure is isolated per job — a `failed` job never blocks its successors.
 *
 * --- No stored lock (issue #203) ---
 *
 * An earlier revision kept a separate `state.lock.active_job` pointer in step alongside each
 * transition, mirroring the `running` job it was meant to describe. That pointer has been DELETED, not
 * ported (see `queue.ts`'s own doc comment) — `spaceBusy` below reads `jobs` directly, so there is no
 * second copy of "is the Space busy" that could drift out of sync with the jobs it describes.
 *
 * The lifecycle is `queued → running → (awaiting_pick | done | failed)`, plus the gate-cleared edge
 * `awaiting_pick → done` via `markPickConsumed` (C24, generalized — the Operator's pick clears the
 * gate) and the recovery edge `failed → queued` via `requeueFailed` (C4). The `mark*` /
 * `requeueFailed` transitions are the only way a job changes status; each returns a NEW state and never
 * mutates the input.
 */

import type { JobStatus, QueueJob, QueueState } from "./queue.ts";

/** Stable, machine-checkable reason a `mark*` transition was refused. */
export type TransitionCode =
  /** No job in the queue for the given `(brand, idea_id, recipe)`. */
  | "unknown_job"
  /** A run was requested while the Space is busy (another job already `running`). */
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

/** Whether the Space is busy: any job currently `running`. */
function spaceBusy(state: QueueState): boolean {
  return state.jobs.some((j) => j.status === "running");
}

/**
 * The single next job to run, or `null` when nothing is ready.
 *
 * Pure. Returns `null` while the Space is busy (single-Space concurrency — at most one `running` job).
 * When the Space is free, returns the `queued` job with the earliest `enqueued_at` (FIFO by acceptance
 * time, not array position). `awaiting_pick`, `done`, and `failed` jobs are skipped, so a job paused at
 * its gate does not hold the Space and a failed job never blocks its successors.
 *
 * @param state  current queue state
 */
export function nextReady(state: QueueState): QueueJob | null {
  if (spaceBusy(state)) {
    return null;
  }
  let best: QueueJob | null = null;
  for (const job of state.jobs) {
    if (job.status !== "queued") continue; // skip awaiting_pick / running / done / failed
    if (best === null || job.enqueued_at < best.enqueued_at) {
      best = job;
    }
  }
  return best;
}

/** Find the index of the job for `(brand, ideaId, recipe)`, or -1 if absent. Composite-keyed (C6). */
function indexOfJob(state: QueueState, brand: string, ideaId: string, recipe: string): number {
  return state.jobs.findIndex((j) => j.brand === brand && j.idea_id === ideaId && j.recipe === recipe);
}

/**
 * Find the index of the job for `(brand, ideaId, recipe)` whose status is `status`, or -1 if there is
 * none.
 *
 * One (Idea, Recipe) can hold TWO jobs at once — its first-gate job (which may already be
 * `awaiting_pick` / `done`) and a later job for the next leg — so a transition must target the job in
 * the EXPECTED source status, not merely the first job for the triple. For a triple with a single job
 * this resolves identically to `indexOfJob`.
 */
function indexOfJobInStatus(
  state: QueueState,
  brand: string,
  ideaId: string,
  recipe: string,
  status: JobStatus,
): number {
  return state.jobs.findIndex(
    (j) => j.brand === brand && j.idea_id === ideaId && j.recipe === recipe && j.status === status,
  );
}

/**
 * Return a NEW state with the job at `index` set to `status`.
 * Pure: copies the jobs array and the target job; never mutates the input.
 */
function transition(state: QueueState, index: number, status: JobStatus): QueueState {
  const jobs = state.jobs.map((job, i) => (i === index ? { ...job, status } : job));
  return { jobs };
}

/**
 * Move a `queued` job to `running`.
 *
 * Refuses with `space_busy` if another job is already `running` (≤1 running), `unknown_job` if no job
 * exists for `(brand, ideaId, recipe)`, and `invalid_transition` if the job is not `queued`. Pure:
 * returns a NEW state on success; the input is unchanged either way.
 */
export function markRunning(
  state: QueueState,
  brand: string,
  ideaId: string,
  recipe: string,
): TransitionResult {
  if (indexOfJob(state, brand, ideaId, recipe) === -1) return { ok: false, code: "unknown_job", state };
  if (spaceBusy(state)) return { ok: false, code: "space_busy", state };
  // Target the (Idea, Recipe)'s `queued` job specifically — it may also hold a gated/done earlier job
  // alongside a queued next-leg job, so we must not pick the wrong one.
  const i = indexOfJobInStatus(state, brand, ideaId, recipe, "queued");
  if (i === -1) {
    return { ok: false, code: "invalid_transition", state };
  }
  return { ok: true, state: transition(state, i, "running") };
}

/**
 * Move a `running` job to `awaiting_pick` (it reached its gate) — the gate does not hold the Space
 * (ADR-0008). Refuses `unknown_job` / `invalid_transition`. Pure.
 */
export function markAwaitingPick(
  state: QueueState,
  brand: string,
  ideaId: string,
  recipe: string,
): TransitionResult {
  return release(state, brand, ideaId, recipe, "awaiting_pick");
}

/**
 * Move a `running` job to `done` (its Space generation finished). Refuses `unknown_job` /
 * `invalid_transition`. Pure.
 */
export function markDone(
  state: QueueState,
  brand: string,
  ideaId: string,
  recipe: string,
): TransitionResult {
  return release(state, brand, ideaId, recipe, "done");
}

/**
 * Move a `running` job to `failed` — failure is isolated, so the queue continues with the next job
 * (ADR-0008). The job stays in the queue for the Operator to see, and can later be revived with
 * `requeueFailed`. Refuses `unknown_job` / `invalid_transition`. Pure.
 */
export function markFailed(
  state: QueueState,
  brand: string,
  ideaId: string,
  recipe: string,
): TransitionResult {
  return release(state, brand, ideaId, recipe, "failed");
}

/**
 * Move a job from `awaiting_pick` to `done` — the Operator has recorded a pick, so the gate has CLEARED
 * (C24, generalized). Invoked by a gate-pick command (e.g. `/pick-cast`) at pick time so `/queue` no
 * longer shows a gate that is already resolved.
 *
 * Refuses `unknown_job` if no job exists for `(brand, ideaId, recipe)`, and `invalid_transition` if a
 * job exists but none of them is `awaiting_pick` (e.g. a re-pick after the gate already cleared). Pure:
 * returns a NEW state on success; the input is unchanged either way.
 */
export function markPickConsumed(
  state: QueueState,
  brand: string,
  ideaId: string,
  recipe: string,
): TransitionResult {
  if (indexOfJob(state, brand, ideaId, recipe) === -1) return { ok: false, code: "unknown_job", state };
  const i = indexOfJobInStatus(state, brand, ideaId, recipe, "awaiting_pick");
  if (i === -1) {
    return { ok: false, code: "invalid_transition", state };
  }
  return { ok: true, state: transition(state, i, "done") };
}

/**
 * Revive a `failed` job back to `queued` so its (Idea, Recipe) can be produced again (C4 — a transient
 * Space failure must not permanently strand production). Targets the `failed` job for
 * `(brand, ideaId, recipe)`.
 *
 * Refuses `unknown_job` if no job exists for `(brand, ideaId, recipe)`, and `invalid_transition` if a
 * job exists but none of them is `failed`. Pure: returns a NEW state on success; the input is unchanged
 * either way.
 */
export function requeueFailed(
  state: QueueState,
  brand: string,
  ideaId: string,
  recipe: string,
): TransitionResult {
  if (indexOfJob(state, brand, ideaId, recipe) === -1) return { ok: false, code: "unknown_job", state };
  const i = indexOfJobInStatus(state, brand, ideaId, recipe, "failed");
  if (i === -1) {
    return { ok: false, code: "invalid_transition", state };
  }
  return { ok: true, state: transition(state, i, "queued") };
}

/** Shared body for the transitions that leave `running` (awaiting_pick / done / failed). */
function release(
  state: QueueState,
  brand: string,
  ideaId: string,
  recipe: string,
  to: JobStatus,
): TransitionResult {
  if (indexOfJob(state, brand, ideaId, recipe) === -1) return { ok: false, code: "unknown_job", state };
  // Target the (Idea, Recipe)'s `running` job specifically (it is the one occupying the single Space).
  const i = indexOfJobInStatus(state, brand, ideaId, recipe, "running");
  if (i === -1) {
    return { ok: false, code: "invalid_transition", state };
  }
  return { ok: true, state: transition(state, i, to) };
}
