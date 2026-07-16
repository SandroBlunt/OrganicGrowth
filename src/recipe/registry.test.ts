import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getRecipe,
  listRecipes,
  listWiredRecipeSlugs,
  isWiredRecipe,
} from "./registry.ts";
import { validate as validateProductionSpec } from "../production-spec/validate.ts";
import {
  MAX_POST_COPY_CHARS,
  MIN_POST_COPY_EMOJIS,
  MAX_POST_COPY_EMOJIS,
} from "../production-spec/contract.ts";
import { JSON_MASTER_NODE_NAME, CHARACTER_NODE_NAME } from "../space-driver/driver.ts";
import { canonicalProtocol } from "../execution-protocol/protocol.ts";
import { validSpec } from "../production-spec/fixtures/specs.ts";

describe("Recipe registry — seeded with exactly one entry (issue #54)", () => {
  it("registers exactly one Recipe: character-explainer-with-cast", () => {
    const slugs = listWiredRecipeSlugs();
    assert.deepEqual(slugs, ["character-explainer-with-cast"]);
    assert.equal(listRecipes().length, 1);
  });

  it("getRecipe returns the seeded Recipe by slug", () => {
    const recipe = getRecipe("character-explainer-with-cast");
    assert.ok(recipe !== null);
    assert.equal(recipe!.slug, "character-explainer-with-cast");
    assert.equal(recipe!.name, "Character Explainer with Cast");
  });

  it("getRecipe returns null for an unregistered slug — never throws", () => {
    assert.equal(getRecipe("carousel"), null);
    assert.equal(getRecipe(""), null);
    assert.equal(getRecipe("../evil"), null);
  });

  it("isWiredRecipe is true only for the seeded slug", () => {
    assert.equal(isWiredRecipe("character-explainer-with-cast"), true);
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

  it("declares a copy-shape matching today's post_copy contract constants exactly", () => {
    assert.equal(recipe.copyShape.maxChars, MAX_POST_COPY_CHARS);
    assert.equal(recipe.copyShape.minEmojis, MIN_POST_COPY_EMOJIS);
    assert.equal(recipe.copyShape.maxEmojis, MAX_POST_COPY_EMOJIS);
  });
});
