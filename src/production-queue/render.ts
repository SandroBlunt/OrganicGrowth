/**
 * Pure renderer for the `/queue` command — formats the Production Queue for the Operator.
 *
 * Pure: takes a QueueState (and optional brand filter), returns a string. No I/O, so it is fully
 * unit-testable. Shows each job's `brand`, `idea_id`, `phase`, and `status`. When `brandFilter` is
 * supplied, only jobs for that Brand are shown (AC6: `/queue` labels and filters by Brand).
 */

import type { QueueState, QueueJob } from "./queue.ts";

const HEADER = "Production Queue";

/** Format the queue as plain text: one line per job (`brand  idea_id  phase  status`), or an empty note. */
export function renderQueue(state: QueueState, brandFilter?: string): string {
  const jobs: readonly QueueJob[] = brandFilter !== undefined
    ? state.jobs.filter((j) => j.brand === brandFilter)
    : state.jobs;

  if (state.jobs.length === 0) {
    return `${HEADER}\n(no jobs — the queue is empty)`;
  }

  if (jobs.length === 0) {
    // Queue is non-empty globally but empty for the filter.
    return `${HEADER}\n(no jobs for brand "${brandFilter}")`;
  }

  const lines = jobs.map(
    (job, i) => `${i + 1}. [${job.brand}] ${job.idea_id}  [${job.phase}]  ${job.status}`,
  );
  return [HEADER, ...lines].join("\n");
}
