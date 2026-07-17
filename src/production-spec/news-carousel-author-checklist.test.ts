import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { auditNewsCarouselAuthorPhase } from "./news-carousel-author-checklist.ts";
import {
  TEST_BASELINE,
  baselineAdherentCarouselSpec,
  missingLogoReference,
  missingPillText,
  missingCapsGuardrail,
  missingFixedClause,
  unconfirmedCardStyle,
  bannedWordInText,
} from "./fixtures/news-carousel-author-checklist-specs.ts";
import { sixSlides, rolesOutOfOrder, textTooLong } from "./fixtures/news-carousel-specs.ts";

describe("auditNewsCarouselAuthorPhase — graduated from the #77 prototype, runs as CODE (issue #85 AC2)", () => {
  it("a baseline-adherent Spec passes every mechanical item; the agent-judged item is flagged, not failed", () => {
    const result = auditNewsCarouselAuthorPhase(baselineAdherentCarouselSpec(), [], TEST_BASELINE);
    assert.equal(result.ok, true);
    assert.equal(result.phase, "author");
    assert.equal(result.recipe, "news-carousel");
    assert.equal(result.items.length, 8);

    const agentJudged = result.items.filter((i) => i.kind === "agent-judged");
    assert.equal(agentJudged.length, 1);
    assert.equal(agentJudged[0]!.ok, null);
    assert.match(agentJudged[0]!.description, /grounded subject/i);

    for (const item of result.items) {
      if (item.kind === "mechanical") assert.equal(item.ok, true, item.description);
    }
  });

  it("fails the '7 slides, roles in order' item on a short Spec — REFERENCES validateNewsCarouselSpec, does not duplicate it", () => {
    const result = auditNewsCarouselAuthorPhase(sixSlides(), [], TEST_BASELINE);
    assert.equal(result.ok, false);
    assert.equal(result.items[0]!.ok, false);
  });

  it("fails the same item when roles are out of order", () => {
    const result = auditNewsCarouselAuthorPhase(rolesOutOfOrder(), [], TEST_BASELINE);
    assert.equal(result.ok, false);
    assert.equal(result.items[0]!.ok, false);
  });

  it("fails the 'text <= 140 chars' item — REFERENCES the SAME validator", () => {
    const result = auditNewsCarouselAuthorPhase(textTooLong(), [], TEST_BASELINE);
    assert.equal(result.ok, false);
    assert.equal(result.items[1]!.ok, false);
  });

  it("fails the logo-reference item when the parameterized logo reference name is absent", () => {
    const result = auditNewsCarouselAuthorPhase(missingLogoReference(), [], TEST_BASELINE);
    assert.equal(result.ok, false);
    assert.equal(result.items[2]!.ok, false);
    // Every OTHER mechanical item still passes — only this one is isolated by the mutation.
    assert.equal(result.items[3]!.ok, true);
  });

  it("fails the pill-text/caps-guard item when the parameterized pill text is absent", () => {
    const result = auditNewsCarouselAuthorPhase(missingPillText(), [], TEST_BASELINE);
    assert.equal(result.ok, false);
    assert.equal(result.items[3]!.ok, false);
  });

  it("fails the pill-text/caps-guard item when the never-all-caps instruction is absent", () => {
    const result = auditNewsCarouselAuthorPhase(missingCapsGuardrail(), [], TEST_BASELINE);
    assert.equal(result.ok, false);
    assert.equal(result.items[3]!.ok, false);
  });

  it("fails the fixed-baseline-clauses item when one parameterized clause is dropped", () => {
    const result = auditNewsCarouselAuthorPhase(missingFixedClause(), [], TEST_BASELINE);
    assert.equal(result.ok, false);
    assert.equal(result.items[4]!.ok, false);
  });

  it("fails the card-style item when a slide's card_style is not one of the parameterized confirmed styles", () => {
    const result = auditNewsCarouselAuthorPhase(unconfirmedCardStyle(), [], TEST_BASELINE);
    assert.equal(result.ok, false);
    assert.equal(result.items[6]!.ok, false);
  });

  it("fails the banned-word item, reject-only, and names the word and field — never rewrites the Spec", () => {
    const spec = bannedWordInText("miracle");
    const result = auditNewsCarouselAuthorPhase(spec, ["miracle"], TEST_BASELINE);
    assert.equal(result.ok, false);
    const bannedItem = result.items[7]!;
    assert.equal(bannedItem.ok, false);
    assert.ok(bannedItem.detail?.includes("miracle"));
    assert.equal("spec" in result, false);
  });

  it("never throws on a malformed / non-object Spec, and fails cleanly", () => {
    assert.doesNotThrow(() => auditNewsCarouselAuthorPhase(null, [], TEST_BASELINE));
    assert.doesNotThrow(() => auditNewsCarouselAuthorPhase({}, [], TEST_BASELINE));
    const result = auditNewsCarouselAuthorPhase({}, [], TEST_BASELINE);
    assert.equal(result.ok, false);
  });

  it("is genuinely parameterized — DIFFERENT (Brand x Format) strings fail a Spec authored for TEST_BASELINE's strings", () => {
    // Straw Motion's REAL baseline strings, swapped in against a Spec that was authored to carry
    // TEST_BASELINE's DIFFERENT strings — this must fail, proving nothing is a hardcoded literal
    // inside the checked module (issue #85's core ask: parameterize, never hardcode).
    const strawMotionParams = {
      ...TEST_BASELINE,
      logoReferenceName: "Brand_Logo",
      pillText: "Unhypped News",
    };
    const result = auditNewsCarouselAuthorPhase(baselineAdherentCarouselSpec(), [], strawMotionParams);
    assert.equal(result.ok, false);
  });

  it("an empty banned-words list always passes the banned-word item", () => {
    const result = auditNewsCarouselAuthorPhase(baselineAdherentCarouselSpec(), [], TEST_BASELINE);
    assert.equal(result.items[7]!.ok, true);
  });
});
