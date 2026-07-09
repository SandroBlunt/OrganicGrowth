/**
 * Phase resolver — pure deep module.
 *
 * Given a Brand's ledger snapshot (an array of `LedgerIdea` objects) and that Brand's slice of the
 * one global Production Queue (an array of `QueueJob` objects filtered to the Brand), determines:
 *
 *   - `phase`         — where in the weekly loop the Brand currently stands.
 *   - `pendingGates`  — the set of human gates currently waiting for Operator action.
 *   - `strandedIdeas` — Idea ids that are `accepted` in the ledger but have no live queue job
 *                       (the 2026-W22 case — they need re-enqueue).
 *
 * This module is PURE: no disk, no network, no Magnific Space, no Apify, no clock access. All
 * inputs are plain arrays of in-memory objects; the return value is a plain object. The ledger
 * is the source of truth (always-rules #7); the queue slice is a secondary index used only to
 * detect stranded `accepted` Ideas.
 *
 * Lifecycle order (CLAUDE.md):
 *   suggested → accepted → casting → produced → posted → tracking → scored  (or rejected)
 *
 * Phase priority (earliest active phase wins for `phase`):
 *   research < review < production < publish < tracking < done
 *
 * Gate mapping:
 *   suggested → "review"    (Gate 1: Review)
 *   casting   → "cast-pick" (Gate 2: Cast pick)
 *   produced  → "publish"   (Gate 3: Publish)
 *   posted    → "track"     (automatic; /track-performance must still be run)
 */

import type { LedgerIdea } from "../ledger/ledger.ts";
import { isLiveJob, type QueueJob } from "../production-queue/queue.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The Brand's current position in the weekly loop. Priority order (ascending):
 * `research` < `review` < `production` < `publish` < `tracking` < `done`.
 */
export type Phase =
  | "research"   // no Ideas yet; loop hasn't started
  | "review"     // suggested Ideas are waiting for the Operator to accept/reject
  | "production" // accepted/casting Ideas: queue draining or Cast gate pending
  | "publish"    // produced Ideas: Assets ready for the Operator to publish
  | "tracking"   // posted Ideas: posts need /track-performance
  | "done";      // all Ideas are scored or rejected — the loop is idle for this week

/**
 * A human gate currently pending Operator action. A gate is present in `pendingGates` when at
 * least one Idea of the corresponding status exists in the ledger.
 *
 * - `"review"`    — suggested Ideas await accept/reject (Gate 1, /review-ideas)
 * - `"cast-pick"` — casting Ideas await Character selection (Gate 2, /pick-cast)
 * - `"publish"`   — produced Ideas await publication (Gate 3, /log-post)
 * - `"track"`     — posted Ideas need /track-performance (automatic; no human decision required
 *                   but the Operator triggers it)
 */
export type PendingGate = "review" | "cast-pick" | "publish" | "track";

/** The result of resolving a Brand's current phase from its ledger + queue slice. */
export interface PhaseResult {
  /** The Brand's current loop position. */
  readonly phase: Phase;
  /** The set of human gates currently pending, with no duplicates. */
  readonly pendingGates: readonly PendingGate[];
  /**
   * Idea ids that are `accepted` in the ledger but have no live queue job — these need to be
   * re-enqueued. The 2026-W22 stranded-ideas case.
   */
  readonly strandedIdeas: readonly string[];
}

// ---------------------------------------------------------------------------
// Phase priority
// ---------------------------------------------------------------------------

/** Numeric priority for each phase (lower = earlier in the lifecycle). */
const PHASE_PRIORITY: Record<Phase, number> = {
  research:   0,
  review:     1,
  production: 2,
  publish:    3,
  tracking:   4,
  done:       5,
};

/** Return the earlier of two phases (lowest priority number wins). */
function earlierPhase(a: Phase, b: Phase): Phase {
  return PHASE_PRIORITY[a] <= PHASE_PRIORITY[b] ? a : b;
}

// ---------------------------------------------------------------------------
// resolvePhase
// ---------------------------------------------------------------------------

/**
 * Resolve a Brand's current loop phase, pending human gates, and stranded Ideas from a ledger
 * snapshot and the Brand's slice of the global Production Queue.
 *
 * Pure: no I/O. The inputs are NOT mutated. Deterministic: same inputs always produce the same
 * output.
 *
 * @param ideas      The Brand's ledger Ideas (any subset of the full lifecycle is valid).
 * @param queueJobs  The Brand's slice of the global queue (jobs where `job.brand === brand`).
 *                   The caller is responsible for pre-filtering to the correct Brand.
 */
export function resolvePhase(
  ideas: readonly LedgerIdea[],
  queueJobs: readonly QueueJob[],
): PhaseResult {
  // Empty ledger → start of the loop (no trends run yet).
  if (ideas.length === 0) {
    return { phase: "research", pendingGates: [], strandedIdeas: [] };
  }

  // Build a Set of idea_ids that have at least one LIVE queue job (for O(1) lookup). Terminal jobs
  // (`failed` / `done`) do NOT keep an accepted Idea off the stranded list — an accepted Idea whose
  // only job is `failed` needs re-enqueue, so it is stranded, not live (C4). The queueJobs are already
  // filtered to this Brand by the caller, so `idea_id` is unique within the slice.
  const liveJobIdeaIds = new Set(queueJobs.filter(isLiveJob).map((j) => j.idea_id));

  let phase: Phase = "done"; // start pessimistic (done); narrow down as we find active Ideas
  const gateSet = new Set<PendingGate>();
  const stranded: string[] = [];

  for (const idea of ideas) {
    switch (idea.status) {
      case "suggested":
        phase = earlierPhase(phase, "review");
        gateSet.add("review");
        break;

      case "accepted":
        // Production phase regardless of queue presence.
        phase = earlierPhase(phase, "production");
        // Stranded if no LIVE queue job exists for this Idea (a `failed`-only Idea is stranded — C4).
        if (!liveJobIdeaIds.has(idea.id)) {
          stranded.push(idea.id);
        }
        // No human gate for accepted: it's either queued or stranded (needs re-enqueue).
        break;

      case "casting":
        // Production phase; the Cast gate is pending for the Operator.
        phase = earlierPhase(phase, "production");
        gateSet.add("cast-pick");
        break;

      case "produced":
        // Publish phase; the Operator must publish the Asset.
        phase = earlierPhase(phase, "publish");
        gateSet.add("publish");
        break;

      case "posted":
        // Tracking phase; /track-performance must be run.
        phase = earlierPhase(phase, "tracking");
        gateSet.add("track");
        break;

      case "tracking":
        // In-flight tracking: the phase is tracking but no additional human gate needed.
        phase = earlierPhase(phase, "tracking");
        break;

      case "scored":
      case "rejected":
        // Terminal states: contribute "done" only, which is the pessimistic default.
        // They do not pull the phase forward from "done".
        break;

      default:
        // Unknown/future status: treat as terminal (do not crash — defensive).
        break;
    }
  }

  return {
    phase,
    pendingGates: Array.from(gateSet),
    strandedIdeas: stranded,
  };
}
