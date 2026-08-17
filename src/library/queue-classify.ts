/**
 * Pure classification of one Run & queue state screen row (issue #210, AC6: "what is produced, parked
 * or failed — without reading JSON"). A plain function of a Job's own status, its Asset's own status,
 * and whether that Asset is currently paused at a gate — no database, no I/O.
 */

import type { JobStatus } from "../production-queue/job-store.ts";
import type { AssetStatus } from "../asset/asset.ts";
import type { QueueBucket } from "./types.ts";

const PRODUCED_ASSET_STATUSES: ReadonlySet<AssetStatus> = new Set<AssetStatus>(["produced", "posted", "tracking", "scored"]);

/**
 * Classifies one Job/Asset pair into the bucket the Run & queue screen groups it under:
 *
 *   - `"failed"`   — the Job itself failed (regardless of the Asset's own status).
 *   - `"parked"`   — paused at a gate: either the Job is `awaiting_pick`, or the Asset carries a
 *                    `pendingGate` (a human pick is outstanding) — CONTEXT.md "a pause inside
 *                    `in_production`, never a status of its own."
 *   - `"running"`  — a worker currently holds this Job.
 *   - `"queued"`   — not yet started.
 *   - `"produced"` — the Job finished (`done`) and the Asset has actually reached `produced` or later.
 *   - `"done"`     — the Job finished but the Asset has not (yet) reached `produced` — a legal but
 *                    unusual state (e.g. a gate-only leg's Job completing before its Asset's next leg
 *                    runs); named honestly rather than folded into `"produced"`.
 */
export function classifyQueueRow(jobStatus: JobStatus, assetStatus: AssetStatus, pendingGate?: string): QueueBucket {
  if (jobStatus === "failed") return "failed";
  if (jobStatus === "awaiting_pick" || pendingGate !== undefined) return "parked";
  if (jobStatus === "running") return "running";
  if (jobStatus === "queued") return "queued";
  // jobStatus === "done"
  return PRODUCED_ASSET_STATUSES.has(assetStatus) ? "produced" : "done";
}
