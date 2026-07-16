/**
 * Recipe offering + selection — pure deep module (issue #54).
 *
 * At Review, an Idea's Format carries `default_recipes` (pre-filled Recipe slugs — `FormatStore`,
 * ADR-0009). This module decides, GIVEN that pre-filled list and the Operator's final conversational
 * choice, which Recipes are actually **offered** (wired-only — AC4: an unwired Recipe is never
 * offered), which are **chosen**, and which of the offered Recipes were **declined** (present in the
 * pre-filled defaults but dropped by the Operator — logged verbatim, mirroring Rejection Reasons;
 * logged-only for v1, never auto-applied).
 *
 * Pure: no I/O, no ledger, no registry mutation — only reads `registry.ts`'s `isWiredRecipe`. The
 * `/review-ideas` orchestration (a markdown-driven conversation, not a TS shell) calls
 * `resolveRecipeSelection` with the Format's `default_recipes` and the Operator's final list, then
 * writes the result onto the ledger via `ledger.ts`'s `writeIdeaRecipeSelection`.
 */

import { isWiredRecipe } from "./registry.ts";

/** A Format's `default_recipes`, split into what CAN be offered (wired) vs what cannot (unwired). */
export interface OfferedRecipes {
  /** Wired Recipe slugs from `defaultRecipes`, in order — the ones actually pre-filled/offered. */
  readonly offered: readonly string[];
  /** Slugs from `defaultRecipes` that are NOT wired — never offered (AC4), kept only for visibility. */
  readonly unwired: readonly string[];
}

/**
 * Split a Format's `default_recipes` into the wired subset that can be offered at Review and the
 * unwired subset that can never be offered (issue #54 AC4). Pure; preserves input order; drops no
 * wired entry and never widens an unwired slug into an offer.
 */
export function offeredRecipes(defaultRecipes: readonly string[]): OfferedRecipes {
  const offered: string[] = [];
  const unwired: string[] = [];
  for (const slug of defaultRecipes) {
    if (isWiredRecipe(slug)) {
      offered.push(slug);
    } else {
      unwired.push(slug);
    }
  }
  return { offered, unwired };
}

/** The outcome of resolving the Operator's final Recipe choice against what was offered. */
export interface RecipeSelectionResult {
  /** The wired Recipe slugs the Operator actually wants produced, deduplicated, in requested order. */
  readonly chosen: readonly string[];
  /** Offered (wired, pre-filled) Recipe slugs the Operator did NOT keep — logged verbatim, not acted on. */
  readonly declined: readonly string[];
  /**
   * Anything the Operator asked to ADD that is not a wired Recipe (AC4: never offered, so it is never
   * added to `chosen` either) — surfaced so the conversation can tell the Operator it isn't available.
   */
  readonly ignoredUnwired: readonly string[];
}

/**
 * Resolve the Operator's final Recipe choice (after trimming/extending the pre-filled defaults
 * conversationally) against the Format's `defaultRecipes`. Pure.
 *
 * - `chosen` is `requested`, filtered to WIRED slugs only and deduplicated (an unwired slug the
 *   Operator asks to add is never offered in the first place — AC4 — so it never becomes `chosen`;
 *   it is reported in `ignoredUnwired` instead).
 * - `declined` is whatever was offered (the wired subset of `defaultRecipes`) but is NOT in `chosen`
 *   — these need a verbatim reason logged (mirrors Rejection Reasons; logged-only for v1).
 *
 * @param defaultRecipes the Idea's Format's pre-filled `default_recipes` (may include unwired slugs)
 * @param requested      the Operator's final list after trimming/extending conversationally
 */
export function resolveRecipeSelection(
  defaultRecipes: readonly string[],
  requested: readonly string[],
): RecipeSelectionResult {
  const { offered } = offeredRecipes(defaultRecipes);

  const chosen: string[] = [];
  const ignoredUnwired: string[] = [];
  for (const slug of requested) {
    if (!isWiredRecipe(slug)) {
      ignoredUnwired.push(slug);
      continue;
    }
    if (!chosen.includes(slug)) {
      chosen.push(slug);
    }
  }

  const declined = offered.filter((slug) => !chosen.includes(slug));

  return { chosen, declined, ignoredUnwired };
}
