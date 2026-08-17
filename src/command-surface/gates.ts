/**
 * `raiseGateRequest` / `resolveGate` — the typed command surface's Gate Request operations (issue #208
 * — a NEW capability, mirroring `jobs.ts`'s own shape for `production-queue/gate-request-store.ts`).
 *
 * `raiseGateRequest` is a thin wrap of `createGateRequest`. `resolveGate` composes
 * `recordGateDecision` with `job-store.ts`'s `createJob` — the SAME "compose more than one store call
 * behind real branching logic" shape `ideas.ts`'s `recordReviewDecision` already established (and the
 * shape issue #209 collapsed its own `schedule-outbox` orchestration into, after qa flagged a separate
 * deep module doing the same job as an un-audited store-write bypass). `claimJob`'s own eligibility rule
 * (`queued`, or `running` with an expired lease — never `awaiting_pick`) is exactly why resuming a
 * parked job means enqueuing a NEW job row for the SAME Asset, rather than re-claiming the parked one —
 * `resolveGate` is that enqueue, done at the moment the Operator's pick is recorded, matching
 * CONTEXT.md's own "Production Queue" story: "resumes that job once the pick is in."
 */

import type { DatabaseSync } from "node:sqlite";

import {
  createGateRequest,
  getGateRequest,
  recordGateDecision,
  GateRequestNotFoundError,
  type GateRequestInput,
  type GateRequestRecord,
  type GateDecisionInput,
} from "../production-queue/gate-request-store.ts";
import { getJob, createJob } from "../production-queue/job-store.ts";

export { GateRequestNotFoundError };
export type { GateRequestInput, GateRequestRecord, GateDecisionInput };

/** Records ONE gate offer — a job pausing at a gate with its candidate set. Undecided until
 *  `resolveGate` is called. Throws (SQLite FOREIGN KEY error) for an unknown `input.jobId`. */
export function raiseGateRequest(
  db: DatabaseSync,
  input: GateRequestInput,
  now: () => string = () => new Date().toISOString(),
): string {
  return createGateRequest(db, input, now);
}

/** The outcome of resolving one gate: the decided gate request's id, plus the NEW job id enqueued for
 *  the resumed leg. */
export interface ResolveGateOutcome {
  readonly gateRequestId: string;
  readonly resumedJobId: string;
}

/**
 * Records the Operator's decision for `gateRequestId` (`recordGateDecision`) and enqueues a NEW `job`
 * row for the SAME Asset the parked job belonged to — `gate` omitted, so the new job's leg targets the
 * final render (every wired gated Recipe declares exactly ONE gate; see `src/worker/plan-leg.ts`'s own
 * doc comment for the known limit this implies for a hypothetical multi-gate Recipe). Throws
 * `GateRequestNotFoundError` for an unknown `gateRequestId`, BEFORE any write.
 */
export function resolveGate(
  db: DatabaseSync,
  gateRequestId: string,
  decision: GateDecisionInput,
  now: () => string = () => new Date().toISOString(),
): ResolveGateOutcome {
  recordGateDecision(db, gateRequestId, decision, now);
  const gateRequest = getGateRequest(db, gateRequestId)!;
  const parkedJob = getJob(db, gateRequest.jobId)!;
  const resumedJobId = createJob(db, { assetId: parkedJob.assetId, brandId: parkedJob.brandId }, now);
  return { gateRequestId, resumedJobId };
}
