/**
 * Tests for build-prompt.ts — ported from test_build_prompt.py (issue #255). Reflects 0.1.1 refresh:
 * timestamp prompting, Ingredients alias, AddRemove (Veo 2, no audio), explicit dialogue/SFX in audio
 * block, noun-phrase negative prompt, F/L hand-off from Nano Banana 2. One `describe` per Python
 * `class`, one `it` per `test_*`. Run: node --import tsx --test scripts/build-prompt.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildPrompt, PromptValidationError, type BuildPromptArgs } from "./build-prompt.ts";

function base(overrides: Partial<BuildPromptArgs> = {}): BuildPromptArgs {
  return {
    mode: "T2V",
    subject: "A barista pulls an espresso shot.",
    action: "Hands rest on the portafilter.",
    setting: "A small Melbourne specialty cafe at 7:30 am.",
    style: "Cinematic photograph, neutral grade.",
    camera: "Medium close-up at 50 mm.",
    motion: "Barista lifts portafilter, locks it, presses brew.",
    references: undefined,
    firstFrame: undefined,
    lastFrame: undefined,
    audio: undefined,
    aspectRatio: "16:9",
    durationS: undefined,
    timestampSegments: undefined,
    negativePrompt: undefined,
    ...overrides,
  };
}

describe("T2V", () => {
  it("assembles six clauses", () => {
    const out = buildPrompt(base({ audio: 'A woman says, "We have to leave now."' }));
    assert.match(out.toLowerCase(), /barista/);
    assert.match(out, /Motion:/);
    assert.match(out, /Audio/);
  });

  it("missing motion raises", () => {
    assert.throws(() => buildPrompt(base({ motion: "" })), PromptValidationError);
  });
});

describe("I2V", () => {
  it("with one ref passes", () => {
    const out = buildPrompt(
      base({
        mode: "I2V",
        references: ["frame 1: portrait of subject"],
        aspectRatio: "9:16",
        motion: "Subject inhales and looks up.",
      }),
    );
    assert.match(out, /frame 1/);
  });
});

describe("ingredients", () => {
  it("alias for MR", () => {
    const out = buildPrompt(base({ mode: "Ingredients", references: ["face", "outfit"] }));
    assert.match(out, /Ingredients to Video/);
  });

  it("legacy MR alias still accepted", () => {
    const out = buildPrompt(base({ mode: "MR", references: ["face", "outfit"] }));
    assert.match(out, /References/);
  });

  it("with four refs raises", () => {
    assert.throws(
      () => buildPrompt(base({ mode: "Ingredients", references: ["a", "b", "c", "d"] })),
      PromptValidationError,
    );
  });

  it("with first frame raises exclusivity", () => {
    assert.throws(
      () => buildPrompt(base({ mode: "Ingredients", references: ["a"], firstFrame: "ff" })),
      PromptValidationError,
    );
  });
});

describe("F/L", () => {
  it("with two frames passes", () => {
    const out = buildPrompt(
      base({
        mode: "F/L",
        firstFrame: "dancer arms at sides",
        lastFrame: "dancer arms overhead",
        motion: "Subject raises arms from sides to overhead.",
      }),
    );
    assert.match(out, /First frame:/);
    assert.match(out, /Last frame:/);
  });

  it("without last frame raises", () => {
    assert.throws(
      () => buildPrompt(base({ mode: "F/L", firstFrame: "ff", lastFrame: undefined })),
      PromptValidationError,
    );
  });

  it("with ingredients refs raises exclusivity", () => {
    assert.throws(
      () => buildPrompt(base({ mode: "F/L", references: ["a"], firstFrame: "ff", lastFrame: "lf" })),
      PromptValidationError,
    );
  });
});

describe("AddRemove", () => {
  it("passes without audio", () => {
    const out = buildPrompt(
      base({ mode: "AddRemove", motion: "Add a coffee cup to the right side of the desk." }),
    );
    assert.match(out, /AddRemove mode/);
    assert.match(out, /Veo 2 model/);
  });

  it("with audio raises", () => {
    assert.throws(
      () => buildPrompt(base({ mode: "AddRemove", audio: 'A woman says, "Hi."' })),
      PromptValidationError,
    );
  });
});

describe("timestamp segments", () => {
  it("segments summing to duration passes", () => {
    const out = buildPrompt(
      base({
        durationS: 8,
        timestampSegments: [
          { bracket: "[00:00-00:02]", text: "Medium shot" },
          { bracket: "[00:02-00:04]", text: "Reverse shot" },
          { bracket: "[00:04-00:06]", text: "Tracking shot" },
          { bracket: "[00:06-00:08]", text: "Wide crane" },
        ],
      }),
    );
    assert.match(out, /Timestamp segments:/);
    assert.match(out, /\[00:00-00:02\]/);
  });

  it("segments not summing raises", () => {
    assert.throws(
      () =>
        buildPrompt(
          base({
            durationS: 8,
            timestampSegments: [
              { bracket: "[00:00-00:02]", text: "x" },
              { bracket: "[00:02-00:05]", text: "y" },
            ],
          }),
        ),
      PromptValidationError,
    );
  });

  it("segments with seconds fields pass", () => {
    const out = buildPrompt(
      base({
        durationS: 4,
        timestampSegments: [
          { startS: 0, endS: 2, text: "wide" },
          { startS: 2, endS: 4, text: "close-up" },
        ],
      }),
    );
    assert.match(out, /Timestamp segments:/);
  });
});

describe("duration", () => {
  it("valid duration passes", () => {
    const out = buildPrompt(base({ durationS: 8 }));
    assert.match(out, /\[duration_s=8\]/);
  });

  it("invalid duration raises", () => {
    assert.throws(() => buildPrompt(base({ durationS: 5 })), PromptValidationError);
  });
});

describe("negative prompt", () => {
  it("noun phrases pass", () => {
    const out = buildPrompt(base({ negativePrompt: "blurriness, distortion, extra limbs" }));
    assert.match(out, /\[negative_prompt/);
  });

  it("negation syntax in negative prompt raises", () => {
    assert.throws(
      () => buildPrompt(base({ negativePrompt: "no people, don't show buildings" })),
      PromptValidationError,
    );
  });
});

describe("aspect ratio", () => {
  it("invalid aspect ratio raises", () => {
    assert.throws(() => buildPrompt(base({ aspectRatio: "3:2" })), PromptValidationError);
  });
});
