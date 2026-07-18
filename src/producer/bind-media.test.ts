import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { bindMediaSlots } from "./bind-media.ts";
import { getRecipe } from "../recipe/registry.ts";

const NEWS_CAROUSEL = getRecipe("news-carousel")!;
const CHARACTER = getRecipe("character-explainer-with-cast")!;

describe("bindMediaSlots — resolve a Recipe's declared media slots; STOP on a missing REQUIRED one (ADR-0016)", () => {
  it("binds a brand-asset slot when its resolution is found — News Carousel's 'Brand_Logo'", () => {
    const result = bindMediaSlots(NEWS_CAROUSEL, {
      "Brand_Logo": { kind: "brand-asset", found: true, path: "/tmp/brand-logo.png" },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.bound.length, 1);
    assert.equal(result.bound[0]!.name, "Brand_Logo");
    assert.deepEqual(result.boundSlotNames, new Set(["Brand_Logo"]));
  });

  it("STOPs with a clear message when a REQUIRED brand-asset slot's asset is not found", () => {
    const result = bindMediaSlots(NEWS_CAROUSEL, {
      "Brand_Logo": {
        kind: "brand-asset",
        found: false,
        message: 'Brand Asset "brand-logo" not found for Brand "straw-motion" (looked in .../assets).',
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.missingSlot, "Brand_Logo");
    assert.match(result.message, /not found for Brand "straw-motion"/);
  });

  it("STOPs with a clear message when a REQUIRED slot has no resolution supplied at all", () => {
    const result = bindMediaSlots(NEWS_CAROUSEL, {});
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.missingSlot, "Brand_Logo");
    assert.match(result.message, /REQUIRED/);
    assert.match(result.message, /ADR-0016/);
    assert.match(result.message, /never bind a half-complete Asset/i);
  });

  it("binds an idea-pick slot when its resolution is found — the character Recipe's 'Selected Character'", () => {
    const result = bindMediaSlots(CHARACTER, {
      "Selected Character": { kind: "idea-pick", found: true, pick: "cast-2" },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.bound.length, 1);
    assert.equal(result.bound[0]!.resolution.kind, "idea-pick");
    if (result.bound[0]!.resolution.kind !== "idea-pick") return;
    assert.equal(result.bound[0]!.resolution.pick, "cast-2");
  });

  it("STOPs when the character Recipe's required idea-pick slot has no resolved pick yet", () => {
    const result = bindMediaSlots(CHARACTER, {
      "Selected Character": { kind: "idea-pick", found: false },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.missingSlot, "Selected Character");
  });

  it("never returns ok:true with a half-bound Asset — required-missing always short-circuits ok:false", () => {
    const result = bindMediaSlots(NEWS_CAROUSEL, {
      "Brand_Logo": { kind: "brand-asset", found: false, message: "missing" },
    });
    assert.equal(result.ok, false);
  });
});
