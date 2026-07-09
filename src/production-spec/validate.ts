/**
 * Production Spec validator — pure deep module.
 *
 * Encodes the Space's `JSON master` contract (from `contract.ts`, the in-code schema/style summary —
 * NOT the truncated canvas node; see Spike 3) and rejects a malformed Spec BEFORE it could ever reach
 * the Space, so a bad Spec never wastes a run or credits (PRD #1 story 4).
 *
 * Pure and deterministic: no I/O, no clock, no Space, no network. Brand-safety (banned words) is a
 * separate concern in `brand-safety.ts`; this module only checks structural/contract conformance.
 *
 * Every failure is returned as a `{ code, message }` so callers (and tests) can assert the SPECIFIC
 * reason, not just pass/fail.
 */

import {
  REQUIRED_CHARACTER_CONCEPTS,
  REQUIRED_CLIPS,
  REQUIRED_THUMBNAILS,
  MAX_POST_COPY_CHARS,
  MIN_POST_COPY_EMOJIS,
  MAX_POST_COPY_EMOJIS,
  ASPECT_RATIO_LINE,
} from "./contract.ts";

/** Stable, machine-checkable identifiers for each contract violation. */
export type ValidationCode =
  | "not_an_object"
  | "character_concepts_count"
  | "clips_count"
  | "clip_shape"
  | "post_copy_missing"
  | "post_copy_not_top_level"
  | "post_copy_length"
  | "post_copy_emoji_count"
  | "thumbnails_missing"
  | "thumbnails_not_top_level"
  | "thumbnails_count";

/** One contract violation: a stable `code` plus a human-readable `message`. */
export interface ValidationError {
  readonly code: ValidationCode;
  readonly message: string;
}

/** The result of validating a Production Spec. */
export interface ValidationResult {
  readonly ok: boolean;
  readonly errors: readonly ValidationError[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Count emoji in a string. Uses `Intl.Segmenter` to count grapheme clusters whose first code point is
 * an emoji presentation character — this treats a ZWJ-joined / variation-selector / skin-tone emoji as
 * ONE emoji (e.g. "☀️" counts once, not twice for the variation selector).
 */
function countEmojis(text: string): number {
  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  let count = 0;
  for (const { segment } of segmenter.segment(text)) {
    const first = segment.codePointAt(0);
    if (first === undefined) continue;
    const head = String.fromCodePoint(first);
    // Extended_Pictographic covers emoji base characters; exclude plain digits/`#`/`*` which carry the
    // property only when followed by an emoji keycap (not relevant for post copy).
    if (/\p{Extended_Pictographic}/u.test(head)) {
      count += 1;
    }
  }
  return count;
}

/** Whether any clip object carries a key that must be TOP-LEVEL on the Spec. */
function someClipHasKey(clips: unknown, key: string): boolean {
  if (!Array.isArray(clips)) return false;
  return clips.some((c) => isObject(c) && key in c);
}

/**
 * Check one clip against the per-clip contract (`SpecClip` in `contract.ts`): a string `id`, a numeric
 * `clip_id`, a non-empty `concept_title`, a non-empty `image_prompt` that ENDS WITH the Space's 9:16
 * aspect-ratio line, and a non-empty `video_prompt`. Returns a human-readable reason on the first
 * violation, or `null` when the clip conforms. Guards contents so a Spec like `clips: [1, 2, 3]` (right
 * count, wrong shape) can never reach the Space (PRD #1 story 4).
 */
function clipContractError(clip: unknown, index: number): string | null {
  if (!isObject(clip)) {
    return `clip ${index} must be an object with the clip fields.`;
  }
  if (typeof clip.id !== "string" || clip.id.length === 0) {
    return `clip ${index} must have a non-empty string id.`;
  }
  if (typeof clip.clip_id !== "number") {
    return `clip ${index} must have a numeric clip_id.`;
  }
  if (typeof clip.concept_title !== "string" || clip.concept_title.length === 0) {
    return `clip ${index} must have a non-empty concept_title.`;
  }
  if (typeof clip.image_prompt !== "string" || clip.image_prompt.length === 0) {
    return `clip ${index} must have a non-empty image_prompt.`;
  }
  if (!clip.image_prompt.endsWith(ASPECT_RATIO_LINE)) {
    return `clip ${index} image_prompt must end with "${ASPECT_RATIO_LINE}".`;
  }
  if (typeof clip.video_prompt !== "string" || clip.video_prompt.length === 0) {
    return `clip ${index} must have a non-empty video_prompt.`;
  }
  return null;
}

/**
 * Validate a Production Spec against the contract. Returns `{ ok, errors }`; never throws on shape.
 *
 * @param spec the candidate Production Spec (untrusted shape — defensively narrowed)
 */
export function validate(spec: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isObject(spec)) {
    return {
      ok: false,
      errors: [
        { code: "not_an_object", message: "Production Spec must be a JSON object." },
      ],
    };
  }

  // character_concepts — exactly 3
  const concepts = spec.character_concepts;
  if (!Array.isArray(concepts) || concepts.length !== REQUIRED_CHARACTER_CONCEPTS) {
    const got = Array.isArray(concepts) ? concepts.length : "missing";
    errors.push({
      code: "character_concepts_count",
      message: `character_concepts must have exactly ${REQUIRED_CHARACTER_CONCEPTS} entries (got ${got}).`,
    });
  }

  // clips — exactly 3, and each must satisfy the per-clip contract (not just be present)
  const clips = spec.clips;
  if (!Array.isArray(clips) || clips.length !== REQUIRED_CLIPS) {
    const got = Array.isArray(clips) ? clips.length : "missing";
    errors.push({
      code: "clips_count",
      message: `clips must have exactly ${REQUIRED_CLIPS} entries (got ${got}).`,
    });
  }
  if (Array.isArray(clips)) {
    clips.forEach((clip, i) => {
      const reason = clipContractError(clip, i);
      if (reason !== null) {
        errors.push({ code: "clip_shape", message: reason });
      }
    });
  }

  // post_copy — top-level string, <=180 chars, 1-3 emojis
  const postCopy = spec.post_copy;
  if (typeof postCopy !== "string") {
    // If it is missing at top level but nested in a clip, that's the more specific "not top level".
    if (someClipHasKey(clips, "post_copy")) {
      errors.push({
        code: "post_copy_not_top_level",
        message: "post_copy must be a TOP-LEVEL field, not nested inside a clip.",
      });
    } else {
      errors.push({
        code: "post_copy_missing",
        message: "post_copy is required and must be a top-level string.",
      });
    }
  } else {
    if ([...postCopy].length > MAX_POST_COPY_CHARS) {
      errors.push({
        code: "post_copy_length",
        message: `post_copy must be at most ${MAX_POST_COPY_CHARS} characters (got ${[...postCopy].length}).`,
      });
    }
    const emojis = countEmojis(postCopy);
    if (emojis < MIN_POST_COPY_EMOJIS || emojis > MAX_POST_COPY_EMOJIS) {
      errors.push({
        code: "post_copy_emoji_count",
        message: `post_copy must contain ${MIN_POST_COPY_EMOJIS}-${MAX_POST_COPY_EMOJIS} emojis (got ${emojis}).`,
      });
    }
  }

  // thumbnails — top-level array of (exactly 3) prompts
  const thumbnails = spec.thumbnails;
  if (!("thumbnails" in spec) || thumbnails === undefined) {
    if (someClipHasKey(clips, "thumbnails")) {
      errors.push({
        code: "thumbnails_not_top_level",
        message: "thumbnails must be a TOP-LEVEL field, not nested inside a clip.",
      });
    } else {
      errors.push({
        code: "thumbnails_missing",
        message: "thumbnails is required and must be a top-level array.",
      });
    }
  } else if (!Array.isArray(thumbnails) || thumbnails.length !== REQUIRED_THUMBNAILS) {
    const got = Array.isArray(thumbnails) ? thumbnails.length : "not-an-array";
    errors.push({
      code: "thumbnails_count",
      message: `thumbnails must be a top-level array of exactly ${REQUIRED_THUMBNAILS} prompts (got ${got}).`,
    });
  }

  return { ok: errors.length === 0, errors };
}
