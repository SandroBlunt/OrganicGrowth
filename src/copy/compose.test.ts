import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { composeCopy, composeCopyForChannels } from "./compose.ts";
import { validateCopy } from "./validate.ts";
import { skillDraftCopy, type CopyInput, type CopyDrafter } from "./draft.ts";
import { newsCarouselSlideNarrative } from "./news-carousel-slide-narrative.ts";
import { characterExplainerCompanies } from "./character-explainer-companies.ts";
import { getRecipe } from "../recipe/registry.ts";
import { CAROUSEL_ROLES, type CarouselSlide } from "../production-spec/news-carousel-contract.ts";
import type { ProductionSpec } from "../production-spec/contract.ts";
import { channelsFrom, type Channel } from "../production-spec/brand-profile.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const RULES_PROFILE = join(HERE, "fixtures", "brand-profile.copy-rules.yaml");
const NO_RULES_PROFILE = join(HERE, "fixtures", "brand-profile.no-rules.yaml");

/**
 * The SINGLE wired Recipe's own copy shape, read from the real registry — never a hand-rolled shape —
 * so this suite proves the true "single-recipe path" (issue #58 AC: "Built test-first against the
 * fake; single-recipe path green").
 */
const CHARACTER_EXPLAINER_SHAPE = getRecipe("character-explainer-with-cast")!.copyShape;

/** The SECOND wired Recipe's own copy shape (2200 chars / 0-2 emoji) — deliberately different bounds,
 *  proving `skillDraftCopy` generalizes across both (issue #111 AC4). */
const NEWS_CAROUSEL_SHAPE = getRecipe("news-carousel")!.copyShape;

function sampleInput(overrides: Partial<CopyInput> = {}): CopyInput {
  return {
    title: "Your first ten minutes decide your whole day",
    angle: "A small home habit fixes your morning energy.",
    voice: "Punchy and curiosity-driven, friendly, never preachy.",
    ...overrides,
  };
}

/**
 * A deterministic FAKE drafter standing in for the producer's LLM job — THIS IS THE FAKE this slice's
 * "drafting is exercised against the fake, never a live model" acceptance criterion refers to. It
 * ignores `shape` on purpose (unlike `defaultDraftCopy`) so tests can prove `composeCopy`'s inject/
 * validate stages do their own work regardless of what the "model" drafted.
 */
function fakeDrafter(caption: string, hashtags: readonly string[] = []): CopyDrafter {
  return () => ({ caption, hashtags: [...hashtags] });
}

describe("composeCopy — single-recipe path (Character Explainer with Cast), against the FAKE drafter", () => {
  it("composes a valid Copy with the DEFAULT deterministic drafter and no Brand rules configured", async () => {
    const result = await composeCopy(sampleInput(), CHARACTER_EXPLAINER_SHAPE, {
      brandProfilePath: NO_RULES_PROFILE,
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.ok(result.copy);
    assert.equal(validateCopy(result.copy, CHARACTER_EXPLAINER_SHAPE, {
      requiredCta: null,
      requiredHashtags: [],
      bannedWords: [],
    }).ok, true);
  });

  it("injects the required CTA and required hashtags deterministically, even when the fake drafter omits them", async () => {
    const result = await composeCopy(sampleInput(), CHARACTER_EXPLAINER_SHAPE, {
      brandProfilePath: RULES_PROFILE,
      drafter: fakeDrafter("Your first ten minutes decide your whole day ☀️", ["#morning"]),
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.ok(result.copy!.caption.includes("Link in bio!"));
    assert.deepEqual(result.copy!.hashtags, ["#morning", "#lifehacks", "#tips"]);
  });

  it("dedupes when the fake drafter ALREADY included the required CTA/hashtags", async () => {
    const result = await composeCopy(sampleInput(), CHARACTER_EXPLAINER_SHAPE, {
      brandProfilePath: RULES_PROFILE,
      drafter: fakeDrafter(
        "Your first ten minutes decide your whole day ☀️ Link in bio!",
        ["#lifehacks", "#tips"],
      ),
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    // The CTA appears exactly once — not duplicated.
    const ctaCount = result.copy!.caption.split("Link in bio!").length - 1;
    assert.equal(ctaCount, 1);
    assert.deepEqual(result.copy!.hashtags, ["#lifehacks", "#tips"]);
  });

  it("REFUSES a fake-drafted Copy containing a banned word — never rewritten, never returned", async () => {
    const result = await composeCopy(sampleInput(), CHARACTER_EXPLAINER_SHAPE, {
      brandProfilePath: RULES_PROFILE,
      drafter: fakeDrafter("This miracle trick fixes your mornings ☀️ Link in bio!", ["#lifehacks", "#tips"]),
    });
    assert.equal(result.ok, false);
    assert.equal(result.copy, undefined);
    assert.ok(result.errors && result.errors.some((e) => e.code === "banned_word" && e.message.includes("miracle")));
  });

  it("REFUSES a fake-drafted Copy that violates the Recipe's own length/emoji shape", async () => {
    const result = await composeCopy(sampleInput(), CHARACTER_EXPLAINER_SHAPE, {
      brandProfilePath: NO_RULES_PROFILE,
      drafter: fakeDrafter("No emoji at all in this caption"),
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors && result.errors.some((e) => e.code === "caption_emoji_count"));
  });

  it("composes LATE, referencing the realised media via mediaContext (ADR-0012)", async () => {
    const result = await composeCopy(
      sampleInput({ mediaContext: "Sunny the Mug" }),
      CHARACTER_EXPLAINER_SHAPE,
      { brandProfilePath: NO_RULES_PROFILE },
    );
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.ok(result.copy!.caption.includes("Sunny the Mug"));
  });

  it("a missing Brand Profile composes with no rules enforced (never crashes)", async () => {
    const result = await composeCopy(sampleInput(), CHARACTER_EXPLAINER_SHAPE, {
      brandProfilePath: join(HERE, "fixtures", "does-not-exist.yaml"),
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
  });

  it("never folds a watermark/@handle into the composed Copy (ADR-0012: watermark stays a Space param)", async () => {
    const result = await composeCopy(sampleInput(), CHARACTER_EXPLAINER_SHAPE, {
      brandProfilePath: NO_RULES_PROFILE,
    });
    assert.equal(result.ok, true);
    assert.equal("watermark" in result.copy!, false);
    assert.equal("handle" in result.copy!, false);
  });
});

/**
 * AC4's concrete proof (issue #111): the `write-social-copy` Skill's deterministic stand-in,
 * `skillDraftCopy`, is a drop-in `CopyDrafter` — composed through the SAME `composeCopy` pipeline,
 * against BOTH wired Recipes' own `copyShape`s, with the Brand's copy rules (banned words + required
 * CTA/hashtags) actually configured. Proves the copywriting Skill's output respects Brand copy rules —
 * required CTA/hashtags present, banned words still rejected, no em dash/en dash/spaced hyphen — for
 * every wired Recipe, not just the one this file's other tests already cover.
 */
describe("composeCopy — the write-social-copy Skill's fake (skillDraftCopy), across BOTH wired Recipes' shapes (issue #111 AC4)", () => {
  it("composes a valid Copy carrying the injected required CTA/hashtags — Character Explainer's 180/1-3 shape", async () => {
    const result = await composeCopy(sampleInput(), CHARACTER_EXPLAINER_SHAPE, {
      brandProfilePath: RULES_PROFILE,
      drafter: skillDraftCopy,
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.ok(result.copy!.caption.includes("Link in bio!"));
    // injectRequiredHashtags normalizes each appended hashtag to carry a leading "#" (inject.ts) —
    // the Brand's own YAML declares "tips" without one, so the composed result carries "#tips".
    assert.deepEqual(result.copy!.hashtags, ["#lifehacks", "#tips"]);
    assert.equal(
      validateCopy(result.copy, CHARACTER_EXPLAINER_SHAPE, {
        requiredCta: "Link in bio!",
        requiredHashtags: ["#lifehacks", "tips"],
        bannedWords: ["cure", "miracle", "guaranteed"],
      }).ok,
      true,
    );
  });

  it("composes a valid Copy carrying the injected required CTA/hashtags — News Carousel's 2200/0-2 shape (different bounds)", async () => {
    const result = await composeCopy(
      sampleInput({
        title: "AI just got a job",
        slideNarrative: [
          { role: "hook", text: "OpenAI, Anthropic, and Meta all shipped agents this week." },
          { role: "shift", text: "Three rivals moved on the same idea at once." },
          { role: "cta", text: "Follow along as we track how far it gets." },
        ],
      }),
      NEWS_CAROUSEL_SHAPE,
      { brandProfilePath: RULES_PROFILE, drafter: skillDraftCopy },
    );
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.ok(result.copy!.caption.includes("Link in bio!"));
    assert.deepEqual(result.copy!.hashtags, ["#lifehacks", "#tips"]);
    // Sharpens the ACTUAL produced narrative — the composed caption carries the real slide beats.
    assert.ok(result.copy!.caption.includes("OpenAI, Anthropic, and Meta all shipped agents this week."));
    assert.ok(result.copy!.caption.includes("Follow along as we track how far it gets."));
  });

  it("composes a valid Copy through the FULL wiring — a saved News Carousel Spec's companies threaded via newsCarouselSlideNarrative into skillDraftCopy (issue #120)", async () => {
    const spec = {
      slides: CAROUSEL_ROLES.map(
        (role, i): CarouselSlide => ({
          slide_index: i,
          role,
          card_style: "full_width",
          stat_callout: `Stat ${i + 1}.`,
          text: `Slide ${i + 1} (${role}) text.`,
          companies: role === "hook" ? ["OpenAI", "Anthropic"] : [],
          image_prompt: `Prompt ${i + 1}.`,
        }),
      ),
    };

    const result = await composeCopy(
      sampleInput({ title: "AI just got a job", slideNarrative: newsCarouselSlideNarrative(spec) }),
      NEWS_CAROUSEL_SHAPE,
      { brandProfilePath: NO_RULES_PROFILE, drafter: skillDraftCopy },
    );
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    // Companies threaded through unchanged (including the empty arrays on every other slide) never
    // breaks the deterministic drafter or the downstream checker — the full pipeline stays green.
    const rules = { requiredCta: null, requiredHashtags: [], bannedWords: [] };
    assert.equal(validateCopy(result.copy!, NEWS_CAROUSEL_SHAPE, rules).ok, true);
  });

  it("composes a valid Copy through the FULL wiring — a saved Character Explainer Spec's companies threaded via characterExplainerCompanies into skillDraftCopy (issue #125)", async () => {
    const spec: ProductionSpec = {
      character_concepts: ["A cheerful anthropomorphic alarm clock"],
      clips: [
        {
          id: "clip-1",
          clip_id: 1,
          concept_title: "The groggy wake-up",
          image_prompt: "Pixar 3D render of the clock at dawn. Aspect Ratio 9:16.",
          video_prompt: "Slow push-in, it yawns, soft voice says good morning, gentle chime sfx.",
        },
      ],
      thumbnails: ["Pixar 3D close-up of the clock. Aspect Ratio 9:16."],
      companies: ["OpenAI", "Anthropic"],
    };

    const result = await composeCopy(
      sampleInput({ title: "AI just got an alarm clock", companies: characterExplainerCompanies(spec) }),
      CHARACTER_EXPLAINER_SHAPE,
      { brandProfilePath: NO_RULES_PROFILE, drafter: skillDraftCopy },
    );
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    // Companies threaded through unchanged never breaks the deterministic drafter or the downstream
    // checker — the full pipeline stays green, mirroring the News Carousel proof above exactly.
    const rules = { requiredCta: null, requiredHashtags: [], bannedWords: [] };
    assert.equal(validateCopy(result.copy!, CHARACTER_EXPLAINER_SHAPE, rules).ok, true);
  });

  it("REFUSES a skillDraftCopy-drafted Copy containing a banned word — the checker is never bypassed", async () => {
    const result = await composeCopy(
      sampleInput({ title: "This miracle trick fixes your mornings" }),
      CHARACTER_EXPLAINER_SHAPE,
      { brandProfilePath: RULES_PROFILE, drafter: skillDraftCopy },
    );
    assert.equal(result.ok, false);
    assert.equal(result.copy, undefined);
    assert.ok(result.errors && result.errors.some((e) => e.code === "banned_word" && e.message.includes("miracle")));
  });

  it("never produces a dash 'tell' in the composed caption (issue #108), across both Recipes' shapes", async () => {
    for (const shape of [CHARACTER_EXPLAINER_SHAPE, NEWS_CAROUSEL_SHAPE]) {
      const result = await composeCopy(
        sampleInput({
          slideNarrative: [
            { role: "hook", text: "OpenAI, Anthropic, and Meta all shipped agents this week." },
            { role: "shift", text: "Three rivals moved on the same idea at once." },
            { role: "cta", text: "Follow along as we track how far it gets." },
          ],
        }),
        shape,
        { brandProfilePath: NO_RULES_PROFILE, drafter: skillDraftCopy },
      );
      assert.equal(result.ok, true, JSON.stringify(result.errors));
      assert.doesNotMatch(result.copy!.caption, /—|–|\s-\s/);
    }
  });
});

// ---------------------------------------------------------------------------
// composeCopyForChannels — one variant per targeted Channel platform (issue #129)
// ---------------------------------------------------------------------------

/** A single-Channel Brand's own Channel list — one entry, Facebook, primary (mirrors a fresh/legacy
 *  single-Channel `brand-profile.yaml`'s post-ADR-0019 list shape). */
const SINGLE_CHANNEL: readonly Channel[] = channelsFrom({
  channel: [{ platform: "facebook", url: "https://example.test/page", primary: true }],
});

/** Straw Motion's OWN real Channel list (ADR-0019's concrete migration target, mirrored from
 *  `data/brands/straw-motion/brand-profile.yaml`) — five targeted platforms, one primary. */
const STRAW_MOTION_CHANNELS: readonly Channel[] = channelsFrom({
  channel: [
    { platform: "facebook", url: "https://www.facebook.com/profile.php?id=61591885769033", primary: true },
    { platform: "instagram", url: "" },
    { platform: "linkedin", url: "" },
    { platform: "x", url: "" },
    { platform: "tiktok", url: "" },
  ],
});

function variantsByPlatform(copy: { readonly variants?: readonly { readonly platform: string }[] }) {
  const map = new Map<string, { readonly platform: string; readonly caption: string; readonly hashtags: readonly string[] }>();
  for (const v of copy.variants ?? []) {
    map.set(v.platform, v as { readonly platform: string; readonly caption: string; readonly hashtags: readonly string[] });
  }
  return map;
}

describe("composeCopyForChannels — AC1/AC5: a single-Channel Brand's behavior is unchanged", () => {
  it("is provably IDENTICAL to composeCopy's own result for a Brand with exactly ONE (primary) Channel", async () => {
    const plain = await composeCopy(sampleInput(), CHARACTER_EXPLAINER_SHAPE, { brandProfilePath: RULES_PROFILE });
    const perChannel = await composeCopyForChannels(sampleInput(), CHARACTER_EXPLAINER_SHAPE, SINGLE_CHANNEL, {
      brandProfilePath: RULES_PROFILE,
    });
    assert.equal(perChannel.ok, true, JSON.stringify(perChannel.errors));
    assert.deepEqual(perChannel, plain);
  });

  it("carries NO `variants` field at all for a single-Channel Brand — the exact pre-#129 Copy shape", async () => {
    const result = await composeCopyForChannels(sampleInput(), CHARACTER_EXPLAINER_SHAPE, SINGLE_CHANNEL, {
      brandProfilePath: NO_RULES_PROFILE,
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal("variants" in result.copy!, false);
    assert.deepEqual(Object.keys(result.copy!).sort(), ["caption", "hashtags"]);
  });

  it("a Brand with ZERO configured Channels degrades to the same unlabeled compose — never crashes", async () => {
    const plain = await composeCopy(sampleInput(), CHARACTER_EXPLAINER_SHAPE, { brandProfilePath: NO_RULES_PROFILE });
    const result = await composeCopyForChannels(sampleInput(), CHARACTER_EXPLAINER_SHAPE, [], {
      brandProfilePath: NO_RULES_PROFILE,
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.deepEqual(result, plain);
  });

  it("a Brand with ZERO configured Channels still reports a failing draft — never silently succeeds", async () => {
    const result = await composeCopyForChannels(
      sampleInput(),
      CHARACTER_EXPLAINER_SHAPE,
      [],
      { brandProfilePath: NO_RULES_PROFILE, drafter: () => ({ caption: "No emoji at all in this caption", hashtags: [] }) },
    );
    assert.equal(result.ok, false);
    assert.equal(result.copy, undefined);
    assert.ok(result.errors && result.errors[0]!.errors.some((e) => e.code === "caption_emoji_count"));
  });
});

describe("composeCopyForChannels — AC2: a multi-Channel Brand composes one variant per targeted platform (Straw Motion's own 5-platform list)", () => {
  it("composes exactly one labeled variant per targeted platform, including the primary", async () => {
    const result = await composeCopyForChannels(sampleInput(), CHARACTER_EXPLAINER_SHAPE, STRAW_MOTION_CHANNELS, {
      brandProfilePath: NO_RULES_PROFILE,
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(result.copy!.variants!.length, 5);
    assert.deepEqual(
      result.copy!.variants!.map((v) => v.platform).sort(),
      ["facebook", "instagram", "linkedin", "tiktok", "x"],
    );
  });

  it("the top-level caption/hashtags mirror the PRIMARY (facebook) Channel's own variant", async () => {
    const result = await composeCopyForChannels(sampleInput(), CHARACTER_EXPLAINER_SHAPE, STRAW_MOTION_CHANNELS, {
      brandProfilePath: NO_RULES_PROFILE,
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    const byPlatform = variantsByPlatform(result.copy!);
    assert.equal(result.copy!.caption, byPlatform.get("facebook")!.caption);
    assert.deepEqual(result.copy!.hashtags, byPlatform.get("facebook")!.hashtags);
  });

  it("the primary Channel's variant uses the Recipe's OWN copyShape (180 chars/1-3 emoji), never platform-shape.ts's own (different) facebook table entry (issue #128 AC3, wired here)", async () => {
    // A title long enough to overflow the Recipe's own 180-char cap but well within the table's
    // facebook entry (477 chars) — if the primary wrongly consulted the table, it would NOT truncate
    // here; because it uses the Recipe's own shape, it must.
    const longTitle = "Straw Motion breaks down this week's biggest AI story in plain English, no jargon, no hype. ".repeat(3);
    const result = await composeCopyForChannels(
      sampleInput({ title: longTitle }),
      CHARACTER_EXPLAINER_SHAPE,
      STRAW_MOTION_CHANNELS,
      { brandProfilePath: NO_RULES_PROFILE },
    );
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    const facebook = variantsByPlatform(result.copy!).get("facebook")!;
    assert.ok([...facebook.caption].length <= CHARACTER_EXPLAINER_SHAPE.maxChars);
    // 1-3 emoji required by the Recipe's OWN shape — proves the table's facebook entry (minEmojis: 0)
    // was never consulted for the primary.
    const emojiCount = [...facebook.caption].filter((ch) => /\p{Extended_Pictographic}/u.test(ch)).length;
    assert.ok(emojiCount >= 1);
  });

  it("each non-primary variant is validated against ITS OWN documented platform bounds (genuinely different caps)", async () => {
    // Longer than X's 280-char cap (so X truncates) but well under LinkedIn's 3,000-char cap (so
    // LinkedIn does not) — makes the two variants' lengths genuinely, provably different.
    const longTitle = "Straw Motion breaks down this week's biggest AI story in plain English, no jargon, no hype. ".repeat(4);
    const result = await composeCopyForChannels(
      sampleInput({ title: longTitle }),
      CHARACTER_EXPLAINER_SHAPE,
      STRAW_MOTION_CHANNELS,
      { brandProfilePath: NO_RULES_PROFILE },
    );
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    const byPlatform = variantsByPlatform(result.copy!);
    assert.ok([...byPlatform.get("x")!.caption].length <= 280);
    assert.ok([...byPlatform.get("tiktok")!.caption].length <= 150);
    assert.ok([...byPlatform.get("instagram")!.caption].length <= 2200);
    assert.ok([...byPlatform.get("linkedin")!.caption].length <= 3000);
    // X's practical cap is materially tighter than LinkedIn's — the two variants are genuinely
    // different lengths for the SAME long input, not one shared shape reused everywhere.
    assert.ok(byPlatform.get("x")!.caption.length < byPlatform.get("linkedin")!.caption.length);
  });

  it("collects EVERY failing platform's errors, never stops at the first, and never partially applies a Copy", async () => {
    // Ignores `shape` entirely — the SAME ~300-char, one-emoji caption for every platform. Too long for
    // the primary's own 180-char cap AND for X (280) AND for TikTok (150); fine for Instagram (2200)
    // and LinkedIn (3000).
    const fixedCaption = `${"A".repeat(300)} ☀️`;
    const fakeDrafter: CopyDrafter = () => ({ caption: fixedCaption, hashtags: [] });

    const result = await composeCopyForChannels(sampleInput(), CHARACTER_EXPLAINER_SHAPE, STRAW_MOTION_CHANNELS, {
      brandProfilePath: NO_RULES_PROFILE,
      drafter: fakeDrafter,
    });
    assert.equal(result.ok, false);
    assert.equal(result.copy, undefined, "a partially-valid set of variants is never surfaced");
    const failingPlatforms = result.errors!.map((f) => f.platform).sort();
    assert.deepEqual(failingPlatforms, ["facebook", "tiktok", "x"]);
    for (const failure of result.errors!) {
      assert.ok(failure.errors.some((e) => e.code === "caption_length"));
    }
  });

  it("flags a malformed LinkedIn @mention on ONLY the LinkedIn variant — other platforms are unaffected by the identical text", async () => {
    const fakeDrafter: CopyDrafter = () => ({
      caption: "Congrats to the team @ for shipping this ☀️",
      hashtags: [],
    });
    const result = await composeCopyForChannels(sampleInput(), CHARACTER_EXPLAINER_SHAPE, STRAW_MOTION_CHANNELS, {
      brandProfilePath: NO_RULES_PROFILE,
      drafter: fakeDrafter,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errors!.length, 1);
    assert.equal(result.errors![0]!.platform, "linkedin");
    assert.ok(result.errors![0]!.errors.some((e) => e.code === "platform_mention_syntax"));
  });

  it("an undocumented platform falls back to the Recipe's OWN baseShape — never fabricates a bound", async () => {
    const channels: readonly Channel[] = channelsFrom({
      channel: [
        { platform: "facebook", url: "https://example.test/page", primary: true },
        { platform: "mastodon", url: "" },
      ],
    });
    const longTitle = "Straw Motion breaks down this week's biggest AI story in plain English, no jargon. ".repeat(3);
    const input = sampleInput({ title: longTitle });

    const plain = await composeCopy(input, CHARACTER_EXPLAINER_SHAPE, { brandProfilePath: NO_RULES_PROFILE });
    const result = await composeCopyForChannels(input, CHARACTER_EXPLAINER_SHAPE, channels, {
      brandProfilePath: NO_RULES_PROFILE,
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    const mastodon = variantsByPlatform(result.copy!).get("mastodon")!;
    // Same draft -> inject -> validate pipeline, same fallback shape (baseShape) as composeCopy's own
    // single-variant path — genuinely the SAME caption, not some fabricated per-platform bound.
    assert.equal(mastodon.caption, plain.copy!.caption);
    assert.deepEqual(mastodon.hashtags, plain.copy!.hashtags);
  });

  it("injects the Brand's required CTA/hashtags into EVERY variant, primary and non-primary alike", async () => {
    const result = await composeCopyForChannels(sampleInput(), CHARACTER_EXPLAINER_SHAPE, STRAW_MOTION_CHANNELS, {
      brandProfilePath: RULES_PROFILE,
      drafter: skillDraftCopy,
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    for (const variant of result.copy!.variants!) {
      assert.ok(variant.caption.includes("Link in bio!"), `${variant.platform} must carry the required CTA`);
      assert.deepEqual(variant.hashtags, ["#lifehacks", "#tips"]);
    }
  });
});
