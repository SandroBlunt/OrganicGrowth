/**
 * `authorSpecForRecipe` — authors a candidate Production Spec and self-checks it in one call (ADR-0031,
 * issue #264).
 *
 * ADR-0031 moves Spec authorship to Review (accept time): the Operator accepts an Idea and chooses its
 * Recipes, and each chosen Recipe's Spec is authored and self-checked SYNCHRONOUSLY, right there, before
 * a job is ever enqueued. This module is that authoring step's deep, testable core — the orchestration
 * shell that calls it (`src/commands/accept-idea.ts`'s `acceptIdeaCommand`) stays thin.
 *
 * **Authoring is a Skill's job in production** — each Recipe's own `producerSkill`
 * (`src/recipe/registry.ts`) names the interactive, LLM-driven Skill that would write a richer, brief-
 * aware Spec inside an attended session. This module's `DEFAULT_SPEC_AUTHORS` map is a DETERMINISTIC,
 * hermetic STAND-IN for that Skill — mirroring `src/copy/draft.ts`'s `CopyDrafter`/`skillDraftCopy`
 * pattern exactly (a swappable function seam, injectable in tests, with a deterministic default that
 * always produces a Spec conformant with its own Recipe's contract). No model call, no I/O, no clock,
 * anywhere in this module.
 *
 * **Self-checking reuses the EXISTING `auditAuthorPhase`** (`src/recipe/phase-contract.ts`) — the SAME
 * function `command-surface/worker.ts`'s `runOneJob` already calls for its own (now defense-in-depth)
 * author-phase check. There is no second, parallel validation path: authoring at Review and authoring
 * inside an (imagined) attended session are held to literally the same bar.
 */

import type { Recipe } from "../recipe/registry.ts";
import { auditAuthorPhase, type PhaseAuditResult } from "../recipe/phase-contract.ts";
import { generate as generateCharacterExplainerSpec, type Brief } from "./generate.ts";
import { generateNewsCarouselSpec } from "./news-carousel-generate.ts";
import { generateNewsShortScriptSpec } from "./news-short-script-generate.ts";

export type { Brief };

/**
 * A Recipe's Spec author: given a minimal Brief, returns a candidate Production Spec in that Recipe's
 * OWN contract shape. In production this is that Recipe's `producerSkill` (an LLM authoring step); in
 * this module (and every test) it is a deterministic stand-in — NEVER a live model call. Mirrors
 * `src/copy/draft.ts`'s `CopyDrafter` exactly.
 */
export type SpecAuthor = (brief: Brief) => Record<string, unknown>;

/**
 * The default, deterministic Spec author per wired Recipe slug — one entry per
 * `src/recipe/registry.ts` entry, each mirroring that Recipe's OWN `producerSkill`. Every wired Recipe
 * SHALL have an entry here (`author-at-review.test.ts`'s own regression proof, checked against
 * `listWiredRecipeSlugs()`); a Recipe registered without a matching entry here is a build-time gap, not
 * a runtime one — `authorSpecForRecipe` degrades it to a clear, named failure rather than throwing.
 */
export const DEFAULT_SPEC_AUTHORS: Readonly<Record<string, SpecAuthor>> = {
  // Each generator returns its own Recipe-specific Spec interface (a plain JSON shape, structurally
  // compatible with `Record<string, unknown>` but not directly assignable to it under TS's `strict`
  // index-signature rule) — the cast is a type-level formality only, never a runtime transformation.
  "character-explainer-with-cast": (brief) => generateCharacterExplainerSpec(brief) as unknown as Record<string, unknown>,
  "news-carousel": (brief) => generateNewsCarouselSpec(brief) as unknown as Record<string, unknown>,
  "news-short-script": (brief) => generateNewsShortScriptSpec(brief) as unknown as Record<string, unknown>,
};

/** The outcome of authoring + self-checking one Recipe's Spec. */
export type AuthorSpecOutcome =
  | { readonly ok: true; readonly spec: Record<string, unknown>; readonly audit: PhaseAuditResult }
  | { readonly ok: false; readonly audit: PhaseAuditResult };

/** A synthetic failing audit for a Recipe slug with no registered author — never thrown, so a caller
 *  authoring several Recipes in a loop can report every failure rather than crashing on the first gap. */
function noAuthorAudit(recipe: Recipe): PhaseAuditResult {
  return {
    recipe: recipe.slug,
    phase: "author",
    ok: false,
    items: [
      {
        id: "no-author",
        description: `No Spec author is registered for Recipe "${recipe.slug}" (author-at-review.ts).`,
        kind: "mechanical",
        ok: false,
        detail: `Add "${recipe.slug}" to DEFAULT_SPEC_AUTHORS (or pass an explicit author override).`,
      },
    ],
  };
}

/**
 * Author a candidate Production Spec for `recipe` from `brief`, then self-check it via the EXISTING
 * `auditAuthorPhase` against `bannedWords`. Returns `{ ok: true, spec, audit }` when the audit passes
 * (`spec` is the SAME candidate the audit checked, never a second, re-derived copy), or `{ ok: false,
 * audit }` naming every failing checklist item otherwise. Never throws — an unregistered Recipe slug
 * (in `authors`) degrades to a named `{ ok: false }` result.
 *
 * @param recipe      the Recipe to author for (its OWN `specShape.validate`/`scanBannedWords` govern)
 * @param brief       a minimal Brief (`id`, `run`, `title`, optionally `angle`/`companies`)
 * @param bannedWords the Brand's banned words (`loadBannedWords`)
 * @param authors     override map, keyed by Recipe slug — defaults to `DEFAULT_SPEC_AUTHORS`; tests
 *                    inject a broken/missing author to prove the loud-failure path
 */
export function authorSpecForRecipe(
  recipe: Recipe,
  brief: Brief,
  bannedWords: readonly string[],
  authors: Readonly<Record<string, SpecAuthor>> = DEFAULT_SPEC_AUTHORS,
): AuthorSpecOutcome {
  const author = authors[recipe.slug];
  if (author === undefined) {
    return { ok: false, audit: noAuthorAudit(recipe) };
  }

  const candidate = author(brief);
  const audit = auditAuthorPhase(recipe, { candidateSpec: candidate, bannedWords });

  return audit.ok ? { ok: true, spec: candidate, audit } : { ok: false, audit };
}
