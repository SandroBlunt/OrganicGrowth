/**
 * `usesSpace` — the single, pure predicate the thin Producer checks before doing ANY canvas work for a
 * Recipe's job (issue #170, ADR-0021: `docs/adr/0021-space-less-recipe-script-assets.md`).
 *
 * A **Space-less Recipe** declares no `space` target (`src/recipe/registry.ts`'s `Recipe.space` is
 * `undefined`) — its Asset is written words (a script) plus collected media, with nothing for a
 * Magnific Space to render. For such a Recipe the Producer skips every canvas step: binding media
 * slots into canvas nodes (`bind-media.ts`'s `bindMediaSlots` already resolves to "nothing to bind"
 * for one, vacuously), driving any Execution Protocol run-point (`space-driver/driver.ts`'s
 * `driveToNextGate`), and setting the watermark `@handle` (`setWatermarkHandle`). `usesSpace` is the
 * ONE place that decision is made, so every canvas step checks the SAME signal rather than each
 * re-deriving "does this Recipe have a Space?" on its own.
 *
 * Pure and deterministic: no I/O, no clock, never throws.
 */

import type { Recipe } from "../recipe/registry.ts";

/**
 * Whether `recipe` drives a Magnific Space at all. `true` for every Recipe declaring a `space` target;
 * `false` for a Space-less Recipe (ADR-0021).
 */
export function usesSpace(recipe: Recipe): boolean {
  return recipe.space !== undefined;
}
