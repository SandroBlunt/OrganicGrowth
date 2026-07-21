/**
 * News Carousel Production Spec test fixtures — a known-valid Spec plus deliberately-broken variants.
 *
 * Mirrors `fixtures/specs.ts`'s own rationale: the valid Spec is the single source of truth; each
 * broken variant is derived from it by ONE focused mutation, so a test asserts exactly one contract
 * violation at a time. Fixtures are plain data (no I/O). The valid Spec is intentionally brand-safe
 * against `fixtures/brand-profile.banned.yaml`'s words, so the same fixture drives both the validator
 * and the brand-safety tests.
 */

import { CAROUSEL_ROLES, type CarouselSlide } from "../news-carousel-contract.ts";

/** A well-formed News Carousel Spec: exactly 7 slides, in fixed role order (map #77). */
export function validCarouselSpec(): Record<string, unknown> {
  const slides: CarouselSlide[] = CAROUSEL_ROLES.map((role, i) => ({
    slide_index: i,
    role,
    card_style: i % 2 === 0 ? "full_width" : "floating_toast",
    stat_callout: `Stat ${i + 1}.`,
    text: `Slide ${i + 1} (${role}): a short on-card supporting line in the Format's voice.`,
    companies: ["OpenAI", "Anthropic"],
    image_prompt:
      `A vertical viral Instagram news post, slide ${i + 1} of 7 (${role}). A grounded, ` +
      "real photographic scene with the Brand_Logo reference and the pill text placed per the " +
      "Baseline Prompt, naming OpenAI and Anthropic in the logo row.",
  }));
  return { slides };
}

/** Deep-clones a fixture so a mutation never leaks across tests. */
function clone(spec: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(spec);
}

/** 6 slides (contract requires exactly 7). */
export function sixSlides(): Record<string, unknown> {
  const s = clone(validCarouselSpec());
  (s.slides as unknown[]).pop();
  return s;
}

/** 8 slides (contract requires exactly 7). */
export function eightSlides(): Record<string, unknown> {
  const s = clone(validCarouselSpec());
  const slides = s.slides as CarouselSlide[];
  slides.push({ ...slides[6]!, slide_index: 7 });
  return s;
}

/** slides is present but every entry is a plain number, not a slide object. */
export function numericSlides(): Record<string, unknown> {
  const s = clone(validCarouselSpec());
  s.slides = [1, 2, 3, 4, 5, 6, 7];
  return s;
}

/** The first two slides' roles are swapped ("then" first, "hook" second) — breaks the fixed order. */
export function rolesOutOfOrder(): Record<string, unknown> {
  const s = clone(validCarouselSpec());
  const slides = s.slides as CarouselSlide[];
  const first = slides[0]!;
  const second = slides[1]!;
  slides[0] = { ...first, role: second.role };
  slides[1] = { ...second, role: first.role };
  return s;
}

/** slide_index values are shifted by one (1..7 instead of 0..6). */
export function slideIndexOffByOne(): Record<string, unknown> {
  const s = clone(validCarouselSpec());
  s.slides = (s.slides as CarouselSlide[]).map((slide) => ({
    ...slide,
    slide_index: slide.slide_index + 1,
  }));
  return s;
}

/** The "shift" slide's on-card text is over the 140-char cap. */
export function textTooLong(): Record<string, unknown> {
  const s = clone(validCarouselSpec());
  const slides = s.slides as CarouselSlide[];
  slides[2] = { ...slides[2]!, text: "x".repeat(141) };
  return s;
}

/** The "proof" slide is missing its image_prompt entirely. */
export function missingImagePrompt(): Record<string, unknown> {
  const s = clone(validCarouselSpec());
  const slides = s.slides as Array<Partial<CarouselSlide>>;
  const { image_prompt: _dropped, ...rest } = slides[3]!;
  slides[3] = rest;
  return s;
}

/** The "proof" slide is missing its companies field entirely. */
export function missingCompanies(): Record<string, unknown> {
  const s = clone(validCarouselSpec());
  const slides = s.slides as Array<Partial<CarouselSlide>>;
  const { companies: _dropped, ...rest } = slides[3]!;
  slides[3] = rest;
  return s;
}
