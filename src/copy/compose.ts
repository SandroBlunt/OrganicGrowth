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
import { validateCopy, validateCopyForPlatform, type CopyValidationError } from "./validate.ts";
import { resolveCopyShapeForPlatform } from "./platform-shape.ts";
import { loadCopyRules, type Channel } from "../production-spec/brand-profile.ts";
import type { Copy, CopyShape, CopyVariant } from "./contract.ts";

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

// ---------------------------------------------------------------------------
// composeCopyForChannels — one variant per targeted Channel platform (issue #129, ADR-0019)
// ---------------------------------------------------------------------------

/** One targeted platform's compose failure — the validation errors that stopped THAT variant. */
export interface ComposeCopyVariantFailure {
  readonly platform: string;
  readonly errors: readonly CopyValidationError[];
}

/** The outcome of composing Copy for every targeted Channel: either a validated `Copy` (carrying
 *  `variants` when more than one Channel was targeted), or the specific per-platform failures that
 *  stopped it — never partially applied, mirroring `ComposeCopyResult`. */
export interface ComposeCopyForChannelsResult {
  readonly ok: boolean;
  readonly copy?: Copy;
  readonly errors?: readonly ComposeCopyVariantFailure[];
}

/**
 * Compose one Copy variant per targeted Channel platform (issue #129) — the SAME underlying
 * `CopyInput` material for every platform, each variant drafted and validated against THAT platform's
 * own bounds:
 *
 *   - the PRIMARY Channel keeps the chosen Recipe's OWN `baseShape` (`recipe.copyShape`) — the two
 *     wired Recipes never consult `platform-shape.ts`'s own bounds for their primary Facebook Channel
 *     (issue #128 AC3's documented rule, wired here for the first time);
 *   - every OTHER (non-primary) targeted Channel resolves its own documented bounds via
 *     `resolveCopyShapeForPlatform`/`validateCopyForPlatform`, falling back to `baseShape` for a
 *     platform `./platform-shape.ts` doesn't document.
 *
 * A Brand with NO Channel configured at all (a not-yet-migrated or misconfigured Brand Profile)
 * degrades to the exact single, unlabeled compose `composeCopy` already performs — never crashes (data-
 * handling rule 4). A Brand with EXACTLY ONE Channel produces a `Copy` with NO `variants` field at all —
 * byte-for-byte today's one-variant shape (AC1/AC5); this is provably identical to calling `composeCopy`
 * directly with the same `baseShape`, since the sole Channel is (by convention) `primary`, so the same
 * draft -> inject -> validate steps run against the same `baseShape`. A Brand targeting MULTIPLE
 * Channels returns a `Copy` whose top-level `caption`/`hashtags` mirror the PRIMARY Channel's own
 * variant (so every existing single-variant consumer keeps working unmodified) plus `variants` — ONE
 * entry per targeted platform, including the primary, each clearly labeled.
 *
 * Every targeted platform's failures are collected (never stops at the first) so a redraft can address
 * all of them at once, mirroring `write-social-copy`'s own "redraft on a soft miss" loop. Only a fully
 * valid set of variants is ever returned — a partially-valid result is never surfaced (mirrors
 * `composeCopy`'s own all-or-nothing contract).
 *
 * @param input    the Idea's material — the SAME material every platform's variant drafts from
 * @param baseShape the chosen Recipe's own copy-shape params (`Recipe.copyShape`)
 * @param channels the Brand's FULL Channel list (`src/production-spec/brand-profile.ts`'s
 *                 `channelsFrom`/`loadChannels`) — every entry's `platform`, not just the primary
 * @param options  the Brand Profile path + an optional injectable drafter
 */
export async function composeCopyForChannels(
  input: CopyInput,
  baseShape: CopyShape,
  channels: readonly Channel[],
  options: ComposeCopyOptions,
): Promise<ComposeCopyForChannelsResult> {
  const drafter = options.drafter ?? defaultDraftCopy;
  const rules = await loadCopyRules(options.brandProfilePath);

  if (channels.length === 0) {
    const draft = drafter(input, baseShape);
    const injected = injectRequiredParts(draft, rules);
    const validation = validateCopy(injected, baseShape, rules);
    if (!validation.ok) {
      return { ok: false, errors: [{ platform: "", errors: validation.errors }] };
    }
    return { ok: true, copy: injected };
  }

  const variants: CopyVariant[] = [];
  const failures: ComposeCopyVariantFailure[] = [];
  let primaryVariant: CopyVariant | null = null;

  for (const channel of channels) {
    const shape = channel.primary ? baseShape : resolveCopyShapeForPlatform(baseShape, channel.platform);
    const draft = drafter(input, shape);
    const injected = injectRequiredParts(draft, rules);
    const validation = channel.primary
      ? validateCopy(injected, shape, rules)
      : validateCopyForPlatform(injected, channel.platform, baseShape, rules);

    if (!validation.ok) {
      failures.push({ platform: channel.platform, errors: validation.errors });
      continue;
    }
    const variant: CopyVariant = { platform: channel.platform, caption: injected.caption, hashtags: injected.hashtags };
    variants.push(variant);
    if (channel.primary) primaryVariant = variant;
  }

  if (failures.length > 0) {
    return { ok: false, errors: failures };
  }

  const primary = primaryVariant ?? variants[0]!;
  if (channels.length === 1) {
    return { ok: true, copy: { caption: primary.caption, hashtags: primary.hashtags } };
  }

  return { ok: true, copy: { caption: primary.caption, hashtags: primary.hashtags, variants } };
}
