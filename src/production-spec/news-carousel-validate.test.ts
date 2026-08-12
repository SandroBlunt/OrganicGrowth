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
  missingCompanies,
  imageSlideWithSourceUrl,
  videoSlideWithSourceUrl,
  invalidSlideKind,
  imageSlideMissingSourceUrl,
  imageSlideMalformedSourceUrl,
} from "./fixtures/news-carousel-specs.ts";
import type { CarouselSlide } from "./news-carousel-contract.ts";

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

  it("rejects a slide missing its companies field", () => {
    const result = validateNewsCarouselSpec(missingCompanies());
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

describe("validateNewsCarouselSpec — per-slide kind (ADR-0024, issue #188)", () => {
  it("a Spec with no kind field at all is accepted (backward compatible — implied 'generated')", () => {
    const result = validateNewsCarouselSpec(validCarouselSpec());
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  it("accepts an image-kind slide carrying a well-formed source_url", () => {
    const result = validateNewsCarouselSpec(imageSlideWithSourceUrl());
    assert.equal(result.ok, true, result.errors.map((e) => e.message).join("; "));
  });

  it("accepts a video-kind slide carrying a well-formed source_url", () => {
    const result = validateNewsCarouselSpec(videoSlideWithSourceUrl());
    assert.equal(result.ok, true, result.errors.map((e) => e.message).join("; "));
  });

  it("rejects a slide whose kind is not one of generated/image/video", () => {
    const result = validateNewsCarouselSpec(invalidSlideKind());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "slide_kind_invalid"), true);
  });

  it("rejects an image-kind slide missing its source_url", () => {
    const result = validateNewsCarouselSpec(imageSlideMissingSourceUrl());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "slide_source_url_invalid"), true);
  });

  it("rejects an image-kind slide whose source_url doesn't look like an http(s) URL", () => {
    const result = validateNewsCarouselSpec(imageSlideMalformedSourceUrl());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "slide_source_url_invalid"), true);
  });

  it("a generated-kind slide never requires a source_url", () => {
    const spec = validCarouselSpec();
    const slides = spec.slides as CarouselSlide[];
    slides[0] = { ...slides[0]!, kind: "generated" };
    const result = validateNewsCarouselSpec(spec);
    assert.equal(result.ok, true);
  });
});
