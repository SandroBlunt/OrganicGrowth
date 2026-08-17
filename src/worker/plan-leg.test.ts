import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getRecipe } from "../recipe/registry.ts";
import { planLeg } from "./plan-leg.ts";

const NEWS_CAROUSEL = getRecipe("news-carousel")!;
const CHARACTER_EXPLAINER = getRecipe("character-explainer-with-cast")!;

describe("planLeg — pure: which leg of a Recipe's Execution Protocol a claimed job represents", () => {
  it("a zero-gate Recipe with no prior decision plans a FIRST, gateless (final) leg", () => {
    const plan = planLeg(NEWS_CAROUSEL, null);
    assert.deepEqual(plan, { kind: "first", targetGate: null });
  });

  it("a one-gate Recipe with no prior decision plans a FIRST leg targeting its first declared gate", () => {
    const plan = planLeg(CHARACTER_EXPLAINER, null);
    assert.deepEqual(plan, { kind: "first", targetGate: "cast" });
  });

  it("a one-gate Recipe with a DECIDED prior gate request plans a RESUMED, final leg carrying the pick", () => {
    const plan = planLeg(CHARACTER_EXPLAINER, { gateName: "cast", choice: "cast-2" });
    assert.deepEqual(plan, { kind: "resumed", targetGate: null, pick: "cast-2" });
  });
});
