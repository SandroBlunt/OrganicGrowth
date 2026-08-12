/**
 * News Short Script Production-Spec validator — pure deep module (issue #174, ADR-0021).
 *
 * Mirrors `news-carousel-validate.ts`'s shape/philosophy exactly (the SAME `ValidationResult`/
 * `ValidationError` types) but enforces the News Short Script Recipe's OWN contract
 * (`news-short-script-contract.ts`): an ordered `beats` array — `"hook"` first, `"cta"` last, at least
 * one `"story"` beat between them — a well-formed Shot List entry on every beat, and a whole-Spec total
 * word count in `[MIN_TOTAL_WORDS, MAX_TOTAL_WORDS]` (the "~120-150 words" 45-60-second target).
 * Brand-safety (banned words) is a separate concern in `news-short-script-brand-safety.ts` — this module
 * only checks structural/contract conformance. Pure and deterministic: no I/O, no clock, no Space, no
 * network. Every failure is returned as `{ code, message }`, never thrown.
 */

import {
  NEWS_SHORT_SCRIPT_ROLES,
  MIN_STORY_BEATS,
  MIN_TOTAL_WORDS,
  MAX_TOTAL_WORDS,
  MIN_CURIOSITY_QUERIES,
  MAX_CURIOSITY_QUERIES,
  countWords,
  type NewsShortScriptRole,
} from "./news-short-script-contract.ts";
import type { ValidationError, ValidationResult } from "./validate.ts";

/** Stable, machine-checkable identifiers for each News Short Script Spec contract violation. */
export type NewsShortScriptValidationCode =
  | "not_an_object"
  | "beats_missing"
  | "beats_empty"
  | "beat_shape"
  | "beat_role_invalid"
  | "beat_role_order"
  | "source_url_invalid"
  | "media_url_invalid"
  | "curiosity_queries_invalid"
  | "word_count_out_of_range";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** A loose "looks like an http(s) URL" check — permissive on purpose (never rejects a real-world URL
 *  over query strings/fragments/ports); only catches an obviously-non-URL value. */
function looksLikeUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

function err(code: NewsShortScriptValidationCode, message: string): ValidationError {
  return { code, message };
}

const VALID_ROLES: ReadonlySet<string> = new Set(NEWS_SHORT_SCRIPT_ROLES);

/**
 * Check one beat's required-fields shape (everything but role-order alignment, which the caller checks
 * once every beat's basic shape is known-good). Returns a human-readable reason on the first violation
 * found, or `null` when the beat conforms.
 */
function beatShapeError(beat: unknown, index: number): string | null {
  if (!isObject(beat)) {
    return `beats[${index}] must be an object with the beat fields.`;
  }
  if (typeof beat.role !== "string" || !VALID_ROLES.has(beat.role)) {
    return `beats[${index}] must have a role of "hook", "story", or "cta" (got ${JSON.stringify(beat.role)}).`;
  }
  if (!isNonEmptyString(beat.text)) {
    return `beats[${index}] must have a non-empty string text.`;
  }
  if (!isNonEmptyString(beat.source_url)) {
    return `beats[${index}] must have a non-empty string source_url.`;
  }
  if (!looksLikeUrl(beat.source_url)) {
    return `beats[${index}].source_url must look like an http(s) URL (got ${JSON.stringify(beat.source_url)}).`;
  }
  if (beat.media_url !== undefined) {
    if (typeof beat.media_url !== "string" || beat.media_url.trim().length === 0) {
      return `beats[${index}].media_url, when present, must be a non-empty string.`;
    }
    if (!looksLikeUrl(beat.media_url)) {
      return `beats[${index}].media_url must look like an http(s) URL (got ${JSON.stringify(beat.media_url)}).`;
    }
  }
  if (!isNonEmptyString(beat.show_cue)) {
    return `beats[${index}] must have a non-empty string show_cue.`;
  }
  if (!Array.isArray(beat.curiosity_queries)) {
    return `beats[${index}] must have a curiosity_queries array of ${MIN_CURIOSITY_QUERIES}-` +
      `${MAX_CURIOSITY_QUERIES} suggested search queries.`;
  }
  if (
    beat.curiosity_queries.length < MIN_CURIOSITY_QUERIES ||
    beat.curiosity_queries.length > MAX_CURIOSITY_QUERIES
  ) {
    return `beats[${index}].curiosity_queries must have ${MIN_CURIOSITY_QUERIES}-${MAX_CURIOSITY_QUERIES} ` +
      `entries (got ${beat.curiosity_queries.length}).`;
  }
  if (!beat.curiosity_queries.every((q: unknown) => typeof q === "string" && q.trim().length > 0)) {
    return `beats[${index}].curiosity_queries must contain only non-empty strings.`;
  }
  return null;
}

/**
 * Validate a News Short Script Production Spec against the contract. Returns `{ ok, errors }`; never
 * throws on shape.
 *
 * @param spec the candidate Production Spec (untrusted shape — defensively narrowed)
 */
export function validateNewsShortScriptSpec(spec: unknown): ValidationResult {
  if (!isObject(spec)) {
    return { ok: false, errors: [err("not_an_object", "Production Spec must be a JSON object.")] };
  }

  const beats = spec.beats;
  if (!("beats" in spec) || beats === undefined) {
    return { ok: false, errors: [err("beats_missing", "beats is required and must be a top-level array.")] };
  }
  if (!Array.isArray(beats)) {
    return { ok: false, errors: [err("beats_empty", "beats must be a non-empty array (got not-an-array).")] };
  }
  if (beats.length === 0) {
    return { ok: false, errors: [err("beats_empty", "beats must be a non-empty array.")] };
  }

  const errors: ValidationError[] = [];
  let wellFormed = true;

  beats.forEach((beat, i) => {
    const shapeReason = beatShapeError(beat, i);
    if (shapeReason !== null) {
      wellFormed = false;
      const code: NewsShortScriptValidationCode = shapeReason.includes("source_url must look like")
        ? "source_url_invalid"
        : shapeReason.includes("media_url must look like") || shapeReason.includes("media_url, when present")
          ? "media_url_invalid"
          : shapeReason.includes("must have a role of")
            ? "beat_role_invalid"
            : shapeReason.includes("curiosity_queries")
              ? "curiosity_queries_invalid"
              : "beat_shape";
      errors.push(err(code, shapeReason));
    }
  });

  if (!wellFormed) {
    // Nothing reliable left to compare role-order/word-count against a malformed beat set.
    return { ok: false, errors };
  }

  const roles = (beats as ReadonlyArray<{ role: NewsShortScriptRole }>).map((b) => b.role);
  const first = roles[0];
  const last = roles[roles.length - 1];
  const middle = roles.slice(1, -1);

  if (first !== "hook") {
    errors.push(err("beat_role_order", `beats[0].role must be "hook" (got ${JSON.stringify(first)}).`));
  }
  if (last !== "cta") {
    errors.push(
      err("beat_role_order", `beats[${roles.length - 1}].role must be "cta" (got ${JSON.stringify(last)}).`),
    );
  }
  const storyBeats = middle.filter((r) => r === "story").length;
  if (storyBeats < MIN_STORY_BEATS || middle.some((r) => r !== "story")) {
    errors.push(
      err(
        "beat_role_order",
        `beats between the hook and the cta must all be "story" (at least ${MIN_STORY_BEATS}) — ` +
          `got roles [${middle.join(", ")}].`,
      ),
    );
  }

  const totalWords = (beats as ReadonlyArray<{ text: string }>).reduce(
    (sum, b) => sum + countWords(b.text),
    0,
  );
  if (totalWords < MIN_TOTAL_WORDS || totalWords > MAX_TOTAL_WORDS) {
    errors.push(
      err(
        "word_count_out_of_range",
        `beats' text SHALL total ${MIN_TOTAL_WORDS}-${MAX_TOTAL_WORDS} words (got ${totalWords}).`,
      ),
    );
  }

  return { ok: errors.length === 0, errors };
}
