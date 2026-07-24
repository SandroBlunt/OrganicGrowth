import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { defaultDraftCopy, skillDraftCopy, type CopyInput, type CopySlideBeat } from "./draft.ts";
import { validateCopy } from "./validate.ts";
import { scanTextFieldsForDashes } from "../production-spec/dash-safety.ts";
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

  it("never joins title/mediaContext with a dash 'tell' — separate short sentences instead (issue #108)", () => {
    const copy = defaultDraftCopy(sampleInput({ mediaContext: "Sunny the Mug" }), CHARACTER_EXPLAINER_SHAPE);
    const scan = scanTextFieldsForDashes([{ field: "caption", text: copy.caption }]);
    assert.equal(scan.ok, true, JSON.stringify(scan.hits));
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

/**
 * `skillDraftCopy` — the `write-social-copy` Skill's deterministic stand-in (issue #111), mirroring
 * EXACTLY how `defaultDraftCopy` above already stands in for the pre-#111 unguided copy-phase prose.
 * Its headline difference: when `input.slideNarrative` is supplied (once the media exists, for a
 * multi-slide Recipe), it sharpens the ACTUAL produced hook/shift/cta beats into the caption, rather
 * than starting from `title` alone.
 */
describe("skillDraftCopy — the write-social-copy Skill's deterministic stand-in (issue #111)", () => {
  it("is deterministic: same input in, same Copy out", () => {
    assert.deepEqual(
      skillDraftCopy(sampleInput(), CHARACTER_EXPLAINER_SHAPE),
      skillDraftCopy(sampleInput(), CHARACTER_EXPLAINER_SHAPE),
    );
  });

  it("always satisfies validateCopy for the SAME shape it was drafted for (no rules configured)", () => {
    const copy = skillDraftCopy(sampleInput(), CHARACTER_EXPLAINER_SHAPE);
    const result = validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, NO_RULES);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
  });

  it("respects a DIFFERENT Recipe's shape — the bounds are the Recipe's own params, not a global 180/1-3", () => {
    const otherShape: CopyShape = { maxChars: 2200, minEmojis: 0, maxEmojis: 2 };
    const copy = skillDraftCopy(sampleInput(), otherShape);
    assert.ok([...copy.caption].length <= 2200);
    const result = validateCopy(copy, otherShape, NO_RULES);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
  });

  it("sharpens the ACTUAL produced on-slide narrative into the caption when slideNarrative is supplied", () => {
    const copy = skillDraftCopy(
      sampleInput({
        slideNarrative: [
          { role: "hook", text: "OpenAI, Anthropic, and Meta all shipped agents this week." },
          { role: "then", text: "This should never be woven in — not hook, shift, or cta." },
          { role: "shift", text: "Three rivals moved on the same idea at once." },
          { role: "cta", text: "Follow Straw Motion for the no hype version." },
        ],
      }),
      CHARACTER_EXPLAINER_SHAPE,
    );
    assert.ok(copy.caption.includes("OpenAI, Anthropic, and Meta all shipped agents this week."));
    assert.ok(copy.caption.includes("Three rivals moved on the same idea at once."));
    assert.ok(copy.caption.includes("Follow Straw Motion for the no hype version."));
    // Proves it drew on the ACTUAL produced narrative, not just the brief's bare title.
    assert.equal(copy.caption.includes(sampleInput().title), false);
  });

  it("only weaves the hook/shift/cta beats — a non-hook/shift/cta role never appears verbatim", () => {
    const copy = skillDraftCopy(
      sampleInput({
        slideNarrative: [
          { role: "hook", text: "The week AI got a job." },
          { role: "then", text: "UNIQUE_THEN_MARKER should never appear." },
          { role: "proof", text: "UNIQUE_PROOF_MARKER should never appear." },
          { role: "cta", text: "Follow Straw Motion." },
        ],
      }),
      CHARACTER_EXPLAINER_SHAPE,
    );
    assert.equal(copy.caption.includes("UNIQUE_THEN_MARKER"), false);
    assert.equal(copy.caption.includes("UNIQUE_PROOF_MARKER"), false);
  });

  it("falls back to title/angle/mediaContext cleanly when slideNarrative is absent (a single-media Recipe)", () => {
    const copy = skillDraftCopy(
      sampleInput({ angle: "A small home habit fixes your morning energy.", mediaContext: "Sunny the Mug" }),
      CHARACTER_EXPLAINER_SHAPE,
    );
    assert.ok(copy.caption.includes(sampleInput().title));
    assert.ok(copy.caption.includes("A small home habit fixes your morning energy."));
    assert.ok(copy.caption.includes("Sunny the Mug"));
    assert.equal(validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, NO_RULES).ok, true);
  });

  it("falls back to title alone when slideNarrative, angle, and mediaContext are all absent", () => {
    const copy = skillDraftCopy({ title: "x" }, CHARACTER_EXPLAINER_SHAPE);
    assert.equal(validateCopy(copy, CHARACTER_EXPLAINER_SHAPE, NO_RULES).ok, true);
  });

  it("never joins its parts with a dash 'tell' (issue #108) — with or without slideNarrative", () => {
    const withSlides = skillDraftCopy(
      sampleInput({
        slideNarrative: [
          { role: "hook", text: "The week AI got a job." },
          { role: "shift", text: "Three rivals moved at once." },
          { role: "cta", text: "Follow Straw Motion." },
        ],
        mediaContext: "the 7-slide news carousel",
      }),
      CHARACTER_EXPLAINER_SHAPE,
    );
    const withoutSlides = skillDraftCopy(sampleInput({ mediaContext: "Sunny the Mug" }), CHARACTER_EXPLAINER_SHAPE);
    for (const copy of [withSlides, withoutSlides]) {
      const scan = scanTextFieldsForDashes([{ field: "caption", text: copy.caption }]);
      assert.equal(scan.ok, true, JSON.stringify(scan.hits));
    }
  });

  it("passes through the Idea's own hashtags unchanged, exactly like defaultDraftCopy", () => {
    const copy = skillDraftCopy(sampleInput({ hashtags: ["#AInews", "#agentic"] }), CHARACTER_EXPLAINER_SHAPE);
    assert.deepEqual(copy.hashtags, ["#AInews", "#agentic"]);
  });

  /**
   * issue #120: a slide's `companies` field is now available on `CopySlideBeat`, mirroring how
   * `statCallout` is already an optional, additive field on the same type. This is the "mechanical
   * availability" proof, not a caption-content proof — it demonstrates a beat carrying `companies`
   * compiles, is accepted, and doesn't alter the drafter's own behavior; NAMING the real companies
   * naturally in the caption's own words is the `write-social-copy` Skill's own LLM job, agent-judged
   * like the News Carousel author phase's "grounded subject" checklist item, never a fixed template.
   */
  it("accepts a slideNarrative beat carrying companies without changing drafting behavior — the data is available to a real drafter without dictating caption content (issue #120)", () => {
    const beatsWithCompanies: readonly CopySlideBeat[] = [
      { role: "hook", text: "OpenAI, Anthropic, and Meta all shipped agents this week.", companies: ["OpenAI", "Anthropic", "Meta"] },
      { role: "shift", text: "Three rivals moved on the same idea at once.", companies: [] },
      { role: "cta", text: "Follow Straw Motion for the no hype version." },
    ];
    const beatsWithoutCompanies: readonly CopySlideBeat[] = beatsWithCompanies.map(
      ({ role, text }) => ({ role, text }),
    );

    const withCompanies = skillDraftCopy(sampleInput({ slideNarrative: beatsWithCompanies }), CHARACTER_EXPLAINER_SHAPE);
    const withoutCompanies = skillDraftCopy(sampleInput({ slideNarrative: beatsWithoutCompanies }), CHARACTER_EXPLAINER_SHAPE);

    // Purely additive: the deterministic drafter's OWN output is unaffected by companies' presence —
    // it never dictates a fixed "here are the companies" template (that judgment is the Skill's job).
    assert.deepEqual(withCompanies, withoutCompanies);
    assert.equal(validateCopy(withCompanies, CHARACTER_EXPLAINER_SHAPE, NO_RULES).ok, true);

    // The data really was available on the beat passed to the drafter — an empty array is DISTINCT
    // from an absent field (never collapsed to the same "nothing to say" case at the type level).
    const shift = beatsWithCompanies.find((b) => b.role === "shift")!;
    assert.deepEqual(shift.companies, []);
    const hook = beatsWithCompanies.find((b) => b.role === "hook")!;
    assert.deepEqual(hook.companies, ["OpenAI", "Anthropic", "Meta"]);
  });

  /**
   * issue #125: `CopyInput.companies` (the WHOLE-Asset-grain sibling of `CopySlideBeat.companies`, for
   * a single-media Recipe like Character Explainer with Cast) is now available on `CopyInput`. Mirrors
   * the #120 "mechanical availability" proof above exactly: a `companies` list compiles, is accepted,
   * and doesn't alter the deterministic drafter's own output — naming the real companies naturally in
   * the caption's own words stays the `write-social-copy` Skill's own LLM job.
   */
  it("accepts a top-level CopyInput.companies list without changing drafting behavior — mirrors CopySlideBeat.companies's availability proof, at the whole-Asset grain (issue #125)", () => {
    const withCompanies = skillDraftCopy(
      sampleInput({ mediaContext: "Sunny the Mug", companies: ["OpenAI", "Anthropic"] }),
      CHARACTER_EXPLAINER_SHAPE,
    );
    const withEmptyCompanies = skillDraftCopy(
      sampleInput({ mediaContext: "Sunny the Mug", companies: [] }),
      CHARACTER_EXPLAINER_SHAPE,
    );
    const withoutCompaniesField = skillDraftCopy(
      sampleInput({ mediaContext: "Sunny the Mug" }),
      CHARACTER_EXPLAINER_SHAPE,
    );

    // Purely additive: the deterministic drafter's OWN output is unaffected by companies' presence,
    // whether non-empty, explicitly empty, or absent entirely.
    assert.deepEqual(withCompanies, withoutCompaniesField);
    assert.deepEqual(withEmptyCompanies, withoutCompaniesField);
    assert.equal(validateCopy(withCompanies, CHARACTER_EXPLAINER_SHAPE, NO_RULES).ok, true);

    // defaultDraftCopy is unaffected too — companies is Recipe-agnostic on CopyInput, not tied to
    // whichever drafter reads it.
    const defaultWith = defaultDraftCopy(
      sampleInput({ mediaContext: "Sunny the Mug", companies: ["OpenAI"] }),
      CHARACTER_EXPLAINER_SHAPE,
    );
    const defaultWithout = defaultDraftCopy(
      sampleInput({ mediaContext: "Sunny the Mug" }),
      CHARACTER_EXPLAINER_SHAPE,
    );
    assert.deepEqual(defaultWith, defaultWithout);
  });
});
