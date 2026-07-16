/**
 * `composeSpec` — orchestration shell for turning an accepted Brief into a saved Production Spec.
 *
 * Thin: it sequences the deep modules and enforces the gate that ONLY a valid, brand-safe Spec reaches
 * disk. All logic lives in the deep modules (`generate.ts`, `validate.ts`, `brand-safety.ts`) and the
 * I/O in `brand-profile.ts` / `store.ts`. No Magnific, no Apify, no network — this slice composes and
 * validates JSON and writes one file.
 *
 * The gate upholds two always-rules in behavior:
 *   - brand-safety (rule 9 / PRD story 30): a banned word never survives into a saved Spec;
 *   - bad Specs never reach the Space (PRD story 4): a Spec that fails `validate()` is never written.
 *
 * --- Recipe-generic since issue #60 ---
 *
 * `options.validator` is injectable (defaults to the WIRED Recipe's `validate` — unchanged behavior for
 * every existing caller). A different Recipe (e.g. the News Carousel, whose Spec shape is entirely
 * different) supplies its OWN validator — typically `recipe.specShape.validate` (`recipe/registry.ts`)
 * — alongside a matching `generator`; the gate above still enforces "no invalid/unsafe Spec ever
 * reaches disk", now for ANY Recipe's own contract, not just the wired one's.
 */

import { generate as defaultGenerate, type Brief } from "./generate.ts";
import { validate as defaultValidate, type ValidationError, type ValidationResult } from "./validate.ts";
import { scanForBannedWords, type BannedWordHit } from "./brand-safety.ts";
import { loadBannedWords } from "./brand-profile.ts";
import { saveSpec, specPathFor } from "./store.ts";
import type { ProductionSpec } from "./contract.ts";

/** Why a compose attempt did not write a Spec. */
export type ComposeFailureReason = "validation" | "brand-safety";

/** The outcome of composing (and attempting to persist) a Production Spec. */
export interface ComposeResult {
  /** Whether a Spec file was written. */
  readonly written: boolean;
  /** The path written (when `written`) or the path that would have been written. */
  readonly path: string;
  /** Why nothing was written, when `written` is false. */
  readonly reason?: ComposeFailureReason;
  /** Validation errors, when `reason === "validation"`. */
  readonly errors?: readonly ValidationError[];
  /** Banned-word hits, when `reason === "brand-safety"`. */
  readonly bannedHits?: readonly BannedWordHit[];
}

export interface ComposeOptions {
  /** REQUIRED: root dir holding `ideas/<run>/...` (e.g. `data/brands/<slug>/ideas`). No ambient
   *  default — the Spec is always written under the named Brand's own ideas tree, never a fallback. */
  readonly ideasRoot: string;
  /** REQUIRED: path to the Brand's Brand Profile YAML. No ambient/brand-scoped default — the
   *  brand-safety filter is always sourced from the named Brand's own profile, never a fallback's. */
  readonly brandProfilePath: string;
  /** REQUIRED: the chosen Recipe slug this Spec is composed for (issue #56, ADR-0011) — segments the
   *  saved path so a second Recipe of the same Idea does not overwrite this one's Spec. Never
   *  defaulted: the caller (the Operator's Review-time Recipe selection) always knows it explicitly. */
  readonly recipe: string;
  /** Injectable generator (defaults to the WIRED Recipe's deterministic composer); enables
   *  fault-injection tests AND a different Recipe's own Spec shape (`| object` widens beyond
   *  `Record<string, unknown>` for a plain interface like `NewsCarouselSpec` — issue #60). */
  readonly generator?: (brief: Brief) => ProductionSpec | Record<string, unknown> | object;
  /** Injectable validator (defaults to the WIRED Recipe's `validate`) — a different Recipe supplies its
   *  OWN spec-shape validator (typically `recipe.specShape.validate`, `recipe/registry.ts`; issue #60). */
  readonly validator?: (spec: unknown) => ValidationResult;
}

/**
 * Compose a Production Spec from an accepted Brief and persist it beside the Brief — but ONLY if it
 * passes `validate()` and the brand-safety filter. Returns a result describing what happened.
 *
 * @param brief   the accepted Brief
 * @param options paths + injectable generator
 */
export async function composeSpec(
  brief: Brief,
  options: ComposeOptions,
): Promise<ComposeResult> {
  const ideasRoot = options.ideasRoot;
  const brandProfilePath = options.brandProfilePath;
  const generate = options.generator ?? defaultGenerate;
  const validate = options.validator ?? defaultValidate;
  const path = specPathFor(brief.id, brief.run, ideasRoot, options.recipe);

  const spec = generate(brief);

  const validation = validate(spec);
  if (!validation.ok) {
    return { written: false, path, reason: "validation", errors: validation.errors };
  }

  const bannedWords = await loadBannedWords(brandProfilePath);
  const safety = scanForBannedWords(spec, bannedWords);
  if (!safety.ok) {
    return { written: false, path, reason: "brand-safety", bannedHits: safety.hits };
  }

  await saveSpec(spec, path);
  return { written: true, path };
}
