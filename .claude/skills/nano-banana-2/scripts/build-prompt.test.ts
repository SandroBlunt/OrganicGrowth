/**
 * Tests for build-prompt.ts — ported from test_build_prompt.py (issue #255). Reflects 0.2.0:
 * variant-aware MR caps (Flash 10obj+4char, Pro 6obj+5char, 14 total), expanded aspect ratios, 512
 * (Flash-only) resolution, Thinking Mode and grounding configuration parameters, frame-sequence
 * unchanged. One `describe` per Python `class`, one `it` per `test_*`.
 * Run: node --import tsx --test scripts/build-prompt.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildPrompt, PromptValidationError, type BuildPromptArgs } from "./build-prompt.ts";

function base(overrides: Partial<BuildPromptArgs> = {}): BuildPromptArgs {
  return {
    mode: "T2I",
    subject: "A barista pulls an espresso shot.",
    action: "Hands rest on the portafilter.",
    setting: "A small Tokyo specialty cafe at 7 am.",
    style: "35 mm photograph, neutral grade.",
    camera: "Medium close-up at 50 mm.",
    references: undefined,
    frames: undefined,
    handoff: undefined,
    aspectRatio: "3:2",
    variant: "flash",
    resolution: undefined,
    thinkingLevel: "minimal",
    includeThoughts: false,
    groundingWeb: false,
    groundingImage: false,
    ...overrides,
  };
}

describe("T2I", () => {
  it("assembles", () => {
    const out = buildPrompt(base());
    assert.match(out, /Tokyo/);
    assert.match(out, /portafilter/);
    assert.match(out, /\[aspect_ratio=3:2\]/);
    assert.match(out, /\[variant=flash\]/);
  });
});

describe("I2I", () => {
  it("with one ref passes", () => {
    const out = buildPrompt(
      base({
        mode: "I2I",
        subject: "Reference: half-body portrait, daylight.",
        action: "Edit: shift to golden-hour lighting.",
        setting: "Preserve identity, framing.",
        style: "Style hold: 35 mm photograph.",
        camera: "Hold reference framing.",
        references: ["primary"],
      }),
    );
    assert.match(out, /Reference:/);
  });

  it("without ref raises", () => {
    assert.throws(() => buildPrompt(base({ mode: "I2I", references: undefined })), PromptValidationError);
  });
});

describe("MR caps flash", () => {
  it("flash max objects passes", () => {
    const refs = Array.from({ length: 10 }, (_, i) => ({ kind: "object", role: `o${i}` }));
    const out = buildPrompt(base({ mode: "MR", references: refs, variant: "flash" }));
    assert.match(out, /Objects \(10 of 10\)/);
  });

  it("flash eleven objects raises", () => {
    const refs = Array.from({ length: 11 }, (_, i) => ({ kind: "object", role: `o${i}` }));
    assert.throws(
      () => buildPrompt(base({ mode: "MR", references: refs, variant: "flash" })),
      PromptValidationError,
    );
  });

  it("flash max characters passes", () => {
    const refs = Array.from({ length: 4 }, (_, i) => ({ kind: "character", role: `c${i}` }));
    const out = buildPrompt(base({ mode: "MR", references: refs, variant: "flash" }));
    assert.match(out, /Characters \(4 of 4\)/);
  });

  it("flash five characters raises", () => {
    const refs = Array.from({ length: 5 }, (_, i) => ({ kind: "character", role: `c${i}` }));
    assert.throws(
      () => buildPrompt(base({ mode: "MR", references: refs, variant: "flash" })),
      PromptValidationError,
    );
  });
});

describe("MR caps pro", () => {
  it("pro max characters passes", () => {
    const refs = Array.from({ length: 5 }, (_, i) => ({ kind: "character", role: `c${i}` }));
    const out = buildPrompt(base({ mode: "MR", references: refs, variant: "pro" }));
    assert.match(out, /Characters \(5 of 5\)/);
  });

  it("pro six characters raises", () => {
    const refs = Array.from({ length: 6 }, (_, i) => ({ kind: "character", role: `c${i}` }));
    assert.throws(
      () => buildPrompt(base({ mode: "MR", references: refs, variant: "pro" })),
      PromptValidationError,
    );
  });

  it("pro seven objects raises", () => {
    const refs = Array.from({ length: 7 }, (_, i) => ({ kind: "object", role: `o${i}` }));
    assert.throws(
      () => buildPrompt(base({ mode: "MR", references: refs, variant: "pro" })),
      PromptValidationError,
    );
  });
});

describe("MR total", () => {
  it("total fifteen raises", () => {
    const refs = [
      ...Array.from({ length: 10 }, (_, i) => ({ kind: "object", role: `o${i}` })),
      ...Array.from({ length: 5 }, (_, i) => ({ kind: "character", role: `c${i}` })),
    ];
    assert.throws(
      () => buildPrompt(base({ mode: "MR", references: refs, variant: "flash" })),
      PromptValidationError,
    );
  });
});

describe("MR legacy string refs", () => {
  it("legacy string refs treated as objects", () => {
    const out = buildPrompt(base({ mode: "MR", references: ["face", "outfit", "set"], variant: "flash" }));
    assert.match(out, /References:/);
    assert.match(out, /face/);
  });
});

describe("frame sequence", () => {
  it("passes with 4 frames and handoff", () => {
    const out = buildPrompt(
      base({
        mode: "frame-sequence",
        subject: "A dancer in a pale-grey silk dress.",
        action: "",
        setting: "",
        style: "50 mm photograph, soft window key from camera-left.",
        camera: "Wide medium at 50 mm, eye level, subject centered.",
        frames: [
          "Frame 1: arms at sides, gaze lowered.",
          "Frame 2: hands rising, gaze lifting.",
          "Frame 3: arms three-quarters up, hem catches motion.",
          "Frame 4: arms overhead, palms together, gaze upward.",
        ],
        handoff: "Veo 3.1 first-and-last-frame",
        aspectRatio: "16:9",
      }),
    );
    assert.match(out, /Sequence intent:/);
    assert.match(out, /Frame 4/);
    assert.match(out, /Veo 3\.1/);
  });

  it("without handoff raises", () => {
    assert.throws(
      () =>
        buildPrompt(
          base({
            mode: "frame-sequence",
            subject: "A dancer.",
            action: "",
            setting: "",
            style: "Photograph.",
            camera: "Medium.",
            frames: ["Frame 1: a.", "Frame 2: b.", "Frame 3: c."],
            handoff: undefined,
            aspectRatio: "16:9",
          }),
        ),
      PromptValidationError,
    );
  });

  it("with 2 frames raises", () => {
    assert.throws(
      () =>
        buildPrompt(
          base({
            mode: "frame-sequence",
            subject: "A dancer.",
            action: "",
            setting: "",
            style: "Photograph.",
            camera: "Medium.",
            frames: ["Frame 1: a.", "Frame 2: b."],
            handoff: "Veo 3.1",
            aspectRatio: "16:9",
          }),
        ),
      PromptValidationError,
    );
  });

  it("with 9 frames raises", () => {
    const frames = Array.from({ length: 9 }, (_, i) => `Frame ${i + 1}: x.`);
    assert.throws(
      () =>
        buildPrompt(
          base({
            mode: "frame-sequence",
            subject: "A dancer.",
            action: "",
            setting: "",
            style: "Photograph.",
            camera: "Medium.",
            frames,
            handoff: "Veo 3.1",
            aspectRatio: "16:9",
          }),
        ),
      PromptValidationError,
    );
  });
});

describe("negation guard", () => {
  it("negation-only T2I raises", () => {
    assert.throws(
      () =>
        buildPrompt(
          base({
            subject: "No people, no cars.",
            action: "No motion, not moving.",
            setting: "An empty street, not lit, no signage.",
            style: "No grain, no filter.",
            camera: "Wide shot, not close, without flare.",
          }),
        ),
      PromptValidationError,
    );
  });
});

describe("expanded aspect ratios", () => {
  it("21:9 passes", () => {
    const out = buildPrompt(base({ aspectRatio: "21:9" }));
    assert.match(out, /\[aspect_ratio=21:9\]/);
  });

  it("1:8 passes", () => {
    const out = buildPrompt(base({ aspectRatio: "1:8" }));
    assert.match(out, /\[aspect_ratio=1:8\]/);
  });

  it("unsupported aspect raises", () => {
    assert.throws(() => buildPrompt(base({ aspectRatio: "32:9" })), PromptValidationError);
  });
});

describe("resolution", () => {
  it("512 on flash passes", () => {
    const out = buildPrompt(base({ resolution: "512", variant: "flash" }));
    assert.match(out, /\[resolution=512\]/);
  });

  it("512 on pro raises", () => {
    assert.throws(() => buildPrompt(base({ resolution: "512", variant: "pro" })), PromptValidationError);
  });

  it("2K on pro passes", () => {
    const out = buildPrompt(base({ resolution: "2K", variant: "pro" }));
    assert.match(out, /\[resolution=2K\]/);
  });
});

describe("thinking mode", () => {
  it("High thinking appears in config block", () => {
    const out = buildPrompt(base({ thinkingLevel: "High" }));
    assert.match(out, /thinkingLevel=High/);
    assert.match(out, /NOT part of prompt budget/);
  });
});

describe("grounding", () => {
  it("image grounding on flash passes", () => {
    const out = buildPrompt(base({ groundingImage: true, variant: "flash" }));
    assert.match(out, /grounding_image=true/);
  });

  it("image grounding on pro raises", () => {
    assert.throws(
      () => buildPrompt(base({ groundingImage: true, variant: "pro" })),
      PromptValidationError,
    );
  });
});
