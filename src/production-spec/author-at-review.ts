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
 *
 * **Widened per-Recipe self-check (issue #273).** `auditAuthorPhase` alone only runs GENERIC checks
 * (shape + banned words) — a Spec can be shape-valid, banned-word-clean, and still be obvious filler
 * (e.g. every slide sharing one `card_style`, every Shot List beat citing the same source host), which
 * is exactly what silently reached production before this ticket. `auditAuthoredSpec` below runs each
 * wired Recipe's OWN, richer author-phase checklist wherever it can run WITHOUT an input that is not yet
 * available at this point (a Format's Baseline Prompt document, needed by the News Carousel Recipe's
 * FULL checklist — `news-carousel-author-checklist.ts`'s own doc comment; that fuller check is the
 * interactive `produce-news-carousel` Skill's own job, later, once that document is read). Where a
 * Recipe has no such registered refinement (`character-explainer-with-cast` today), the generic
 * `auditAuthorPhase` still applies, unchanged. `command-surface/worker.ts`'s `runOneJob` also calls
 * `auditAuthoredSpec` (not `auditAuthorPhase` directly) for its own defense-in-depth check, so the two
 * remain the SAME bar, never two independently-drifting ones.
 */

import type { Recipe } from "../recipe/registry.ts";
import { auditAuthorPhase, type PhaseAuditResult } from "../recipe/phase-contract.ts";
import { generate as generateCharacterExplainerSpec, type Brief } from "./generate.ts";
import { generateNewsCarouselSpec } from "./news-carousel-generate.ts";
import { auditNewsCarouselStandaloneAuthorPhase } from "./news-carousel-author-checklist.ts";
import { generateNewsShortScriptSpec } from "./news-short-script-generate.ts";
import { auditNewsShortScriptAuthorPhase } from "./news-short-script-author-checklist.ts";

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

/** A Recipe's OWN, richer author-phase auditor, usable standalone — i.e. it needs no input that isn't
 *  already available at self-check time (a candidate Spec + the Brand's banned words). Registered per
 *  Recipe slug in `AUTHOR_PHASE_REFINERS` below (issue #273). */
type AuthorPhaseRefiner = (candidateSpec: unknown, bannedWords: readonly string[]) => PhaseAuditResult;

/**
 * Per-Recipe REFINEMENTS of the generic `auditAuthorPhase` (issue #273) — one entry per wired Recipe
 * whose OWN author-phase checklist can run right now, without a not-yet-available input:
 *
 *   - `news-carousel`: `auditNewsCarouselStandaloneAuthorPhase`, the Baseline-Prompt-INDEPENDENT subset
 *     of `news-carousel-author-checklist.ts`'s full checklist (its FULL checklist needs
 *     `NewsCarouselBaselineParams`, read from a Format's Baseline Prompt document — not yet resolved at
 *     this point; running the fuller check remains the interactive `produce-news-carousel` Skill's own
 *     later job).
 *   - `news-short-script`: `auditNewsShortScriptAuthorPhase`, its FULL checklist — it needs no Format-
 *     specific document at all, so nothing is held back here.
 *
 * `character-explainer-with-cast` has no entry — it keeps the plain generic `auditAuthorPhase` check,
 * unchanged; this ticket reported no filler defect for it.
 */
const AUTHOR_PHASE_REFINERS: Readonly<Record<string, AuthorPhaseRefiner>> = {
  "news-carousel": auditNewsCarouselStandaloneAuthorPhase,
  "news-short-script": auditNewsShortScriptAuthorPhase,
};

/**
 * Self-check `candidateSpec` against the FULLEST author-phase checklist mechanically available for
 * `recipe` right now (issue #273): that Recipe's own registered refinement
 * (`AUTHOR_PHASE_REFINERS`) when one exists, else the generic, cross-Recipe `auditAuthorPhase`
 * (`src/recipe/phase-contract.ts`). Exported so `command-surface/worker.ts`'s `runOneJob` runs the
 * IDENTICAL bar for its own defense-in-depth author-phase check — never a second, independently-drifting
 * notion of "does this Spec pass."
 */
export function auditAuthoredSpec(
  recipe: Recipe,
  candidateSpec: unknown,
  bannedWords: readonly string[],
): PhaseAuditResult {
  const refiner = AUTHOR_PHASE_REFINERS[recipe.slug];
  return refiner !== undefined
    ? refiner(candidateSpec, bannedWords)
    : auditAuthorPhase(recipe, { candidateSpec, bannedWords });
}

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
 * Author a candidate Production Spec for `recipe` from `brief`, then self-check it via `auditAuthoredSpec`
 * (that Recipe's OWN richer checklist where one is registered, else the generic `auditAuthorPhase`)
 * against `bannedWords`. Returns `{ ok: true, spec, audit }` when the audit passes (`spec` is the SAME
 * candidate the audit checked, never a second, re-derived copy), or `{ ok: false, audit }` naming every
 * failing checklist item otherwise. Never throws — an unregistered Recipe slug (in `authors`) degrades to
 * a named `{ ok: false }` result.
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
  const audit = auditAuthoredSpec(recipe, candidate, bannedWords);

  return audit.ok ? { ok: true, spec: candidate, audit } : { ok: false, audit };
}
