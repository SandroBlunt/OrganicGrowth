/**
 * Tests for build-prompt.ts — ported from test_build_prompt.py (issue #255). Reflects 0.2.0 capability:
 * Multi-Shot is core, native audio, element binding 1-3 images per element, separate negative prompt,
 * motion intensity, additional aspect ratios. One `describe` per Python `class`, one `it` per `test_*`.
 * Run: node --import tsx --test scripts/build-prompt.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildPrompt, PromptValidationError, type BuildPromptArgs } from "./build-prompt.ts";

function base(overrides: Partial<BuildPromptArgs> = {}): BuildPromptArgs {
  return {
    mode: "T2V",
    subject: "A dancer.",
    action: "Stands.",
    setting: "Empty stage.",
    style: "Painterly cinematic.",
    camera: "Wide medium, 50 mm.",
    motion: "Dancer raises both arms overhead.",
    elements: undefined,
    firstFrame: undefined,
    lastFrame: undefined,
    i2vReference: undefined,
    aspectRatio: "16:9",
    multiShotMode: "single",
    shots: undefined,
    totalDurationS: undefined,
    audio: undefined,
    motionIntensity: undefined,
    negativePrompt: undefined,
    ...overrides,
  };
}

describe("T2V", () => {
  it("assembles", () => {
    const out = buildPrompt(base());
    assert.match(out, /Motion:/);
  });

  it("missing motion raises", () => {
    assert.throws(() => buildPrompt(base({ motion: "" })), PromptValidationError);
  });

  it("multi-beat motion no longer rejected", () => {
    // Legacy "one beat per prompt" guard removed in 0.2.0.
    const out = buildPrompt(base({ motion: "She sits, then stands, then walks away." }));
    assert.match(out, /Motion:/);
  });
});

describe("I2V", () => {
  it("with one ref passes", () => {
    const out = buildPrompt(base({ mode: "I2V", i2vReference: "start frame: dancer at rest" }));
    assert.match(out, /Reference \(start frame\)/);
  });

  it("without ref raises", () => {
    assert.throws(() => buildPrompt(base({ mode: "I2V", i2vReference: undefined })), PromptValidationError);
  });

  it("with element binding", () => {
    const out = buildPrompt(
      base({
        mode: "I2V",
        i2vReference: "start frame: dancer at rest",
        elements: [
          { name: "dancer", images: ["front"] },
          { name: "the dress", images: ["front", "back"] },
        ],
      }),
    );
    assert.match(out, /Bound elements/);
  });
});

describe("MR", () => {
  it("two elements with one to three images", () => {
    const out = buildPrompt(
      base({
        mode: "MR",
        elements: [
          { name: "subject's face", images: ["a1"] },
          { name: "the satchel", images: ["b1", "b2", "b3"] },
        ],
      }),
    );
    assert.match(out, /Elements:/);
    assert.match(out, /subject's face/);
  });

  it("element with zero images raises", () => {
    assert.throws(
      () =>
        buildPrompt(
          base({
            mode: "MR",
            elements: [
              { name: "x", images: [] },
              { name: "y", images: ["b1"] },
            ],
          }),
        ),
      PromptValidationError,
    );
  });

  it("element with four images raises", () => {
    assert.throws(
      () =>
        buildPrompt(
          base({
            mode: "MR",
            elements: [
              { name: "x", images: ["a", "b", "c", "d"] },
              { name: "y", images: ["b1"] },
            ],
          }),
        ),
      PromptValidationError,
    );
  });

  it("with one element raises", () => {
    assert.throws(
      () => buildPrompt(base({ mode: "MR", elements: [{ name: "x", images: ["a", "b"] }] })),
      PromptValidationError,
    );
  });

  it("with five elements raises", () => {
    const elements = Array.from({ length: 5 }, (_, i) => ({ name: `e${i}`, images: ["x", "y"] }));
    assert.throws(() => buildPrompt(base({ mode: "MR", elements })), PromptValidationError);
  });
});

describe("F/L", () => {
  it("with two frames", () => {
    const out = buildPrompt(
      base({ mode: "F/L", firstFrame: "dancer arms at sides", lastFrame: "dancer arms overhead" }),
    );
    assert.match(out, /First frame:/);
  });

  it("missing last raises", () => {
    assert.throws(
      () => buildPrompt(base({ mode: "F/L", firstFrame: "ff", lastFrame: undefined })),
      PromptValidationError,
    );
  });
});

describe("multi-shot", () => {
  it("auto multi-shot passes", () => {
    const out = buildPrompt(
      base({
        multiShotMode: "auto",
        shots: [{ text: "Shot 1: wide establishing" }, { text: "Shot 2: medium reaction" }],
        totalDurationS: 8,
      }),
    );
    assert.match(out, /Multi-Shot: auto/);
  });

  it("custom multi-shot passes when durations sum", () => {
    const out = buildPrompt(
      base({
        multiShotMode: "custom",
        shots: [
          { durationS: 3, text: "wide" },
          { durationS: 5, text: "medium" },
        ],
        totalDurationS: 8,
      }),
    );
    assert.match(out, /Multi-Shot: custom/);
  });

  it("custom multi-shot durations must sum", () => {
    assert.throws(
      () =>
        buildPrompt(
          base({
            multiShotMode: "custom",
            shots: [
              { durationS: 3, text: "wide" },
              { durationS: 5, text: "medium" },
            ],
            totalDurationS: 10, // mismatched
          }),
        ),
      PromptValidationError,
    );
  });

  it("more than six shots raises", () => {
    const shots = Array.from({ length: 7 }, (_, i) => ({ durationS: 1, text: `s${i}` }));
    assert.throws(
      () => buildPrompt(base({ multiShotMode: "custom", shots, totalDurationS: 7 })),
      PromptValidationError,
    );
  });
});

describe("audio", () => {
  it("audio clause appears when supplied", () => {
    const out = buildPrompt(base({ audio: '[Detective, sharp]: "Where is the truth?"' }));
    assert.match(out, /Audio:/);
    assert.match(out, /Detective/);
  });
});

describe("motion intensity", () => {
  it("in range passes", () => {
    const out = buildPrompt(base({ motionIntensity: 0.5 }));
    assert.match(out, /Motion intensity: 0\.5/);
  });

  it("out of range raises", () => {
    assert.throws(() => buildPrompt(base({ motionIntensity: 1.5 })), PromptValidationError);
  });
});

describe("negative prompt", () => {
  it("appears as separate block", () => {
    const out = buildPrompt(base({ negativePrompt: "motion blur, face distortion" }));
    assert.match(out, /\[negative_prompt/);
    assert.match(out, /motion blur, face distortion/);
  });
});

describe("aspect", () => {
  it("invalid aspect raises", () => {
    assert.throws(() => buildPrompt(base({ aspectRatio: "3:2" })), PromptValidationError);
  });

  it("1:1 passes", () => {
    const out = buildPrompt(base({ aspectRatio: "1:1" }));
    assert.match(out, /\[aspect_ratio=1:1\]/);
  });

  it("4:5 passes", () => {
    const out = buildPrompt(base({ aspectRatio: "4:5" }));
    assert.match(out, /\[aspect_ratio=4:5\]/);
  });
});

describe("duration", () => {
  it("in range passes", () => {
    const out = buildPrompt(base({ totalDurationS: 10 }));
    assert.match(out, /\[duration_s=10\]/);
  });

  it("out of range raises", () => {
    assert.throws(() => buildPrompt(base({ totalDurationS: 20 })), PromptValidationError);
  });
});
