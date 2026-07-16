import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { validateCopy, type CopyValidationCode, type CopyValidationResult } from "./validate.ts";
import type { CopyShape } from "./contract.ts";
import type { BrandCopyRules } from "../production-spec/brand-profile.ts";

/** The wired *Character Explainer with Cast* Recipe's own copy-shape params (registry.ts): the OLD
 *  180-char / 1-3-emoji global constants are now this ONE Recipe's own params, not shared globals —
 *  these tests assert against them directly to prove the validator is genuinely per-Recipe. */
const CHARACTER_EXPLAINER_SHAPE: CopyShape = { maxChars: 180, minEmojis: 1, maxEmojis: 3 };

const NO_RULES: BrandCopyRules = { requiredCta: null, requiredHashtags: [], bannedWords: [] };

function hasCode(result: CopyValidationResult, code: CopyValidationCode): boolean {
  return result.errors.some((e) => e.code === code);
}

function validCopy() {
  return { caption: "Your first ten minutes decide your whole day ☀️", hashtags: ["#lifehacks"] };
}

describe("validateCopy — well-formed Copy", () => {
  it("accepts a valid Copy with no errors", () => {
    const result = validateCopy(validCopy(), CHARACTER_EXPLAINER_SHAPE, NO_RULES);
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });
});

describe("validateCopy — caption length (per-Recipe shape, not a global constant)", () => {
  it("rejects a caption exceeding shape.maxChars", () => {
    const copy = { caption: "A".repeat(181) + " ☀️", hashtags: [] };
    const result = validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, NO_RULES);
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "caption_length"), true);
  });

  it("a shorter Recipe's own maxChars is enforced, not the 180 default", () => {
    const shortShape: CopyShape = { maxChars: 20, minEmojis: 0, maxEmojis: 3 };
    const copy = { caption: "This is definitely longer than 20 chars", hashtags: [] };
    const result = validateCopy(copy, shortShape, NO_RULES);
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "caption_length"), true);
  });
});

describe("validateCopy — caption emoji count (per-Recipe shape)", () => {
  it("rejects a caption with 0 emojis when the shape requires at least 1", () => {
    const copy = { caption: "Your first ten minutes decide your whole day", hashtags: [] };
    const result = validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, NO_RULES);
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "caption_emoji_count"), true);
  });

  it("rejects a caption with 4 emojis when the shape allows at most 3", () => {
    const copy = { caption: "Your morning ☀️☕✨🌟", hashtags: [] };
    const result = validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, NO_RULES);
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "caption_emoji_count"), true);
  });

  it("a shape allowing 0 emojis accepts a caption with none", () => {
    const zeroShape: CopyShape = { maxChars: 100, minEmojis: 0, maxEmojis: 0 };
    const copy = { caption: "Plain caption, no emoji", hashtags: [] };
    assert.equal(validateCopy(copy, zeroShape, NO_RULES).ok, true);
  });
});

describe("validateCopy — required CTA (ADR-0012: bring the dead rule live)", () => {
  const rules: BrandCopyRules = { requiredCta: "Link in bio!", requiredHashtags: [], bannedWords: [] };

  it("rejects a caption missing the required CTA", () => {
    const result = validateCopy(validCopy(), CHARACTER_EXPLAINER_SHAPE, rules);
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "required_cta_missing"), true);
  });

  it("accepts a caption that already includes the required CTA", () => {
    const copy = { caption: "Your first ten minutes decide your whole day ☀️ Link in bio!", hashtags: [] };
    const result = validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, rules);
    assert.equal(hasCode(result, "required_cta_missing"), false);
  });

  it("matches case-insensitively", () => {
    const copy = { caption: "Your morning tip ☀️ LINK IN BIO!", hashtags: [] };
    const result = validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, rules);
    assert.equal(hasCode(result, "required_cta_missing"), false);
  });
});

describe("validateCopy — required hashtags (ADR-0012: bring the dead rule live)", () => {
  const rules: BrandCopyRules = { requiredCta: null, requiredHashtags: ["#lifehacks", "tips"], bannedWords: [] };

  it("rejects hashtags missing a required entry", () => {
    const copy = { caption: validCopy().caption, hashtags: ["#lifehacks"] };
    const result = validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, rules);
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "required_hashtag_missing"), true);
  });

  it("accepts hashtags carrying every required entry, # and case agnostic", () => {
    const copy = { caption: validCopy().caption, hashtags: ["#LifeHacks", "Tips"] };
    const result = validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, rules);
    assert.equal(hasCode(result, "required_hashtag_missing"), false);
  });

  it("rejects a non-array hashtags field", () => {
    const copy = { caption: validCopy().caption, hashtags: "not-an-array" };
    const result = validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, NO_RULES);
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "hashtags_invalid"), true);
  });
});

describe("validateCopy — banned words re-pointed onto the composed Copy (ADR-0012, reject-only)", () => {
  const rules: BrandCopyRules = { requiredCta: null, requiredHashtags: [], bannedWords: ["miracle", "cure"] };

  it("rejects a caption containing a banned word and names it", () => {
    const copy = { caption: "This miracle trick fixes mornings ☀️", hashtags: [] };
    const result = validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, rules);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === "banned_word" && e.message.includes("miracle")));
  });

  it("rejects a hashtag containing a banned word", () => {
    const copy = { caption: validCopy().caption, hashtags: ["#cure"] };
    const result = validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, rules);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === "banned_word"));
  });

  it("does not match a banned word embedded inside an unrelated word (whole-word only)", () => {
    const copy = { caption: "Feel secure every morning ☀️", hashtags: [] };
    const result = validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, rules);
    assert.equal(hasCode(result, "banned_word"), false);
  });

  it("never rewrites the Copy — a banned word simply fails validation (reject-only)", () => {
    const copy = { caption: "This miracle trick fixes mornings ☀️", hashtags: [] };
    const result = validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, rules);
    // The result carries only errors — no "corrected" copy is ever produced by this function.
    assert.equal("copy" in result, false);
  });
});

describe("validateCopy — defensive on non-object / missing caption", () => {
  it("rejects null / non-object input rather than throwing", () => {
    const result = validateCopy(null, CHARACTER_EXPLAINER_SHAPE, NO_RULES);
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "not_an_object"), true);
  });

  it("rejects a Copy missing caption", () => {
    const result = validateCopy({ hashtags: [] }, CHARACTER_EXPLAINER_SHAPE, NO_RULES);
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "caption_missing"), true);
  });
});

describe("validateCopy — error reasons are specific", () => {
  it("every error carries a code and a human-readable message", () => {
    const result = validateCopy({ caption: "", hashtags: "nope" }, CHARACTER_EXPLAINER_SHAPE, NO_RULES);
    assert.equal(result.ok, false);
    for (const err of result.errors) {
      assert.equal(typeof err.code, "string");
      assert.equal(typeof err.message, "string");
      assert.ok(err.message.length > 0);
    }
  });
});
