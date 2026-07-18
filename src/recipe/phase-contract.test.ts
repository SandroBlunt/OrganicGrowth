import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  PHASE_ORDER,
  declaresAllPhasesInOrder,
  auditAuthorPhase,
  auditBindMediaPhase,
  auditCopyPhase,
  auditPhase,
  type PhaseContract,
  type PhaseName,
} from "./phase-contract.ts";
import { getRecipe } from "./registry.ts";
import { validSpec, twoClips } from "../production-spec/fixtures/specs.ts";
import { validCarouselSpec, sixSlides } from "../production-spec/fixtures/news-carousel-specs.ts";
import type { BrandCopyRules } from "../production-spec/brand-profile.ts";

const NO_RULES: BrandCopyRules = { requiredCta: null, requiredHashtags: [], bannedWords: [] };

const characterRecipe = getRecipe("character-explainer-with-cast")!;
const carouselRecipe = getRecipe("news-carousel")!;

describe("PHASE_ORDER — the six production phases, in order (ADR-0017, CONTEXT.md 'Phase Contract')", () => {
  it("is exactly author -> bind-media -> gate -> render -> copy -> save", () => {
    assert.deepEqual(PHASE_ORDER, ["author", "bind-media", "gate", "render", "copy", "save"]);
  });
});

describe("declaresAllPhasesInOrder — a pure shape guard", () => {
  const make = (phase: PhaseName): PhaseContract => ({ phase, description: "d", checklist: [] });

  it("is true for a well-ordered, complete 6-phase list", () => {
    assert.equal(declaresAllPhasesInOrder(PHASE_ORDER.map(make)), true);
  });

  it("is false for a short list", () => {
    assert.equal(declaresAllPhasesInOrder([make("author")]), false);
  });

  it("is false for an out-of-order list", () => {
    const phases = PHASE_ORDER.map(make);
    const [a, b, ...rest] = phases;
    assert.equal(declaresAllPhasesInOrder([b!, a!, ...rest]), false);
  });

  it("both wired Recipes declare all 6 phases, in order (issue #85 AC1)", () => {
    assert.equal(declaresAllPhasesInOrder(characterRecipe.phases), true);
    assert.equal(declaresAllPhasesInOrder(carouselRecipe.phases), true);
  });
});

describe("auditAuthorPhase — generic across ANY wired Recipe, via its OWN specShape (issue #85 AC4)", () => {
  it("passes the character Recipe's author phase for a well-formed Spec", () => {
    const result = auditAuthorPhase(characterRecipe, { candidateSpec: validSpec(), bannedWords: [] });
    assert.equal(result.ok, true);
    assert.equal(result.recipe, "character-explainer-with-cast");
    assert.equal(result.phase, "author");
    assert.equal(result.items.length, 2);
  });

  it("fails the character Recipe's author phase for a malformed Spec (2 clips instead of 3) — referencing validate.ts, not duplicating it", () => {
    const result = auditAuthorPhase(characterRecipe, { candidateSpec: twoClips(), bannedWords: [] });
    assert.equal(result.ok, false);
    assert.equal(result.items[0]!.ok, false);
    assert.ok(result.items[0]!.detail !== undefined);
  });

  it("fails the character Recipe's author phase on a banned word — referencing brand-safety.ts, not duplicating it", () => {
    const spec = validSpec();
    (spec.character_concepts as string[])[0] = "A miracle alarm clock";
    const result = auditAuthorPhase(characterRecipe, { candidateSpec: spec, bannedWords: ["miracle"] });
    assert.equal(result.ok, false);
    assert.equal(result.items[1]!.ok, false);
  });

  it("passes the news-carousel Recipe's author phase for a well-formed Spec — the SAME auditor function", () => {
    const result = auditAuthorPhase(carouselRecipe, {
      candidateSpec: validCarouselSpec(),
      bannedWords: [],
    });
    assert.equal(result.ok, true);
    assert.equal(result.recipe, "news-carousel");
  });

  it("fails the news-carousel Recipe's author phase for a malformed Spec (6 slides instead of 7)", () => {
    const result = auditAuthorPhase(carouselRecipe, { candidateSpec: sixSlides(), bannedWords: [] });
    assert.equal(result.ok, false);
  });
});

describe("auditBindMediaPhase — generic across ANY wired Recipe, via its OWN canvasInputs.mediaSlots", () => {
  it("passes the character Recipe when its required 'Selected Character' slot is bound", () => {
    const result = auditBindMediaPhase(characterRecipe, {
      boundSlotNames: new Set(["Selected Character"]),
    });
    assert.equal(result.ok, true);
    assert.equal(result.items.length, 1);
  });

  it("fails the character Recipe when its required slot is NOT bound — STOPS the run (ADR-0016)", () => {
    const result = auditBindMediaPhase(characterRecipe, { boundSlotNames: new Set() });
    assert.equal(result.ok, false);
    assert.ok(result.items[0]!.detail?.includes("STOPS"));
  });

  it("passes the news-carousel Recipe when its required 'Brand_Logo' slot is bound", () => {
    const result = auditBindMediaPhase(carouselRecipe, { boundSlotNames: new Set(["Brand_Logo"]) });
    assert.equal(result.ok, true);
  });

  it("fails the news-carousel Recipe when its required slot is NOT bound", () => {
    const result = auditBindMediaPhase(carouselRecipe, { boundSlotNames: new Set() });
    assert.equal(result.ok, false);
  });
});

describe("auditCopyPhase — generic across ANY wired Recipe, via its OWN copyShape", () => {
  it("passes the character Recipe's copy phase for a valid Copy", () => {
    const copy = { caption: "Your first ten minutes decide your whole day ☀️", hashtags: ["#lifehacks"] };
    const result = auditCopyPhase(characterRecipe, { candidateCopy: copy, rules: NO_RULES });
    assert.equal(result.ok, true);
    assert.equal(result.items.length, 1);
  });

  it("fails the character Recipe's copy phase for a too-long caption", () => {
    const copy = { caption: "A".repeat(200) + " ☀️", hashtags: [] };
    const result = auditCopyPhase(characterRecipe, { candidateCopy: copy, rules: NO_RULES });
    assert.equal(result.ok, false);
  });

  it("passes the news-carousel Recipe's copy phase under its OWN, different shape (0 emojis allowed)", () => {
    const copy = {
      caption: "A calm editorial recap of this week's AI news, no emoji needed.",
      hashtags: ["#ainews"],
    };
    const result = auditCopyPhase(carouselRecipe, { candidateCopy: copy, rules: NO_RULES });
    assert.equal(result.ok, true);
  });

  it("the news-carousel Recipe's SAME long caption that broke the character Recipe passes here (2200-char cap)", () => {
    const copy = { caption: "A".repeat(200), hashtags: [] };
    const result = auditCopyPhase(carouselRecipe, { candidateCopy: copy, rules: NO_RULES });
    assert.equal(result.ok, true);
  });
});

describe("auditPhase — single dispatcher entry point (issue #85 AC4: 'an auditor can take a saved artifact + its phase and get a pass/fail')", () => {
  it("dispatches 'author' to auditAuthorPhase, identically", () => {
    const viaDispatcher = auditPhase(characterRecipe, {
      phase: "author",
      candidateSpec: validSpec(),
      bannedWords: [],
    });
    const direct = auditAuthorPhase(characterRecipe, { candidateSpec: validSpec(), bannedWords: [] });
    assert.deepEqual(viaDispatcher, direct);
  });

  it("dispatches 'bind-media' identically, for either Recipe", () => {
    const viaDispatcher = auditPhase(carouselRecipe, {
      phase: "bind-media",
      boundSlotNames: new Set(["Brand_Logo"]),
    });
    const direct = auditBindMediaPhase(carouselRecipe, { boundSlotNames: new Set(["Brand_Logo"]) });
    assert.deepEqual(viaDispatcher, direct);
  });

  it("dispatches 'copy' identically, for either Recipe", () => {
    const copy = { caption: "A calm recap.", hashtags: [] };
    const viaDispatcher = auditPhase(carouselRecipe, {
      phase: "copy",
      candidateCopy: copy,
      rules: NO_RULES,
    });
    const direct = auditCopyPhase(carouselRecipe, { candidateCopy: copy, rules: NO_RULES });
    assert.deepEqual(viaDispatcher, direct);
  });
});
