/**
 * The worker — orchestration shell (issue #208).
 *
 * Thin: repeatedly find the oldest `queued` job (`job-store.ts`'s `findNextQueuedJob`, a FIFO read) and
 * run it via `command-surface/worker.ts`'s `runOneJob`, until nothing is `queued`. All the real logic —
 * claiming, phase self-audits, driving the Space, parking at a gate, retrying a failure — lives in
 * `runOneJob`; this module is the loop around it, "a local process, started by the Operator, draining
 * the queue" (issue #208's own text).
 *
 * Because this loop processes jobs STRICTLY SEQUENTIALLY — never starting a second job's `runOneJob`
 * call before the current one settles (`done` / `awaiting_pick` / `failed`) — the Magnific Space's own
 * one-generation-at-a-time constraint (ADR-0004/ADR-0008) holds by construction; no separate "is the
 * Space busy" bookkeeping is needed on top of the atomic claim `runOneJob` already uses.
 */

import type { DatabaseSync } from "node:sqlite";

import { findNextQueuedJob } from "../production-queue/job-store.ts";
import { runOneJob, type RunOneJobOptions, type RunOneJobOutcome } from "../command-surface/worker.ts";
import type { SpaceMcpPort } from "../space-driver/port.ts";

export interface DrainQueueOptions extends RunOneJobOptions {
  /** A safety valve against a pathological infinite loop — never expected to bind in practice, since
   *  `runOneJob` always moves a claimed job OFF `queued` (to `running` then `done`/`awaiting_pick`/
   *  `failed`, or leaves it `queued` only when the claim itself was lost to a race). Default 1000. */
  readonly maxIterations?: number;
}

/** One processed job's own outcome, paired with its id. */
export interface DrainQueueProcessedJob {
  readonly jobId: string;
  readonly outcome: RunOneJobOutcome;
}

export interface DrainQueueSummary {
  readonly processed: readonly DrainQueueProcessedJob[];
}

/**
 * Drain the Production Queue: repeatedly claim and process the oldest `queued` job until none remain
 * (or `maxIterations` is reached). Returns every processed job's own outcome, in the order processed.
 */
export async function drainQueue(
  db: DatabaseSync,
  port: SpaceMcpPort,
  options: DrainQueueOptions = {},
): Promise<DrainQueueSummary> {
  const maxIterations = options.maxIterations ?? 1000;
  const processed: DrainQueueProcessedJob[] = [];

  for (let i = 0; i < maxIterations; i += 1) {
    const next = findNextQueuedJob(db);
    if (next === null) break;
    const outcome = await runOneJob(db, port, next.id, options);
    processed.push({ jobId: next.id, outcome });
  }

  return { processed };
}
