/**
 * Pure renderer for the `/queue` command — formats the Production Queue for the Operator.
 *
 * Pure: takes a QueueState, returns a string. No I/O, so it is fully unit-testable. Shows each job's
 * `idea_id`, `phase`, and `status` (the three fields the Operator needs to read the backlog).
 */

import type { QueueState } from "./queue.ts";

const HEADER = "Production Queue";

/** Format the queue as plain text: one line per job (`idea_id  phase  status`), or an empty note. */
export function renderQueue(state: QueueState): string {
  if (state.jobs.length === 0) {
    return `${HEADER}\n(no jobs — the queue is empty)`;
  }
  const lines = state.jobs.map(
    (job, i) => `${i + 1}. ${job.idea_id}  [${job.phase}]  ${job.status}`,
  );
  return [HEADER, ...lines].join("\n");
}
