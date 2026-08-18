import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { authorSpecForRecipe, DEFAULT_SPEC_AUTHORS } from "./author-at-review.ts";
import { getRecipe, listWiredRecipeSlugs } from "../recipe/registry.ts";
import type { Brief } from "./generate.ts";

const BRIEF: Brief = { id: "idea-01", run: "2026-W33", title: "A brand new headline about real news" };

describe("authorSpecForRecipe — authors a candidate Spec and self-checks it via auditAuthorPhase (ADR-0031, issue #264)", () => {
  it("every wired Recipe has a registered default author", () => {
    for (const slug of listWiredRecipeSlugs()) {
      assert.ok(DEFAULT_SPEC_AUTHORS[slug] !== undefined, `no default author for wired Recipe "${slug}"`);
    }
  });

  it("authors a valid News Carousel Spec that passes its own audit", () => {
    const recipe = getRecipe("news-carousel")!;
    const outcome = authorSpecForRecipe(recipe, BRIEF, []);
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.audit.ok, true);
    assert.equal(recipe.specShape.validate(outcome.spec).ok, true);
  });

  it("authors a valid Character Explainer with Cast Spec that passes its own audit", () => {
    const recipe = getRecipe("character-explainer-with-cast")!;
    const outcome = authorSpecForRecipe(recipe, BRIEF, []);
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(recipe.specShape.validate(outcome.spec).ok, true);
  });

  it("authors a valid News Short Script Spec that passes its own audit", () => {
    const recipe = getRecipe("news-short-script")!;
    const outcome = authorSpecForRecipe(recipe, BRIEF, []);
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(recipe.specShape.validate(outcome.spec).ok, true);
  });

  it("a banned word in the Brief's title fails the audit — ok: false, naming the banned-words check", () => {
    const recipe = getRecipe("news-carousel")!;
    const outcome = authorSpecForRecipe(recipe, { ...BRIEF, title: "VERBOTEN headline" }, ["VERBOTEN"]);
    assert.equal(outcome.ok, false);
    const bannedItem = outcome.audit.items.find((i) => i.id === "banned-words");
    assert.equal(bannedItem?.ok, false);
  });

  it("a malformed candidate Spec (from an injected broken author) fails the shape check, never throws", () => {
    const recipe = getRecipe("news-carousel")!;
    const outcome = authorSpecForRecipe(recipe, BRIEF, [], { [recipe.slug]: () => ({}) });
    assert.equal(outcome.ok, false);
    const shapeItem = outcome.audit.items.find((i) => i.id === "spec-shape");
    assert.equal(shapeItem?.ok, false);
  });

  it("an unregistered Recipe slug returns ok: false rather than throwing", () => {
    const recipe = getRecipe("news-carousel")!;
    const outcome = authorSpecForRecipe(recipe, BRIEF, [], {});
    assert.equal(outcome.ok, false);
  });

  it("the returned Spec is the SAME one the audit checked — never a second, re-derived copy", () => {
    const recipe = getRecipe("news-carousel")!;
    const outcome = authorSpecForRecipe(recipe, BRIEF, []);
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    const reaudit = recipe.specShape.validate(outcome.spec);
    assert.equal(reaudit.ok, true);
  });
});
