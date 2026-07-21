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
import {
  STRAW_MOTION_BASELINE,
  strawMotionIdeaOneCarouselSpec,
} from "./fixtures/news-carousel-straw-motion-specs.ts";
import { loadFormat } from "../format/store.ts";
import { loadBaselinePrompt } from "../format/baseline-prompt.ts";
import { TEST_BASELINE } from "./fixtures/news-carousel-author-checklist-specs.ts";
import type { CarouselSlide } from "./news-carousel-contract.ts";

/**
 * The document is a wrapped markdown blockquote (each line prefixed "> ", sentences wrapped
 * mid-line). Normalize it the way a reader interprets rendered prose — strip the blockquote markers,
 * join lines with a space, collapse repeated whitespace — before checking containment, since a
 * sentence spanning a wrapped line break is never a literal contiguous byte run in the raw file.
 */
function normalizeBaselineDoc(content: string): string {
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
    assert.equal(result.items.length, 10);

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

    const normalized = normalizeBaselineDoc(lookup.content);

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

describe("the placement-variety item against idea-01's ACTUAL reported pattern, real style names (issue #106)", () => {
  it("flags the exact monotone pattern reproduction-confirmed on idea-01 — AC1", () => {
    // The Triage Assessment's own reproduction: idea-01's card_style values across its 7 slides were
    // full_width, floating_toast, small_badge, full_width_inset, floating_toast, small_badge_inset,
    // full_width — 5 distinct values, all bottom/lower-left, ZERO top-region cards, even though
    // STRAW_MOTION_BASELINE.confirmedCardStyles already includes the document's own top-region option.
    const ideaOnePattern = [
      "full_width",
      "floating_toast",
      "small_badge",
      "full_width_inset",
      "floating_toast",
      "small_badge_inset",
      "full_width",
    ];
    const base = strawMotionIdeaOneCarouselSpec() as { slides: readonly CarouselSlide[] };
    const monotoneSpec = {
      slides: base.slides.map((slide, i) => ({ ...slide, card_style: ideaOnePattern[i]! })),
    };

    const result = auditNewsCarouselAuthorPhase(monotoneSpec, [], STRAW_MOTION_BASELINE);
    assert.equal(result.ok, false);
    const variety = result.items.find((i) => i.id === "placement-variety");
    assert.ok(variety, "the placement-variety item must be present");
    assert.equal(variety.kind, "mechanical");
    assert.equal(variety.ok, false);

    // Only card_style values changed — every OTHER mechanical item (all sourced from the SAME real
    // image_prompt prose, untouched) still passes, isolating placement-variety as the sole failure.
    for (const other of result.items) {
      if (other.id !== "placement-variety" && other.kind === "mechanical") {
        assert.equal(other.ok, true, `${other.id} must still pass: ${other.detail ?? ""}`);
      }
    }
  });

  it("passes a genuinely varied 7-slide spread that includes a top-region card — AC2", () => {
    const result = auditNewsCarouselAuthorPhase(
      strawMotionIdeaOneCarouselSpec(),
      [],
      STRAW_MOTION_BASELINE,
    );
    assert.equal(result.ok, true);
    const variety = result.items.find((i) => i.id === "placement-variety");
    assert.ok(variety);
    assert.equal(variety.ok, true);
  });
});

describe("the real Baseline Prompt document instructs active placement spread, subject variety, and real-named-people balance (issue #106 AC5)", () => {
  it("the Card style guidance requires at least one top-region placement, actively, not just as an option among many", async () => {
    const format = await loadFormat("straw-motion", "unhypped-news");
    const lookup = await loadBaselinePrompt("straw-motion", format, "news-carousel");
    assert.ok(lookup.found);
    const normalized = normalizeBaselineDoc(lookup.content);

    assert.match(normalized, /actively spread placements/i);
    assert.match(normalized, /must use at least one/i);
    assert.match(normalized, /top card, photo below/i);
  });

  it("the Subject guidance instructs varying subject TYPE and reaching for the real named person, balanced with product shots", async () => {
    const format = await loadFormat("straw-motion", "unhypped-news");
    const lookup = await loadBaselinePrompt("straw-motion", format, "news-carousel");
    assert.ok(lookup.found);
    const normalized = normalizeBaselineDoc(lookup.content);

    assert.match(normalized, /vary the subject type/i);
    assert.match(normalized, /balance (?:people|real people)/i);
  });
});
