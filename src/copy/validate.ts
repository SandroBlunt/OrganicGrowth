/**
 * Copy validator — the pure, hermetic "checker" half of the Copy step (ADR-0012, issue #58).
 *
 * ADR-0012 splits WRITING copy (the producer's LLM job — `draft.ts`, exercised against a fake/
 * deterministic drafter in tests, never a live model) from CHECKING it: this module is the checker —
 * pure, deterministic, no I/O, no clock, no Space, no network — so it runs fast in the unit suite every
 * time. It enforces, in ONE pass:
 *
 *   - length + emoji bounds, from the chosen Recipe's OWN `CopyShape` (no longer the fixed 180-char /
 *     1-3-emoji global constants `production-spec/contract.ts` used to own for `post_copy`);
 *   - the Brand's required CTA is present in the caption (`required_cta`);
 *   - the Brand's required hashtags are all present (`required_hashtags`);
 *   - the Brand's banned words are absent from EITHER the caption or any hashtag — REJECT-ONLY, never
 *     auto-edited (always-rule 9). This re-points the banned-word scan that used to run on the Spec's
 *     `post_copy` (`production-spec/brand-safety.ts`) onto the composed Copy instead, sharing the SAME
 *     `scanTextFields` core so the word-boundary/case-insensitivity rule can never drift between the two.
 *   - no em dash, en dash, or hyphen-used-as-a-dash appears in EITHER the caption or any hashtag
 *     (issue #108) — REJECT-ONLY, never auto-edited, exactly mirroring the banned-word rule above.
 *     Rewrite the offending clause as separate short sentences instead. Reuses `dash-safety.ts`'s
 *     `scanTextFieldsForDashes` against the SAME `fields` array the banned-word scan already builds.
 *
 * Every failure is returned as a `{ code, message }`, mirroring `production-spec/validate.ts`, so
 * callers (and tests) can assert the SPECIFIC reason, not just pass/fail.
 */

import { scanTextFields, type TextField } from "../production-spec/brand-safety.ts";
import { scanTextFieldsForDashes } from "../production-spec/dash-safety.ts";
import type { BrandCopyRules } from "../production-spec/brand-profile.ts";
import type { CopyShape } from "./contract.ts";

/** Stable, machine-checkable identifiers for each Copy contract violation. */
export type CopyValidationCode =
  | "not_an_object"
  | "caption_missing"
  | "caption_length"
  | "caption_emoji_count"
  | "hashtags_invalid"
  | "required_cta_missing"
  | "required_hashtag_missing"
  | "banned_word"
  | "dash_in_copy";

/** One Copy contract violation: a stable `code` plus a human-readable `message`. */
export interface CopyValidationError {
  readonly code: CopyValidationCode;
  readonly message: string;
}

/** The result of validating a composed Copy. */
export interface CopyValidationResult {
  readonly ok: boolean;
  readonly errors: readonly CopyValidationError[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Count emoji in a string. Uses `Intl.Segmenter` to count grapheme clusters whose first code point is
 * an emoji presentation character — this treats a ZWJ-joined / variation-selector / skin-tone emoji as
 * ONE emoji (e.g. "☀️" counts once, not twice for the variation selector). Mirrors the emoji-counting
 * rule the old `production-spec/validate.ts` used for `post_copy`, before ADR-0012 retired it there.
 */
function countEmojis(text: string): number {
  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  let count = 0;
  for (const { segment } of segmenter.segment(text)) {
    const first = segment.codePointAt(0);
    if (first === undefined) continue;
    const head = String.fromCodePoint(first);
    if (/\p{Extended_Pictographic}/u.test(head)) {
      count += 1;
    }
  }
  return count;
}

/** Strip a leading `#` and lower-case, so hashtag presence checks are agnostic to the `#` and case. */
function normalizeHashtag(tag: string): string {
  const trimmed = tag.trim();
  return (trimmed.startsWith("#") ? trimmed.slice(1) : trimmed).toLowerCase();
}

/**
 * Validate a composed Copy against `shape` (the chosen Recipe's own length/emoji bounds) and `rules`
 * (the Brand's required CTA / required hashtags / banned words). Returns `{ ok, errors }`; never throws
 * on shape — an untrusted/garbled `copy` value is reported, not thrown.
 *
 * @param copy  the candidate composed Copy (untrusted shape — defensively narrowed)
 * @param shape the chosen Recipe's own copy-shape params (`Recipe.copyShape`)
 * @param rules the Brand's copy rules (`production-spec/brand-profile.ts`'s `loadCopyRules`)
 */
export function validateCopy(
  copy: unknown,
  shape: CopyShape,
  rules: BrandCopyRules,
): CopyValidationResult {
  const errors: CopyValidationError[] = [];

  if (!isObject(copy)) {
    return {
      ok: false,
      errors: [{ code: "not_an_object", message: "Copy must be an object." }],
    };
  }

  const caption = copy.caption;
  let captionText: string | null = null;
  if (typeof caption !== "string" || caption.trim().length === 0) {
    errors.push({
      code: "caption_missing",
      message: "caption is required and must be a non-empty string.",
    });
  } else {
    captionText = caption;
    if ([...caption].length > shape.maxChars) {
      errors.push({
        code: "caption_length",
        message: `caption must be at most ${shape.maxChars} characters (got ${[...caption].length}).`,
      });
    }
    const emojis = countEmojis(caption);
    if (emojis < shape.minEmojis || emojis > shape.maxEmojis) {
      errors.push({
        code: "caption_emoji_count",
        message: `caption must contain ${shape.minEmojis}-${shape.maxEmojis} emojis (got ${emojis}).`,
      });
    }
    if (rules.requiredCta !== null && !caption.toLowerCase().includes(rules.requiredCta.toLowerCase())) {
      errors.push({
        code: "required_cta_missing",
        message: `caption must include the required CTA "${rules.requiredCta}".`,
      });
    }
  }

  const hashtagsRaw = copy.hashtags;
  let hashtags: readonly string[] | null = null;
  if (!Array.isArray(hashtagsRaw) || hashtagsRaw.some((h) => typeof h !== "string")) {
    errors.push({
      code: "hashtags_invalid",
      message: "hashtags must be an array of strings.",
    });
  } else {
    hashtags = hashtagsRaw;
    const normalized = new Set(hashtags.map(normalizeHashtag));
    for (const required of rules.requiredHashtags) {
      if (!normalized.has(normalizeHashtag(required))) {
        errors.push({
          code: "required_hashtag_missing",
          message: `hashtags must include the required hashtag "${required}".`,
        });
      }
    }
  }

  // Banned words — reject-only, re-pointed onto the composed Copy's own fields (ADR-0012).
  const fields: TextField[] = [
    ...(captionText !== null ? [{ field: "caption", text: captionText }] : []),
    ...(hashtags ?? []).map((text, i) => ({ field: `hashtags[${i}]`, text })),
  ];
  const safety = scanTextFields(fields, rules.bannedWords);
  for (const hit of safety.hits) {
    errors.push({
      code: "banned_word",
      message: `banned word "${hit.word}" found in ${hit.field}.`,
    });
  }

  // Em dash / en dash / hyphen-used-as-a-dash — reject-only, an AI "tell" that hurts scannability
  // (issue #108). Rewrite as separate short sentences instead — never a silent substitution.
  const dashes = scanTextFieldsForDashes(fields);
  for (const hit of dashes.hits) {
    errors.push({
      code: "dash_in_copy",
      message:
        `dash "${hit.match}" found in ${hit.field} — rewrite as separate short sentences instead ` +
        "(an em dash, en dash, or hyphen used as a sentence dash is never allowed in Copy).",
    });
  }

  return { ok: errors.length === 0, errors };
}
