/**
 * Tests for `src/copy/platform-shape.ts`'s pure per-platform CopyShape table (issue #128).
 *
 * No Magnific fake is needed here — this module has no Space/MCP code at all, only a table lookup and
 * pure data transforms.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  KNOWN_PLATFORMS,
  platformCopyShapeFor,
  resolveCopyShapeForPlatform,
  listPlatformCopyShapes,
} from "./platform-shape.ts";
import { validateCopy, validateCopyForPlatform } from "./validate.ts";
import type { CopyShape } from "./contract.ts";
import type { BrandCopyRules } from "../production-spec/brand-profile.ts";
import { channelsFrom } from "../production-spec/brand-profile.ts";
import { getRecipe } from "../recipe/registry.ts";

const NO_RULES: BrandCopyRules = { requiredCta: null, requiredHashtags: [], bannedWords: [] };

// ---------------------------------------------------------------------------
// platformCopyShapeFor / listPlatformCopyShapes
// ---------------------------------------------------------------------------

describe("platformCopyShapeFor — documented, per-platform bounds (issue #128)", () => {
  it("resolves each of the six documented platforms to its own CopyShape", () => {
    for (const platform of KNOWN_PLATFORMS) {
      const shape = platformCopyShapeFor(platform);
      assert.ok(shape, `expected a documented shape for ${platform}`);
      assert.equal(shape!.platform, platform);
      assert.ok(shape!.maxChars > 0);
      assert.ok(shape!.description.length > 0);
    }
  });

  it("is case- and whitespace-insensitive", () => {
    assert.deepEqual(platformCopyShapeFor("  LinkedIn  "), platformCopyShapeFor("linkedin"));
    assert.deepEqual(platformCopyShapeFor("X"), platformCopyShapeFor("x"));
  });

  it("returns null for a platform this table doesn't document — never fabricates bounds", () => {
    assert.equal(platformCopyShapeFor("mastodon"), null);
    assert.equal(platformCopyShapeFor(""), null);
    assert.equal(platformCopyShapeFor("   "), null);
  });

  it("X's cap is materially tighter than LinkedIn's — genuinely different platform bounds", () => {
    const x = platformCopyShapeFor("x")!;
    const linkedin = platformCopyShapeFor("linkedin")!;
    assert.ok(x.maxChars < linkedin.maxChars);
  });

  it("Instagram's cap matches the already-shipped News Carousel Recipe's own copyShape (2200 chars)", () => {
    const instagram = platformCopyShapeFor("instagram")!;
    const newsCarousel = getRecipe("news-carousel");
    assert.ok(newsCarousel);
    assert.equal(instagram.maxChars, newsCarousel!.copyShape.maxChars);
  });

  it("only LinkedIn declares supportsMentions today", () => {
    const supporting = listPlatformCopyShapes().filter((s) => s.supportsMentions);
    assert.deepEqual(
      supporting.map((s) => s.platform),
      ["linkedin"],
    );
  });

  it("listPlatformCopyShapes returns all six, each with a distinct platform name", () => {
    const all = listPlatformCopyShapes();
    assert.equal(all.length, 6);
    assert.equal(new Set(all.map((s) => s.platform)).size, 6);
  });
});

// ---------------------------------------------------------------------------
// resolveCopyShapeForPlatform (AC1 — extends the single per-Recipe CopyShape)
// ---------------------------------------------------------------------------

describe("resolveCopyShapeForPlatform — extends a Recipe's own CopyShape per platform (AC1)", () => {
  const baseShape: CopyShape = { maxChars: 180, minEmojis: 1, maxEmojis: 3 };

  it("uses the platform's documented bounds when known", () => {
    const resolved = resolveCopyShapeForPlatform(baseShape, "x");
    assert.deepEqual(resolved, platformCopyShapeFor("x"));
    assert.notDeepEqual(resolved, baseShape);
  });

  it("falls back to the caller's own base shape for a platform this table doesn't document", () => {
    assert.deepEqual(resolveCopyShapeForPlatform(baseShape, "mastodon"), baseShape);
  });
});

// ---------------------------------------------------------------------------
// AC3 — single-Channel Brand: the wired Recipe's own copyShape path is unchanged
// ---------------------------------------------------------------------------

describe("AC3 — single-Channel Brand: the wired Recipe's own copyShape path is unchanged", () => {
  it("a Brand configured for exactly one Channel (Facebook) still validates against the Recipe's OWN 180-char shape, not this table's facebook entry", () => {
    const channels = channelsFrom({
      channel: [{ platform: "facebook", url: "https://example.test/page", primary: true }],
    });
    assert.equal(channels.length, 1);
    assert.equal(channels[0]?.primary, true);

    const recipe = getRecipe("character-explainer-with-cast");
    assert.ok(recipe);

    // The EXISTING call path — validateCopy against the Recipe's own copyShape directly, no platform
    // resolution involved, exactly as it worked before this slice.
    const okCaption = { caption: "Your first ten minutes decide your whole day ☀️", hashtags: [] };
    const okResult = validateCopy(okCaption, recipe!.copyShape, NO_RULES);
    assert.equal(okResult.ok, true);

    // The Recipe's own 180-char bound still fires exactly as before — this table's own (different)
    // facebook number is never consulted on this path.
    const tooLong = { caption: "A".repeat(181) + " ☀️", hashtags: [] };
    const tooLongResult = validateCopy(tooLong, recipe!.copyShape, NO_RULES);
    assert.equal(tooLongResult.ok, false);
    assert.ok(tooLongResult.errors.some((e) => e.code === "caption_length"));
  });
});

// ---------------------------------------------------------------------------
// AC4 — multi-Channel Brand: two different platform bounds enforced on the SAME caption
// ---------------------------------------------------------------------------

describe("AC4 — multi-Channel Brand: two different platform bounds (Straw Motion's own platform list)", () => {
  const channels = channelsFrom({
    channel: [
      { platform: "facebook", url: "https://example.test/straw-motion", primary: true },
      { platform: "instagram", url: "" },
      { platform: "linkedin", url: "" },
      { platform: "x", url: "" },
      { platform: "tiktok", url: "" },
    ],
  });

  it("configures five Channels for this Brand, exactly one primary", () => {
    assert.equal(channels.length, 5);
    assert.equal(channels.filter((c) => c.primary).length, 1);
  });

  const recipeBase: CopyShape = { maxChars: 2200, minEmojis: 0, maxEmojis: 2 }; // News Carousel's own base

  it("a caption too long for X validates fine for LinkedIn — genuinely different platform bounds", () => {
    const caption = "Straw Motion breaks down this week's biggest AI story in plain English. ".repeat(5);
    const copy = { caption, hashtags: ["#ai"] };

    const xResult = validateCopyForPlatform(copy, "x", recipeBase, NO_RULES);
    assert.equal(xResult.ok, false);
    assert.ok(xResult.errors.some((e) => e.code === "caption_length"));

    const linkedinResult = validateCopyForPlatform(copy, "linkedin", recipeBase, NO_RULES);
    assert.equal(linkedinResult.ok, true);
  });

  it("flags a malformed LinkedIn @mention but does not apply that rule on X for the identical text", () => {
    const copy = { caption: "Congrats to the team @ for shipping this ☀️", hashtags: ["#ai"] };

    const linkedinResult = validateCopyForPlatform(copy, "linkedin", recipeBase, NO_RULES);
    assert.equal(linkedinResult.ok, false);
    assert.ok(linkedinResult.errors.some((e) => e.code === "platform_mention_syntax"));

    const xResult = validateCopyForPlatform(copy, "x", recipeBase, NO_RULES);
    assert.equal(
      xResult.errors.some((e) => e.code === "platform_mention_syntax"),
      false,
    );
  });

  it("a well-formed LinkedIn @mention passes the syntax check", () => {
    const copy = { caption: "Congrats to @Anthropic on the launch ☀️", hashtags: ["#ai"] };
    const result = validateCopyForPlatform(copy, "linkedin", recipeBase, NO_RULES);
    assert.equal(
      result.errors.some((e) => e.code === "platform_mention_syntax"),
      false,
    );
  });
});
