/**
 * Proves issue #87 AC2: following the `produce-news-carousel` Skill on a real brief (idea-01) plus
 * the imported real Baseline Prompt document yields a Spec that passes BOTH #81's structural
 * validator AND #85's author-phase checklist — concretely, since "an agent following prose" isn't
 * directly unit-testable.
 *
 * Two things are proven here, together:
 *   1. The COMMITTED fixture (`strawMotionIdeaOneCarouselSpec()`, the graduated map-#77 prototype's
 *      7 on-contract prompts) passes `validateNewsCarouselSpec` (#81) AND
 *      `auditNewsCarouselAuthorPhase` (#85) when parameterized with `STRAW_MOTION_BASELINE`.
 *   2. `STRAW_MOTION_BASELINE`'s strings are genuinely Straw Motion's OWN, by loading the real
 *      Format + the real Baseline Prompt document (issue #83's `loadFormat`/`loadBaselinePrompt`)
 *      and asserting every one of those strings is a real substring of the document's own prose —
 *      never asserted by fiat, never invented for the test.
 *
 * No Magnific fake needed: this is plain-file + pure-function testing (a Format YAML, a markdown
 * document, and two deterministic deep modules) — no Space, no MCP tool, no network, no credits.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { validateNewsCarouselSpec } from "./news-carousel-validate.ts";
import { auditNewsCarouselAuthorPhase } from "./news-carousel-author-checklist.ts";
import { CAROUSEL_ROLES } from "./news-carousel-contract.ts";
import {
  STRAW_MOTION_BASELINE,
  strawMotionIdeaOneCarouselSpec,
} from "./fixtures/news-carousel-straw-motion-specs.ts";
import { loadFormat } from "../format/store.ts";
import { loadBaselinePrompt } from "../format/baseline-prompt.ts";
import { TEST_BASELINE } from "./fixtures/news-carousel-author-checklist-specs.ts";

/**
 * The document is a wrapped markdown blockquote (each line prefixed "> ", sentences wrapped
 * mid-line). Normalize it the way a reader interprets rendered prose — strip the blockquote
 * markers, join lines with a space, collapse repeated whitespace — before checking containment,
 * since a sentence spanning a wrapped line break is never a literal contiguous byte run in the raw
 * file. Shared by every test below that reads the real document's prose.
 */
function normalizeBaselineProse(content: string): string {
  return content
    .split("\n")
    .map((line) => line.replace(/^>\s?/, ""))
    .join(" ")
    .replace(/\s+/g, " ");
}

describe("the produce-news-carousel Skill's graduated output passes both gates (issue #87 AC2)", () => {
  it("passes validateNewsCarouselSpec (#81's structural contract)", () => {
    const result = validateNewsCarouselSpec(strawMotionIdeaOneCarouselSpec());
    assert.equal(result.ok, true, result.errors.map((e) => e.message).join("; "));
    assert.deepEqual(result.errors, []);
  });

  it("passes auditNewsCarouselAuthorPhase parameterized with Straw Motion's REAL baseline strings (#85's checklist)", () => {
    const result = auditNewsCarouselAuthorPhase(
      strawMotionIdeaOneCarouselSpec(),
      [], // Straw Motion's brand-profile.yaml today: banned_words: [] (empty)
      STRAW_MOTION_BASELINE,
    );
    assert.equal(result.ok, true);
    assert.equal(result.items.length, 11);

    const agentJudged = result.items.filter((i) => i.kind === "agent-judged");
    assert.equal(agentJudged.length, 1);
    assert.equal(agentJudged[0]!.ok, null, "grounded-subject stays agent-judged, never auto-computed");

    for (const item of result.items) {
      if (item.kind === "mechanical") {
        assert.equal(item.ok, true, `${item.description}${item.detail ? ` — ${item.detail}` : ""}`);
      }
    }
  });

  it("every slide's image_prompt is grounded — names idea-01's real companies via the logos row (agent-judged item's own bar, checked concretely here)", () => {
    const spec = strawMotionIdeaOneCarouselSpec() as { slides: readonly { image_prompt: string }[] };
    // idea-01 reports a real, named launch (OpenAI/ChatGPT Work, Anthropic/Claude Cowork, Meta/Muse
    // Spark). Every slide's image_prompt names all three real companies via the pill's "three tiny
    // real product logos" row, and the "shift" slide's on-card text additionally spells out all
    // three product names — a concrete, checkable stand-in for "grounded, not invented" (the
    // checklist's own agent-judged item never computes this; this test does, for the committed
    // fixture specifically).
    for (const slide of spec.slides) {
      for (const company of ["OpenAI", "Anthropic", "Meta"]) {
        assert.match(
          slide.image_prompt,
          new RegExp(company),
          `every slide must ground itself in the real company "${company}", not an invented stand-in`,
        );
      }
      assert.doesNotMatch(
        slide.image_prompt,
        /is (?:ChatGPT Work|Claude Cowork|Muse Spark)'s (?:actual|real) screen/i,
        "must never claim an invented UI IS a named product's actual screen",
      );
    }
    const shift = spec.slides[2]!;
    for (const product of ["ChatGPT Work", "Claude Cowork", "Muse Spark"]) {
      assert.ok(shift.image_prompt.includes(product), `"shift" slide must name the real product "${product}"`);
    }
  });
});

describe("STRAW_MOTION_BASELINE's strings are genuinely Straw Motion's own (not invented for the test)", () => {
  it("loadFormat + loadBaselinePrompt resolve the real document, and every STRAW_MOTION_BASELINE string is a real substring of its prose", async () => {
    const format = await loadFormat("straw-motion", "unhypped-news");
    const lookup = await loadBaselinePrompt("straw-motion", format, "news-carousel");
    assert.equal(lookup.found, true);
    assert.ok(lookup.found);

    const normalized = normalizeBaselineProse(lookup.content);

    assert.ok(
      normalized.includes(STRAW_MOTION_BASELINE.logoReferenceName),
      "the document must actually contain the logo reference name STRAW_MOTION_BASELINE claims",
    );
    assert.ok(
      normalized.includes(STRAW_MOTION_BASELINE.pillText),
      "the document must actually contain the pill text STRAW_MOTION_BASELINE claims",
    );
    assert.ok(
      normalized.includes(STRAW_MOTION_BASELINE.neverAllCapsInstruction),
      "the document must actually contain the never-all-caps instruction STRAW_MOTION_BASELINE claims",
    );
    assert.ok(
      normalized.includes(STRAW_MOTION_BASELINE.logoReferencePhrase),
      "the document must actually contain the name-free logo reference phrase STRAW_MOTION_BASELINE claims (issue #110)",
    );
    assert.ok(
      normalized.includes(STRAW_MOTION_BASELINE.logoNameGuardrailInstruction),
      "the document must actually contain the negative-prompt logo guardrail STRAW_MOTION_BASELINE claims (issue #110)",
    );
    for (const clause of STRAW_MOTION_BASELINE.fixedClauses) {
      assert.ok(
        normalized.includes(clause),
        `the document must actually contain the fixed clause ${JSON.stringify(clause)}`,
      );
    }
  });

  it("is genuinely a DIFFERENT baseline than the stand-in TEST_BASELINE (proving this isn't the same fixture renamed)", () => {
    assert.notEqual(STRAW_MOTION_BASELINE.logoReferenceName, TEST_BASELINE.logoReferenceName);
    assert.notEqual(STRAW_MOTION_BASELINE.pillText, TEST_BASELINE.pillText);
  });
});

/**
 * Pins the four render-fidelity guardrails issue #109 adds to the document (epic #106 items 8, 10,
 * 11, 12) — a docs-test in spirit (guards prose content), kept as a REGULAR `.test.ts` because it's
 * part of the SAME real-document read this file already does for issue #83/#85's own pins, so it
 * runs under `npm test`'s always-on gate rather than the separate `npm run test:docs` pass.
 */
describe("news-carousel.md instructs the four render-fidelity guardrails (issue #109)", () => {
  it("(8) prefers real, recognizable products/screens over fine invented UI text, which renders as misspelled gibberish; keeps on-screen text minimal where no real screen exists", async () => {
    const format = await loadFormat("straw-motion", "unhypped-news");
    const lookup = await loadBaselinePrompt("straw-motion", format, "news-carousel");
    assert.ok(lookup.found);
    const normalized = normalizeBaselineProse(lookup.content);

    assert.match(normalized, /renders? as misspelled gibberish/i);
    assert.match(normalized, /keep any on-screen text minimal/i);
  });

  it("(10) the supporting line has a readable minimum size (~13-14px equivalent), never a tiny caption-sized afterthought", async () => {
    const format = await loadFormat("straw-motion", "unhypped-news");
    const lookup = await loadBaselinePrompt("straw-motion", format, "news-carousel");
    assert.ok(lookup.found);
    const normalized = normalizeBaselineProse(lookup.content);

    assert.match(normalized, /13-14px equivalent/);
    assert.match(normalized, /caption-sized afterthought/i);
  });

  it("(11) every card style, including the top card, fills its photo region edge to edge with no black margins or letterboxing", async () => {
    const format = await loadFormat("straw-motion", "unhypped-news");
    const lookup = await loadBaselinePrompt("straw-motion", format, "news-carousel");
    assert.ok(lookup.found);
    const normalized = normalizeBaselineProse(lookup.content);

    assert.match(normalized, /including the top card/i);
    assert.match(normalized, /no black margins/i);
    assert.match(normalized, /edge to edge/i);
  });

  it("(12) the logo/text backing is always a soft gradient vignette, never a hard-edged solid black bar or box", async () => {
    const format = await loadFormat("straw-motion", "unhypped-news");
    const lookup = await loadBaselinePrompt("straw-motion", format, "news-carousel");
    assert.ok(lookup.found);
    const normalized = normalizeBaselineProse(lookup.content);

    assert.match(normalized, /soft dark gradient vignette/i);
    assert.match(normalized, /never a hard-edged solid black bar or (?:box|filled box)/i);
  });

  it("every strawMotionIdeaOneCarouselSpec() slide still carries the UPDATED vignette clause verbatim (the doc/fixture stay in sync after issue #109's wording change)", () => {
    const spec = strawMotionIdeaOneCarouselSpec() as { slides: readonly { image_prompt: string }[] };
    for (const slide of spec.slides) {
      assert.match(
        slide.image_prompt,
        /A soft dark gradient vignette sits behind it for legibility against the photo, never a hard-edged solid black bar or box\./,
      );
    }
  });
});

/**
 * Pins the negative-prompt logo guardrail + slide-position pill/logo sizing issue #110 adds to the
 * document (epic #106 items 5, 7), mirroring issue #109's "regular `.test.ts`, not `.docs-test.ts`"
 * precedent: this reads the SAME real, committed document this file already reads for #83/#85/#109's
 * own pins, so it runs under `npm test`'s always-on gate.
 */
describe("news-carousel.md carries the issue #110 logo negative-prompt guardrail + slide-position pill/logo sizing", () => {
  it("(AC1) instructs never rendering the logo's reference name/filename as visible on-image text — a negative-prompt guardrail", async () => {
    const format = await loadFormat("straw-motion", "unhypped-news");
    const lookup = await loadBaselinePrompt("straw-motion", format, "news-carousel");
    assert.ok(lookup.found);
    const normalized = normalizeBaselineProse(lookup.content);

    assert.match(normalized, /negative-prompt instruction/i);
    assert.match(normalized, /never render (?:this|its) reference image'?s? name or file name/i);
    assert.match(normalized, /as visible text anywhere in the image/i);
  });

  it("(AC1) still instructs the logo rendered unaltered — no redraw/restyle/recolor/reshape (composes with the pre-existing clause, doesn't replace it)", async () => {
    const format = await loadFormat("straw-motion", "unhypped-news");
    const lookup = await loadBaselinePrompt("straw-motion", format, "news-carousel");
    assert.ok(lookup.found);
    const normalized = normalizeBaselineProse(lookup.content);

    assert.match(normalized, /render(?:ed)? unaltered/i);
    assert.match(
      normalized,
      /do not change its shape, proportions, or color in any way, and do not restyle it to match the scene/i,
    );
  });

  it("(AC3) instructs a smaller pill + logo on every slide after the hook, larger allowed on the hook slide (slide_index 0)", async () => {
    const format = await loadFormat("straw-motion", "unhypped-news");
    const lookup = await loadBaselinePrompt("straw-motion", format, "news-carousel");
    assert.ok(lookup.found);
    const normalized = normalizeBaselineProse(lookup.content);

    assert.match(normalized, /scale varies by slide position/i);
    assert.match(normalized, /hook slide \(slide_index 0\)/i);
    assert.match(normalized, /no wider than ~⅙ frame width/);
    assert.match(normalized, /noticeably smaller/i);
  });

  it("(AC4) the pre-existing logo/pill checklist facts (unaltered logo, never-all-caps pill) are still genuine substrings of the document", async () => {
    const format = await loadFormat("straw-motion", "unhypped-news");
    const lookup = await loadBaselinePrompt("straw-motion", format, "news-carousel");
    assert.ok(lookup.found);
    const normalized = normalizeBaselineProse(lookup.content);

    assert.ok(normalized.includes(STRAW_MOTION_BASELINE.logoReferenceName));
    assert.ok(normalized.includes(STRAW_MOTION_BASELINE.neverAllCapsInstruction));
    assert.ok(normalized.includes(STRAW_MOTION_BASELINE.pillText));
  });

  it("every strawMotionIdeaOneCarouselSpec() slide carries the negative guardrail clause verbatim (the doc/fixture stay in sync, mirroring issue #109's own sync check)", () => {
    const spec = strawMotionIdeaOneCarouselSpec() as { slides: readonly { image_prompt: string }[] };
    for (const slide of spec.slides) {
      assert.ok(slide.image_prompt.includes(STRAW_MOTION_BASELINE.logoNameGuardrailInstruction));
      assert.ok(slide.image_prompt.includes(STRAW_MOTION_BASELINE.logoReferencePhrase));
    }
  });

  it("the committed idea-01 fixture still passes the full author-phase checklist parameterized with the UPDATED STRAW_MOTION_BASELINE (logo-reference + logo-name-not-as-text both ok)", () => {
    const result = auditNewsCarouselAuthorPhase(strawMotionIdeaOneCarouselSpec(), [], STRAW_MOTION_BASELINE);
    assert.equal(result.ok, true);
    const logoReferenceItem = result.items.find((i) => i.id === "logo-reference");
    const logoNameItem = result.items.find((i) => i.id === "logo-name-not-as-text");
    assert.equal(logoReferenceItem?.ok, true);
    assert.equal(logoNameItem?.ok, true);
  });
});

/**
 * Pins the reengineered 7-slide narrative formula issue #111 (epic #106 item 6) adds to the document —
 * mirroring issue #109/#110's own precedent ("a docs-test in spirit, kept as a REGULAR `.test.ts`
 * because it reads the SAME real document this file already reads for issues #83/#85/#109/#110's own
 * pins, so it runs under `npm test`'s always-on gate"). Confined to the "The 7-slide narrative"
 * section only — the fixed clauses / template / worked Examples this file's other describe blocks
 * pin are untouched by this change.
 */
describe("news-carousel.md's 7-slide narrative formula advances real comprehension, not just mood (issue #111 item 6)", () => {
  it("states the standing rule: every role's on-slide line must state what happened and what it means", async () => {
    const format = await loadFormat("straw-motion", "unhypped-news");
    const lookup = await loadBaselinePrompt("straw-motion", format, "news-carousel");
    assert.ok(lookup.found);
    const normalized = normalizeBaselineProse(lookup.content);

    assert.match(normalized, /must advance real comprehension/i);
    assert.match(normalized, /state plainly what happened and what it means/i);
    assert.match(normalized, /acceptable only when it is ALSO informative/i);
  });

  it("names the mood-only anti-pattern by the issue's own reproduced examples", async () => {
    const format = await loadFormat("straw-motion", "unhypped-news");
    const lookup = await loadBaselinePrompt("straw-motion", format, "news-carousel");
    assert.ok(lookup.found);
    const normalized = normalizeBaselineProse(lookup.content);

    assert.ok(normalized.includes('"Same week."'));
    assert.ok(normalized.includes('"You still check."'));
    assert.match(normalized, /name(s)? nothing a reader could repeat back/i);
  });

  it("keeps the fixed role order unchanged: hook, then, shift, proof, different, next, cta", async () => {
    const format = await loadFormat("straw-motion", "unhypped-news");
    const lookup = await loadBaselinePrompt("straw-motion", format, "news-carousel");
    assert.ok(lookup.found);
    const normalized = normalizeBaselineProse(lookup.content);

    const narrativeSection = normalized.split("The 7-slide narrative")[1] ?? "";
    const roleOrder = [...CAROUSEL_ROLES];
    const positions = roleOrder.map((role) => narrativeSection.indexOf(`**${role}**`));
    assert.ok(
      positions.every((p) => p >= 0),
      `every role must be named as a bolded heading in the narrative section: ${JSON.stringify(positions)}`,
    );
    for (let i = 1; i < positions.length; i += 1) {
      assert.ok(
        positions[i]! > positions[i - 1]!,
        `role "${roleOrder[i]}" must appear after "${roleOrder[i - 1]}", matching CAROUSEL_ROLES' fixed order`,
      );
    }
  });

  it("splits each role's guidance into what the stat_callout must name vs. what the text must state", async () => {
    const format = await loadFormat("straw-motion", "unhypped-news");
    const lookup = await loadBaselinePrompt("straw-motion", format, "news-carousel");
    assert.ok(lookup.found);
    const normalized = normalizeBaselineProse(lookup.content);

    assert.match(normalized, /the `stat_callout` names/i);
    assert.match(normalized, /the `text` (spells out|states)/i);
  });

  it("composes with — never reverts — the pre-existing #108/#109/#110 facts in the same document", async () => {
    const format = await loadFormat("straw-motion", "unhypped-news");
    const lookup = await loadBaselinePrompt("straw-motion", format, "news-carousel");
    assert.ok(lookup.found);
    const normalized = normalizeBaselineProse(lookup.content);

    // #108 (no-dash rule, card-text clause).
    assert.match(normalized, /Never an em dash/);
    // #109 (render-fidelity guardrails).
    assert.match(normalized, /13-14px equivalent/);
    // #110 (logo negative-prompt guardrail + slide-position sizing).
    assert.match(normalized, /negative-prompt instruction/i);
    assert.match(normalized, /scale varies by slide position/i);
  });

  it("the graduated Straw Motion fixture is unaffected — this change touches only the narrative section", () => {
    const spec = strawMotionIdeaOneCarouselSpec() as { slides: readonly { image_prompt: string }[] };
    for (const slide of spec.slides) {
      for (const clause of STRAW_MOTION_BASELINE.fixedClauses) {
        assert.ok(slide.image_prompt.includes(clause));
      }
    }
    const result = auditNewsCarouselAuthorPhase(strawMotionIdeaOneCarouselSpec(), [], STRAW_MOTION_BASELINE);
    assert.equal(result.ok, true);
  });
});
