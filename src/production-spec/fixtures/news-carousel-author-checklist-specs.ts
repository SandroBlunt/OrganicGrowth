/**
 * News Carousel author-phase-checklist test fixtures — a Baseline-Prompt-ADHERENT Spec plus focused
 * broken variants (issue #85, graduated from map ticket #77; placement-variety fixtures added issue
 * #106).
 *
 * `TEST_BASELINE` is a STAND-IN (Brand x Format) Baseline Prompt's own strings — deliberately
 * DIFFERENT from Straw Motion's real "Unhypped News"/"Brand_Logo" (see `produce-news-carousel`
 * prototype notes) so these tests can never accidentally pass on a hardcoded literal baked into the
 * checked module — proving the checklist genuinely takes them as PARAMETERS (issue #85's core ask),
 * not string literals. Its `confirmedCardStyles` deliberately carries THREE non-top-region names
 * (`full_width`, `floating_toast`, `small_badge`) plus ONE top-region name (`top_card`), so the
 * placement-variety fixtures below can isolate "too few distinct placements" from "no top-region
 * placement" as two independently-triggerable failures (issue #106's own OR-condition).
 */

import { CAROUSEL_ROLES, type CarouselSlide } from "../news-carousel-contract.ts";
import type { NewsCarouselBaselineParams } from "../news-carousel-author-checklist.ts";

/** A stand-in Baseline Prompt's own strings — see module doc above. */
export const TEST_BASELINE: NewsCarouselBaselineParams = {
  logoReferenceName: "Test_Brand_Logo",
  pillText: "Test Wire",
  neverAllCapsInstruction: "Never render it in all-caps, no matter the surrounding typography.",
  // Deliberately DIFFERENT wording from Straw Motion's real strings (issue #110) — same reasoning as
  // every other TEST_BASELINE field: proves the checklist reads these as PARAMETERS, never literals.
  logoReferencePhrase: "the linked reference image",
  logoNameGuardrailInstruction:
    "Never render this asset's identifying name or file name as visible text in the image; it exists " +
    "only to mark which connected reference to use.",
  fixedClauses: [
    "A vertical viral Instagram news post.",
    "Render the logo exactly as provided in the reference image.",
    "a solid white rounded card",
    "set in Inter font",
    "Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card.",
  ],
  confirmedCardStyles: ["full_width", "floating_toast", "small_badge", "top_card"],
  topRegionCardStyles: ["top_card"],
  minDistinctCardStyles: 3,
};

/** A stand-in set of companies for the slides that name real ones (the rest name none). */
const TEST_COMPANIES: readonly string[] = ["Acme", "Globex"];

/** Assembles ONE slide's image_prompt carrying EVERY clause `TEST_BASELINE` declares, verbatim, plus a
 *  logo row citing `companies` (omitted entirely when `companies` is empty — issue #102 finding #1).
 *  Carries the logo reference (via `logoReferencePhrase` + the raw name — issue #110) and the negative
 *  guardrail instruction, so this positive fixture passes the reworked `logo-reference` item AND the
 *  new `logo-name-not-as-text` item cleanly. */
function baselineAdherentImagePrompt(role: string, companies: readonly string[]): string {
  const [clause0, clause1, clause2, clause3, clause4] = TEST_BASELINE.fixedClauses;
  const logoRow =
    companies.length > 0
      ? ` Positioned next to the pill are ${companies.length} tiny real product logos (${companies.join(", ")}) in a row.`
      : "";
  return (
    `${clause0} A grounded photographic scene for the "${role}" beat, with ${TEST_BASELINE.logoReferencePhrase} ` +
    `${TEST_BASELINE.logoReferenceName} placed along the free edge. ${TEST_BASELINE.logoNameGuardrailInstruction} ` +
    `${clause1} Below it, ${clause2} ` +
    `carries a pill badge reading "${TEST_BASELINE.pillText}". ${TEST_BASELINE.neverAllCapsInstruction}` +
    `${logoRow} All card text is ${clause3}. ${clause4}`
  );
}

function clone(spec: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(spec);
}

/** A well-formed, BASELINE-ADHERENT News Carousel Spec: every image_prompt carries every
 *  `TEST_BASELINE` clause verbatim (map #77's graduated checklist, issue #85), and its `card_style`s
 *  cycle through ALL of `TEST_BASELINE.confirmedCardStyles` — genuinely varied, including the
 *  top-region style — so it also passes the placement-variety item (issue #106). */
export function baselineAdherentCarouselSpec(): Record<string, unknown> {
  const slides: CarouselSlide[] = CAROUSEL_ROLES.map((role, i) => {
    // Odd slides name no real company (proving the empty-companies path needs no logo row); even
    // slides name TEST_COMPANIES — mirrors a real carousel varying which slides show real companies.
    const companies = i % 2 === 0 ? TEST_COMPANIES : [];
    return {
      slide_index: i,
      role,
      card_style: TEST_BASELINE.confirmedCardStyles[i % TEST_BASELINE.confirmedCardStyles.length]!,
      stat_callout: `Stat ${i + 1}.`,
      text: `Slide ${i + 1} (${role}): a short on-card supporting line.`,
      companies,
      image_prompt: baselineAdherentImagePrompt(role, companies),
    };
  });
  return { slides };
}

/**
 * Every slide's image_prompt has the RAW, underscored logo reference name stripped out (replaced with
 * a plain, name-free stand-in) — but keeps the Baseline Prompt's own generic reference phrase
 * (`logoReferencePhrase`, e.g. "the linked reference image") AND the negative guardrail instruction.
 * Under issue #110's reworked `logo-reference` item, THIS now PASSES: the raw name is no longer
 * required on its own, as long as the logo is still referenced (via the generic phrase) and the
 * guardrail is present. Proves AC2/AC5's "a name-free-but-guarded prompt passes the reworked rule".
 */
export function logoReferenceNameFreeButGuarded(): Record<string, unknown> {
  const s = clone(baselineAdherentCarouselSpec());
  const slides = s.slides as CarouselSlide[];
  s.slides = slides.map((slide) => ({
    ...slide,
    image_prompt: slide.image_prompt.split(TEST_BASELINE.logoReferenceName).join("the brand mark"),
  }));
  return s;
}

/** Every slide's image_prompt is missing the negative guardrail instruction (the raw name + generic
 *  phrase both stay) — proves the guardrail is now genuinely REQUIRED, not merely the name (issue #110). */
export function missingLogoGuardrail(): Record<string, unknown> {
  const s = clone(baselineAdherentCarouselSpec());
  const slides = s.slides as CarouselSlide[];
  s.slides = slides.map((slide) => ({
    ...slide,
    image_prompt: slide.image_prompt.split(TEST_BASELINE.logoNameGuardrailInstruction).join(""),
  }));
  return s;
}

/** Every slide's image_prompt has BOTH the raw logo reference name AND the generic reference phrase
 *  stripped (the guardrail sentence stays) — the logo is not referenced at all, so the `logo-reference`
 *  item must still correctly fail (issue #110: proves the item isn't vacuously true). */
export function logoNotReferencedAtAll(): Record<string, unknown> {
  const s = clone(baselineAdherentCarouselSpec());
  const slides = s.slides as CarouselSlide[];
  s.slides = slides.map((slide) => ({
    ...slide,
    image_prompt: slide.image_prompt
      .split(TEST_BASELINE.logoReferenceName)
      .join("the brand mark")
      .split(TEST_BASELINE.logoReferencePhrase)
      .join("a nearby element"),
  }));
  return s;
}

/**
 * The "hook" slide's image_prompt additionally renders the raw logo reference name QUOTED, as if it
 * were literal on-image text (mirroring how this same fixture already quotes the pill text) — the
 * specific anti-pattern issue #110's `logo-name-not-as-text` item flags. Every OTHER aspect of the
 * prompt stays baseline-adherent (the plain, unquoted reference + guardrail are still present), so
 * this mutation isolates the new item alone.
 */
export function logoReferenceNameRenderedAsText(): Record<string, unknown> {
  const s = clone(baselineAdherentCarouselSpec());
  const slides = s.slides as CarouselSlide[];
  slides[0] = {
    ...slides[0]!,
    image_prompt: `${slides[0]!.image_prompt} The pill secondarily displays "${TEST_BASELINE.logoReferenceName}" beneath it.`,
  };
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

/** The "hook" slide's companies field names a company its own image_prompt never mentions. */
export function companyNotCitedInPrompt(): Record<string, unknown> {
  const s = clone(baselineAdherentCarouselSpec());
  const slides = s.slides as CarouselSlide[];
  slides[0] = { ...slides[0]!, companies: [...slides[0]!.companies, "Initech"] };
  return s;
}

/** The "hook" slide's companies field names a company that appears ONLY inside a longer word of its
 *  image_prompt ("Glo" inside "Globex") — a bare-substring check would false-pass it. */
export function companyOnlySubstringInPrompt(): Record<string, unknown> {
  const s = clone(baselineAdherentCarouselSpec());
  const slides = s.slides as CarouselSlide[];
  slides[0] = { ...slides[0]!, companies: [...slides[0]!.companies, "Glo"] };
  return s;
}

/** The "cta" slide's on-card text carries a banned word. */
export function bannedWordInText(bannedWord: string): Record<string, unknown> {
  const s = clone(baselineAdherentCarouselSpec());
  const slides = s.slides as CarouselSlide[];
  slides[6] = { ...slides[6]!, text: `${slides[6]!.text} ${bannedWord}` };
  return s;
}

/** The "cta" slide's on-card text carries an em dash — the AI "tell" issue #108 forbids. */
export function dashInText(): Record<string, unknown> {
  const s = clone(baselineAdherentCarouselSpec());
  const slides = s.slides as CarouselSlide[];
  slides[6] = { ...slides[6]!, text: `${slides[6]!.text} — and more.` };
  return s;
}

/**
 * All 7 slides use only BOTTOM-region confirmed styles (never `TEST_BASELINE.topRegionCardStyles`),
 * cycling through every non-top-region style so the distinct-count sub-check is satisfied — isolating
 * the "no top-region placement" failure exactly as reproduction-confirmed on straw-motion's idea-01
 * (issue #106): plenty of distinct bottom placements, zero top-region cards.
 */
export function allBottomPlacements(): Record<string, unknown> {
  const s = clone(baselineAdherentCarouselSpec());
  const slides = s.slides as CarouselSlide[];
  const bottomStyles = TEST_BASELINE.confirmedCardStyles.filter(
    (style) => !TEST_BASELINE.topRegionCardStyles.includes(style),
  );
  s.slides = slides.map((slide, i) => ({
    ...slide,
    card_style: bottomStyles[i % bottomStyles.length]!,
  }));
  return s;
}

/**
 * Only 2 distinct `card_style` values across the 7 slides — below `TEST_BASELINE.minDistinctCardStyles`
 * — even though one of the two IS a top-region style. Isolates the "too few distinct placements"
 * failure from "no top-region placement" (issue #106's own OR-condition — both clauses must be able to
 * fail independently).
 */
export function tooFewDistinctPlacements(): Record<string, unknown> {
  const s = clone(baselineAdherentCarouselSpec());
  const slides = s.slides as CarouselSlide[];
  const twoStyles = [TEST_BASELINE.confirmedCardStyles[0]!, TEST_BASELINE.topRegionCardStyles[0]!];
  s.slides = slides.map((slide, i) => ({
    ...slide,
    card_style: twoStyles[i % twoStyles.length]!,
  }));
  return s;
}
