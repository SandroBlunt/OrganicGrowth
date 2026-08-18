/**
 * Tests for build-prompt.ts — ported from test_build_prompt.py (issue #255). Covers: camera-front-loaded
 * ordering, subject+action, Sound placed last, Sound-required refusal, I2V one-first-frame rule,
 * reference 1..7 cap, extend one-clip rule, single-camera-move validation + stacking rejection +
 * override, the moderation-safety scanner (violence word refused; safe rephrase passes;
 * overrideSafety bypasses), negation guard, duration range (1..15). One `describe` per Python `class`,
 * one `it` per `test_*` (a Python `subTest` loop inside one test method stays one `it` with an internal
 * loop, matching the Python test-count semantics exactly — the original Python test suite reported 35
 * tests regardless of subTest count, confirmed by direct run before the port).
 * Run: node --import tsx --test scripts/build-prompt.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildPrompt, PromptValidationError, type BuildPromptArgs } from "./build-prompt.ts";

function base(overrides: Partial<BuildPromptArgs> = {}): BuildPromptArgs {
  return {
    mode: "T2V",
    camera: "Slow push-in toward the performers.",
    subject:
      "Two performers move through a precise athletic stage routine in a rain-soaked alley at night.",
    action: "Their footwork splashes through puddles with crisp, synchronized timing.",
    environment: "Neon reflections shift on the wet brick.",
    style: "High-contrast film-noir look, stylized film lighting.",
    references: undefined,
    dialogue: undefined,
    sfx: "boots splashing through puddles, heavy rain on concrete",
    ambience: undefined,
    music: undefined,
    duration: 6,
    aspectRatio: "16:9",
    ...overrides,
  };
}

describe("ordering", () => {
  it("camera leads then subject then sound", () => {
    const out = buildPrompt(base());
    assert.match(out, /push-in/);
    assert.match(out, /Sound:/);
    assert.match(out, /\[on-screen settings/);
    assert.ok(out.indexOf("push-in") < out.indexOf("performers move"));
    assert.ok(out.indexOf("performers move") < out.indexOf("Sound:"));
    assert.ok(out.indexOf("Sound:") < out.indexOf("on-screen settings"));
  });

  it("requires camera subject action", () => {
    for (const field of ["camera", "subject", "action"] as const) {
      assert.throws(() => buildPrompt(base({ [field]: "" })), PromptValidationError);
    }
  });

  it("T2V rejects references", () => {
    assert.throws(() => buildPrompt(base({ references: ["something"] })), PromptValidationError);
  });
});

describe("sound required", () => {
  it("no sound raises", () => {
    assert.throws(
      () => buildPrompt(base({ sfx: undefined, ambience: undefined, music: undefined, dialogue: undefined })),
      PromptValidationError,
    );
  });

  it("ambience only passes", () => {
    const out = buildPrompt(base({ sfx: undefined, ambience: "distant traffic muffled by rain" }));
    assert.match(out, /Sound:/);
  });

  it("audio is last content line", () => {
    const out = buildPrompt(base({ ambience: "distant thunder" }));
    // Sound comes after environment and style, before settings.
    assert.ok(out.indexOf("film-noir") < out.indexOf("Sound:"));
    assert.ok(out.indexOf("Sound:") < out.indexOf("on-screen settings"));
  });

  it("dialogue quoted in sound", () => {
    const out = buildPrompt(base({ dialogue: "You made it." }));
    assert.match(out, /dialogue: "You made it\."/);
  });
});

describe("I2V", () => {
  it("one image passes", () => {
    const out = buildPrompt(
      base({ mode: "I2V", references: [{ kind: "image", role: "the two performers" }] }),
    );
    assert.match(out, /Begin from the attached image/);
    assert.match(out, /only what changes/);
  });

  it("zero refs raises", () => {
    assert.throws(() => buildPrompt(base({ mode: "I2V", references: undefined })), PromptValidationError);
  });

  it("two refs raises", () => {
    assert.throws(() => buildPrompt(base({ mode: "I2V", references: ["a", "b"] })), PromptValidationError);
  });
});

describe("extend", () => {
  it("one clip passes", () => {
    const out = buildPrompt(base({ mode: "extend", references: [{ kind: "video", role: "source clip" }] }));
    assert.match(out, /Continue from the last frame/);
  });

  it("zero refs raises", () => {
    assert.throws(() => buildPrompt(base({ mode: "extend", references: undefined })), PromptValidationError);
  });
});

describe("reference mode", () => {
  it("reference seven passes", () => {
    const refs = Array.from({ length: 7 }, (_, i) => ({ kind: "image", role: `style ${i}` }));
    const out = buildPrompt(base({ mode: "reference", references: refs }));
    assert.match(out, /Reference 7:/);
  });

  it("reference eight raises", () => {
    const refs = Array.from({ length: 8 }, (_, i) => ({ kind: "image", role: `style ${i}` }));
    assert.throws(() => buildPrompt(base({ mode: "reference", references: refs })), PromptValidationError);
  });

  it("reference zero raises", () => {
    assert.throws(() => buildPrompt(base({ mode: "reference", references: undefined })), PromptValidationError);
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
    for (const move of [
      "push-in", "dolly", "orbit", "tracking", "arc", "pan", "tilt", "zoom", "crane", "handheld",
    ]) {
      const out = buildPrompt(base({ camera: `Gentle ${move} across the alley.` }));
      assert.match(out, new RegExp(move));
    }
  });

  it("static/locked-off not stacking", () => {
    // synonyms collapse to one group; must NOT read as two moves
    const out = buildPrompt(base({ camera: "Locked-off / static frame." }));
    assert.match(out, /Locked-off \/ static frame\./);
  });

  it("stacked camera raises", () => {
    assert.throws(
      () => buildPrompt(base({ camera: "Slow push-in, then a smooth orbit around the lead." })),
      PromptValidationError,
    );
  });

  it("stacked camera override passes", () => {
    const out = buildPrompt(
      base({ camera: "Slow push-in, then a smooth orbit around the lead.", overrideCamera: true }),
    );
    assert.match(out, /push-in/);
  });

  it("off-list override passes", () => {
    const out = buildPrompt(
      base({ camera: "Camera floats dreamily through the scene.", overrideCamera: true }),
    );
    assert.match(out, /floats dreamily/);
  });
});

describe("moderation scanner", () => {
  it("violence word refused", () => {
    try {
      buildPrompt(base({ action: "One performer throws a punch at the other." }));
      assert.fail("expected a PromptValidationError");
    } catch (exc) {
      assert.ok(exc instanceof PromptValidationError);
      assert.match((exc as Error).message, /punch/);
    }
  });

  it("photorealism cue refused", () => {
    try {
      buildPrompt(base({ style: "ultra-realistic 8K photorealistic raw footage" }));
      assert.fail("expected a PromptValidationError");
    } catch (exc) {
      assert.ok(exc instanceof PromptValidationError);
      assert.match((exc as Error).message, /ultra-realistic/);
    }
  });

  it("safe rephrase passes", () => {
    const out = buildPrompt(
      base({
        action:
          "One performer guides the other through a controlled, pulled stage movement with " +
          "synchronized timing.",
      }),
    );
    assert.match(out, /Sound:/);
  });

  it("override safety bypasses", () => {
    const out = buildPrompt(
      base({ action: "One performer throws a punch at the other.", overrideSafety: true }),
    );
    assert.match(out, /throws a punch/);
  });

  it("scanner reads sound fields", () => {
    assert.throws(
      () => buildPrompt(base({ sfx: "the crack of a real punch landing" })),
      PromptValidationError,
    );
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
            camera: "Not close, without a move.",
            environment: "No signage.",
            style: "No grain, never lit.",
          }),
        ),
      PromptValidationError,
    );
  });
});

describe("duration", () => {
  it("min passes", () => {
    const out = buildPrompt(base({ duration: 1 }));
    assert.match(out, /duration_s=1/);
  });

  it("max passes", () => {
    const out = buildPrompt(base({ duration: 15 }));
    assert.match(out, /duration_s=15/);
  });

  it("zero raises", () => {
    assert.throws(() => buildPrompt(base({ duration: 0 })), PromptValidationError);
  });

  it("sixteen raises", () => {
    assert.throws(() => buildPrompt(base({ duration: 16 })), PromptValidationError);
  });

  it("sweet spot note outside range", () => {
    const out = buildPrompt(base({ duration: 12 }));
    assert.match(out, /sweet spot/);
  });
});

describe("aspect ratio", () => {
  it("unsupported raises", () => {
    assert.throws(() => buildPrompt(base({ aspectRatio: "21:9" })), PromptValidationError);
  });

  it("9:16 passes", () => {
    const out = buildPrompt(base({ aspectRatio: "9:16" }));
    assert.match(out, /aspect_ratio=9:16/);
  });
});

describe("staging", () => {
  it("staging clause added", () => {
    const out = buildPrompt(base({ staging: true }));
    assert.match(out, /safe stagecraft/);
  });
});
