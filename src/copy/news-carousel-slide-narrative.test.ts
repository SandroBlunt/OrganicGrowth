import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { newsCarouselSlideNarrative } from "./news-carousel-slide-narrative.ts";
import { skillDraftCopy, type CopySlideBeat } from "./draft.ts";
import type { CarouselSlide } from "../production-spec/news-carousel-contract.ts";
import { CAROUSEL_ROLES } from "../production-spec/news-carousel-contract.ts";
import type { CopyShape } from "./contract.ts";

/** A well-formed, TYPED 7-slide News Carousel Spec — mirrors
 *  `production-spec/fixtures/news-carousel-specs.ts`'s `validCarouselSpec()` shape, but kept local and
 *  strongly typed (this module's own concern is the Spec -> CopySlideBeat[] wiring, not Spec
 *  validation, which already has its own fixtures/tests). The "then" slide deliberately names NO real
 *  company (an empty `companies` array) — proving the empty case is carried through, not dropped. */
function sampleSpec(): { slides: readonly CarouselSlide[] } {
  const slides: CarouselSlide[] = CAROUSEL_ROLES.map((role, i) => ({
    slide_index: i,
    role,
    card_style: i % 2 === 0 ? "full_width" : "floating_toast",
    stat_callout: `Stat ${i + 1}.`,
    text: `Slide ${i + 1} (${role}): a short on-card supporting line.`,
    companies: role === "then" ? [] : ["OpenAI", "Anthropic"],
    image_prompt: `Prompt for slide ${i + 1} (${role}).`,
  }));
  return { slides };
}

describe("newsCarouselSlideNarrative — wires a saved News Carousel Spec into CopyInput.slideNarrative (issue #120)", () => {
  it("maps all 7 slides, in the SAME order, role/text/statCallout/companies carried through unchanged", () => {
    const spec = sampleSpec();
    const beats = newsCarouselSlideNarrative(spec);

    assert.equal(beats.length, 7);
    beats.forEach((beat, i) => {
      const source = spec.slides[i]!;
      assert.equal(beat.role, source.role);
      assert.equal(beat.text, source.text);
      assert.equal(beat.statCallout, source.stat_callout);
      assert.deepEqual(beat.companies, source.companies);
    });
    assert.deepEqual(
      beats.map((b) => b.role),
      [...CAROUSEL_ROLES],
    );
  });

  it("passes a slide's companies array through UNCHANGED when non-empty", () => {
    const spec = sampleSpec();
    const beats = newsCarouselSlideNarrative(spec);
    const hook = beats.find((b) => b.role === "hook")!;
    assert.deepEqual(hook.companies, ["OpenAI", "Anthropic"]);
  });

  it("passes a slide's EMPTY companies array through as [] — never omitted, never fabricated", () => {
    const spec = sampleSpec();
    const beats = newsCarouselSlideNarrative(spec);
    const then = beats.find((b) => b.role === "then")!;
    assert.ok(then.companies !== undefined, "companies must be present, not omitted, even when empty");
    assert.deepEqual(then.companies, []);
  });

  it("never mutates the source Spec's slides", () => {
    const spec = sampleSpec();
    const before = structuredClone(spec);
    newsCarouselSlideNarrative(spec);
    assert.deepEqual(spec, before);
  });

  it("is deterministic: same Spec in, same beats out", () => {
    const spec = sampleSpec();
    assert.deepEqual(newsCarouselSlideNarrative(spec), newsCarouselSlideNarrative(spec));
  });
});

/**
 * AC4's concrete proof (issue #120 Agent Brief): "A Spec whose slides all have empty `companies`
 * arrays produces the same caption behavior as before this change (never a fabricated mention)."
 * Compares the composed caption from a wired-through, all-empty-companies `slideNarrative` against the
 * SAME narrative with `companies` stripped entirely (the pre-#120 shape) — they must be byte-identical.
 */
describe("newsCarouselSlideNarrative — an all-empty-companies Spec changes nothing about drafting (issue #120 AC4)", () => {
  const SHAPE: CopyShape = { maxChars: 2200, minEmojis: 0, maxEmojis: 2 };

  it("skillDraftCopy's output is IDENTICAL with an all-empty-companies slideNarrative vs. no companies field at all", () => {
    const spec = sampleSpec();
    const allEmptySlides = spec.slides.map((s) => ({ ...s, companies: [] as readonly string[] }));
    const withEmptyCompanies = newsCarouselSlideNarrative({ slides: allEmptySlides });
    const withoutCompaniesField: readonly CopySlideBeat[] = withEmptyCompanies.map(
      (b): CopySlideBeat => ({ role: b.role, text: b.text, ...(b.statCallout !== undefined ? { statCallout: b.statCallout } : {}) }),
    );

    const input = { title: "AI just got a job" };
    const draftedWithEmpty = skillDraftCopy({ ...input, slideNarrative: withEmptyCompanies }, SHAPE);
    const draftedWithoutField = skillDraftCopy(
      { ...input, slideNarrative: withoutCompaniesField },
      SHAPE,
    );

    assert.deepEqual(draftedWithEmpty, draftedWithoutField);
  });
});
