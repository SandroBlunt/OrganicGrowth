import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { validateNewsCarouselSpec, type NewsCarouselValidationCode } from "./news-carousel-validate.ts";
import {
  validNewsCarouselSpec,
  tooFewSlides,
  tooManySlides,
  duplicateSlideIndex,
  gapInSlideIndex,
  slideMissingPrompt,
  missingSlides,
} from "./fixtures/news-carousel-specs.ts";

function hasCode(
  result: ReturnType<typeof validateNewsCarouselSpec>,
  code: NewsCarouselValidationCode,
): boolean {
  return result.errors.some((e) => e.code === code);
}

describe("validateNewsCarouselSpec — well-formed Spec", () => {
  it("accepts a valid 5-slide Spec with no errors", () => {
    const result = validateNewsCarouselSpec(validNewsCarouselSpec(5));
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  it("accepts a valid 6-slide Spec", () => {
    assert.equal(validateNewsCarouselSpec(validNewsCarouselSpec(6)).ok, true);
  });

  it("accepts a valid 7-slide Spec", () => {
    assert.equal(validateNewsCarouselSpec(validNewsCarouselSpec(7)).ok, true);
  });
});

describe("validateNewsCarouselSpec — not an object", () => {
  it("rejects null/array/primitive input", () => {
    assert.equal(hasCode(validateNewsCarouselSpec(null), "not_an_object"), true);
    assert.equal(hasCode(validateNewsCarouselSpec([1, 2, 3]), "not_an_object"), true);
    assert.equal(hasCode(validateNewsCarouselSpec("nope"), "not_an_object"), true);
  });
});

describe("validateNewsCarouselSpec — slides presence + count", () => {
  it("rejects a Spec with no slides field", () => {
    const result = validateNewsCarouselSpec(missingSlides());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "slides_missing"), true);
  });

  it("rejects 4 slides (below the minimum of 5)", () => {
    assert.equal(hasCode(validateNewsCarouselSpec(tooFewSlides()), "slides_count"), true);
  });

  it("rejects 8 slides (above the maximum of 7)", () => {
    assert.equal(hasCode(validateNewsCarouselSpec(tooManySlides()), "slides_count"), true);
  });
});

describe("validateNewsCarouselSpec — per-slide shape", () => {
  it("rejects a slide missing its image_prompt", () => {
    const result = validateNewsCarouselSpec(slideMissingPrompt());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "slide_shape"), true);
  });

  it("rejects a slide that is not an object", () => {
    const spec = validNewsCarouselSpec(5);
    const broken = { slides: [...spec.slides.slice(0, 4), "not-an-object"] };
    assert.equal(hasCode(validateNewsCarouselSpec(broken), "slide_shape"), true);
  });
});

describe("validateNewsCarouselSpec — slide_index contiguity", () => {
  it("rejects a duplicated slide_index (and the resulting gap)", () => {
    const result = validateNewsCarouselSpec(duplicateSlideIndex());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "slide_index_invalid"), true);
  });

  it("rejects a gap in slide_index", () => {
    const result = validateNewsCarouselSpec(gapInSlideIndex());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "slide_index_invalid"), true);
  });
});
