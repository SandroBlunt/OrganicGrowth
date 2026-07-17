import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CAROUSEL_SLIDE_COUNT,
  CAROUSEL_ROLES,
  CAROUSEL_TEXT_MAX_CHARS,
} from "./news-carousel-contract.ts";
import { validCarouselSpec } from "./fixtures/news-carousel-specs.ts";

describe("News Carousel contract constants", () => {
  it("requires exactly 7 slides", () => {
    assert.equal(CAROUSEL_SLIDE_COUNT, 7);
  });

  it("declares the 7 roles in the fixed order hook -> then -> shift -> proof -> different -> next -> cta", () => {
    assert.deepEqual(CAROUSEL_ROLES, [
      "hook",
      "then",
      "shift",
      "proof",
      "different",
      "next",
      "cta",
    ]);
  });

  it("caps on-card text at 140 chars", () => {
    assert.equal(CAROUSEL_TEXT_MAX_CHARS, 140);
  });
});

describe("validCarouselSpec fixture", () => {
  it("has exactly 7 slides, in role order, slide_index 0..6", () => {
    const spec = validCarouselSpec();
    const slides = spec.slides as Array<Record<string, unknown>>;
    assert.equal(slides.length, CAROUSEL_SLIDE_COUNT);
    slides.forEach((slide, i) => {
      assert.equal(slide.slide_index, i);
      assert.equal(slide.role, CAROUSEL_ROLES[i]);
    });
  });

  it("every slide's text is within the 140-char cap", () => {
    const spec = validCarouselSpec();
    const slides = spec.slides as Array<Record<string, unknown>>;
    for (const slide of slides) {
      assert.ok((slide.text as string).length <= CAROUSEL_TEXT_MAX_CHARS);
    }
  });
});
