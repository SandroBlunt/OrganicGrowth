import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { composeCopy } from "./compose.ts";
import { validateCopy } from "./validate.ts";
import { skillDraftCopy, type CopyInput, type CopyDrafter } from "./draft.ts";
import { newsCarouselSlideNarrative } from "./news-carousel-slide-narrative.ts";
import { getRecipe } from "../recipe/registry.ts";
import { CAROUSEL_ROLES, type CarouselSlide } from "../production-spec/news-carousel-contract.ts";

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
