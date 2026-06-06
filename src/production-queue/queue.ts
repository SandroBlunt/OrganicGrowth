/**
 * Production Queue — pure deep module.
 *
 * The Production Queue is the serialized backlog of Magnific Space generations the Producer owns
 * (CONTEXT.md, ADR-0004). This module holds the *pure, deterministic* shape and logic: it never
 * touches the filesystem, the network, the Magnific Space, or the clock. I/O lives in `store.ts`,
 * orchestration in the `commands/` shell.
 *
 * State is persisted to `data/queue.json`. The ledger (`data/ledger.json`) stays the source of
 * truth — the queue is *derived* from accepted Ideas and never the reverse.
 *
 * --- Job shape (documented contract; see also openspec/specs/production-queue) ---
 *
 *   {
 *     idea_id:     string,   // the Idea this job produces (matches ledger `id`)
 *     brand:       string,   // the Brand slug the job belongs to (routes ledger writes; required)
 *     phase:       "cast" | "render",
 *     status:      "queued" | "running" | "awaiting_cast" | "done" | "failed",
 *     enqueued_at: string    // ISO-8601 timestamp
 *   }
 *
 * --- Lock ---
 *
 *   { active_job: string | null }   // at most one Space-busy job; `idea_id` of the active job or null
 *
 * In this slice the scheduler is only `enqueue` + (list, in the command). FIFO drain, readiness, and
 * single-Space concurrency are introduced by later slices.
 */

/** The Space generation phase a job represents. */
export type JobPhase = "cast" | "render";

/** A job's lifecycle status within the queue. */
export type JobStatus = "queued" | "running" | "awaiting_cast" | "done" | "failed";

/** One unit of Space work for one Idea. */
export interface QueueJob {
  readonly idea_id: string;
  /**
   * The Brand slug this job belongs to (e.g. `"mundotip"`). Required. The worker reads this to
   * route every ledger write to the correct Brand's ledger via the resolver — never from
   * session/active-brand state (CONTEXT.md: no global active-brand pointer).
   */
  readonly brand: string;
  readonly phase: JobPhase;
  readonly status: JobStatus;
  /** ISO-8601 timestamp. */
  readonly enqueued_at: string;
}

/** The single-active-run lock: at most one Space-busy job at a time. */
export interface QueueLock {
  /** `idea_id` of the active job, or `null` when the Space is free. */
  readonly active_job: string | null;
}

/** The full persisted Production Queue state. */
export interface QueueState {
  readonly jobs: readonly QueueJob[];
  readonly lock: QueueLock;
}

/** The canonical empty queue: no jobs, lock free. */
export function emptyQueue(): QueueState {
  return { jobs: [], lock: { active_job: null } };
}

/** Whether the queue already holds a job for this Idea (any phase/status). */
export function hasJobFor(state: QueueState, ideaId: string): boolean {
  return state.jobs.some((job) => job.idea_id === ideaId);
}

/** Whether the queue already holds a job of `phase` for this Idea. */
export function hasJobOfPhase(state: QueueState, ideaId: string, phase: JobPhase): boolean {
  return state.jobs.some((job) => job.idea_id === ideaId && job.phase === phase);
}

/**
 * Append a `cast`-phase, `status: queued` job for an accepted Idea (ADR-0004 auto-enqueue).
 *
 * Pure: returns a NEW state object and never mutates `state`. Idempotent per `idea_id` — if a job
 * for the Idea already exists, the state is returned unchanged (no duplicate). The accepted-only
 * guard lives in the orchestration shell, which checks the ledger before calling this.
 *
 * @param state    current queue state
 * @param ideaId   the Idea to enqueue (must already be `accepted` in the ledger)
 * @param now      ISO-8601 timestamp for `enqueued_at` (injected, never read from the clock here)
 * @param brand    the Brand slug the job belongs to (routes ledger writes; required)
 */
export function enqueue(state: QueueState, ideaId: string, now: string, brand: string): QueueState {
  if (hasJobFor(state, ideaId)) {
    return state;
  }
  const job: QueueJob = {
    idea_id: ideaId,
    brand,
    phase: "cast",
    status: "queued",
    enqueued_at: now,
  };
  return { jobs: [...state.jobs, job], lock: state.lock };
}

/**
 * Append a `render`-phase, `status: queued` job for an Idea whose **Cast** the Operator has picked
 * (ADR-0004 — "picking a Cast enqueues the render"). The render runs against the pinned Character once the
 * Space is free; the Producer worker drains it like any other job, one Space generation at a time.
 *
 * Pure: returns a NEW state object and never mutates `state`. Idempotent per `idea_id` for the **render**
 * phase — if a render job for the Idea already exists, the state is returned unchanged (no duplicate). The
 * Idea's prior `cast` job (now `awaiting_cast` / `done`) is preserved; a render job is distinct from it.
 * The "the Character has been picked" guard lives in the `/pick-cast` shell, which calls this only after
 * recording the chosen Character.
 *
 * @param state    current queue state
 * @param ideaId   the Idea to enqueue a render for (its Cast must already be picked)
 * @param now      ISO-8601 timestamp for `enqueued_at` (injected, never read from the clock here)
 * @param brand    the Brand slug the job belongs to (routes ledger writes; required)
 */
export function enqueueRender(
  state: QueueState,
  ideaId: string,
  now: string,
  brand: string,
): QueueState {
  if (hasJobOfPhase(state, ideaId, "render")) {
    return state;
  }
  const job: QueueJob = {
    idea_id: ideaId,
    brand,
    phase: "render",
    status: "queued",
    enqueued_at: now,
  };
  return { jobs: [...state.jobs, job], lock: state.lock };
}
