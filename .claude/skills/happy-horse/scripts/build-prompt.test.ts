/**
 * Tests for build-prompt.ts — ported from test_build_prompt.py (issue #255). Covers: subject+action
 * lead, camera/style/environment ordering, audio placed last, dialogue language requirement,
 * @Image1/@Video1 token binding, I2V one-first-frame rule, R2V/edit 5-reference cap, duration and
 * resolution ranges, sequence beats (First/then/finally), negation guard, named-camera-move validation
 * (soft; overrideCamera bypasses). One `describe` per Python `class`, one `it` per `test_*`.
 * Run: node --import tsx --test scripts/build-prompt.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildPrompt, PromptValidationError, type BuildPromptArgs } from "./build-prompt.ts";

function base(overrides: Partial<BuildPromptArgs> = {}): BuildPromptArgs {
  return {
    mode: "T2V",
    subject: "A lone swordswoman steps into a courtyard.",
    action: "She snaps into a guard stance.",
    camera: "Camera tracks behind her, then orbits 90 degrees left.",
    style: "Ultra-realistic, warm lantern light, cinematic.",
    environment: "Night, heavy rain, paper lanterns swaying.",
    references: undefined,
    dialogue: undefined,
    sfx: undefined,
    ambience: undefined,
    music: undefined,
    sequence: undefined,
    duration: 5,
    resolution: "1080p",
    aspectRatio: "16:9",
    ...overrides,
  };
}

describe("T2V", () => {
  it("assembles in order", () => {
    const out = buildPrompt(base());
    assert.match(out, /swordswoman/);
    assert.match(out, /Camera:/);
    assert.match(out, /Style:/);
    assert.match(out, /Environment:/);
    assert.match(out, /\[on-screen settings/);
    // subject/action precedes camera precedes settings
    assert.ok(out.indexOf("swordswoman") < out.indexOf("Camera:"));
    assert.ok(out.indexOf("Camera:") < out.indexOf("on-screen settings"));
  });

  it("requires subject action camera", () => {
    for (const field of ["subject", "action", "camera"] as const) {
      assert.throws(() => buildPrompt(base({ [field]: "" })), PromptValidationError);
    }
  });

  it("T2V rejects references", () => {
    assert.throws(() => buildPrompt(base({ references: ["something"] })), PromptValidationError);
  });
});

describe("audio last", () => {
  it("audio block after visuals", () => {
    const out = buildPrompt(base({ sfx: "rain hammering on tile", ambience: "distant thunder" }));
    assert.match(out, /Audio:/);
    assert.ok(out.indexOf("Environment:") < out.indexOf("Audio:"));
    assert.ok(out.indexOf("Audio:") < out.indexOf("on-screen settings"));
  });
});

describe("dialogue", () => {
  it("dialogue with language passes", () => {
    const out = buildPrompt(base({ dialogue: 'Japanese|the old man says, "おかえり。"' }));
    assert.match(out, /Dialogue \(Japanese\):/);
  });

  it("dialogue without language raises", () => {
    assert.throws(() => buildPrompt(base({ dialogue: 'she says, "hi"' })), PromptValidationError);
  });
});

describe("I2V", () => {
  it("with one image passes", () => {
    const out = buildPrompt(
      base({ mode: "I2V", references: [{ kind: "image", role: "woman on a beach" }] }),
    );
    assert.match(out, /@Image1 as the first frame/);
  });

  it("without ref raises", () => {
    assert.throws(() => buildPrompt(base({ mode: "I2V", references: undefined })), PromptValidationError);
  });

  it("with two refs raises", () => {
    assert.throws(() => buildPrompt(base({ mode: "I2V", references: ["a", "b"] })), PromptValidationError);
  });
});

describe("R2V", () => {
  it("binds image and video tokens", () => {
    const out = buildPrompt(
      base({
        mode: "R2V",
        references: [
          { kind: "image", role: "the mercenary" },
          { kind: "image", role: "neon palette" },
          { kind: "video", role: "camera reference" },
        ],
      }),
    );
    assert.match(out, /@Image1: the mercenary/);
    assert.match(out, /@Image2: neon palette/);
    assert.match(out, /@Video1: camera reference/);
  });

  it("five refs passes", () => {
    const refs = Array.from({ length: 5 }, (_, i) => ({ kind: "image", role: `r${i}` }));
    const out = buildPrompt(base({ mode: "R2V", references: refs }));
    assert.match(out, /@Image5/);
  });

  it("six refs raises", () => {
    const refs = Array.from({ length: 6 }, (_, i) => ({ kind: "image", role: `r${i}` }));
    assert.throws(() => buildPrompt(base({ mode: "R2V", references: refs })), PromptValidationError);
  });

  it("zero refs raises", () => {
    assert.throws(() => buildPrompt(base({ mode: "R2V", references: undefined })), PromptValidationError);
  });
});

describe("edit", () => {
  it("assembles", () => {
    const out = buildPrompt(
      base({
        mode: "edit",
        subject: "The car drives down the road.",
        action: "It rounds a bend.",
        references: [
          { kind: "video", role: "source clip" },
          { kind: "image", role: "cream convertible" },
        ],
      }),
    );
    assert.match(out, /Edit;/);
    assert.match(out, /@Video1: source clip/);
  });
});

describe("duration", () => {
  it("in range passes", () => {
    const out = buildPrompt(base({ duration: 15 }));
    assert.match(out, /duration_s=15/);
  });

  it("too short raises", () => {
    assert.throws(() => buildPrompt(base({ duration: 3 })), PromptValidationError);
  });

  it("too long raises", () => {
    assert.throws(() => buildPrompt(base({ duration: 16 })), PromptValidationError);
  });
});

describe("settings", () => {
  it("480p passes", () => {
    const out = buildPrompt(base({ resolution: "480p" }));
    assert.match(out, /resolution=480p/);
  });

  it("unsupported resolution raises", () => {
    assert.throws(() => buildPrompt(base({ resolution: "4K" })), PromptValidationError);
  });

  it("unsupported aspect raises", () => {
    assert.throws(() => buildPrompt(base({ aspectRatio: "21:9" })), PromptValidationError);
  });
});

describe("sequence", () => {
  it("three beats first then finally", () => {
    const out = buildPrompt(
      base({
        sequence: ["she draws the blade", "she lunges forward", "she holds the final pose"],
      }),
    );
    assert.match(out, /First, she draws the blade\./);
    assert.match(out, /Then, she lunges forward\./);
    assert.match(out, /Finally, she holds the final pose\./);
  });
});

describe("camera validation", () => {
  it("off-list camera raises", () => {
    assert.throws(
      () => buildPrompt(base({ camera: "Camera floats dreamily through the scene." })),
      PromptValidationError,
    );
  });

  it("each named move passes", () => {
    for (const move of ["pan", "tilt", "dolly", "zoom", "orbit", "crane"]) {
      const out = buildPrompt(base({ camera: `Slow ${move} across the courtyard.` }));
      assert.match(out, /Camera:/);
    }
  });

  it("static passes", () => {
    const out = buildPrompt(base({ camera: "Static camera, locked off." }));
    assert.match(out, /Camera: Static camera, locked off\./);
  });

  it("override allows off-list camera", () => {
    const out = buildPrompt(
      base({ camera: "Fully reference @Video1 for all camera movements.", overrideCamera: true }),
    );
    assert.match(out, /Camera: Fully reference @Video1/);
  });
});

describe("negation guard", () => {
  it("negation-only raises", () => {
    assert.throws(
      () =>
        buildPrompt(
          base({
            subject: "No people.",
            action: "Not moving.",
            camera: "Not close, without flare.",
            style: "No grain.",
            environment: "No signage, never lit.",
          }),
        ),
      PromptValidationError,
    );
  });
});
