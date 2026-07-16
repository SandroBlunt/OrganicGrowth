/**
 * News Carousel Production Spec test fixtures (issue #60) — mirrors `fixtures/specs.ts`'s pattern for
 * the wired Recipe: one well-formed Spec plus focused, deliberately-broken variants, so a test asserts
 * exactly one contract violation at a time.
 */

import type { CarouselSlide, NewsCarouselSpec } from "../news-carousel-contract.ts";

/** One deterministic, contract-conformant slide for position `n` (1-based). */
function slide(n: number): CarouselSlide {
  return {
    slide_index: n,
    image_prompt:
      `A vertical viral Instagram news post for slide ${n}: full-frame editorial photograph with ` +
      `bold white uppercase headline text overlaid on the bottom half, thin "Unhypped News" divider ` +
      `above it. Clean editorial social media news page layout.`,
  };
}

/** A well-formed News Carousel Spec with `slideCount` slides (default 5, the minimum). */
export function validNewsCarouselSpec(slideCount = 5): NewsCarouselSpec {
  return { slides: Array.from({ length: slideCount }, (_, i) => slide(i + 1)) };
}

/** 4 slides — below the required minimum of 5. */
export function tooFewSlides(): Record<string, unknown> {
  return { slides: Array.from({ length: 4 }, (_, i) => slide(i + 1)) };
}

/** 8 slides — above the maximum of 7 (the Space only wires 7 pipelines). */
export function tooManySlides(): Record<string, unknown> {
  return { slides: Array.from({ length: 8 }, (_, i) => slide(i + 1)) };
}

/** 5 slides but slide_index 3 is duplicated (and 5 is missing). */
export function duplicateSlideIndex(): Record<string, unknown> {
  const slides = Array.from({ length: 5 }, (_, i) => slide(i + 1));
  return { slides: [...slides.slice(0, 4), { ...slide(3) }] };
}

/** 5 slides but slide_index jumps from 4 to 6 (a gap at 5). */
export function gapInSlideIndex(): Record<string, unknown> {
  const slides = Array.from({ length: 5 }, (_, i) => slide(i + 1));
  return { slides: [...slides.slice(0, 4), { ...slide(6) }] };
}

/** A well-formed slide count, but one slide is missing its image_prompt. */
export function slideMissingPrompt(): Record<string, unknown> {
  const slides = validNewsCarouselSpec(5).slides.map((s) => ({ ...s })) as Array<Record<string, unknown>>;
  delete slides[2]!.image_prompt;
  return { slides };
}

/** No `slides` field at all. */
export function missingSlides(): Record<string, unknown> {
  return {};
}
