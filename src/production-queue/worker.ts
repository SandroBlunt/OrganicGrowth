/**
 * Producer worker — drain-on-trigger + periodic tick (ADR-0004).
 *
 * This is the ORCHESTRATION SHELL the prior slices were missing: it ties the pure scheduler
 * (`nextReady` / the `mark*` lifecycle / the single-Space lock — Slice 4) to the Space driver's two
 * phases (`composeAndCast` → Cast at the Cast gate; `pickAndRender` → Asset — Slices 5–6) and the ledger
 * writers (`writeIdeaCast` / `writeIdeaAsset` / `writeIdeaStatus`, status derived via
 * `ledgerStatusForTransition`). It owns NO business logic of its own beyond the wiring; the deep modules
 * decide everything.
 *
 * --- The two entry points (ADR-0004) ---
 *
 *   • drain(deps)  — the DRAIN-ON-TRIGGER task. Each trigger (an Idea accepted, or a Cast picked) calls
 *     this. While the Space is free and `nextReady(queue)` returns a job, it `markRunning`s that job
 *     (taking the single-Space lock), STARTS its Space op asynchronously through the injected
 *     `SpaceSession`, and persists. Because the Space is now busy, `nextReady` returns null and `drain`
 *     EXITS — there is NO always-on daemon and NO busy-wait. At most ONE Space op is ever in flight, so
 *     two Space ops never run at once (the Space has no parallelism).
 *
 *   • tick(deps)   — the REQUIRED periodic reap-and-advance. Space ops are async and can finish while the
 *     Operator is idle (no accept/pick to trigger a drain), so a light recurring tick must reap the
 *     completed op and start the next job, or throughput stalls. It polls the in-flight op; if still
 *     running it does nothing; if terminal it REAPS it (a cast-gen → `awaiting_cast` + Cast/casting ledger
 *     writes, releasing the lock; a render → `done` + Asset/produced ledger writes; a failure → `failed` +
 *     an Operator notification of WHEN + WHY) and then calls `drain` to start the next ready job. Default
 *     tick host: `/loop` (a build choice — see `docs/producer-worker-permissions.md`).
 *
 * --- Hermetic / no live Space ---
 *
 * The worker reaches Magnific ONLY through the injected `SpaceSession` (which itself drives the driver
 * through the narrow `SpaceMcpPort`). The clock, the queue/ledger I/O, and the Operator notifier are all
 * injected too. Tests pass the Magnific FAKE and in-memory/temp-file stand-ins — NO live
 * `spaces_*`/`creations_*`, NO credits, NO board mutation, NO network.
 *
 * --- Permission path (the spike's blocker) ---
 *
 * `spaces_edit`/`spaces_run` are auto-denied as "modifying shared infrastructure" and need per-call
 * approval even with verbal consent (`docs/producer-spikes-results.md`). The background worker drives them
 * unattended via the documented allowlist: `.claude/permissions/producer-worker.json` (see
 * `docs/producer-worker-permissions.md`).
 *
 * --- Always-rules ---
 *
 * generate-never-publish: the worker drives cast-gens and renders and STOPS at the finished Asset — there
 * is NO publish/Facebook/post path here. ledger-as-source-of-truth: every status change and the
 * `cast`/`asset` fields are written to the ledger from the queue transition, derived (never inferred); the
 * queue file is kept consistent with it. Failure is never fabricated — a failed op becomes a `failed` job
 * plus an explicit Operator notification, never an invented Cast or Asset.
 */

import type { QueueJob, QueueState } from "./queue.ts";
import {
  markRunning,
  markAwaitingCast,
  markDone,
  markFailed,
  nextReady,
} from "./scheduler.ts";
import type { LedgerCastCandidate, LedgerAsset } from "../ledger/ledger.ts";
import type { DriverError } from "../space-driver/driver.ts";

// --- The Space op result the SpaceSession surfaces (a tagged union by phase + ok/failure) -----------

/** A completed cast-gen: the candidate Cast the Operator picks from (Phase A). */
export interface CastOpOutcome {
  readonly phase: "cast";
  readonly cast: readonly LedgerCastCandidate[];
}

/** A completed render: the finished Asset (Phase B). `produced_at` is stamped by the worker's clock. */
export interface RenderOpOutcome {
  readonly phase: "render";
  readonly character: string;
  readonly asset_url: string;
}

/** A successful terminal Space op. */
export type SpaceOpSuccess =
  | { readonly ok: true; readonly outcome: CastOpOutcome }
  | { readonly ok: true; readonly outcome: RenderOpOutcome };

/** A failed terminal Space op — carries the driver's stable failure reason (the WHY). */
export interface SpaceOpFailure {
  readonly ok: false;
  readonly error: DriverError;
}

/** The terminal result of a Space op, or `null` while it is still in flight. */
export type SpaceOpResult = SpaceOpSuccess | SpaceOpFailure;

/**
 * The worker's Space seam — a single in-flight async op the worker STARTS and later POLLS to terminal.
 * This is the only thing the worker touches that talks to Magnific; the live adapter (deferred) and the
 * FAKE (tests) both implement it. Modelling the op as start-then-poll is exactly what lets a render
 * complete "while the Operator is idle" and be reaped by a later `tick`.
 */
export interface SpaceSession {
  /** True when a Space op is started and not yet reaped (the Space is busy at the session level). */
  inFlight(): boolean;
  /** Start the Space op for `job` (a cast-gen or a render). Resolves once the op is STARTED, not finished. */
  start(job: QueueJob): Promise<void>;
  /** Poll the in-flight op: `null` while still running; the terminal result once it completes. */
  poll(): Promise<SpaceOpResult | null>;
}

/** What the worker reads/writes for the queue (injected so tests use temp files / in-memory). */
export interface QueuePersistence {
  load(): Promise<QueueState>;
  save(state: QueueState): Promise<void>;
}

/** The ledger writes the worker performs on reap (injected; defaults wrap the real ledger writers). */
export interface LedgerWrites {
  writeCast(ideaId: string, cast: readonly LedgerCastCandidate[]): Promise<void>;
  writeAsset(ideaId: string, asset: LedgerAsset): Promise<void>;
  writeStatus(ideaId: string, status: "casting" | "produced"): Promise<void>;
}

/** An Operator notification (the WHEN + WHY of a failure). Injected so tests assert it was called. */
export type Notifier = (message: string) => void;

/**
 * Brand-aware ledger-write factory: given a Brand slug, return the `LedgerWrites` scoped to that
 * Brand's ledger. The worker calls this with `job.brand` for every reap — never with ambient/session
 * state (CONTEXT.md: no global active-brand pointer). The implementation wires each Brand to its
 * per-Brand ledger path via the resolver. May throw for an unresolvable brand; the worker treats
 * that as a failure and continues draining.
 */
export type ResolveLedger = (brand: string) => LedgerWrites;

/** Everything the worker needs, all injected — no ambient I/O, no clock, no live Space. */
export interface WorkerDeps {
  readonly queue: QueuePersistence;
  /**
   * Brand-aware ledger-write factory. The worker calls `resolveLedger(job.brand)` for each job
   * reap — never a single ambient `LedgerWrites` object, so jobs for different Brands each write
   * to the correct Brand's ledger (AC3).
   */
  readonly resolveLedger: ResolveLedger;
  readonly space: SpaceSession;
  readonly notify: Notifier;
  /** Injected clock for `produced_at` / failure `when` (never read from the global clock here). */
  readonly now: () => string;
}

/** What a `drain` did: the job it started, or `null` for a clean no-op. */
export interface DrainResult {
  readonly started: QueueJob | null;
}

/** What a `tick` did: whether it reaped an op, and the drain that followed. */
export interface TickResult {
  readonly reaped: "cast" | "render" | "failed" | null;
  readonly drain: DrainResult;
}

/**
 * DRAIN-ON-TRIGGER (ADR-0004). Start the next Space-ready job and exit — no daemon.
 *
 * If a Space op is already in flight at the session level, or `nextReady(queue)` returns nothing, this is
 * a clean no-op. Otherwise it marks the `nextReady` job `running` (taking the single-Space lock),
 * persists, starts the op through the `SpaceSession`, and returns. It starts AT MOST ONE op — the
 * single-Space lock plus the in-flight session guarantee two Space ops never run at once.
 */
export async function drain(deps: WorkerDeps): Promise<DrainResult> {
  if (deps.space.inFlight()) {
    return { started: null }; // the Space is busy with an op the tick will reap — never start a second
  }
  const queue = await deps.queue.load();
  const job = nextReady(queue);
  if (job === null) {
    return { started: null }; // nothing ready (empty / all gated / all terminal)
  }

  const running = markRunning(queue, job.idea_id);
  if (!running.ok) {
    // Defensive: the lock is held or the job is no longer queued — do not start a second op.
    return { started: null };
  }
  await deps.queue.save(running.state);
  await deps.space.start(job);
  return { started: job };
}

/**
 * REQUIRED PERIODIC TICK (ADR-0004). Reap the in-flight op (if it finished) and start the next job.
 *
 * Polls the single in-flight Space op. If it is still running, the tick does nothing. If it completed, the
 * tick reaps it by phase — recording the result to the ledger and moving the job through its lifecycle so
 * the single-Space lock releases — then calls `drain` to start the next ready job with NO Operator action.
 * A failed op is isolated: the job becomes `failed`, the Operator is notified of WHEN + WHY, and the queue
 * continues with the next job.
 */
export async function tick(deps: WorkerDeps): Promise<TickResult> {
  const result = await deps.space.poll();
  if (result === null) {
    return { reaped: null, drain: { started: null } }; // op still in flight — nothing to reap
  }

  const queue = await deps.queue.load();
  const running = queue.jobs.find((j) => j.status === "running") ?? null;
  if (running === null) {
    // No running job to attach the result to (already reaped). Still try to advance the queue.
    return { reaped: null, drain: await drain(deps) };
  }

  const reaped = await reap(deps, queue, running, result);
  // With the lock released by the reap, start the next ready job unattended.
  const drained = await drain(deps);
  return { reaped, drain: drained };
}

/** Reap one terminal Space op for its `running` job: update the queue + ledger (or notify on failure). */
async function reap(
  deps: WorkerDeps,
  queue: QueueState,
  job: QueueJob,
  result: SpaceOpResult,
): Promise<"cast" | "render" | "failed"> {
  if (!result.ok) {
    return reapFailure(deps, queue, job, result.error);
  }
  // Resolve brand-scoped ledger writers from job.brand — never from session/ambient state (AC3).
  let ledger: LedgerWrites;
  try {
    ledger = deps.resolveLedger(job.brand);
  } catch (err: unknown) {
    // An unresolvable brand is a defensive failure: mark the job failed, release the lock, continue.
    const msg = err instanceof Error ? err.message : String(err);
    return reapBrandFailure(deps, queue, job, msg);
  }
  if (result.outcome.phase === "cast") {
    return reapCast(deps, queue, job, result.outcome, ledger);
  }
  return reapRender(deps, queue, job, result.outcome, ledger);
}

/** A cast-gen reached the Cast gate: record the Cast + `casting`, move the job to `awaiting_cast`. */
async function reapCast(
  deps: WorkerDeps,
  queue: QueueState,
  job: QueueJob,
  outcome: CastOpOutcome,
  ledger: LedgerWrites,
): Promise<"cast"> {
  const next = markAwaitingCast(queue, job.idea_id);
  // Ledger first (source of truth), then the queue mirrors it; the status is derived from the transition.
  // Writes go to the Brand's ledger resolved from job.brand — never to an ambient/session ledger (AC3).
  await ledger.writeCast(job.idea_id, outcome.cast);
  await ledger.writeStatus(job.idea_id, "casting");
  await deps.queue.save(next.state);
  return "cast";
}

/** A render completed: record the Asset + `produced`, move the job to `done`. The worker never publishes. */
async function reapRender(
  deps: WorkerDeps,
  queue: QueueState,
  job: QueueJob,
  outcome: RenderOpOutcome,
  ledger: LedgerWrites,
): Promise<"render"> {
  const next = markDone(queue, job.idea_id);
  const asset: LedgerAsset = {
    character: outcome.character,
    asset_url: outcome.asset_url,
    produced_at: deps.now(),
  };
  // Writes go to the Brand's ledger resolved from job.brand — never to an ambient/session ledger (AC3).
  await ledger.writeAsset(job.idea_id, asset);
  await ledger.writeStatus(job.idea_id, "produced");
  await deps.queue.save(next.state);
  return "render";
}

/**
 * A Space op failed: mark the job `failed` (it stays in the queue for the Operator), release the lock so
 * the queue continues, and notify the Operator with WHEN (an injected ISO-8601 timestamp) and WHY (the
 * driver's failure code + message). The Idea's ledger status is NOT advanced — no Cast/Asset is fabricated.
 */
async function reapFailure(
  deps: WorkerDeps,
  queue: QueueState,
  job: QueueJob,
  error: DriverError,
): Promise<"failed"> {
  const next = markFailed(queue, job.idea_id);
  await deps.queue.save(next.state);
  deps.notify(
    `Producer: ${job.phase} generation FAILED for ${job.idea_id} at ${deps.now()} — ${error.code}: ${error.message}. The queue continues with the next job.`,
  );
  return "failed";
}

/**
 * A job's brand could not be resolved to a ledger (defensive failure, AC1/AC3). Mark the job `failed`,
 * release the lock so the queue continues, and notify the Operator. The Idea's ledger status is NOT
 * advanced — no Cast/Asset is fabricated. The queue drain continues with the next job.
 */
async function reapBrandFailure(
  deps: WorkerDeps,
  queue: QueueState,
  job: QueueJob,
  detail: string,
): Promise<"failed"> {
  const next = markFailed(queue, job.idea_id);
  await deps.queue.save(next.state);
  deps.notify(
    `Producer: ${job.phase} job for ${job.idea_id} DROPPED at ${deps.now()} — brand "${job.brand}" could not be resolved: ${detail}. The queue continues with the next job.`,
  );
  return "failed";
}
