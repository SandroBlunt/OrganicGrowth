import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { composeCopy } from "./compose.ts";
import { validateCopy } from "./validate.ts";
import type { CopyInput, CopyDrafter } from "./draft.ts";
import { getRecipe } from "../recipe/registry.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const RULES_PROFILE = join(HERE, "fixtures", "brand-profile.copy-rules.yaml");
const NO_RULES_PROFILE = join(HERE, "fixtures", "brand-profile.no-rules.yaml");

/**
 * The SINGLE wired Recipe's own copy shape, read from the real registry — never a hand-rolled shape —
 * so this suite proves the true "single-recipe path" (issue #58 AC: "Built test-first against the
 * fake; single-recipe path green").
 */
const CHARACTER_EXPLAINER_SHAPE = getRecipe("character-explainer-with-cast")!.copyShape;

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
