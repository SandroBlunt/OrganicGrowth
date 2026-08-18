/**
 * Tests for build-prompt.ts — ported from test_build_prompt.py (issue #255), written first (TDD),
 * one Node `describe` per Python `class`, one `it` per Python `test_*` method — same grouping, same
 * assertions, same fixture values. Run: node --import tsx --test scripts/build-prompt.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildPrompt, PromptValidationError } from "./build-prompt.ts";

describe("T2I assembly", () => {
  it("assembles five clauses in order", () => {
    const out = buildPrompt({
      mode: "T2I",
      subject: "A barista pulling an espresso shot.",
      action: "The barista's hands rest on the portafilter.",
      setting: "A small Melbourne specialty cafe at 7:30 am.",
      style: "35 mm photograph, Kodak Portra 400 palette.",
      camera: "Medium close-up at 50 mm, key from window camera-left.",
      references: undefined,
      aspectRatio: "3:2",
    });
    assert.match(out, /barista pulling an espresso shot/);
    assert.match(out, /portafilter/);
    assert.match(out, /Melbourne/);
    assert.match(out, /Portra 400/);
    assert.match(out, /Medium close-up/);
    const idxSubject = out.indexOf("barista pulling");
    const idxSetting = out.indexOf("Melbourne");
    const idxCamera = out.indexOf("Medium close-up");
    assert.ok(idxSubject < idxSetting);
    assert.ok(idxSetting < idxCamera);
  });

  it("missing clause raises", () => {
    assert.throws(
      () =>
        buildPrompt({
          mode: "T2I",
          subject: "A barista.",
          action: "",
          setting: "A cafe.",
          style: "Photograph.",
          camera: "Medium shot.",
          references: undefined,
          aspectRatio: "1:1",
        }),
      PromptValidationError,
    );
  });
});

describe("negation guard", () => {
  it("negation-only subject raises", () => {
    assert.throws(
      () =>
        buildPrompt({
          mode: "T2I",
          subject: "No people, no cars, not a cityscape.",
          action: "No motion.",
          setting: "An empty street, no signage.",
          style: "Photograph, no grain.",
          camera: "Wide shot, no people.",
          references: undefined,
          aspectRatio: "16:9",
        }),
      PromptValidationError,
    );
  });

  it("positive phrasing passes", () => {
    const out = buildPrompt({
      mode: "T2I",
      subject: "An empty cobbled street.",
      action: "Wind drifts a single paper bag along the kerb.",
      setting: "A pre-dawn European old-town square, blue hour.",
      style: "35 mm photograph, neutral grade.",
      camera: "Wide at 28 mm, eye level, soft ambient sky as key.",
      references: undefined,
      aspectRatio: "16:9",
    });
    assert.match(out, /cobbled street/);
  });
});

describe("MR cap", () => {
  it("MR with four refs passes", () => {
    const out = buildPrompt({
      mode: "MR",
      subject: "Editorial portrait composite.",
      action: "Subject stands three-quarter to camera.",
      setting: "Charcoal studio cyc.",
      style: "Editorial photograph.",
      camera: "Medium close-up, 85 mm.",
      references: [
        "subject's face",
        "outfit: charcoal blazer",
        "set: charcoal cyc",
        "lighting reference: soft key 45 deg camera-left",
      ],
      aspectRatio: "4:5",
    });
    assert.match(out, /References:/);
    assert.match(out, /1\./);
    assert.match(out, /4\./);
  });

  it("MR with five refs raises", () => {
    assert.throws(
      () =>
        buildPrompt({
          mode: "MR",
          subject: "Composite.",
          action: "Stands.",
          setting: "Studio.",
          style: "Photograph.",
          camera: "Medium.",
          references: ["a", "b", "c", "d", "e"],
          aspectRatio: "1:1",
        }),
      PromptValidationError,
    );
  });

  it("MR with one ref raises", () => {
    assert.throws(
      () =>
        buildPrompt({
          mode: "MR",
          subject: "Composite.",
          action: "Stands.",
          setting: "Studio.",
          style: "Photograph.",
          camera: "Medium.",
          references: ["only-one"],
          aspectRatio: "1:1",
        }),
      PromptValidationError,
    );
  });
});

describe("I2I ref required", () => {
  it("I2I without ref raises", () => {
    assert.throws(
      () =>
        buildPrompt({
          mode: "I2I",
          subject: "Edit the supplied portrait.",
          action: "Subject smiles instead of frowns.",
          setting: "Same set as the reference.",
          style: "Match the reference style.",
          camera: "Hold the reference framing.",
          references: undefined,
          aspectRatio: "1:1",
        }),
      PromptValidationError,
    );
  });

  it("I2I with one ref passes", () => {
    const out = buildPrompt({
      mode: "I2I",
      subject: "Reference: half-body portrait of a woman in a denim jacket.",
      action: "Edit: change lighting to golden-hour from camera-left.",
      setting: "Preserve: subject identity, pose, framing.",
      style: "Style hold: 35 mm photograph, Portra palette.",
      camera: "Hold reference framing.",
      references: ["primary edit reference"],
      aspectRatio: "3:2",
    });
    assert.match(out, /Reference:/);
  });
});

describe("aspect ratio", () => {
  it("invalid aspect ratio raises", () => {
    assert.throws(
      () =>
        buildPrompt({
          mode: "T2I",
          subject: "A.",
          action: "B.",
          setting: "C.",
          style: "D.",
          camera: "E.",
          references: undefined,
          aspectRatio: "banana",
        }),
      PromptValidationError,
    );
  });
});
