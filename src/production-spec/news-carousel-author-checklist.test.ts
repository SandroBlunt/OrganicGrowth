import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  auditNewsCarouselAuthorPhase,
  verifyBaselineParamsAgainstDocument,
  type NewsCarouselBaselineParams,
} from "./news-carousel-author-checklist.ts";
import {
  TEST_BASELINE,
  baselineAdherentCarouselSpec,
  missingLogoReference,
  missingPillText,
  missingCapsGuardrail,
  missingFixedClause,
  unconfirmedCardStyle,
  companyNotCitedInPrompt,
  companyOnlySubstringInPrompt,
  bannedWordInText,
  allBottomPlacements,
  tooFewDistinctPlacements,
} from "./fixtures/news-carousel-author-checklist-specs.ts";
import { sixSlides, rolesOutOfOrder, textTooLong } from "./fixtures/news-carousel-specs.ts";
import type { ChecklistItemAudit, PhaseAuditResult } from "../recipe/phase-contract.ts";

/** Select a checklist item by its STABLE id — never by array position, so inserting a new item
 *  no longer renumbers every assertion below it. */
function item(result: PhaseAuditResult, id: string): ChecklistItemAudit {
  const found = result.items.find((i) => i.id === id);
  assert.ok(found, `checklist item "${id}" must exist`);
  return found;
}

describe("auditNewsCarouselAuthorPhase — graduated from the #77 prototype, runs as CODE (issue #85 AC2)", () => {
  it("a baseline-adherent Spec passes every mechanical item; the agent-judged item is flagged, not failed", () => {
    const result = auditNewsCarouselAuthorPhase(baselineAdherentCarouselSpec(), [], TEST_BASELINE);
    assert.equal(result.ok, true);
    assert.equal(result.phase, "author");
    assert.equal(result.recipe, "news-carousel");
    assert.equal(result.items.length, 10);

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
    assert.equal(item(result, "slide-count-role-order").ok, false);
  });

  it("fails the same item when roles are out of order", () => {
    const result = auditNewsCarouselAuthorPhase(rolesOutOfOrder(), [], TEST_BASELINE);
    assert.equal(result.ok, false);
    assert.equal(item(result, "slide-count-role-order").ok, false);
  });

  it("fails the 'text <= 140 chars' item — REFERENCES the SAME validator", () => {
    const result = auditNewsCarouselAuthorPhase(textTooLong(), [], TEST_BASELINE);
    assert.equal(result.ok, false);
    assert.equal(item(result, "text-length").ok, false);
  });

  it("fails the logo-reference item when the parameterized logo reference name is absent", () => {
    const result = auditNewsCarouselAuthorPhase(missingLogoReference(), [], TEST_BASELINE);
    assert.equal(result.ok, false);
    assert.equal(item(result, "logo-reference").ok, false);
    // Every OTHER mechanical item still passes — only this one is isolated by the mutation.
    assert.equal(item(result, "pill-text-caps").ok, true);
  });

  it("fails the pill-text/caps-guard item when the parameterized pill text is absent", () => {
    const result = auditNewsCarouselAuthorPhase(missingPillText(), [], TEST_BASELINE);
    assert.equal(result.ok, false);
    assert.equal(item(result, "pill-text-caps").ok, false);
  });

  it("fails the pill-text/caps-guard item when the never-all-caps instruction is absent", () => {
    const result = auditNewsCarouselAuthorPhase(missingCapsGuardrail(), [], TEST_BASELINE);
    assert.equal(result.ok, false);
    assert.equal(item(result, "pill-text-caps").ok, false);
  });

  it("fails the fixed-baseline-clauses item when one parameterized clause is dropped", () => {
    const result = auditNewsCarouselAuthorPhase(missingFixedClause(), [], TEST_BASELINE);
    assert.equal(result.ok, false);
    assert.equal(item(result, "fixed-clauses").ok, false);
  });

  it("fails the card-style item when a slide's card_style is not one of the parameterized confirmed styles", () => {
    const result = auditNewsCarouselAuthorPhase(unconfirmedCardStyle(), [], TEST_BASELINE);
    assert.equal(result.ok, false);
    assert.equal(item(result, "card-style-stat-callout").ok, false);
  });

  describe("placement-variety — the NEW mechanical item (issue #106)", () => {
    it("is present, kind: mechanical, and flags an all-bottom-region Spec — the idea-01 pattern (AC1)", () => {
      const result = auditNewsCarouselAuthorPhase(allBottomPlacements(), [], TEST_BASELINE);
      assert.equal(result.ok, false);
      const variety = item(result, "placement-variety");
      assert.equal(variety.kind, "mechanical");
      assert.equal(variety.ok, false);
      // Every OTHER mechanical item still passes — only card_style values changed, so only
      // placement-variety is isolated by this mutation (a "too few distinct" fixture would also
      // trip card-style-stat-callout if the mutation used an unconfirmed style; it doesn't here).
      assert.equal(item(result, "logo-reference").ok, true);
      assert.equal(item(result, "pill-text-caps").ok, true);
      assert.equal(item(result, "fixed-clauses").ok, true);
      assert.equal(item(result, "card-style-stat-callout").ok, true);
    });

    it("passes when placements spread across the vertical range and include a top-region card (AC2)", () => {
      const result = auditNewsCarouselAuthorPhase(baselineAdherentCarouselSpec(), [], TEST_BASELINE);
      assert.equal(result.ok, true);
      assert.equal(item(result, "placement-variety").ok, true);
    });

    it("fails on too few distinct placements even when a top-region card IS used — the OTHER disjunct", () => {
      const result = auditNewsCarouselAuthorPhase(tooFewDistinctPlacements(), [], TEST_BASELINE);
      assert.equal(result.ok, false);
      assert.equal(item(result, "placement-variety").ok, false);
    });

    it("participates in the overall ok — a mechanical item is never merely flagged (ADR-0017 vs agent-judged)", () => {
      const failing = auditNewsCarouselAuthorPhase(allBottomPlacements(), [], TEST_BASELINE);
      assert.equal(item(failing, "placement-variety").ok, false);
      assert.equal(failing.ok, false, "overall ok must be false when placement-variety fails");
    });

    it("takes 'top region' and the distinct-count threshold from NewsCarouselBaselineParams — never a hardcoded literal (AC3)", () => {
      // The SAME all-bottom Spec, unmodified, now passes once a DIFFERENT NewsCarouselBaselineParams
      // redefines "top region" to include a style the Spec actually uses and relaxes the threshold —
      // proving the rule is genuinely parameterized, not a literal baked into the checked module.
      const relaxedBaseline: NewsCarouselBaselineParams = {
        ...TEST_BASELINE,
        topRegionCardStyles: [TEST_BASELINE.confirmedCardStyles[0]!],
        minDistinctCardStyles: 1,
      };
      const result = auditNewsCarouselAuthorPhase(allBottomPlacements(), [], relaxedBaseline);
      assert.equal(item(result, "placement-variety").ok, true);
    });

    it("never throws on a malformed / non-object Spec, and the placement-variety item itself fails cleanly", () => {
      assert.doesNotThrow(() => auditNewsCarouselAuthorPhase({}, [], TEST_BASELINE));
      const result = auditNewsCarouselAuthorPhase({}, [], TEST_BASELINE);
      assert.equal(item(result, "placement-variety").ok, false);
    });
  });

  it("fails the companies item when a slide names a company its own image_prompt never cites", () => {
    const result = auditNewsCarouselAuthorPhase(companyNotCitedInPrompt(), [], TEST_BASELINE);
    assert.equal(result.ok, false);
    assert.equal(item(result, "companies-cited").ok, false);
  });

  it("fails the companies item when the name appears only inside a longer word — never a bare substring match", () => {
    const result = auditNewsCarouselAuthorPhase(companyOnlySubstringInPrompt(), [], TEST_BASELINE);
    assert.equal(result.ok, false);
    assert.equal(item(result, "companies-cited").ok, false);
  });

  it("fails the banned-word item, reject-only, and names the word and field — never rewrites the Spec", () => {
    const spec = bannedWordInText("miracle");
    const result = auditNewsCarouselAuthorPhase(spec, ["miracle"], TEST_BASELINE);
    assert.equal(result.ok, false);
    const bannedItem = item(result, "banned-words");
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
    assert.equal(item(result, "banned-words").ok, true);
  });

  it("omitting the raw document text skips the baseline-copy-verification item entirely", () => {
    const result = auditNewsCarouselAuthorPhase(baselineAdherentCarouselSpec(), [], TEST_BASELINE);
    assert.equal(result.items.length, 10);
  });

  it("supplying the raw document text adds one more item, verifying the hand-copy against it", () => {
    const documentText =
      `${TEST_BASELINE.logoReferenceName} ${TEST_BASELINE.pillText} ` +
      `${TEST_BASELINE.neverAllCapsInstruction} ${TEST_BASELINE.fixedClauses.join(" ")}`;
    const result = auditNewsCarouselAuthorPhase(baselineAdherentCarouselSpec(), [], TEST_BASELINE, documentText);
    assert.equal(result.items.length, 11);
    assert.equal(item(result, "baseline-doc-verified").ok, true);
  });

  it("fails the baseline-copy-verification item when a hand-copied fact isn't actually in the document", () => {
    const documentText = "a document that never mentions the logo name, pill text, or fixed clauses";
    const result = auditNewsCarouselAuthorPhase(baselineAdherentCarouselSpec(), [], TEST_BASELINE, documentText);
    assert.equal(result.ok, false);
    const verifyItem = item(result, "baseline-doc-verified");
    assert.equal(verifyItem.ok, false);
    assert.ok(verifyItem.detail?.includes(TEST_BASELINE.logoReferenceName));
  });
});

describe("verifyBaselineParamsAgainstDocument — cross-checks a hand-copied baseline against the raw document", () => {
  it("passes when every verbatim fact is present in the document", () => {
    const documentText =
      `${TEST_BASELINE.logoReferenceName} ${TEST_BASELINE.pillText} ` +
      `${TEST_BASELINE.neverAllCapsInstruction} ${TEST_BASELINE.fixedClauses.join(" ")}`;
    const result = verifyBaselineParamsAgainstDocument(TEST_BASELINE, documentText);
    assert.equal(result.ok, true);
    assert.deepEqual(result.mismatches, []);
  });

  it("reports every fact that is missing from the document, without throwing", () => {
    const result = verifyBaselineParamsAgainstDocument(TEST_BASELINE, "an unrelated document");
    assert.equal(result.ok, false);
    assert.equal(result.mismatches.length > 0, true);
    assert.ok(result.mismatches.some((m) => m.includes(TEST_BASELINE.logoReferenceName)));
  });

  it("never checks confirmedCardStyles — those are the Skill's own names, not literal document text", () => {
    // A document naming every OTHER fact verbatim but never using the code-style slug "full_width"
    // must still pass — confirmedCardStyles is deliberately excluded from this verbatim check.
    const documentText =
      `${TEST_BASELINE.logoReferenceName} ${TEST_BASELINE.pillText} ` +
      `${TEST_BASELINE.neverAllCapsInstruction} ${TEST_BASELINE.fixedClauses.join(" ")}`;
    const result = verifyBaselineParamsAgainstDocument(TEST_BASELINE, documentText);
    assert.equal(result.ok, true);
  });
});
