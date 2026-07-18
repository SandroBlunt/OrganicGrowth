import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getRecipe,
  listRecipes,
  listWiredRecipeSlugs,
  isWiredRecipe,
} from "./registry.ts";
import { PHASE_ORDER, declaresAllPhasesInOrder } from "./phase-contract.ts";
import { validate as validateProductionSpec } from "../production-spec/validate.ts";
import { scanForBannedWords } from "../production-spec/brand-safety.ts";
import { validateNewsCarouselSpec } from "../production-spec/news-carousel-validate.ts";
import { scanNewsCarouselForBannedWords } from "../production-spec/news-carousel-brand-safety.ts";
import { JSON_MASTER_NODE_NAME, CHARACTER_NODE_NAME, WATERMARK_NODE_NAME } from "../space-driver/driver.ts";
import { canonicalProtocol, canonicalCarouselProtocol } from "../execution-protocol/protocol.ts";
import { validSpec } from "../production-spec/fixtures/specs.ts";
import { validCarouselSpec } from "../production-spec/fixtures/news-carousel-specs.ts";

describe("Recipe registry — seeded with two entries (issue #54, issue #81)", () => {
  it("registers exactly two Recipes: character-explainer-with-cast and news-carousel", () => {
    const slugs = listWiredRecipeSlugs();
    assert.deepEqual(slugs, ["character-explainer-with-cast", "news-carousel"]);
    assert.equal(listRecipes().length, 2);
  });

  it("getRecipe returns the seeded character Recipe by slug", () => {
    const recipe = getRecipe("character-explainer-with-cast");
    assert.ok(recipe !== null);
    assert.equal(recipe!.slug, "character-explainer-with-cast");
    assert.equal(recipe!.name, "Character Explainer with Cast");
  });

  it("getRecipe returns the seeded news-carousel Recipe by slug", () => {
    const recipe = getRecipe("news-carousel");
    assert.ok(recipe !== null);
    assert.equal(recipe!.slug, "news-carousel");
    assert.equal(recipe!.name, "News Carousel");
  });

  it("getRecipe returns null for an unregistered slug — never throws", () => {
    assert.equal(getRecipe("carousel"), null);
    assert.equal(getRecipe(""), null);
    assert.equal(getRecipe("../evil"), null);
  });

  it("isWiredRecipe is true for both seeded slugs and false for an unregistered one", () => {
    assert.equal(isWiredRecipe("character-explainer-with-cast"), true);
    assert.equal(isWiredRecipe("news-carousel"), true);
    assert.equal(isWiredRecipe("carousel"), false);
    assert.equal(isWiredRecipe(""), false);
  });
});

describe("The character Recipe declares gates + spec-shape + copy-shape + Space target (issue #54 AC1) — UNCHANGED by issue #81", () => {
  const recipe = getRecipe("character-explainer-with-cast")!;

  it("declares exactly one gate: cast — matching today's single Cast-gate protocol", () => {
    assert.deepEqual(recipe.gates, ["cast"]);
  });

  it("declares a Space target with the node names today's driver actually uses", () => {
    assert.equal(recipe.space.id, "a1f05d67-1b98-4d10-9251-6603bea3b578");
    assert.equal(recipe.space.name, "Organic Character Explainer");
    // Not duplicated literals: assert equality against the SAME constants driver.ts exports.
    assert.equal(recipe.space.nodes.specInput, JSON_MASTER_NODE_NAME);
    assert.equal(recipe.space.nodes.pinnedReference, CHARACTER_NODE_NAME);
  });

  it("declares the cast/clip run-point node names from the SAME canonicalProtocol() the driver reads", () => {
    const protocol = canonicalProtocol();
    const castRunPoint = protocol.run_points.find((rp) => rp.gate === "cast")!;
    const clipRunPoint = protocol.run_points.find((rp) => rp.gate === null)!;
    assert.equal(recipe.space.nodes.castRunPoint, castRunPoint.start);
    assert.equal(recipe.space.nodes.clipRunPoint, clipRunPoint.start);
  });

  it("declares a watermarkNode — the real, captured Watermark-instructions node (QA-1, issue #88)", () => {
    assert.equal(recipe.space.nodes.watermarkNode, WATERMARK_NODE_NAME);
  });

  it("declares a spec-shape whose validator IS the real production-spec validator (zero drift)", () => {
    assert.equal(recipe.specShape.validate, validateProductionSpec);
  });

  it("declares a spec-shape whose banned-word scan IS the real brand-safety scanner (zero drift, issue #81)", () => {
    assert.equal(recipe.specShape.scanBannedWords, scanForBannedWords);
  });

  it("the spec-shape's validator accepts a well-formed Spec and rejects a malformed one", () => {
    assert.equal(recipe.specShape.validate(validSpec()).ok, true);
    assert.equal(recipe.specShape.validate({}).ok, false);
  });

  it("declares a copy-shape of its OWN — 180 chars, 1-3 emojis — no longer sourced from a shared Spec-contract constant (ADR-0012, issue #58)", () => {
    assert.equal(recipe.copyShape.maxChars, 180);
    assert.equal(recipe.copyShape.minEmojis, 1);
    assert.equal(recipe.copyShape.maxEmojis, 3);
  });

  it("the Spec no longer carries post_copy — copy is composed separately (ADR-0012)", () => {
    assert.equal(recipe.specShape.validate(validSpec()).ok, true);
    assert.equal("post_copy" in validSpec(), false);
  });

  it("declares its typed canvas inputs: one idea-pick media slot (Selected Character) + a prompt node (issue #81 AC1)", () => {
    assert.deepEqual(Object.keys(recipe.canvasInputs.mediaSlots), ["Selected Character"]);
    const slot = recipe.canvasInputs.mediaSlots["Selected Character"]!;
    assert.equal(slot.kind, "idea-pick");
    assert.equal(slot.media, "image");
    assert.equal(slot.required, true);
    assert.equal(slot.kind === "idea-pick" ? slot.gate : undefined, "cast");
    // The idea-pick slot's gate must be one of THIS Recipe's own declared gates.
    assert.ok(recipe.gates.includes(slot.kind === "idea-pick" ? slot.gate : ""));
  });

  it("declares its prompt node as the SAME node the Producer injects the Production Spec into", () => {
    assert.equal(recipe.canvasInputs.promptNode, recipe.space.nodes.specInput);
    assert.equal(recipe.canvasInputs.promptNode, JSON_MASTER_NODE_NAME);
  });

  it("declares all six Phase Contracts, in PHASE_ORDER's exact order (issue #85 AC1)", () => {
    assert.equal(declaresAllPhasesInOrder(recipe.phases), true);
    assert.deepEqual(
      recipe.phases.map((p) => p.phase),
      [...PHASE_ORDER],
    );
  });

  it("its author-phase checklist has exactly 3 items: 2 mechanical (referencing its OWN specShape) + 1 agent-judged", () => {
    const author = recipe.phases.find((p) => p.phase === "author")!;
    assert.equal(author.checklist.length, 3);
    const mechanical = author.checklist.filter((i) => i.kind === "mechanical");
    const agentJudged = author.checklist.filter((i) => i.kind === "agent-judged");
    assert.equal(mechanical.length, 2);
    assert.equal(agentJudged.length, 1);
  });

  it("its bind-media-phase and copy-phase checklists each have exactly 1 mechanical item", () => {
    const bindMedia = recipe.phases.find((p) => p.phase === "bind-media")!;
    const copy = recipe.phases.find((p) => p.phase === "copy")!;
    assert.equal(bindMedia.checklist.length, 1);
    assert.equal(bindMedia.checklist[0]!.kind, "mechanical");
    assert.equal(copy.checklist.length, 1);
    assert.equal(copy.checklist[0]!.kind, "mechanical");
  });
});

describe("The News Carousel Recipe declares its OWN gates + spec-shape + copy-shape + Space target (issue #81 AC2)", () => {
  const recipe = getRecipe("news-carousel")!;

  it("declares ZERO gates — a gate count different from the character Recipe's one", () => {
    assert.deepEqual(recipe.gates, []);
  });

  it("declares a Space target different from the character Recipe's — the single-lane 'Carrousel' Space", () => {
    const characterRecipe = getRecipe("character-explainer-with-cast")!;
    assert.equal(recipe.space.name, "Carrousel");
    assert.notEqual(recipe.space.id, characterRecipe.space.id);
    assert.notEqual(recipe.space.name, characterRecipe.space.name);
  });

  it("declares its Space's SOLE run-point name from the SAME canonicalCarouselProtocol() (zero drift)", () => {
    const protocol = canonicalCarouselProtocol();
    assert.equal(protocol.run_points.length, 1);
    assert.equal(recipe.space.nodes.clipRunPoint, protocol.run_points[0]!.start);
    assert.equal(recipe.space.nodes.clipRunPoint, "JSON Master");
  });

  it("declares NO pinnedReference/castRunPoint — it has no pick-gate to pin or render a paused Cast for", () => {
    assert.equal(recipe.space.nodes.pinnedReference, undefined);
    assert.equal(recipe.space.nodes.castRunPoint, undefined);
  });

  it("declares NO watermarkNode — its canvas has no watermark parameter (QA-1, issue #88)", () => {
    assert.equal(recipe.space.nodes.watermarkNode, undefined);
  });

  it("declares a spec-shape whose validator IS the real news-carousel validator (zero drift)", () => {
    assert.equal(recipe.specShape.validate, validateNewsCarouselSpec);
  });

  it("declares a spec-shape whose banned-word scan IS the real news-carousel scanner (zero drift)", () => {
    assert.equal(recipe.specShape.scanBannedWords, scanNewsCarouselForBannedWords);
  });

  it("the spec-shape's validator accepts a well-formed 7-slide Spec and rejects a malformed one", () => {
    assert.equal(recipe.specShape.validate(validCarouselSpec()).ok, true);
    assert.equal(recipe.specShape.validate({}).ok, false);
  });

  it("the spec-shape's banned-word scan catches a seeded banned word (issue #81 AC3)", () => {
    const clean = recipe.specShape.scanBannedWords(validCarouselSpec(), ["miracle"]);
    assert.equal(clean.ok, true);
  });

  it("declares a copy-shape DIFFERENT from the character Recipe's 180/1-3 (2200/0/2)", () => {
    assert.equal(recipe.copyShape.maxChars, 2200);
    assert.equal(recipe.copyShape.minEmojis, 0);
    assert.equal(recipe.copyShape.maxEmojis, 2);
  });

  it("declares its typed canvas inputs: one brand-asset media slot (Brand_Logo, the real captured canvas node) + a prompt node (issue #81 AC1, issue #89 node-name alignment)", () => {
    assert.deepEqual(Object.keys(recipe.canvasInputs.mediaSlots), ["Brand_Logo"]);
    const slot = recipe.canvasInputs.mediaSlots["Brand_Logo"]!;
    assert.equal(slot.kind, "brand-asset");
    assert.equal(slot.media, "image");
    assert.equal(slot.required, true);
    assert.equal(slot.kind === "brand-asset" ? slot.brandAssetKey : undefined, "brand-logo");
  });

  it("declares its prompt node as the SAME node its sole run-point starts at", () => {
    assert.equal(recipe.canvasInputs.promptNode, recipe.space.nodes.clipRunPoint);
    assert.equal(recipe.canvasInputs.promptNode, "JSON Master");
  });

  it("declares all six Phase Contracts, in PHASE_ORDER's exact order (issue #85 AC1)", () => {
    assert.equal(declaresAllPhasesInOrder(recipe.phases), true);
    assert.deepEqual(
      recipe.phases.map((p) => p.phase),
      [...PHASE_ORDER],
    );
  });

  it("its author-phase checklist has exactly 8 items: 7 mechanical + 1 agent-judged ('grounded subject') — the slice's headline case (issue #85 AC2)", () => {
    const author = recipe.phases.find((p) => p.phase === "author")!;
    assert.equal(author.checklist.length, 8);
    const mechanical = author.checklist.filter((i) => i.kind === "mechanical");
    const agentJudged = author.checklist.filter((i) => i.kind === "agent-judged");
    assert.equal(mechanical.length, 7);
    assert.equal(agentJudged.length, 1);
    assert.match(agentJudged[0]!.description, /grounded subject/i);
  });

  it("its gate-phase checklist is EMPTY — it declares zero gates, so nothing pauses there", () => {
    const gate = recipe.phases.find((p) => p.phase === "gate")!;
    assert.deepEqual(gate.checklist, []);
  });

  it("its bind-media-phase and copy-phase checklists each have exactly 1 mechanical item", () => {
    const bindMedia = recipe.phases.find((p) => p.phase === "bind-media")!;
    const copy = recipe.phases.find((p) => p.phase === "copy")!;
    assert.equal(bindMedia.checklist.length, 1);
    assert.equal(bindMedia.checklist[0]!.kind, "mechanical");
    assert.equal(copy.checklist.length, 1);
    assert.equal(copy.checklist[0]!.kind, "mechanical");
  });

  it("every mechanical checklist item across every phase carries a non-empty reference (issue #85 AC3: referenced, not duplicated)", () => {
    for (const phase of recipe.phases) {
      for (const item of phase.checklist) {
        if (item.kind === "mechanical") {
          assert.ok(item.reference.length > 0, `${phase.phase}: ${item.description}`);
        }
      }
    }
  });
});
