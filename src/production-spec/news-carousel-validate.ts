/**
 * News Carousel Production-Spec validator — pure deep module (issue #81, map ticket #77).
 *
 * Mirrors `validate.ts`'s shape/philosophy exactly (the SAME `ValidationResult`/`ValidationError`
 * types — see that module's docstring for why `code` is plain `string`) but enforces the News
 * Carousel Recipe's OWN contract (`news-carousel-contract.ts`) instead of the wired Recipe's
 * `character_concepts`/`clips`/`thumbnails` shape. Pure and deterministic: no I/O, no clock, no
 * Space, no network. Brand-safety (banned words, including in `image_prompt`) is a separate concern
 * in `news-carousel-brand-safety.ts` — this module only checks structural/contract conformance. Every
 * failure is returned as `{ code, message }`, never thrown, so callers/tests assert the SPECIFIC
 * reason.
 */

import {
  CAROUSEL_SLIDE_COUNT,
  CAROUSEL_ROLES,
  CAROUSEL_TEXT_MAX_CHARS,
} from "./news-carousel-contract.ts";
import type { ValidationError, ValidationResult } from "./validate.ts";

/** Stable, machine-checkable identifiers for each News Carousel Spec contract violation. */
export type NewsCarouselValidationCode =
  | "not_an_object"
  | "slides_missing"
  | "slides_count"
  | "slide_shape"
  | "slide_text_too_long"
  | "slide_role_order"
  | "slide_index_invalid";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function err(code: NewsCarouselValidationCode, message: string): ValidationError {
  return { code, message };
}

/**
 * Check one slide's required-fields shape (everything but role-order/slide_index alignment, which the
 * caller checks once every slide's basic shape is known-good). Returns a human-readable reason on the
 * first violation, or `null` when the slide conforms.
 */
function slideShapeError(slide: unknown, index: number): string | null {
  if (!isObject(slide)) {
    return `slides[${index}] must be an object with the slide fields.`;
  }
  if (typeof slide.slide_index !== "number" || !Number.isInteger(slide.slide_index)) {
    return `slides[${index}] must have an integer slide_index.`;
  }
  if (typeof slide.role !== "string" || slide.role.trim().length === 0) {
    return `slides[${index}] must have a non-empty string role.`;
  }
  if (typeof slide.card_style !== "string" || slide.card_style.trim().length === 0) {
    return `slides[${index}] must have a non-empty string card_style.`;
  }
  if (typeof slide.stat_callout !== "string" || slide.stat_callout.trim().length === 0) {
    return `slides[${index}] must have a non-empty string stat_callout.`;
  }
  if (typeof slide.text !== "string" || slide.text.trim().length === 0) {
    return `slides[${index}] must have a non-empty string text.`;
  }
  if (typeof slide.image_prompt !== "string" || slide.image_prompt.trim().length === 0) {
    return `slides[${index}] must have a non-empty string image_prompt.`;
  }
  return null;
}

/**
 * Validate a News Carousel Production Spec against the contract. Returns `{ ok, errors }`; never
 * throws on shape.
 *
 * @param spec the candidate Production Spec (untrusted shape — defensively narrowed)
 */
export function validateNewsCarouselSpec(spec: unknown): ValidationResult {
  if (!isObject(spec)) {
    return { ok: false, errors: [err("not_an_object", "Production Spec must be a JSON object.")] };
  }

  const slides = spec.slides;
  if (!("slides" in spec) || slides === undefined) {
    return {
      ok: false,
      errors: [err("slides_missing", "slides is required and must be a top-level array.")],
    };
  }
  if (!Array.isArray(slides)) {
    return {
      ok: false,
      errors: [
        err(
          "slides_count",
          `slides must be an array of exactly ${CAROUSEL_SLIDE_COUNT} entries (got not-an-array).`,
        ),
      ],
    };
  }

  const errors: ValidationError[] = [];
  if (slides.length !== CAROUSEL_SLIDE_COUNT) {
    errors.push(
      err(
        "slides_count",
        `slides must be an array of exactly ${CAROUSEL_SLIDE_COUNT} entries (got ${slides.length}).`,
      ),
    );
  }

  slides.forEach((slide, i) => {
    const shapeReason = slideShapeError(slide, i);
    if (shapeReason !== null) {
      errors.push(err("slide_shape", shapeReason));
      return; // nothing reliable left to compare on a malformed slide
    }
    const s = slide as Record<string, unknown>;

    if (typeof s.text === "string" && s.text.length > CAROUSEL_TEXT_MAX_CHARS) {
      errors.push(
        err(
          "slide_text_too_long",
          `slides[${i}] text must be at most ${CAROUSEL_TEXT_MAX_CHARS} chars (got ${s.text.length}).`,
        ),
      );
    }

    const expectedRole: string | undefined = CAROUSEL_ROLES[i];
    if (expectedRole !== undefined && s.role !== expectedRole) {
      errors.push(
        err(
          "slide_role_order",
          `slides[${i}] must have role ${JSON.stringify(expectedRole)} (fixed order ` +
            `${CAROUSEL_ROLES.join(" -> ")}; got ${JSON.stringify(s.role)}).`,
        ),
      );
    }
    if (s.slide_index !== i) {
      errors.push(
        err(
          "slide_index_invalid",
          `slides[${i}] must have slide_index ${i} (got ${JSON.stringify(s.slide_index)}).`,
        ),
      );
    }
  });

  return { ok: errors.length === 0, errors };
}
