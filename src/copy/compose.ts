/**
 * `composeCopy` — orchestration shell wiring the Copy step's deep modules together (ADR-0012,
 * issue #58).
 *
 * Thin: draft (the injectable `CopyDrafter` — the producer's LLM job in production, a deterministic
 * fake in tests) → inject the Brand's required CTA/hashtags deterministically (`inject.ts`) → validate
 * against the chosen Recipe's copy shape + the Brand's rules (`validate.ts`, which itself re-points the
 * banned-word scan onto this composed Copy, reject-only). Mirrors `production-spec/compose.ts`'s own
 * shape (compose → validate → gate), but Copy has no Recipe-segmented file of its own — it is stored
 * STRUCTURED on the Asset by the CALLER (`src/asset/store.ts`'s `writeAsset`), not written to disk here.
 *
 * No Magnific, no Apify, no network. The only I/O is reading the Brand Profile
 * (`production-spec/brand-profile.ts`'s `loadCopyRules`).
 */

import { defaultDraftCopy, type CopyDrafter, type CopyInput } from "./draft.ts";
import { injectRequiredParts } from "./inject.ts";
import { validateCopy, type CopyValidationError } from "./validate.ts";
import { loadCopyRules } from "../production-spec/brand-profile.ts";
import type { Copy, CopyShape } from "./contract.ts";

export interface ComposeCopyOptions {
  /** REQUIRED: path to the Brand's Brand Profile YAML. No ambient default — the required CTA/hashtags
   *  and banned-word rules are always sourced from the named Brand's own profile. */
  readonly brandProfilePath: string;
  /** Injectable drafter (defaults to `defaultDraftCopy`); tests inject a deterministic FAKE standing
   *  in for the producer's LLM job — never a live model. */
  readonly drafter?: CopyDrafter;
}

/** The outcome of composing a Copy: either a validated, rule-conformant `Copy`, or the specific
 *  validation errors that stopped it (never partially applied — a failing Copy is never returned). */
export interface ComposeCopyResult {
  readonly ok: boolean;
  readonly copy?: Copy;
  readonly errors?: readonly CopyValidationError[];
}

/**
 * Compose a Copy for one Asset: draft it, deterministically inject the Brand's required CTA/hashtags,
 * then validate the result against `shape` (the chosen Recipe's own copy-shape params) and the Brand's
 * rules — INCLUDING the banned-word scan (reject-only; a banned word is never auto-edited, it fails the
 * whole compose). Only a Copy that passes validation is ever returned.
 *
 * @param input   the Idea's material + (when composing late, post-render) the realised media context
 * @param shape   the chosen Recipe's own copy-shape params (`Recipe.copyShape`)
 * @param options the Brand Profile path + an optional injectable drafter
 */
export async function composeCopy(
  input: CopyInput,
  shape: CopyShape,
  options: ComposeCopyOptions,
): Promise<ComposeCopyResult> {
  const drafter = options.drafter ?? defaultDraftCopy;
  const draft = drafter(input, shape);
  const rules = await loadCopyRules(options.brandProfilePath);
  const injected = injectRequiredParts(draft, rules);

  const validation = validateCopy(injected, shape, rules);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }
  return { ok: true, copy: injected };
}
