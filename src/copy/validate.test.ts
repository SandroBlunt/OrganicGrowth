import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  validateCopy,
  validateCopyForPlatform,
  checkCombinedCaptionHashtagsCap,
  type CopyValidationCode,
  type CopyValidationResult,
} from "./validate.ts";
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

describe("validateCopy — no dash 'tells' in caption or hashtags, reject-only (issue #108)", () => {
  it("rejects a caption containing an em dash", () => {
    const copy = { caption: "Same week — new tools ☀️", hashtags: [] };
    const result = validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, NO_RULES);
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "dash_in_copy"), true);
  });

  it("rejects a caption containing an en dash", () => {
    const copy = { caption: "Same week – new tools ☀️", hashtags: [] };
    const result = validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, NO_RULES);
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "dash_in_copy"), true);
  });

  it("rejects a caption containing a hyphen used as a spaced dash", () => {
    const copy = { caption: "Same week - new tools ☀️", hashtags: [] };
    const result = validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, NO_RULES);
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "dash_in_copy"), true);
  });

  it("rejects a hashtag containing a dash tell", () => {
    const copy = { caption: validCopy().caption, hashtags: ["#state—of—the—art"] };
    const result = validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, NO_RULES);
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "dash_in_copy"), true);
  });

  it("does NOT flag an ordinary hyphenated compound word in the caption", () => {
    const copy = {
      caption: "This is a state-of-the-art task-assistant ☀️",
      hashtags: ["#lifehacks"],
    };
    const result = validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, NO_RULES);
    assert.equal(hasCode(result, "dash_in_copy"), false);
  });

  it("never rewrites — a dash tell simply fails validation, no 'corrected' Copy is ever returned", () => {
    const copy = { caption: "Same week — new tools ☀️", hashtags: [] };
    const result = validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, NO_RULES);
    assert.equal("copy" in result, false);
  });

  it("names the exact tell and the field it was found in", () => {
    const copy = { caption: "Same week — new tools ☀️", hashtags: [] };
    const result = validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, NO_RULES);
    const err = result.errors.find((e) => e.code === "dash_in_copy");
    assert.ok(err);
    assert.match(err!.message, /caption/);
    assert.match(err!.message, /—/);
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

// ---------------------------------------------------------------------------
// checkCombinedCaptionHashtagsCap / validateCopyForPlatform's combined check (issue #142)
// ---------------------------------------------------------------------------

const NEWS_CAROUSEL_SHAPE: CopyShape = { maxChars: 2200, minEmojis: 0, maxEmojis: 2 };

describe("checkCombinedCaptionHashtagsCap — X's 280-char cap covers caption + hashtags together (issue #142)", () => {
  it("the 318-character live-failure case: caption alone within 280, combined over — regression test", () => {
    // Reproduces the exact live failure named in the issue: a 318-character X variant whose caption
    // ALONE is within the 280-char cap (here: exactly at it), but caption + hashtags combined is not.
    const caption = "A".repeat(280);
    const hashtags = [`#${"b".repeat(36)}`]; // 37 chars; " " + 37 = 38; 280 + 38 = 318 combined.
    const copy = { caption, hashtags };

    // Caption alone passes X's 280-char cap.
    assert.ok([...caption].length <= 280);

    const err = checkCombinedCaptionHashtagsCap(copy, "x");
    assert.ok(err, "expected the combined cap to fail");
    assert.equal(err!.code, "caption_hashtags_length");
    assert.match(err!.message, /x/);
    assert.match(err!.message, /318/);
    assert.match(err!.message, /38/); // named overage: 318 - 280
  });

  it("names the platform and the overage in the message (AC1)", () => {
    // caption 280 + " " (1) + hashtag "#cccccccc" (9) = 290 combined -> overage 10.
    const copy = { caption: "A".repeat(280), hashtags: ["#" + "c".repeat(8)] };
    const err = checkCombinedCaptionHashtagsCap(copy, "x");
    assert.ok(err);
    assert.match(err!.message, /\bx\b/);
    assert.match(err!.message, /10/); // 290 - 280
  });

  it("a compliant X variant (combined within 280) passes unchanged", () => {
    const copy = { caption: "A short, punchy tweet.", hashtags: ["#ai"] };
    assert.equal(checkCombinedCaptionHashtagsCap(copy, "x"), null);
  });

  it("caption alone already over 280 is still flagged by the combined check too", () => {
    const copy = { caption: "A".repeat(300), hashtags: [] };
    const err = checkCombinedCaptionHashtagsCap(copy, "x");
    assert.ok(err);
  });

  it("other platforms' limits are unaffected — the SAME combined length passes for Instagram/LinkedIn (AC3)", () => {
    const caption = "A".repeat(280);
    const hashtags = [`#${"b".repeat(36)}`];
    const copy = { caption, hashtags };
    assert.equal(checkCombinedCaptionHashtagsCap(copy, "instagram"), null);
    assert.equal(checkCombinedCaptionHashtagsCap(copy, "linkedin"), null);
    assert.equal(checkCombinedCaptionHashtagsCap(copy, "facebook"), null);
    assert.equal(checkCombinedCaptionHashtagsCap(copy, "tiktok"), null);
  });

  it("returns null for an undocumented platform — never fabricates a bound", () => {
    const copy = { caption: "A".repeat(400), hashtags: ["#x".repeat(50)] };
    assert.equal(checkCombinedCaptionHashtagsCap(copy, "mastodon"), null);
  });

  it("is defensive on a malformed copy value — never throws", () => {
    assert.equal(checkCombinedCaptionHashtagsCap(null, "x"), null);
    assert.equal(checkCombinedCaptionHashtagsCap({ hashtags: [] }, "x"), null);
    assert.equal(checkCombinedCaptionHashtagsCap({ caption: "ok", hashtags: "nope" }, "x"), null);
  });
});

describe("validateCopyForPlatform — X's combined cap is wired in (issue #142)", () => {
  it("fails an X variant whose caption + hashtags combined exceeds 280, even though the caption alone fits", () => {
    const caption = "A".repeat(280);
    const hashtags = [`#${"b".repeat(36)}`];
    const copy = { caption, hashtags };

    const result = validateCopyForPlatform(copy, "x", NEWS_CAROUSEL_SHAPE, NO_RULES);
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "caption_hashtags_length"), true);
    // The caption-alone check (against X's own 280-char shape) still passes on its own — proving the
    // NEW failure is specifically the combined check, not a duplicate of caption_length.
    assert.equal(hasCode(result, "caption_length"), false);
  });

  it("a compliant X variant still passes unchanged", () => {
    const copy = { caption: "A short, punchy tweet about the news.", hashtags: ["#ai", "#news"] };
    const result = validateCopyForPlatform(copy, "x", NEWS_CAROUSEL_SHAPE, NO_RULES);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
  });

  it("the SAME over-280-combined Copy still passes for Instagram/LinkedIn — other platforms unaffected (AC3)", () => {
    const caption = "A".repeat(280);
    const hashtags = [`#${"b".repeat(36)}`];
    const copy = { caption, hashtags };

    const instagram = validateCopyForPlatform(copy, "instagram", NEWS_CAROUSEL_SHAPE, NO_RULES);
    assert.equal(instagram.ok, true, JSON.stringify(instagram.errors));
    const linkedin = validateCopyForPlatform(copy, "linkedin", NEWS_CAROUSEL_SHAPE, NO_RULES);
    assert.equal(linkedin.ok, true, JSON.stringify(linkedin.errors));
  });
});
