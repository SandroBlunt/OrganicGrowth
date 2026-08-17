/**
 * `planLeg` — pure deep module deciding which LEG of a Recipe's Execution Protocol a claimed job
 * represents (issue #208).
 *
 * A `job` row carries no `pick` column and no "is this a first or resumed leg" flag of its own (`job`
 * has `gate`, the gate this job's OWN leg targets — mirroring `space-driver/driver.ts`'s
 * `DriveLegInput.targetGate` — but nothing that says whether a preceding gate has already resolved).
 * That fact is derived, never separately tracked: a job represents a RESUMED leg exactly when the
 * Asset it belongs to already carries a DECIDED `gate_request` from an EARLIER job
 * (`production-queue/gate-request-store.ts`'s `listGateRequestsForAsset` — the caller's job, not this
 * pure module's). A FIRST leg targets the Recipe's own first declared gate (or `null` for a zero-gate
 * Recipe — its single leg is simultaneously first and final). A RESUMED leg always targets `null` (the
 * final render), carrying the decided gate request's `choice` as its pick — every wired Recipe with at
 * least one gate declares exactly one (`recipe/registry.ts`), so there is no "next" gate to resolve
 * beyond the final render; a future multi-gate Recipe would need this module widened, a known limit
 * (see this change's `handoff.md`).
 */

import type { Recipe } from "../recipe/registry.ts";

/** One EARLIER job's decided gate request for the SAME Asset — the fact that makes a leg RESUMED. */
export interface PriorGateDecision {
  readonly gateName: string;
  readonly choice: string;
}

/** Which leg a claimed job represents, and the target gate (or `null` for the final render) it drives
 *  toward — the exact shape `space-driver/driver.ts`'s `DriveLegInput` needs, minus the Spec/prompt-node
 *  fields only the caller (which already loaded the Asset) can supply. */
export type LegPlan =
  | { readonly kind: "first"; readonly targetGate: string | null }
  | { readonly kind: "resumed"; readonly targetGate: null; readonly pick: string };

/**
 * Decide which leg `recipe`'s job represents, given `priorDecision` — the LATEST decided gate request
 * raised by an earlier job for the same Asset, or `null` when none exists yet. Pure: no I/O, no clock.
 */
export function planLeg(recipe: Recipe, priorDecision: PriorGateDecision | null): LegPlan {
  if (priorDecision === null) {
    return { kind: "first", targetGate: recipe.gates[0] ?? null };
  }
  return { kind: "resumed", targetGate: null, pick: priorDecision.choice };
}
