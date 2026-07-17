/**
 * News Carousel brand-safety scanner — pure deep module (issue #81).
 *
 * Closes the gap the issue-60 salvage build report flagged: `brand-safety.ts`'s `collectTextFields`
 * only ever read the WIRED Recipe's own field names (`character_concepts`, `clips[].image_prompt`/
 * `video_prompt`/`concept_title`, `thumbnails`) — it had no idea a carousel Spec's `slides[]` existed,
 * so a carousel `image_prompt` (or any other slide text field) was never scanned for banned words.
 *
 * This module is the News Carousel Recipe's OWN collector, reusing `brand-safety.ts`'s shared
 * `scanTextFields` matching core (case-insensitive, whole-word) so the two Recipes' scans can never
 * drift on that rule — mirroring how `src/copy/validate.ts`'s composed-Copy scan already reuses the
 * same core. It covers EVERY free-text field a slide carries: `role`, `card_style`, `stat_callout`,
 * `text`, and `image_prompt` — not just the field the salvage build flagged, so a banned word hiding
 * in any authored slide text is caught, not only in the most obvious one.
 *
 * Pure and deterministic: no I/O. Never throws on shape — an untrusted/malformed Spec simply yields no
 * (or fewer) fields to scan; `news-carousel-validate.ts` is the module that rejects a malformed shape.
 */

import { scanTextFields, type BrandSafetyResult, type TextField } from "./brand-safety.ts";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every slide text field, in `slides[]` order — every string field a slide carries. */
const SLIDE_TEXT_KEYS = ["role", "card_style", "stat_callout", "text", "image_prompt"] as const;

/**
 * Collect every `{ field, text }` pair from a News Carousel Spec's `slides[]` — EVERY text-bearing
 * field on every slide, not only `image_prompt` (closes the issue-60 gap). Untrusted shape: anything
 * missing or wrongly-typed is simply skipped (the validator catches structural problems).
 */
function collectNewsCarouselTextFields(spec: unknown): TextField[] {
  const out: TextField[] = [];
  if (!isObject(spec)) return out;

  const slides = spec.slides;
  if (!Array.isArray(slides)) return out;

  slides.forEach((slide, i) => {
    if (!isObject(slide)) return;
    for (const key of SLIDE_TEXT_KEYS) {
      const value = slide[key];
      if (typeof value === "string") {
        out.push({ field: `slides[${i}].${key}`, text: value });
      }
    }
  });

  return out;
}

/**
 * Scan a News Carousel Production Spec for any of `bannedWords` (case-insensitive, whole-word), across
 * EVERY slide text field (`role`, `card_style`, `stat_callout`, `text`, `image_prompt`). Returns
 * `{ ok, hits }`. When `bannedWords` is empty the scan always passes.
 *
 * @param spec        the candidate News Carousel Production Spec (untrusted shape)
 * @param bannedWords the Brand Profile's banned words (from `brand-profile.ts`'s `loadBannedWords`)
 */
export function scanNewsCarouselForBannedWords(
  spec: unknown,
  bannedWords: readonly string[],
): BrandSafetyResult {
  return scanTextFields(collectNewsCarouselTextFields(spec), bannedWords);
}
