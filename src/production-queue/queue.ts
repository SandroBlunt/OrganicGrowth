/**
 * Production Queue — pure deep module.
 *
 * The Production Queue is the serialized backlog of Magnific Space generations the Producer owns
 * (CONTEXT.md, ADR-0008). This module holds the *pure, deterministic* shape and logic: it never
 * touches the filesystem, the network, the Magnific Space, or the clock. I/O lives in `store.ts`,
 * orchestration in the `commands/` shell.
 *
 * State is persisted to `data/queue.json`. The ledger (`data/brands/<slug>/ledger.json`) stays the
 * source of truth — the queue is *derived* from accepted Ideas' chosen Recipes and never the reverse.
 *
 * --- Composite identity: (brand, idea_id, recipe) — issue #56, ADR-0011 ---
 *
 * One Idea can now fan out into 1..N chosen Recipes (ADR-0009), each producing its own Asset. A job
 * therefore represents ONE (brand, idea, recipe) production leg — never a bare `(brand, idea_id)` pair,
 * which would collide two Recipes' jobs for the same Idea into one dedupe bucket and silently drop the
 * second Recipe's job. Every lookup, dedupe check, and transition key on the COMPOSITE
 * `(brand, idea_id, recipe)` triple.
 *
 * --- Job shape (documented contract; see also openspec/specs/production-queue) ---
 *
 *   {
 *     idea_id:     string,          // the Idea this job produces (matches ledger `id`)
 *     brand:       string,          // the Brand slug the job belongs to (routes ledger writes; required)
 *     recipe:      string,          // the chosen Recipe slug this job produces (src/recipe/registry.ts)
 *     gate:        string | null,   // the GENERIC gate cursor (issue #56) — see below
 *     status:      "queued" | "running" | "awaiting_pick" | "done" | "failed",
 *     enqueued_at: string,          // ISO-8601 timestamp
 *     pick?:       string           // the Operator's resolved pick from the PRECEDING gate — set on a
 *                                   // job enqueued via `enqueueNextLeg` (C1's `character` field,
 *                                   // generalized); absent on a job's first leg.
 *   }
 *
 * --- The generic gate cursor (issue #56 — replaces the old cast/render `phase` + `awaiting_cast`) ---
 *
 * A Recipe declares an ORDERED list of pick-gates (`Recipe.gates`, `src/recipe/registry.ts`) — zero,
 * one, or several human picks before the final Asset renders. A job's `gate` field names the gate its
 * Space run is working TOWARD, or is `null` when this leg is the FINAL one (it renders the Asset; no
 * further gate follows). For the one seeded Recipe (`gates: ["cast"]`) there are exactly two legs:
 * the first targets `gate: "cast"`, the second (enqueued once the Operator's pick resolves it) has
 * `gate: null`. This generalizes cleanly to a Recipe with more gates, or none at all (`gate: null` from
 * the very first leg — an unattended end-to-end render), without hard-coding "cast"/"render" here.
 *
 * `awaiting_pick` generalizes the old `awaiting_cast`: a job reaching this status has produced its
 * gate's candidates and is PAUSED for the Operator, releasing the single-Space slot so the next queued
 * job can proceed (the gate does not hold the Space).
 *
 * --- No stored lock field (issue #203) ---
 *
 * An earlier revision of this module carried a separate `lock: { active_job }` field alongside `jobs` —
 * a single pointer meant to guard the single-Space invariant. That field lived INSIDE the very
 * `data/queue.json` file two concurrent Operator sessions could race on (read-whole-file →
 * mutate-in-memory → write-whole-file), so it could itself drift out of sync with the `jobs` array it
 * was supposed to describe — and separately went missing from the live file entirely, with the loader
 * silently reinventing a `{ active_job: null }` replacement on every read. It has been DELETED, not
 * ported: "at most one job is `running`" is now derived PURELY from each job's own `status` field
 * (`scheduler.ts`'s `spaceBusy`) — there is no second, independently-writable copy of that fact left to
 * go stale. Real atomic claiming (an owner + expiry lease, safe under genuine concurrent writers) now
 * lives in the SQL `job` table (`job-store.ts`, issue #203) — not a field in this contended file.
 *
 * --- Terminal vs live jobs ---
 *
 * `failed` and `done` are TERMINAL: a job in either state is a historical record the Operator can see,
 * but it does NOT block its (Idea, Recipe). Dedupe (`hasJobFor` / `hasJobAtGate`) and the enqueue
 * idempotency guards ignore terminal jobs, so an (Idea, Recipe) whose only job failed can be
 * re-enqueued and produced again.
 */

/** A job's lifecycle status within the queue. `awaiting_pick` generalizes the old `awaiting_cast`. */
export type JobStatus = "queued" | "running" | "awaiting_pick" | "done" | "failed";

/** One unit of Space work for one (brand, idea, recipe) production leg. */
export interface QueueJob {
  readonly idea_id: string;
  /**
   * The Brand slug this job belongs to (e.g. `"mundotip"`). Required. Routes ledger writes to the
   * correct Brand's ledger via the resolver — never from session/active-brand state (CONTEXT.md: no
   * global active-brand pointer).
   */
  readonly brand: string;
  /** The chosen Recipe slug this job produces (`src/recipe/registry.ts`). Required (issue #56). */
  readonly recipe: string;
  /**
   * The GENERIC gate cursor: the gate name this leg's Space run works toward, or `null` when this leg
   * is the FINAL one (renders the Asset; no gate follows). See the module docstring.
   */
  readonly gate: string | null;
  readonly status: JobStatus;
  /** ISO-8601 timestamp. */
  readonly enqueued_at: string;
  /**
   * The Operator's resolved pick from the PRECEDING gate (generalizes the old render-job `character`
   * field, C1) — present only on a job enqueued via `enqueueNextLeg`; absent on a job's first leg (the
   * job that targets a Recipe's first gate, or that renders straight through for a gateless Recipe).
   * The worker passes this straight into the Space session so the Operator's actual pick reaches the
   * Space — it is never re-derived or defaulted downstream. `exactOptionalPropertyTypes`: omitted when
   * not applicable.
   */
  readonly pick?: string;
}

/** The full persisted Production Queue state. No separate lock field (issue #203 — see this module's
 *  own doc comment, "No stored lock field"): the single-active-run invariant is derived from `jobs`
 *  itself, never a second, independently-writable pointer. */
export interface QueueState {
  readonly jobs: readonly QueueJob[];
}

/** The canonical empty queue: no jobs. */
export function emptyQueue(): QueueState {
  return { jobs: [] };
}

/**
 * Whether a job is still "live" — i.e. it blocks re-enqueue of its (Idea, Recipe) and counts as
 * in-flight work. `failed` and `done` are TERMINAL (a historical record) and are NOT live, so an
 * (Idea, Recipe) whose only job is failed/done can be re-enqueued (C4) and is reported stranded by the
 * phase resolver.
 */
export function isLiveJob(job: QueueJob): boolean {
  return job.status !== "failed" && job.status !== "done";
}

/** Whether the same job — matched on the COMPOSITE `(brand, idea_id, recipe)`, never a subset of it. */
function isJob(job: QueueJob, brand: string, ideaId: string, recipe: string): boolean {
  return job.brand === brand && job.idea_id === ideaId && job.recipe === recipe;
}

/**
 * Whether the queue holds a LIVE job for this `(brand, idea_id, recipe)` (at any gate cursor). Terminal
 * (`failed` / `done`) jobs are ignored, so a failed job does not make its (Idea, Recipe) look busy — it
 * can be re-enqueued. Keyed on the composite triple so one Brand's job never masks another Brand's
 * colliding Idea id (C6), and one Recipe's job never masks a second Recipe's job for the same Idea
 * (issue #56).
 */
export function hasJobFor(state: QueueState, brand: string, ideaId: string, recipe: string): boolean {
  return state.jobs.some((job) => isJob(job, brand, ideaId, recipe) && isLiveJob(job));
}

/**
 * Whether the queue holds a LIVE job for this `(brand, idea_id, recipe)` whose gate cursor is `gate`.
 * Terminal jobs are ignored (so a failed leg can be re-enqueued). Used to keep enqueueing the NEXT leg
 * idempotent without being blocked by an earlier (already-gated/consumed) leg of the SAME (Idea,
 * Recipe) — mirrors the old `hasJobOfPhase(..., "render")` check, generalized to any gate value.
 */
export function hasJobAtGate(
  state: QueueState,
  brand: string,
  ideaId: string,
  recipe: string,
  gate: string | null,
): boolean {
  return state.jobs.some(
    (job) => isJob(job, brand, ideaId, recipe) && job.gate === gate && isLiveJob(job),
  );
}

/**
 * Append a `status: queued` job STARTING production for one (brand, idea, recipe) — the job's `gate`
 * names the Recipe's first pick-gate (or `null` for a gateless Recipe, which renders unattended
 * end-to-end). Callers resolve `gate` from the Recipe registry (`Recipe.gates[0] ?? null`); this pure
 * module carries no dependency on the registry.
 *
 * Pure: returns a NEW state object and never mutates `state`. Idempotent per `(brand, idea_id, recipe)`
 * while a LIVE job for that triple exists — if one does, the state is returned unchanged (no
 * duplicate), regardless of that job's own gate cursor. A prior `failed`/`done` job does NOT block a
 * fresh enqueue (C4: an (Idea, Recipe) can be produced again after a failure).
 *
 * @param state    current queue state
 * @param ideaId   the Idea to enqueue (must already be `accepted` in the ledger, with `recipe` chosen)
 * @param now      ISO-8601 timestamp for `enqueued_at` (injected, never read from the clock here)
 * @param brand    the Brand slug the job belongs to (routes ledger writes; required)
 * @param recipe   the chosen Recipe slug this job produces
 * @param gate     the gate this leg's Space run works toward, or `null` for a gateless final leg
 */
export function enqueue(
  state: QueueState,
  ideaId: string,
  now: string,
  brand: string,
  recipe: string,
  gate: string | null,
): QueueState {
  if (hasJobFor(state, brand, ideaId, recipe)) {
    return state;
  }
  const job: QueueJob = {
    idea_id: ideaId,
    brand,
    recipe,
    gate,
    status: "queued",
    enqueued_at: now,
  };
  return { jobs: [...state.jobs, job] };
}

/**
 * Append the NEXT leg after the Operator resolved a gate's pick (ADR-0008: "picking a gate's candidate
 * enqueues the next leg") — the job that works toward `nextGate` (or `null` — the final leg, rendering
 * the Asset with no further gate). Carries the Operator's resolved `pick` (C1, generalized) so it
 * survives to the Space session unchanged.
 *
 * Pure: returns a NEW state object and never mutates `state`. Idempotent per `(brand, idea_id, recipe)`
 * AT `nextGate` specifically — a live job already gated EARLIER in the sequence (e.g. the just-resolved
 * gate's own job, now `awaiting_pick`/`done`) does not block this. A prior `failed` leg at `nextGate`
 * does NOT block a fresh one (C4).
 *
 * @param state     current queue state
 * @param ideaId    the Idea this leg continues producing
 * @param now       ISO-8601 timestamp for `enqueued_at` (injected, never read from the clock here)
 * @param brand     the Brand slug the job belongs to (routes ledger writes; required)
 * @param recipe    the Recipe slug this leg continues producing
 * @param nextGate  the gate this leg's Space run works toward, or `null` for the final leg
 * @param pick      the Operator's resolved pick from the gate that was just cleared
 */
export function enqueueNextLeg(
  state: QueueState,
  ideaId: string,
  now: string,
  brand: string,
  recipe: string,
  nextGate: string | null,
  pick: string,
): QueueState {
  if (hasJobAtGate(state, brand, ideaId, recipe, nextGate)) {
    return state;
  }
  const job: QueueJob = {
    idea_id: ideaId,
    brand,
    recipe,
    gate: nextGate,
    status: "queued",
    enqueued_at: now,
    pick,
  };
  return { jobs: [...state.jobs, job] };
}
