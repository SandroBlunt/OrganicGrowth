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
 */

import { generate as defaultGenerate, type Brief } from "./generate.ts";
import { validate, type ValidationError } from "./validate.ts";
import { scanForBannedWords, type BannedWordHit } from "./brand-safety.ts";
import { loadBannedWords, DEFAULT_BRAND_PROFILE_PATH } from "./brand-profile.ts";
import { saveSpec, specPathFor, DEFAULT_IDEAS_ROOT } from "./store.ts";
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
  /** Root dir holding `ideas/<run>/...` (defaults to `ideas`). */
  readonly ideasRoot?: string;
  /** Path to the Brand Profile YAML (defaults to `data/brand-profile.yaml`). */
  readonly brandProfilePath?: string;
  /** Injectable generator (defaults to the deterministic composer); enables fault-injection tests. */
  readonly generator?: (brief: Brief) => ProductionSpec | Record<string, unknown>;
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
  options: ComposeOptions = {},
): Promise<ComposeResult> {
  const ideasRoot = options.ideasRoot ?? DEFAULT_IDEAS_ROOT;
  const brandProfilePath = options.brandProfilePath ?? DEFAULT_BRAND_PROFILE_PATH;
  const generate = options.generator ?? defaultGenerate;
  const path = specPathFor(brief.id, brief.run, ideasRoot);

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
