/**
 * Orchestration shell — auto-enqueue an accepted Idea (ADR-0004).
 *
 * Wires the read-only ledger to the pure queue logic and the file store. Kept thin: the decision
 * logic ("accepted-only", "no-duplicate") lives in `queue.ts` / the ledger check; this just sequences
 * load → guard → enqueue → save. Called by the `/review-ideas` accept path; there is no separate
 * `/produce` kickoff.
 *
 * The queue is derived from the ledger, never the reverse: an Idea must already be `accepted` in the
 * ledger before it can be enqueued (the ledger stays the source of truth).
 */

import { findIdea, loadIdeas, DEFAULT_LEDGER_PATH } from "../ledger/ledger.ts";
import { enqueue, hasJobFor, type QueueState } from "./queue.ts";
import { loadQueue, saveQueue, DEFAULT_QUEUE_PATH } from "./store.ts";

/** Outcome of an enqueue-on-accept attempt. */
export interface EnqueueResult {
  /** Whether a new job was added. */
  readonly enqueued: boolean;
  /** Why nothing was enqueued, when `enqueued` is false. */
  readonly reason?: "not-accepted" | "already-queued" | "unknown-idea";
  /** The queue state after the attempt. */
  readonly state: QueueState;
}

export interface EnqueueOnAcceptOptions {
  readonly ledgerPath?: string;
  readonly queuePath?: string;
  /** Injected clock for deterministic timestamps in tests; defaults to now. */
  readonly now?: () => string;
}

/**
 * Decide what enqueueing an Idea should do, given the current ledger and queue state. Pure: no I/O.
 * Exposed so the accepted-only + no-duplicate policy is unit-testable without the filesystem.
 *
 * @param ideas   the current ledger Ideas
 * @param queue   the current queue state
 * @param ideaId  the Idea to enqueue
 * @param now     ISO-8601 timestamp for `enqueued_at`
 * @param brand   the Brand slug to stamp on the enqueued job (required — never ambient/session)
 */
export function planEnqueue(
  ideas: Parameters<typeof findIdea>[0],
  queue: QueueState,
  ideaId: string,
  now: string,
  brand: string,
): EnqueueResult {
  const idea = findIdea(ideas, ideaId);
  if (idea === null) {
    return { enqueued: false, reason: "unknown-idea", state: queue };
  }
  if (idea.status !== "accepted") {
    // Rejected (or suggested) Ideas never produce a job — credits only on accepted Ideas.
    return { enqueued: false, reason: "not-accepted", state: queue };
  }
  if (hasJobFor(queue, ideaId)) {
    return { enqueued: false, reason: "already-queued", state: queue };
  }
  return { enqueued: true, state: enqueue(queue, ideaId, now, brand) };
}

/**
 * Load ledger + queue, apply the enqueue policy, and persist if anything changed.
 *
 * @param ideaId  the Idea to enqueue
 * @param brand   the Brand slug to stamp on the enqueued job (required — never ambient/session)
 * @param options optional path/clock overrides
 */
export async function enqueueOnAccept(
  ideaId: string,
  brand: string,
  options: EnqueueOnAcceptOptions = {},
): Promise<EnqueueResult> {
  const ledgerPath = options.ledgerPath ?? DEFAULT_LEDGER_PATH;
  const queuePath = options.queuePath ?? DEFAULT_QUEUE_PATH;
  const now = (options.now ?? (() => new Date().toISOString()))();

  const ideas = await loadIdeas(ledgerPath);
  const queue = await loadQueue(queuePath);
  const result = planEnqueue(ideas, queue, ideaId, now, brand);

  if (result.enqueued) {
    await saveQueue(result.state, queuePath);
  }
  return result;
}
