/**
 * Tests for build-prompt.ts — ported from test_build_prompt.py (issue #255). Covers: subject-first
 * stills, in-image text quoting, Edit single-ref, MR ordinal labelling + 10-ref cap, sequential-set
 * count + global style lock, word-budget hard ceiling, negation guard, aspect/resolution validation.
 * One `describe` per Python `class`, one `it` per `test_*`.
 * Run: node --import tsx --test scripts/build-prompt.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildPrompt, PromptValidationError, type BuildPromptArgs } from "./build-prompt.ts";

function base(overrides: Partial<BuildPromptArgs> = {}): BuildPromptArgs {
  return {
    mode: "T2I",
    subject: "A weathered fisherman mends a net.",
    action: "His hands work the cord, gaze down and focused.",
    setting: "A wooden harbour jetty at golden hour.",
    style: "Naturalistic 35mm film look, neutral-warm grade.",
    camera: "85mm portrait, low golden-hour sun from camera-right.",
    references: undefined,
    frames: undefined,
    setCount: undefined,
    inImageText: undefined,
    aspectRatio: "3:2",
    resolution: "2K",
    ...overrides,
  };
}

describe("T2I", () => {
  it("assembles", () => {
    const out = buildPrompt(base());
    assert.match(out, /fisherman/);
    assert.match(out, /\[on-screen settings/);
    assert.match(out, /aspect_ratio=3:2/);
    assert.match(out, /resolution=2K/);
  });

  it("requires subject", () => {
    assert.throws(() => buildPrompt(base({ subject: "  " })), PromptValidationError);
  });

  it("requires style", () => {
    assert.throws(() => buildPrompt(base({ style: "" })), PromptValidationError);
  });
});

describe("in-image text", () => {
  it("quoted text passes and appears", () => {
    const out = buildPrompt(base({ inImageText: 'the title "VISIT KYOTO" in bold serif' }));
    assert.match(out, /VISIT KYOTO/);
    assert.match(out, /In-image text:/);
  });

  it("unquoted text raises", () => {
    assert.throws(() => buildPrompt(base({ inImageText: "the title VISIT KYOTO" })), PromptValidationError);
  });
});

describe("edit", () => {
  it("with one ref passes", () => {
    const out = buildPrompt(
      base({
        mode: "Edit",
        subject: "Change the season to winter, bare trees, light snow.",
        action: "",
        setting: "",
        style: "Keep the original 35mm film look and warm grade.",
        camera: "",
        references: ["a lakeside cabin in autumn, warm window glow"],
      }),
    );
    assert.match(out, /Reference:/);
  });

  it("without ref raises", () => {
    assert.throws(() => buildPrompt(base({ mode: "Edit", references: undefined })), PromptValidationError);
  });

  it("with two refs raises", () => {
    assert.throws(() => buildPrompt(base({ mode: "Edit", references: ["a", "b"] })), PromptValidationError);
  });
});

describe("MR", () => {
  it("labels images by ordinal", () => {
    const out = buildPrompt(
      base({ mode: "MR", references: ["red-haired woman headshot", "neon Tokyo alley"] }),
    );
    assert.match(out, /Image 1: red-haired woman headshot/);
    assert.match(out, /Image 2: neon Tokyo alley/);
  });

  it("ten refs passes", () => {
    const refs = Array.from({ length: 10 }, (_, i) => `ref ${i}`);
    const out = buildPrompt(base({ mode: "MR", references: refs }));
    assert.match(out, /Image 10:/);
  });

  it("eleven refs raises", () => {
    const refs = Array.from({ length: 11 }, (_, i) => `ref ${i}`);
    assert.throws(() => buildPrompt(base({ mode: "MR", references: refs })), PromptValidationError);
  });

  it("dict ref requires role", () => {
    assert.throws(() => buildPrompt(base({ mode: "MR", references: [{ role: "" }] })), PromptValidationError);
  });
});

describe("sequential set", () => {
  it("assembles with count and states", () => {
    const out = buildPrompt(
      base({
        mode: "sequential-set",
        subject: "the same chubby orange cat mascot",
        action: "",
        setting: "",
        style: "flat vector sticker, bold outline, white background",
        camera: "",
        setCount: 3,
        frames: ["Image 1: happy, waving.", "Image 2: sleeping.", "Image 3: surprised."],
      }),
    );
    assert.match(out, /Generate a set of 3 images/);
    assert.match(out, /same across the whole set/);
    assert.match(out, /image_count=3/);
  });

  it("without count raises", () => {
    assert.throws(
      () =>
        buildPrompt(
          base({
            mode: "sequential-set",
            subject: "a cat mascot",
            style: "flat vector sticker",
            setCount: undefined,
          }),
        ),
      PromptValidationError,
    );
  });

  it("count too large raises", () => {
    assert.throws(
      () =>
        buildPrompt(
          base({ mode: "sequential-set", subject: "a cat mascot", style: "flat vector sticker", setCount: 9 }),
        ),
      PromptValidationError,
    );
  });

  it("more states than count raises", () => {
    assert.throws(
      () =>
        buildPrompt(
          base({
            mode: "sequential-set",
            subject: "a cat mascot",
            style: "flat vector sticker",
            setCount: 2,
            frames: ["Image 1: a.", "Image 2: b.", "Image 3: c."],
          }),
        ),
      PromptValidationError,
    );
  });
});

describe("word budget", () => {
  it("over ceiling raises", () => {
    const longSubject = "a cat ".repeat(130);
    assert.throws(() => buildPrompt(base({ subject: longSubject })), PromptValidationError);
  });
});

describe("negation guard", () => {
  it("negation-only raises", () => {
    assert.throws(
      () =>
        buildPrompt(
          base({
            subject: "No people, no cars.",
            action: "Not moving.",
            setting: "An empty street, no signage.",
            style: "No grain, no filter.",
            camera: "Not close, without flare.",
          }),
        ),
      PromptValidationError,
    );
  });
});

describe("settings validation", () => {
  it("21:9 passes", () => {
    const out = buildPrompt(base({ aspectRatio: "21:9" }));
    assert.match(out, /aspect_ratio=21:9/);
  });

  it("unsupported aspect raises", () => {
    assert.throws(() => buildPrompt(base({ aspectRatio: "32:9" })), PromptValidationError);
  });

  it("4K passes", () => {
    const out = buildPrompt(base({ resolution: "4K" }));
    assert.match(out, /resolution=4K/);
  });

  it("unsupported resolution raises", () => {
    assert.throws(() => buildPrompt(base({ resolution: "8K" })), PromptValidationError);
  });
});
