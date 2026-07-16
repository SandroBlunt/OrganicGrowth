/**
 * Pure text formatter for the `/queue` command — formats the Production Queue for the Operator.
 *
 * Named `format` (not `render`): domain-wide "render" means producing the Asset (a Reel) by driving a
 * Magnific Space. This module only turns a QueueState into display text, so it must not borrow that
 * verb (C49).
 *
 * Pure: takes a QueueState (and optional brand filter), returns a string. No I/O, so it is fully
 * unit-testable. Shows each job's `brand`, `idea_id`, `recipe`, its generic `gate` cursor (issue #56 —
 * `final` for a `null` gate, meaning this leg renders the Asset with no further gate), and `status`.
 * When `brandFilter` is supplied, only jobs for that Brand are shown (AC6: `/queue` labels and filters
 * by Brand).
 */

import type { QueueState, QueueJob } from "./queue.ts";

const HEADER = "Production Queue";

/** Display label for a job's gate cursor: the gate name, or `final` for a `null` (last-leg) cursor. */
function gateLabel(gate: string | null): string {
  return gate ?? "final";
}

/** Format the queue as plain text: one line per job, or an empty note. */
export function formatQueue(state: QueueState, brandFilter?: string): string {
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
    (job, i) =>
      `${i + 1}. [${job.brand}] ${job.idea_id}  [${job.recipe}]  gate=${gateLabel(job.gate)}  ${job.status}`,
  );
  return [HEADER, ...lines].join("\n");
}
