import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateNewsCarouselSpec } from "./news-carousel-validate.ts";
import {
  validCarouselSpec,
  sixSlides,
  eightSlides,
  numericSlides,
  rolesOutOfOrder,
  slideIndexOffByOne,
  textTooLong,
  missingImagePrompt,
} from "./fixtures/news-carousel-specs.ts";

/** Whether the validation result carries an error with the given code. */
function hasCode(result: ReturnType<typeof validateNewsCarouselSpec>, code: string): boolean {
  return result.errors.some((e) => e.code === code);
}

describe("validateNewsCarouselSpec — well-formed Spec", () => {
  it("accepts a valid 7-slide Spec with no errors", () => {
    const result = validateNewsCarouselSpec(validCarouselSpec());
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });
});

describe("validateNewsCarouselSpec — not an object", () => {
  it("rejects null/array/primitive candidates", () => {
    assert.equal(validateNewsCarouselSpec(null).ok, false);
    assert.equal(validateNewsCarouselSpec([1, 2, 3]).ok, false);
    assert.equal(validateNewsCarouselSpec("nope").ok, false);
    assert.equal(hasCode(validateNewsCarouselSpec(null), "not_an_object"), true);
  });
});

describe("validateNewsCarouselSpec — slides presence/count", () => {
  it("rejects a Spec with no slides field", () => {
    const result = validateNewsCarouselSpec({});
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "slides_missing"), true);
  });

  it("rejects 6 slides (one short of the required 7)", () => {
    const result = validateNewsCarouselSpec(sixSlides());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "slides_count"), true);
  });

  it("rejects 8 slides (one over the required 7)", () => {
    const result = validateNewsCarouselSpec(eightSlides());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "slides_count"), true);
  });

  it("rejects slides that is not an array at all", () => {
    const result = validateNewsCarouselSpec({ slides: "not-an-array" });
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "slides_count"), true);
  });
});

describe("validateNewsCarouselSpec — per-slide shape", () => {
  it("rejects slides that are plain numbers, not slide objects", () => {
    const result = validateNewsCarouselSpec(numericSlides());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "slide_shape"), true);
  });

  it("rejects a slide missing its image_prompt", () => {
    const result = validateNewsCarouselSpec(missingImagePrompt());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "slide_shape"), true);
  });
});

describe("validateNewsCarouselSpec — text length cap", () => {
  it("rejects a slide whose text exceeds 140 chars", () => {
    const result = validateNewsCarouselSpec(textTooLong());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "slide_text_too_long"), true);
  });
});

describe("validateNewsCarouselSpec — fixed role order", () => {
  it("rejects slides whose roles are out of the fixed hook->then->... order", () => {
    const result = validateNewsCarouselSpec(rolesOutOfOrder());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "slide_role_order"), true);
  });
});

describe("validateNewsCarouselSpec — slide_index alignment", () => {
  it("rejects slide_index values that don't match position (0..6)", () => {
    const result = validateNewsCarouselSpec(slideIndexOffByOne());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "slide_index_invalid"), true);
  });
});
