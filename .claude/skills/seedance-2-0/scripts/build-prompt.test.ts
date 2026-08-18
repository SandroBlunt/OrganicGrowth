/**
 * Tests for build-prompt.ts — ported from test_build_prompt.py (issue #255). One `describe` per Python
 * `class`, one `it` per `test_*`. Run: node --import tsx --test scripts/build-prompt.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildPrompt, PromptValidationError, type BuildPromptArgs } from "./build-prompt.ts";

function base(overrides: Partial<BuildPromptArgs> = {}): BuildPromptArgs {
  return {
    mode: "T2V",
    subject: "A subject.",
    action: "Stands.",
    setting: "A place.",
    style: "Cinematic.",
    camera: "Medium, 50 mm.",
    motion: "Subject turns head.",
    references: undefined,
    i2vReference: undefined,
    firstFrame: undefined,
    lastFrame: undefined,
    audio: undefined,
    aspectRatio: "16:9",
    overrideMixBudget: false,
    ...overrides,
  };
}

describe("T2V", () => {
  it("assembles", () => {
    const out = buildPrompt(base());
    assert.match(out, /Motion:/);
  });
});

describe("I2V", () => {
  it("with one ref passes", () => {
    const out = buildPrompt(base({ mode: "I2V", i2vReference: "frame 1: subject portrait" }));
    assert.match(out, /Reference \(frame 1\)/);
  });
});

describe("MR caps", () => {
  it("max documented passes", () => {
    const refs = Array.from({ length: 9 }, (_, i) => ({ type: "image", role: `i${i}` }));
    const out = buildPrompt(base({ mode: "MR", references: refs }));
    assert.match(out, /Images \(9\/9\):/);
  });

  it("ten images raises", () => {
    const refs = Array.from({ length: 10 }, (_, i) => ({ type: "image", role: `i${i}` }));
    assert.throws(() => buildPrompt(base({ mode: "MR", references: refs })), PromptValidationError);
  });

  it("four videos raises", () => {
    const refs = Array.from({ length: 4 }, (_, i) => ({ type: "video", role: `v${i}` }));
    assert.throws(() => buildPrompt(base({ mode: "MR", references: refs })), PromptValidationError);
  });

  it("four audios raises", () => {
    const refs = Array.from({ length: 4 }, (_, i) => ({ type: "audio", role: `a${i}` }));
    assert.throws(() => buildPrompt(base({ mode: "MR", references: refs })), PromptValidationError);
  });
});

describe("MR heuristic", () => {
  it("video present with one image raises", () => {
    const refs = [
      { type: "video", role: "v1" },
      { type: "image", role: "i1" },
    ];
    assert.throws(() => buildPrompt(base({ mode: "MR", references: refs })), PromptValidationError);
  });

  it("video present with two images passes", () => {
    const refs = [
      { type: "video", role: "v1" },
      { type: "image", role: "i1" },
      { type: "image", role: "i2" },
    ];
    const out = buildPrompt(base({ mode: "MR", references: refs }));
    assert.match(out, /References/);
  });

  it("three videos raises effective cap", () => {
    const refs = [
      ...Array.from({ length: 3 }, (_, i) => ({ type: "video", role: `v${i}` })),
      ...Array.from({ length: 3 }, (_, i) => ({ type: "image", role: `i${i}` })),
    ];
    assert.throws(() => buildPrompt(base({ mode: "MR", references: refs })), PromptValidationError);
  });

  it("three audios raises effective cap", () => {
    const refs = [
      ...Array.from({ length: 3 }, (_, i) => ({ type: "audio", role: `a${i}` })),
      ...Array.from({ length: 3 }, (_, i) => ({ type: "image", role: `i${i}` })),
    ];
    assert.throws(() => buildPrompt(base({ mode: "MR", references: refs })), PromptValidationError);
  });

  it("three videos with override passes", () => {
    const refs = [
      ...Array.from({ length: 3 }, (_, i) => ({ type: "video", role: `v${i}` })),
      ...Array.from({ length: 3 }, (_, i) => ({ type: "image", role: `i${i}` })),
    ];
    const out = buildPrompt(base({ mode: "MR", references: refs, overrideMixBudget: true }));
    assert.match(out, /References/);
  });
});

describe("F/L", () => {
  it("with two frames", () => {
    const out = buildPrompt(base({ mode: "F/L", firstFrame: "ff", lastFrame: "lf" }));
    assert.match(out, /First frame:/);
  });
});
