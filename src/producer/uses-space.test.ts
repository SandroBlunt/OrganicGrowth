import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { usesSpace } from "./uses-space.ts";
import { getRecipe } from "../recipe/registry.ts";
import { SPACE_LESS_TEST_RECIPE } from "../recipe/fixtures/space-less-recipe.ts";

describe("usesSpace — the single predicate the thin Producer checks before ANY canvas work (issue #170, ADR-0021)", () => {
  it("is true for the wired character-explainer-with-cast Recipe — unaffected by this slice", () => {
    assert.equal(usesSpace(getRecipe("character-explainer-with-cast")!), true);
  });

  it("is true for the wired news-carousel Recipe — unaffected by this slice", () => {
    assert.equal(usesSpace(getRecipe("news-carousel")!), true);
  });

  it("is false for a Space-less test fixture Recipe", () => {
    assert.equal(usesSpace(SPACE_LESS_TEST_RECIPE), false);
  });
});
