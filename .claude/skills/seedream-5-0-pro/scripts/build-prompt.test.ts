/**
 * Tests for build-prompt.ts — ported from test_build_prompt.py (issue #255). Covers: subject-first
 * stills, Design (info-layout) mode, in-image text quoting + language hint, Edit single-ref with
 * grounded target and hex/swatch recolour validation, MR ordinal labelling + 10-ref cap,
 * sequential-set count + global style lock, layer-separation flag, word-budget hard ceiling, negation
 * guard, aspect/resolution validation (2K ceiling — a 4K request is rejected). One `describe` per
 * Python `class`, one `it` per `test_*`. Run: node --import tsx --test scripts/build-prompt.test.ts
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
    target: undefined,
    color: undefined,
    layers: false,
    inImageText: undefined,
    textLanguage: undefined,
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

describe("Design", () => {
  it("has brief header", () => {
    const out = buildPrompt(
      base({
        mode: "Design",
        subject: "A one-page infographic explaining the water cycle.",
        action: "",
        setting: "A circular clockwise flow with four labelled stages.",
        style: "Flat vector, teal-and-white, bold sans-serif headings.",
        camera: "",
        inImageText: 'the title "THE WATER CYCLE"',
      }),
    );
    assert.match(out, /High-density design brief:/);
    assert.match(out, /THE WATER CYCLE/);
  });

  it("requires style", () => {
    assert.throws(() => buildPrompt(base({ mode: "Design", style: "" })), PromptValidationError);
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

  it("language hint appears", () => {
    const out = buildPrompt(base({ inImageText: 'the sign "مرحبا"', textLanguage: "ar" }));
    assert.match(out, /language: ar/);
  });
});

describe("edit", () => {
  it("with one ref passes", () => {
    const out = buildPrompt(
      base({
        mode: "Edit",
        subject: "Recolour the car body to a deep metallic blue.",
        action: "",
        setting: "",
        camera: "",
        style: "Keep the original commercial-product look.",
        references: ["a red sports car in a studio"],
      }),
    );
    assert.match(out, /Reference:/);
  });

  it("target appears", () => {
    const out = buildPrompt(
      base({
        mode: "Edit",
        subject: "Recolour the body panels.",
        action: "",
        setting: "",
        camera: "",
        style: "Keep the original look.",
        references: ["a red sports car"],
        target: "the box around the body panels, not the windows",
      }),
    );
    assert.match(out, /Target:/);
  });

  it("hex color passes", () => {
    const out = buildPrompt(
      base({
        mode: "Edit",
        subject: "Recolour the body.",
        action: "",
        setting: "",
        camera: "",
        style: "Keep the gloss.",
        references: ["a car"],
        color: "#1E3A8A",
      }),
    );
    assert.match(out, /#1E3A8A/);
  });

  it("swatch color passes", () => {
    const out = buildPrompt(
      base({
        mode: "Edit",
        subject: "Replace the tabletop material.",
        action: "",
        setting: "",
        camera: "",
        style: "Keep the lighting.",
        references: ["a wooden table"],
        color: "match the swatch in Image 2",
      }),
    );
    assert.match(out, /Colour \/ material value:/);
  });

  it("bad color raises", () => {
    assert.throws(
      () =>
        buildPrompt(
          base({
            mode: "Edit",
            subject: "Recolour the body.",
            action: "",
            setting: "",
            camera: "",
            style: "Keep the gloss.",
            references: ["a car"],
            color: "bluish",
          }),
        ),
      PromptValidationError,
    );
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
        camera: "",
        style: "flat vector sticker, bold outline, white background",
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

describe("layers", () => {
  it("flag appends instruction", () => {
    const out = buildPrompt(base({ layers: true }));
    assert.match(out, /Layer separation:/);
    assert.match(out, /export as PNG/);
  });

  it("on sequential set", () => {
    const out = buildPrompt(
      base({
        mode: "sequential-set",
        subject: "a cat mascot",
        action: "",
        setting: "",
        camera: "",
        style: "flat vector sticker",
        setCount: 2,
        layers: true,
      }),
    );
    assert.match(out, /Layer separation:/);
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
  it("4:5 passes", () => {
    const out = buildPrompt(base({ aspectRatio: "4:5" }));
    assert.match(out, /aspect_ratio=4:5/);
  });

  it("auto aspect passes", () => {
    const out = buildPrompt(base({ aspectRatio: "auto" }));
    assert.match(out, /aspect_ratio=auto/);
  });

  it("unsupported aspect raises", () => {
    assert.throws(() => buildPrompt(base({ aspectRatio: "32:9" })), PromptValidationError);
  });

  it("2K passes", () => {
    const out = buildPrompt(base({ resolution: "2K" }));
    assert.match(out, /resolution=2K/);
  });

  it("auto resolution passes", () => {
    const out = buildPrompt(base({ resolution: "auto" }));
    assert.match(out, /resolution=auto/);
  });

  it("4K rejected", () => {
    // Seedream 5.0 Pro is a 2K model — 4K is not a valid tier.
    assert.throws(() => buildPrompt(base({ resolution: "4K" })), PromptValidationError);
  });
});
