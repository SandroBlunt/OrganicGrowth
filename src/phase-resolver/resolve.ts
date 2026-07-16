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
 * As of issue #55 (ADR-0011), an Idea's OWN status is only ever `suggested` / `accepted` /
 * `rejected` — production state (what used to be `casting` / `produced` / `posted` / `tracking` /
 * `scored`) now lives on the Idea's per-Recipe `assets` (`src/asset/asset.ts`). This resolver FOLDS
 * an `accepted` Idea's Assets exactly the way it already folds many Ideas into one Brand phase: the
 * EARLIEST Asset stage sets the phase contribution, and EVERY Asset's gate (not just the earliest
 * one's) surfaces in `pendingGates` — one Idea's Recipe can be `produced`, ready to publish, while
 * another is still `in_production` paused at a different gate; the Operator needs to see both.
 *
 * Lifecycle order (ADR-0011):
 *   Idea:  suggested → accepted → rejected
 *   Asset: queued → in_production → produced → posted → tracking → scored
 *          (a human pick, e.g. the Cast pick, is a PAUSE inside in_production, named by
 *           pending_gate — never a stage of its own; `casting` is retired)
 *
 * Phase priority (earliest active phase wins for `phase`):
 *   research < review < production < publish < tracking < done
 *
 * Gate mapping (per Asset, folded across all of an Idea's Assets):
 *   suggested                                 → "review"    (Gate 1: Review)
 *   in_production, pending_gate: "cast"        → "cast-pick" (Gate 2: Cast pick)
 *   produced                                  → "publish"   (Gate 3: Publish)
 *   posted                                    → "track"     (automatic; /track-performance must still be run)
 */

import type { LedgerIdea } from "../ledger/ledger.ts";
import { isLiveJob, type QueueJob } from "../production-queue/queue.ts";
import type { LedgerAssetRecord } from "../asset/asset.ts";

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
  | "production" // accepted Ideas: queue draining, an Asset still queued, or a gate pending
  | "publish"    // an Asset is produced: ready for the Operator to publish
  | "tracking"   // an Asset is posted: posts need /track-performance
  | "done";      // all Ideas are rejected or every Asset is scored — the loop is idle for this week

/**
 * A human gate currently pending Operator action. A gate is present in `pendingGates` when at
 * least one Idea (or one of its Assets) of the corresponding status exists in the ledger.
 *
 * - `"review"`    — suggested Ideas await accept/reject (Gate 1, /review-ideas)
 * - `"cast-pick"` — an Asset is `in_production` paused at its Cast gate (Gate 2, /pick-cast)
 * - `"publish"`   — an Asset is `produced`, awaiting publication (Gate 3, /log-post)
 * - `"track"`     — an Asset is `posted`, needing /track-performance (automatic; no human decision
 *                   required but the Operator triggers it)
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
// Per-Asset folding (mirrors the per-Idea folding one grain up)
// ---------------------------------------------------------------------------

/**
 * Fold ONE Asset into the running phase, adding any gate it contributes to `gateSet`. Returns the
 * new phase (the earlier of `phase` and this Asset's own phase contribution). `scored` is terminal
 * and contributes nothing (mirrors the old `scored`/`rejected` Idea-level case).
 */
function foldAssetIntoPhase(phase: Phase, gateSet: Set<PendingGate>, asset: LedgerAssetRecord): Phase {
  switch (asset.status) {
    case "queued":
      return earlierPhase(phase, "production");
    case "in_production":
      if (asset.pending_gate === "cast") gateSet.add("cast-pick");
      return earlierPhase(phase, "production");
    case "produced":
      gateSet.add("publish");
      return earlierPhase(phase, "publish");
    case "posted":
      gateSet.add("track");
      return earlierPhase(phase, "tracking");
    case "tracking":
      return earlierPhase(phase, "tracking");
    case "scored":
      return phase;
  }
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

      case "accepted": {
        const assets = idea.assets ?? [];
        if (assets.length === 0) {
          // No Assets recorded yet (today's real-ledger shape — accepting an Idea does not by
          // itself create an Asset). Production phase regardless of queue presence; stranded if no
          // LIVE queue job exists for this Idea (a `failed`-only Idea is stranded — C4).
          phase = earlierPhase(phase, "production");
          if (!liveJobIdeaIds.has(idea.id)) {
            stranded.push(idea.id);
          }
          break;
        }
        // Fold EVERY Asset (not just the earliest): a Recipe already `produced` and another still
        // `in_production` paused at a gate must BOTH surface — mirrors the old cross-Idea folding,
        // one grain down.
        for (const asset of assets) {
          phase = foldAssetIntoPhase(phase, gateSet, asset);
        }
        break;
      }

      case "rejected":
        // Terminal state: contributes "done" only, which is the pessimistic default.
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
