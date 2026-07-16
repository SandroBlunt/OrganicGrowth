import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { defaultDraftCopy, type CopyInput } from "./draft.ts";
import { validateCopy } from "./validate.ts";
import type { CopyShape } from "./contract.ts";

const NO_RULES = { requiredCta: null, requiredHashtags: [], bannedWords: [] };

/** The wired *Character Explainer with Cast* Recipe's own copy-shape params (registry.ts) — used
 *  directly (not re-typed) so these tests prove the SAME bounds the real Recipe declares. */
const CHARACTER_EXPLAINER_SHAPE: CopyShape = { maxChars: 180, minEmojis: 1, maxEmojis: 3 };

function sampleInput(overrides: Partial<CopyInput> = {}): CopyInput {
  return { title: "Your first ten minutes decide your whole day", ...overrides };
}

describe("defaultDraftCopy — deterministic, no model call, no I/O, no clock", () => {
  it("is deterministic: same input in, same Copy out", () => {
    assert.deepEqual(defaultDraftCopy(sampleInput(), CHARACTER_EXPLAINER_SHAPE), defaultDraftCopy(sampleInput(), CHARACTER_EXPLAINER_SHAPE));
  });

  it("always satisfies validateCopy for the SAME shape it was drafted for (no rules configured)", () => {
    const copy = defaultDraftCopy(sampleInput(), CHARACTER_EXPLAINER_SHAPE);
    const result = validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, NO_RULES);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
  });

  it("truncates an over-long title to fit shape.maxChars", () => {
    const longTitle = "Lorem ipsum dolor sit amet ".repeat(20); // > 180 chars
    const copy = defaultDraftCopy(sampleInput({ title: longTitle }), CHARACTER_EXPLAINER_SHAPE);
    assert.ok([...copy.caption].length <= CHARACTER_EXPLAINER_SHAPE.maxChars);
    assert.equal(validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, NO_RULES).ok, true);
  });

  it("passes through the Idea's own hashtags unchanged", () => {
    const copy = defaultDraftCopy(sampleInput({ hashtags: ["#lifehacks", "#morning"] }), CHARACTER_EXPLAINER_SHAPE);
    assert.deepEqual(copy.hashtags, ["#lifehacks", "#morning"]);
  });

  it("defaults hashtags to [] when the Idea supplies none", () => {
    const copy = defaultDraftCopy(sampleInput(), CHARACTER_EXPLAINER_SHAPE);
    assert.deepEqual(copy.hashtags, []);
  });

  it("folds mediaContext into the caption — copy composed LATE can reference the realised media (ADR-0012)", () => {
    const copy = defaultDraftCopy(sampleInput({ mediaContext: "Sunny the Mug" }), CHARACTER_EXPLAINER_SHAPE);
    assert.ok(copy.caption.includes("Sunny the Mug"));
  });

  it("respects a DIFFERENT Recipe's shape — the bounds are the Recipe's own params, not a global 180/1-3", () => {
    const otherShape: CopyShape = { maxChars: 40, minEmojis: 0, maxEmojis: 1 };
    const copy = defaultDraftCopy(sampleInput(), otherShape);
    assert.ok([...copy.caption].length <= 40);
    assert.equal(validateCopy(copy, otherShape, NO_RULES).ok, true, JSON.stringify(validateCopy(copy, otherShape, NO_RULES).errors));
  });

  it("respects a shape requiring 0 emojis", () => {
    const zeroEmojiShape: CopyShape = { maxChars: 100, minEmojis: 0, maxEmojis: 0 };
    const copy = defaultDraftCopy(sampleInput(), zeroEmojiShape);
    assert.equal(validateCopy(copy, zeroEmojiShape, NO_RULES).ok, true);
  });

  it("degenerate/minimal input still yields a valid Copy", () => {
    const copy = defaultDraftCopy({ title: "x" }, CHARACTER_EXPLAINER_SHAPE);
    assert.equal(validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, NO_RULES).ok, true);
  });
});
