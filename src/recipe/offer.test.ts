import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { offeredRecipes, resolveRecipeSelection } from "./offer.ts";

const WIRED = "character-explainer-with-cast";
const SECOND_WIRED = "news-carousel"; // wired by issue #81 — proves AC4 generalizes to a new Recipe
const UNWIRED = "carousel"; // not in the registry — must never be offered/chosen (AC4)

describe("offeredRecipes — filters a Format's default_recipes to wired-only (issue #54 AC3/AC4)", () => {
  it("offers a wired default and drops nothing from it", () => {
    const result = offeredRecipes([WIRED]);
    assert.deepEqual(result.offered, [WIRED]);
    assert.deepEqual(result.unwired, []);
  });

  it("never offers an unwired slug — it is reported separately, never in `offered`", () => {
    const result = offeredRecipes([WIRED, UNWIRED]);
    assert.deepEqual(result.offered, [WIRED]);
    assert.deepEqual(result.unwired, [UNWIRED]);
  });

  it("an empty default_recipes list offers nothing", () => {
    const result = offeredRecipes([]);
    assert.deepEqual(result.offered, []);
    assert.deepEqual(result.unwired, []);
  });

  it("a Format whose default_recipes is entirely unwired offers nothing", () => {
    const result = offeredRecipes(["carousel", "meme"]);
    assert.deepEqual(result.offered, []);
    assert.deepEqual(result.unwired, ["carousel", "meme"]);
  });

  it("offers news-carousel for a Format whose default_recipes lists it (issue #81 AC4)", () => {
    const result = offeredRecipes([SECOND_WIRED]);
    assert.deepEqual(result.offered, [SECOND_WIRED]);
    assert.deepEqual(result.unwired, []);
  });

  it("offers BOTH wired Recipes when a Format's default_recipes lists both, order preserved", () => {
    const result = offeredRecipes([WIRED, SECOND_WIRED]);
    assert.deepEqual(result.offered, [WIRED, SECOND_WIRED]);
    assert.deepEqual(result.unwired, []);
  });

  it("news-carousel becoming wired does NOT make a different unwired slug ever surface", () => {
    const result = offeredRecipes([SECOND_WIRED, UNWIRED]);
    assert.deepEqual(result.offered, [SECOND_WIRED]);
    assert.deepEqual(result.unwired, [UNWIRED]);
  });
});

describe("resolveRecipeSelection — pre-fill, trim/extend, decline (issue #54 AC3)", () => {
  it("keeping the pre-filled default: chosen = default, nothing declined", () => {
    const result = resolveRecipeSelection([WIRED], [WIRED]);
    assert.deepEqual(result.chosen, [WIRED]);
    assert.deepEqual(result.declined, []);
    assert.deepEqual(result.ignoredUnwired, []);
  });

  it("declining the only pre-filled default: it is logged as declined, nothing chosen", () => {
    const result = resolveRecipeSelection([WIRED], []);
    assert.deepEqual(result.chosen, []);
    assert.deepEqual(result.declined, [WIRED]);
  });

  it("an Operator request for an unwired Recipe is never added to chosen (AC4)", () => {
    const result = resolveRecipeSelection([WIRED], [WIRED, UNWIRED]);
    assert.deepEqual(result.chosen, [WIRED]);
    assert.deepEqual(result.ignoredUnwired, [UNWIRED]);
  });

  it("requesting ONLY an unwired Recipe yields nothing chosen and the default is declined", () => {
    const result = resolveRecipeSelection([WIRED], [UNWIRED]);
    assert.deepEqual(result.chosen, []);
    assert.deepEqual(result.declined, [WIRED]);
    assert.deepEqual(result.ignoredUnwired, [UNWIRED]);
  });

  it("no default_recipes but the Operator explicitly picks a wired Recipe: chosen, nothing declined", () => {
    const result = resolveRecipeSelection([], [WIRED]);
    assert.deepEqual(result.chosen, [WIRED]);
    assert.deepEqual(result.declined, []);
  });

  it("duplicate requests for the same wired Recipe are deduplicated in chosen", () => {
    const result = resolveRecipeSelection([WIRED], [WIRED, WIRED]);
    assert.deepEqual(result.chosen, [WIRED]);
  });

  it("a Format default that is itself unwired is never chosen and never counted as declined", () => {
    // "declined" only makes sense for something that was actually OFFERED (wired); an unwired default
    // was never offered in the first place, so it cannot be "declined" — it simply never appears.
    const result = resolveRecipeSelection([UNWIRED], []);
    assert.deepEqual(result.chosen, []);
    assert.deepEqual(result.declined, []);
  });
});
