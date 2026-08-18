/**
 * Tests for build-prompt.ts — ported from test_build_prompt.py (issue #255). Covers: T2I subject-first
 * assembly with required subject / lighting / style, the word-budget hard ceiling, the edit change+keep
 * requirement, the edit one-reference rule, the moderation-safety scanner (a violence term refused, a
 * safe rephrase passes, overrideSafety bypasses), the negation guard (with the edit keep-clause
 * exception), and aspect-ratio validation. One `describe` per Python `class`, one `it` per `test_*`.
 * Run: node --import tsx --test scripts/build-prompt.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildPrompt, PromptValidationError, type BuildPromptArgs } from "./build-prompt.ts";

function t2i(overrides: Partial<BuildPromptArgs> = {}): BuildPromptArgs {
  return {
    mode: "T2I",
    subject: "A weathered fisherman mending a net, hands working the cord.",
    environment: "A wooden harbour jetty, boats blurred behind him.",
    lighting: "Soft golden-hour side light, warm and low.",
    camera: "85mm portrait, three-quarter angle, shallow depth of field.",
    style: "Cinematic film still, naturalistic 35mm look.",
    details: "",
    aspectRatio: "3:2",
    ...overrides,
  };
}

function edit(overrides: Partial<BuildPromptArgs> = {}): BuildPromptArgs {
  return {
    mode: "edit",
    change: "Relight the scene as heavy night rain with neon reflections.",
    keep: "the performers' faces, poses, costumes, and exact composition",
    references: ["two performers in a rain-soaked alley"],
    aspectRatio: "16:9",
    ...overrides,
  };
}

describe("T2I", () => {
  it("assembles", () => {
    const out = buildPrompt(t2i());
    assert.match(out, /fisherman/);
    assert.match(out, /\[on-screen settings/);
    assert.match(out, /aspect_ratio=3:2/);
  });

  it("subject leads", () => {
    const out = buildPrompt(t2i());
    const firstLine = out.split("\n")[0]!;
    assert.match(firstLine, /fisherman/);
  });

  it("requires subject", () => {
    assert.throws(() => buildPrompt(t2i({ subject: "  " })), PromptValidationError);
  });

  it("requires lighting", () => {
    assert.throws(() => buildPrompt(t2i({ lighting: "" })), PromptValidationError);
  });

  it("requires style", () => {
    assert.throws(() => buildPrompt(t2i({ style: "" })), PromptValidationError);
  });
});

describe("word budget", () => {
  it("over ceiling raises", () => {
    const longSubject = "a lone figure ".repeat(40);
    assert.throws(() => buildPrompt(t2i({ subject: longSubject })), PromptValidationError);
  });
});

describe("edit", () => {
  it("assembles", () => {
    const out = buildPrompt(edit());
    assert.match(out, /Reference:/);
    assert.match(out, /Keep the performers' faces/);
    assert.match(out, /exactly the same/);
  });

  it("requires change", () => {
    assert.throws(() => buildPrompt(edit({ change: "" })), PromptValidationError);
  });

  it("requires keep", () => {
    assert.throws(() => buildPrompt(edit({ keep: "" })), PromptValidationError);
  });

  it("requires one reference", () => {
    assert.throws(() => buildPrompt(edit({ references: undefined })), PromptValidationError);
  });

  it("two refs raises", () => {
    assert.throws(() => buildPrompt(edit({ references: ["a", "b"] })), PromptValidationError);
  });

  it("keep clause not falsely negation-rejected", () => {
    // A keep clause containing "without" must not trip the negation guard when the change clause is a
    // positive instruction.
    const out = buildPrompt(
      edit({
        change: "Relight the scene as a bright overcast midday.",
        keep: "the face and pose without altering the framing",
      }),
    );
    assert.match(out, /Reference:/);
  });
});

describe("moderation scanner", () => {
  it("violence term refused", () => {
    assert.throws(
      () => buildPrompt(t2i({ subject: "Two boxers in a brutal fight, one landing a punch." })),
      PromptValidationError,
    );
  });

  it("extreme photorealism refused", () => {
    assert.throws(
      () => buildPrompt(t2i({ style: "8K photorealistic, raw footage, documentary realism." })),
      PromptValidationError,
    );
  });

  it("quality spam refused", () => {
    assert.throws(
      () => buildPrompt(t2i({ details: "ultra-detailed, masterpiece, best quality." })),
      PromptValidationError,
    );
  });

  it("safe rephrase passes", () => {
    const out = buildPrompt(
      t2i({
        subject:
          "Two performers mid-rehearsal of a precise athletic stage routine, one guiding the other.",
        style: "High-contrast film-noir look, gritty but theatrical.",
      }),
    );
    assert.match(out, /performers/);
  });

  it("override safety bypasses", () => {
    const out = buildPrompt(
      t2i({ subject: "Two boxers in a fight, one landing a punch.", overrideSafety: true }),
    );
    assert.match(out, /boxers/);
  });

  it("scanner reports offending term and alternative", () => {
    try {
      buildPrompt(t2i({ subject: "A soldier in a fight scene." }));
      assert.fail("expected a PromptValidationError");
    } catch (exc) {
      assert.ok(exc instanceof PromptValidationError);
      const msg = (exc as Error).message;
      assert.match(msg, /fight/);
      assert.match(msg, /stage routine/);
    }
  });
});

describe("negation guard", () => {
  it("T2I all negation raises", () => {
    assert.throws(
      () =>
        buildPrompt(
          t2i({
            subject: "No people, no cars.",
            environment: "An empty street, no signage.",
            lighting: "No harsh light, never overexposed.",
            camera: "Not close, without flare.",
            style: "No grain, no filter.",
          }),
        ),
      PromptValidationError,
    );
  });
});

describe("aspect ratio", () => {
  it("default and presets pass", () => {
    assert.match(buildPrompt(t2i({ aspectRatio: "1:1" })), /aspect_ratio=1:1/);
    assert.match(buildPrompt(t2i({ aspectRatio: "9:16" })), /aspect_ratio=9:16/);
    assert.match(buildPrompt(t2i({ aspectRatio: "auto" })), /aspect_ratio=auto/);
  });

  it("unsupported aspect raises", () => {
    assert.throws(() => buildPrompt(t2i({ aspectRatio: "32:9" })), PromptValidationError);
  });
});
