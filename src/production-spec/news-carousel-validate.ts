/**
 * News Carousel Production-Spec validator — pure deep module (issue #60).
 *
 * Mirrors `validate.ts`'s shape/philosophy exactly (same `ValidationResult`/`ValidationError` types —
 * see that module's docstring for why `code` is plain `string`) but enforces the News Carousel Recipe's
 * OWN contract (`news-carousel-contract.ts`) instead of the wired Recipe's `character_concepts`/`clips`/
 * `thumbnails` shape. Pure and deterministic: no I/O, no clock, no Space, no network. Every failure is
 * returned as `{ code, message }`, never thrown, so callers/tests assert the SPECIFIC reason.
 */

import { MIN_SLIDES, MAX_SLIDES } from "./news-carousel-contract.ts";
import type { ValidationError, ValidationResult } from "./validate.ts";

/** Stable, machine-checkable identifiers for each News Carousel Spec contract violation. */
export type NewsCarouselValidationCode =
  | "not_an_object"
  | "slides_missing"
  | "slides_count"
  | "slide_shape"
  | "slide_index_invalid";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function err(code: NewsCarouselValidationCode, message: string): ValidationError {
  return { code, message };
}

/** Check one slide's shape: an object with a numeric `slide_index` and a non-empty `image_prompt`. */
function slideShapeError(slide: unknown, index: number): string | null {
  if (!isObject(slide)) {
    return `slides[${index}] must be an object with slide_index and image_prompt.`;
  }
  if (typeof slide.slide_index !== "number" || !Number.isInteger(slide.slide_index)) {
    return `slides[${index}] must have an integer slide_index.`;
  }
  if (typeof slide.image_prompt !== "string" || slide.image_prompt.trim().length === 0) {
    return `slides[${index}] must have a non-empty image_prompt.`;
  }
  return null;
}

/**
 * Validate a News Carousel Production Spec against the contract. Returns `{ ok, errors }`; never throws
 * on shape.
 *
 * @param spec the candidate Production Spec (untrusted shape — defensively narrowed)
 */
export function validateNewsCarouselSpec(spec: unknown): ValidationResult {
  const errors: ValidationError[] = [];

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
  if (!Array.isArray(slides) || slides.length < MIN_SLIDES || slides.length > MAX_SLIDES) {
    const got = Array.isArray(slides) ? slides.length : "not-an-array";
    errors.push(
      err(
        "slides_count",
        `slides must be an array of ${MIN_SLIDES}-${MAX_SLIDES} entries (got ${got}).`,
      ),
    );
    // A garbled/miscounted `slides` may still be worth per-entry shape-checking below (a test can
    // smuggle a single malformed slide inside an otherwise correctly-sized array), but a non-array
    // value has nothing further to check.
    if (!Array.isArray(slides)) {
      return { ok: false, errors };
    }
  }

  slides.forEach((slide, i) => {
    const reason = slideShapeError(slide, i);
    if (reason !== null) {
      errors.push(err("slide_shape", reason));
    }
  });

  // slide_index values must be exactly 1..N, each exactly once (order in the array does not matter —
  // `slideRunPointNames` sorts before driving), so the Producer can drive `Image Prompt Slide 1..N`
  // without a gap or a duplicate. Only checked once every slide has a numeric slide_index (a missing/
  // non-numeric one is already reported as `slide_shape` above — never double-counted here).
  const indices = slides
    .filter(isObject)
    .map((s) => s.slide_index)
    .filter((v): v is number => typeof v === "number");
  if (indices.length === slides.length) {
    const expectedCount = new Map(Array.from({ length: slides.length }, (_, i) => [i + 1, 0]));
    for (const idx of indices) {
      expectedCount.set(idx, (expectedCount.get(idx) ?? 0) + 1);
    }
    const allExactlyOnce = [...expectedCount.values()].every((count) => count === 1);
    if (!allExactlyOnce) {
      errors.push(
        err(
          "slide_index_invalid",
          `slide_index values must be exactly 1..${slides.length}, each exactly once (got ${JSON.stringify(indices)}).`,
        ),
      );
    }
  }

  return { ok: errors.length === 0, errors };
}
