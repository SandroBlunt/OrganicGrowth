/**
 * `loadQueueStrict` — the one-shot importer's stricter wrapper around the existing `data/queue.json`
 * loader (issue #204).
 *
 * `src/production-queue/store.ts`'s `loadQueue`/`parseQueueState` IS the existing loader for the
 * Production Queue — this ticket's own constraint ("read through the existing loaders and normalisers,
 * never raw JSON") means the importer calls it, unchanged, rather than re-parsing `queue.json` itself.
 * But that loader is deliberately TOLERANT for its real, ongoing caller (`/queue`, the live pipeline): a
 * malformed job record is dropped with a `console.warn`, never a thrown error, so a hand-typo'd job
 * never crashes the live queue read (its own doc comment: "Every dropped record is WARNED about (never
 * silently discarded)").
 *
 * A one-shot migration cannot accept "warned about" as good enough — this ticket's own brief is
 * explicit: "never a silent drop... a warning buried in a log is not [a good outcome]". This module
 * closes that gap WITHOUT forking or reimplementing the parser: it calls the real `loadQueue` unchanged,
 * temporarily capturing whatever it writes to `console.warn`, and hands both the parsed state AND the
 * captured warnings back to the caller — which, for the importer's planner, means "any warning at all
 * turns into a named refusal", never a job the Operator never gets to see was dropped.
 */

import { loadQueue, DEFAULT_QUEUE_PATH } from "../production-queue/store.ts";
import type { QueueState } from "../production-queue/queue.ts";

export interface StrictQueueLoadResult {
  readonly state: QueueState;
  /** Every message `loadQueue` wrote to `console.warn` while parsing — `[]` when nothing was dropped. */
  readonly warnings: readonly string[];
}

/**
 * Loads `data/queue.json` (or `path`, if given) through the existing `loadQueue`, capturing any
 * `console.warn` it emits instead of letting it reach the real console. Restores the real
 * `console.warn` afterward (even if `loadQueue` throws — e.g. a genuinely corrupt/truncated file, which
 * `loadQueue` still throws for, unchanged).
 */
export async function loadQueueStrict(path: string = DEFAULT_QUEUE_PATH): Promise<StrictQueueLoadResult> {
  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]): void => {
    warnings.push(args.map((a) => String(a)).join(" "));
  };
  try {
    const state = await loadQueue(path);
    return { state, warnings };
  } finally {
    console.warn = realWarn;
  }
}
