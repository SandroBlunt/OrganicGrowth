import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  MIN_SLIDES,
  MAX_SLIDES,
  TOTAL_SLIDE_PIPELINES,
  slideRunPointName,
  slideRunPointNames,
} from "./news-carousel-contract.ts";
import { validNewsCarouselSpec } from "./fixtures/news-carousel-specs.ts";
import { canonicalCarouselProtocol } from "../execution-protocol/protocol.ts";

describe("News Carousel contract — slide bounds", () => {
  it("accepts 5 to 7 slides", () => {
    assert.equal(MIN_SLIDES, 5);
    assert.equal(MAX_SLIDES, 7);
  });

  it("the physical pipeline count on the Space matches the canonical carousel protocol (never drifts)", () => {
    assert.equal(TOTAL_SLIDE_PIPELINES, canonicalCarouselProtocol().run_points.length);
    assert.equal(TOTAL_SLIDE_PIPELINES, MAX_SLIDES);
  });
});

describe("slideRunPointName — the canonical per-slide extractor node name", () => {
  it("names each slide 'Image Prompt Slide N'", () => {
    assert.equal(slideRunPointName(1), "Image Prompt Slide 1");
    assert.equal(slideRunPointName(7), "Image Prompt Slide 7");
  });
});

describe("slideRunPointNames — only the run-points for the slides PRESENT, in slide order", () => {
  it("returns exactly N names for an N-slide Spec, in ascending slide order", () => {
    const spec = validNewsCarouselSpec(5);
    assert.deepEqual(slideRunPointNames(spec), [
      "Image Prompt Slide 1",
      "Image Prompt Slide 2",
      "Image Prompt Slide 3",
      "Image Prompt Slide 4",
      "Image Prompt Slide 5",
    ]);
  });

  it("never names a slide beyond the Spec's own slide count (5-slide Spec never names Slide 6/7)", () => {
    const names = slideRunPointNames(validNewsCarouselSpec(5));
    assert.ok(!names.includes("Image Prompt Slide 6"));
    assert.ok(!names.includes("Image Prompt Slide 7"));
  });

  it("sorts by slide_index regardless of the Spec's own array order", () => {
    const spec = validNewsCarouselSpec(3);
    const shuffled = { slides: [spec.slides[2]!, spec.slides[0]!, spec.slides[1]!] };
    assert.deepEqual(slideRunPointNames(shuffled), [
      "Image Prompt Slide 1",
      "Image Prompt Slide 2",
      "Image Prompt Slide 3",
    ]);
  });

  it("a full 7-slide Spec names all seven run-points", () => {
    assert.equal(slideRunPointNames(validNewsCarouselSpec(7)).length, 7);
  });
});
