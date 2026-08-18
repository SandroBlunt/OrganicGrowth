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
    v2vReference: undefined,
    v2vRole: undefined,
    firstFrame: undefined,
    lastFrame: undefined,
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

describe("V2V", () => {
  it("with role passes", () => {
    const out = buildPrompt(
      base({ mode: "V2V", v2vReference: "A short clip of a dancer spinning.", v2vRole: "motion source" }),
    );
    assert.match(out, /Reference clip/);
    assert.match(out, /motion source/);
  });

  it("without ref raises", () => {
    assert.throws(
      () => buildPrompt(base({ mode: "V2V", v2vReference: undefined, v2vRole: "motion source" })),
      PromptValidationError,
    );
  });

  it("without role raises", () => {
    assert.throws(
      () => buildPrompt(base({ mode: "V2V", v2vReference: "x", v2vRole: undefined })),
      PromptValidationError,
    );
  });
});

describe("MR", () => {
  it("seven images", () => {
    const refs = Array.from({ length: 7 }, (_, i) => ({ type: "image", role: `r${i}` }));
    const out = buildPrompt(base({ mode: "MR", references: refs }));
    assert.match(out, /References \(mixed/);
  });

  it("eight inputs raises", () => {
    const refs = Array.from({ length: 8 }, (_, i) => ({ type: "image", role: `r${i}` }));
    assert.throws(() => buildPrompt(base({ mode: "MR", references: refs })), PromptValidationError);
  });

  it("three video raises heuristic", () => {
    const refs = Array.from({ length: 3 }, (_, i) => ({ type: "video", role: `v${i}` }));
    assert.throws(() => buildPrompt(base({ mode: "MR", references: refs })), PromptValidationError);
  });

  it("video present with two images raises image floor", () => {
    const refs = [
      { type: "video", role: "v1" },
      { type: "image", role: "i1" },
      { type: "image", role: "i2" },
    ];
    assert.throws(() => buildPrompt(base({ mode: "MR", references: refs })), PromptValidationError);
  });

  it("video present with three images passes", () => {
    const refs = [
      { type: "video", role: "v1" },
      { type: "image", role: "i1" },
      { type: "image", role: "i2" },
      { type: "image", role: "i3" },
    ];
    const out = buildPrompt(base({ mode: "MR", references: refs }));
    assert.match(out, /References/);
  });

  it("two audio raises", () => {
    const refs = [
      { type: "audio", role: "a1" },
      { type: "audio", role: "a2" },
    ];
    assert.throws(() => buildPrompt(base({ mode: "MR", references: refs })), PromptValidationError);
  });

  it("heuristic violation with override passes", () => {
    const refs = Array.from({ length: 3 }, (_, i) => ({ type: "video", role: `v${i}` }));
    const out = buildPrompt(base({ mode: "MR", references: refs, overrideMixBudget: true }));
    assert.match(out, /References/);
  });
});

describe("I2V", () => {
  it("with one ref passes", () => {
    const out = buildPrompt(base({ mode: "I2V", i2vReference: "frame 1: subject portrait" }));
    assert.match(out, /Reference \(frame 1\)/);
  });
});

describe("F/L", () => {
  it("with two frames", () => {
    const out = buildPrompt(base({ mode: "F/L", firstFrame: "ff", lastFrame: "lf" }));
    assert.match(out, /First frame:/);
  });
});
