/**
 * Production Spec validator — pure deep module.
 *
 * Encodes the Space's `JSON master` contract (from `contract.ts`, the in-code schema/style summary —
 * NOT the truncated canvas node; see Spike 3) and rejects a malformed Spec BEFORE it could ever reach
 * the Space, so a bad Spec never wastes a run or credits (PRD #1 story 4).
 *
 * Pure and deterministic: no I/O, no clock, no Space, no network. Brand-safety (banned words) is a
 * separate concern in `brand-safety.ts`; this module only checks structural/contract conformance.
 * `post_copy` is RETIRED here (ADR-0012, issue #58) — Copy leaves the Spec entirely; its own
 * length/emoji/required-parts checks now live in `src/copy/validate.ts`, parameterized by the chosen
 * Recipe's own copy shape rather than a fixed contract constant.
 *
 * Every failure is returned as a `{ code, message }` so callers (and tests) can assert the SPECIFIC
 * reason, not just pass/fail.
 *
 * --- `ValidationResult`/`ValidationError` are the SHARED spec-validation shape (issue #60) ---
 *
 * `RecipeSpecShape.validate` (`src/recipe/registry.ts`) types EVERY Recipe's spec validator as
 * `(spec: unknown) => ValidationResult` — not just this WIRED contract's. `ValidationError.code` is
 * therefore typed as plain `string`, not the narrower `ValidationCode` union below: `validate()` here
 * only ever produces `ValidationCode` values (a subtype of `string`, so nothing here changes), but a
 * DIFFERENT Recipe (e.g. the News Carousel, `news-carousel-validate.ts`) has its OWN error-code
 * vocabulary and reuses these two interfaces rather than inventing a parallel, redundant pair.
 */

import {
  REQUIRED_CHARACTER_CONCEPTS,
  REQUIRED_CLIPS,
  REQUIRED_THUMBNAILS,
  ASPECT_RATIO_LINE,
} from "./contract.ts";

/** Stable, machine-checkable identifiers for each contract violation. */
export type ValidationCode =
  | "not_an_object"
  | "character_concepts_count"
  | "clips_count"
  | "clip_shape"
  | "thumbnails_missing"
  | "thumbnails_not_top_level"
  | "thumbnails_count";

/** One contract violation: a stable `code` plus a human-readable `message`. `code` is plain `string`
 *  (not narrowed to `ValidationCode`) so a DIFFERENT Recipe's validator can produce this same shape
 *  with its own codes (see the module docstring). `validate()` below only ever pushes `ValidationCode`
 *  values. */
export interface ValidationError {
  readonly code: string;
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
