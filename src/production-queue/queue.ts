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
 * --- Composite identity: (brand, idea_id) ---
 *
 * The queue is brand-agnostic (one file for every Brand — ADR-0004/0006) but Idea ids carry no Brand
 * component (`idea-<run>-<nn>`), so two Brands can legitimately hold the *same* Idea id in the same
 * run. Every lookup, dedupe check, transition, and the lock therefore key on the COMPOSITE
 * `(brand, idea_id)` — never on `idea_id` alone — so one Brand's job can never mask or capture another
 * Brand's job with a colliding id.
 *
 * --- Job shape (documented contract; see also openspec/specs/production-queue) ---
 *
 *   {
 *     idea_id:     string,   // the Idea this job produces (matches ledger `id`)
 *     brand:       string,   // the Brand slug the job belongs to (routes ledger writes; required)
 *     phase:       "cast" | "render",
 *     status:      "queued" | "running" | "awaiting_cast" | "done" | "failed",
 *     enqueued_at: string,   // ISO-8601 timestamp
 *     character?:  string    // the Operator's chosen Character — set on RENDER jobs at pick time
 *                            // (C1), absent on cast jobs; the render session pins exactly this.
 *   }
 *
 * --- Lock ---
 *
 *   { active_job: { brand, idea_id } | null }   // at most one Space-busy job; the composite ref of
 *                                               // the active job, or null when the Space is free.
 *
 * --- Terminal vs live jobs ---
 *
 * `failed` and `done` are TERMINAL: a job in either state is a historical record the Operator can see,
 * but it does NOT block its Idea. Dedupe (`hasJobFor` / `hasJobOfPhase`) and the enqueue idempotency
 * guards ignore terminal jobs, so an Idea whose only job failed can be re-enqueued and produced again.
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
  /**
   * The chosen **Character** to render against — the Operator's Gate-2 pick, written onto the RENDER
   * job at pick time (`/pick-cast`, C1). Present ONLY on `render` jobs; absent on `cast` jobs (which
   * exist to *produce* the Cast, not consume it). The worker passes this straight into the render
   * session (`SpaceSession.start` → `pickAndRender`) so the Operator's actual pick reaches the Space —
   * it is never re-derived or defaulted downstream. `exactOptionalPropertyTypes`: omitted on cast jobs.
   */
  readonly character?: string;
}

/**
 * The composite identity of a job: `(brand, idea_id)`. Idea ids are not Brand-unique, so a bare
 * `idea_id` cannot identify a job across Brands — the lock and every transition use this pair.
 */
export interface JobRef {
  readonly brand: string;
  readonly idea_id: string;
}

/** The single-active-run lock: at most one Space-busy job at a time. */
export interface QueueLock {
  /** The composite `(brand, idea_id)` of the active job, or `null` when the Space is free. */
  readonly active_job: JobRef | null;
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

/**
 * Whether a job is still "live" — i.e. it blocks re-enqueue of its Idea and counts as in-flight work.
 * `failed` and `done` are TERMINAL (a historical record) and are NOT live, so an Idea whose only job
 * is failed/done can be re-enqueued (C4) and is reported stranded by the phase resolver.
 */
export function isLiveJob(job: QueueJob): boolean {
  return job.status !== "failed" && job.status !== "done";
}

/** Whether the same job — matched on the COMPOSITE `(brand, idea_id)`, never `idea_id` alone. */
function isJob(job: QueueJob, brand: string, ideaId: string): boolean {
  return job.brand === brand && job.idea_id === ideaId;
}

/**
 * Whether the queue holds a LIVE job for this `(brand, idea_id)` (any phase). Terminal (`failed` /
 * `done`) jobs are ignored, so a failed job does not make its Idea look busy — it can be re-enqueued.
 * Keyed on the composite pair so one Brand's job never masks another Brand's colliding Idea id (C6).
 */
export function hasJobFor(state: QueueState, brand: string, ideaId: string): boolean {
  return state.jobs.some((job) => isJob(job, brand, ideaId) && isLiveJob(job));
}

/**
 * Whether the queue holds a LIVE job of `phase` for this `(brand, idea_id)`. Terminal jobs are
 * ignored (so a failed render can be re-enqueued). Composite-keyed (C6).
 */
export function hasJobOfPhase(
  state: QueueState,
  brand: string,
  ideaId: string,
  phase: JobPhase,
): boolean {
  return state.jobs.some((job) => isJob(job, brand, ideaId) && job.phase === phase && isLiveJob(job));
}

/**
 * Append a `cast`-phase, `status: queued` job for an accepted Idea (ADR-0004 auto-enqueue).
 *
 * Pure: returns a NEW state object and never mutates `state`. Idempotent per `(brand, idea_id)` while a
 * LIVE job for that pair exists — if one does, the state is returned unchanged (no duplicate). A prior
 * `failed`/`done` job does NOT block a fresh enqueue (C4: an Idea can be produced again after a failure).
 * The accepted-only guard lives in the orchestration shell, which checks the ledger before calling this.
 *
 * @param state    current queue state
 * @param ideaId   the Idea to enqueue (must already be `accepted` in the ledger)
 * @param now      ISO-8601 timestamp for `enqueued_at` (injected, never read from the clock here)
 * @param brand    the Brand slug the job belongs to (routes ledger writes; required)
 */
export function enqueue(state: QueueState, ideaId: string, now: string, brand: string): QueueState {
  if (hasJobFor(state, brand, ideaId)) {
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
 * Pure: returns a NEW state object and never mutates `state`. Idempotent per `(brand, idea_id)` for the
 * **render** phase while a LIVE render job exists — if one does, the state is returned unchanged (no
 * duplicate). A prior `failed` render does NOT block a fresh one (C4). The Idea's prior `cast` job (now
 * `awaiting_cast` / `done`) is preserved; a render job is distinct from it. The "the Character has been
 * picked" guard lives in the `/pick-cast` shell, which calls this only after recording the chosen Character.
 *
 * The chosen `character` is STAMPED onto the render job (C1) so the Operator's Gate-2 pick survives a
 * process restart and reaches the render session unchanged — the render never re-derives or defaults it.
 *
 * @param state      current queue state
 * @param ideaId     the Idea to enqueue a render for (its Cast must already be picked)
 * @param now        ISO-8601 timestamp for `enqueued_at` (injected, never read from the clock here)
 * @param brand      the Brand slug the job belongs to (routes ledger writes; required)
 * @param character  the Operator's chosen Character (a Cast candidate identifier) to render against
 */
export function enqueueRender(
  state: QueueState,
  ideaId: string,
  now: string,
  brand: string,
  character: string,
): QueueState {
  if (hasJobOfPhase(state, brand, ideaId, "render")) {
    return state;
  }
  const job: QueueJob = {
    idea_id: ideaId,
    brand,
    phase: "render",
    status: "queued",
    enqueued_at: now,
    character,
  };
  return { jobs: [...state.jobs, job], lock: state.lock };
}
