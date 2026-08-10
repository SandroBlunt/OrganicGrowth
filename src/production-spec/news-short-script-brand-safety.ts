/**
 * News Short Script brand-safety scanner — pure deep module (issue #174).
 *
 * Mirrors `news-carousel-brand-safety.ts`'s own pattern exactly: reuses `brand-safety.ts`'s shared
 * `scanTextFields` matching core (case-insensitive, whole-word) so this Recipe's scan can never drift
 * from every other Recipe's own scan on that rule. Covers EVERY free-text field a beat carries —
 * `text` (the teleprompter line), `show_cue`, `source_url`, and `media_url` (when present) — not just
 * the most obvious one (the same "closes the gap" reasoning issue #81 already applied to the News
 * Carousel Recipe's own `image_prompt`).
 *
 * Pure and deterministic: no I/O. Never throws on shape — an untrusted/malformed Spec simply yields no
 * (or fewer) fields to scan; `news-short-script-validate.ts` is the module that rejects a malformed
 * shape.
 */

import { scanTextFields, type BrandSafetyResult, type TextField } from "./brand-safety.ts";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every beat text field scanned, in `beats[]` order. */
const BEAT_TEXT_KEYS = ["text", "source_url", "media_url", "show_cue"] as const;

/**
 * Collect every `{ field, text }` pair from a News Short Script Spec's `beats[]` — every text-bearing
 * field on every beat. Untrusted shape: anything missing or wrongly-typed is simply skipped (the
 * validator catches structural problems).
 */
function collectNewsShortScriptTextFields(spec: unknown): TextField[] {
  const out: TextField[] = [];
  if (!isObject(spec)) return out;

  const beats = spec.beats;
  if (!Array.isArray(beats)) return out;

  beats.forEach((beat, i) => {
    if (!isObject(beat)) return;
    for (const key of BEAT_TEXT_KEYS) {
      const value = beat[key];
      if (typeof value === "string") {
        out.push({ field: `beats[${i}].${key}`, text: value });
      }
    }
  });

  return out;
}

/**
 * Scan a News Short Script Production Spec for any of `bannedWords` (case-insensitive, whole-word),
 * across EVERY beat text field (`text`, `source_url`, `media_url`, `show_cue`). Returns `{ ok, hits }`.
 * When `bannedWords` is empty the scan always passes.
 *
 * @param spec        the candidate News Short Script Production Spec (untrusted shape)
 * @param bannedWords the Brand Profile's banned words (from `brand-profile.ts`'s `loadBannedWords`)
 */
export function scanNewsShortScriptForBannedWords(
  spec: unknown,
  bannedWords: readonly string[],
): BrandSafetyResult {
  return scanTextFields(collectNewsShortScriptTextFields(spec), bannedWords);
}
