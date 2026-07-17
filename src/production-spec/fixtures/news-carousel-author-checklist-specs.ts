/**
 * News Carousel author-phase-checklist test fixtures — a Baseline-Prompt-ADHERENT Spec plus focused
 * broken variants (issue #85, graduated from map ticket #77).
 *
 * `TEST_BASELINE` is a STAND-IN (Brand x Format) Baseline Prompt's own strings — deliberately
 * DIFFERENT from Straw Motion's real "Unhypped News"/"Brand_Logo" (see `produce-news-carousel`
 * prototype notes) so these tests can never accidentally pass on a hardcoded literal baked into the
 * checked module — proving the checklist genuinely takes them as PARAMETERS (issue #85's core ask),
 * not string literals.
 */

import { CAROUSEL_ROLES, type CarouselSlide } from "../news-carousel-contract.ts";
import type { NewsCarouselBaselineParams } from "../news-carousel-author-checklist.ts";

/** A stand-in Baseline Prompt's own strings — see module doc above. */
export const TEST_BASELINE: NewsCarouselBaselineParams = {
  logoReferenceName: "Test_Brand_Logo",
  pillText: "Test Wire",
  neverAllCapsInstruction: "Never render it in all-caps, no matter the surrounding typography.",
  fixedClauses: [
    "A vertical viral Instagram news post.",
    "Render the logo exactly as provided in the reference image.",
    "a solid white rounded card",
    "set in Inter font",
    "Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card.",
  ],
  confirmedCardStyles: ["full_width", "floating_toast"],
};

/** Assembles ONE slide's image_prompt carrying EVERY clause `TEST_BASELINE` declares, verbatim. */
function baselineAdherentImagePrompt(role: string): string {
  const [clause0, clause1, clause2, clause3, clause4] = TEST_BASELINE.fixedClauses;
  return (
    `${clause0} A grounded photographic scene for the "${role}" beat, with the connected reference ` +
    `image ${TEST_BASELINE.logoReferenceName} placed along the free edge. ${clause1} Below it, ${clause2} ` +
    `carries a pill badge reading "${TEST_BASELINE.pillText}". ${TEST_BASELINE.neverAllCapsInstruction} ` +
    `All card text is ${clause3}. ${clause4}`
  );
}

function clone(spec: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(spec);
}

/** A well-formed, BASELINE-ADHERENT News Carousel Spec: every image_prompt carries every
 *  `TEST_BASELINE` clause verbatim (map #77's graduated checklist, issue #85). */
export function baselineAdherentCarouselSpec(): Record<string, unknown> {
  const slides: CarouselSlide[] = CAROUSEL_ROLES.map((role, i) => ({
    slide_index: i,
    role,
    card_style: TEST_BASELINE.confirmedCardStyles[i % 2]!,
    stat_callout: `Stat ${i + 1}.`,
    text: `Slide ${i + 1} (${role}): a short on-card supporting line.`,
    image_prompt: baselineAdherentImagePrompt(role),
  }));
  return { slides };
}

/** Every slide's image_prompt is missing the logo reference name. */
export function missingLogoReference(): Record<string, unknown> {
  const s = clone(baselineAdherentCarouselSpec());
  const slides = s.slides as CarouselSlide[];
  s.slides = slides.map((slide) => ({
    ...slide,
    image_prompt: slide.image_prompt.split(TEST_BASELINE.logoReferenceName).join("a logo"),
  }));
  return s;
}

/** Every slide's image_prompt is missing the pill text. */
export function missingPillText(): Record<string, unknown> {
  const s = clone(baselineAdherentCarouselSpec());
  const slides = s.slides as CarouselSlide[];
  s.slides = slides.map((slide) => ({
    ...slide,
    image_prompt: slide.image_prompt.split(`"${TEST_BASELINE.pillText}"`).join('"a pill"'),
  }));
  return s;
}

/** Every slide's image_prompt is missing the never-all-caps instruction. */
export function missingCapsGuardrail(): Record<string, unknown> {
  const s = clone(baselineAdherentCarouselSpec());
  const slides = s.slides as CarouselSlide[];
  s.slides = slides.map((slide) => ({
    ...slide,
    image_prompt: slide.image_prompt.split(TEST_BASELINE.neverAllCapsInstruction).join(""),
  }));
  return s;
}

/** Every slide's image_prompt drops ONE fixed clause (the closing style line). */
export function missingFixedClause(): Record<string, unknown> {
  const s = clone(baselineAdherentCarouselSpec());
  const closingLine = TEST_BASELINE.fixedClauses[4]!;
  const slides = s.slides as CarouselSlide[];
  s.slides = slides.map((slide) => ({
    ...slide,
    image_prompt: slide.image_prompt.split(closingLine).join(""),
  }));
  return s;
}

/** The "hook" slide's card_style is not one of the confirmed styles. */
export function unconfirmedCardStyle(): Record<string, unknown> {
  const s = clone(baselineAdherentCarouselSpec());
  const slides = s.slides as CarouselSlide[];
  slides[0] = { ...slides[0]!, card_style: "gradient_burst" };
  return s;
}

/** The "cta" slide's on-card text carries a banned word. */
export function bannedWordInText(bannedWord: string): Record<string, unknown> {
  const s = clone(baselineAdherentCarouselSpec());
  const slides = s.slides as CarouselSlide[];
  slides[6] = { ...slides[6]!, text: `${slides[6]!.text} ${bannedWord}` };
  return s;
}
