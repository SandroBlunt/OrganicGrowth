import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getRecipe,
  listRecipes,
  listWiredRecipeSlugs,
  isWiredRecipe,
} from "./registry.ts";
import { validate as validateProductionSpec } from "../production-spec/validate.ts";
import { validateNewsCarouselSpec } from "../production-spec/news-carousel-validate.ts";
import { JSON_MASTER_NODE_NAME, CHARACTER_NODE_NAME } from "../space-driver/driver.ts";
import { canonicalProtocol, canonicalCarouselProtocol } from "../execution-protocol/protocol.ts";
import { validSpec } from "../production-spec/fixtures/specs.ts";
import { validNewsCarouselSpec } from "../production-spec/fixtures/news-carousel-specs.ts";

describe("Recipe registry — seeded with TWO entries (issue #54, issue #60)", () => {
  it("registers exactly two Recipes: character-explainer-with-cast and news-carousel", () => {
    const slugs = listWiredRecipeSlugs();
    assert.deepEqual(slugs, ["character-explainer-with-cast", "news-carousel"]);
    assert.equal(listRecipes().length, 2);
  });

  it("getRecipe returns each seeded Recipe by slug", () => {
    const wired = getRecipe("character-explainer-with-cast");
    assert.ok(wired !== null);
    assert.equal(wired!.slug, "character-explainer-with-cast");
    assert.equal(wired!.name, "Character Explainer with Cast");

    const carousel = getRecipe("news-carousel");
    assert.ok(carousel !== null);
    assert.equal(carousel!.slug, "news-carousel");
    assert.equal(carousel!.name, "News Carousel");
  });

  it("getRecipe returns null for an unregistered slug — never throws", () => {
    assert.equal(getRecipe("carousel"), null);
    assert.equal(getRecipe(""), null);
    assert.equal(getRecipe("../evil"), null);
  });

  it("isWiredRecipe is true for both seeded slugs, false for anything else", () => {
    assert.equal(isWiredRecipe("character-explainer-with-cast"), true);
    assert.equal(isWiredRecipe("news-carousel"), true);
    assert.equal(isWiredRecipe("carousel"), false);
    assert.equal(isWiredRecipe(""), false);
  });
});

describe("The seeded Recipe declares gates + spec-shape + copy-shape + Space target (issue #54 AC1)", () => {
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

  it("declares a spec-shape whose validator IS the real production-spec validator (zero drift)", () => {
    assert.equal(recipe.specShape.validate, validateProductionSpec);
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
});

// === The second wired Recipe: News Carousel — proves the machinery generic (issue #60) ================

describe("The News Carousel Recipe declares its OWN gates + spec-shape + copy-shape + Space target (issue #60)", () => {
  const recipe = getRecipe("news-carousel")!;

  it("declares ZERO gates — a gate count different from the wired Recipe's one (Operator-confirmed)", () => {
    assert.deepEqual(recipe.gates, []);
  });

  it("declares a DIFFERENT Space target from the wired Recipe — 'AI News'", () => {
    assert.equal(recipe.space.id, "a2402c48-b688-436b-8cb6-23a4aad7822e");
    assert.equal(recipe.space.name, "AI News");
    assert.notEqual(recipe.space.id, getRecipe("character-explainer-with-cast")!.space.id);
  });

  it("shares the SAME spec-injection node name convention as the wired Space ('JSON Master')", () => {
    assert.equal(recipe.space.nodes.specInput, JSON_MASTER_NODE_NAME);
  });

  it("has no pinned-reference / cast / clip run-point — those are the WIRED Recipe's own vocabulary", () => {
    assert.equal(recipe.space.nodes.pinnedReference, undefined);
    assert.equal(recipe.space.nodes.castRunPoint, undefined);
    assert.equal(recipe.space.nodes.clipRunPoint, undefined);
  });

  it("declares its 7 slide run-point names from the SAME canonicalCarouselProtocol() the driver reads", () => {
    const protocolNames = canonicalCarouselProtocol().run_points.map((rp) => rp.start);
    assert.deepEqual(recipe.space.nodes.slideRunPoints, protocolNames);
    assert.equal(recipe.space.nodes.slideRunPoints!.length, 7);
    assert.equal(recipe.space.nodes.slideRunPoints![0], "Image Prompt Slide 1");
    assert.equal(recipe.space.nodes.slideRunPoints![6], "Image Prompt Slide 7");
  });

  it("declares a spec-shape whose validator IS the real News Carousel Spec validator (zero drift)", () => {
    assert.equal(recipe.specShape.validate, validateNewsCarouselSpec);
  });

  it("the spec-shape's validator accepts a well-formed 5-7-slide Spec and rejects a malformed one", () => {
    assert.equal(recipe.specShape.validate(validNewsCarouselSpec(5)).ok, true);
    assert.equal(recipe.specShape.validate(validNewsCarouselSpec(7)).ok, true);
    assert.equal(recipe.specShape.validate({}).ok, false);
  });

  it("declares a copy-shape DIFFERENT from the wired Recipe's 180/1-3 — this Recipe's OWN params (ADR-0012)", () => {
    assert.equal(recipe.copyShape.maxChars, 2200);
    assert.equal(recipe.copyShape.minEmojis, 0);
    assert.equal(recipe.copyShape.maxEmojis, 2);
    const wired = getRecipe("character-explainer-with-cast")!;
    assert.notEqual(recipe.copyShape.maxChars, wired.copyShape.maxChars);
  });

  it("the Spec is media instructions only — no post_copy (ADR-0012)", () => {
    assert.equal("post_copy" in validNewsCarouselSpec(5), false);
  });
});
