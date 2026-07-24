import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { characterExplainerCompanies } from "./character-explainer-companies.ts";
import { skillDraftCopy, type CopyInput } from "./draft.ts";
import type { ProductionSpec } from "../production-spec/contract.ts";
import type { CopyShape } from "./contract.ts";

/** A well-formed Character Explainer Spec, kept local and strongly typed — this module's own concern
 *  is the Spec -> CopyInput.companies wiring, not Spec validation (which has its own fixtures/tests). */
function sampleSpec(overrides: Partial<ProductionSpec> = {}): ProductionSpec {
  return {
    character_concepts: [
      "A cheerful anthropomorphic alarm clock",
      "A sleepy anthropomorphic coffee mug",
      "A bright anthropomorphic window curtain",
    ],
    clips: [
      {
        id: "clip-1",
        clip_id: 1,
        concept_title: "The groggy wake-up",
        image_prompt: "Pixar 3D render of the clock at dawn. Aspect Ratio 9:16.",
        video_prompt: "Slow push-in, it yawns, soft voice says good morning, gentle chime sfx.",
      },
      {
        id: "clip-2",
        clip_id: 2,
        concept_title: "The first ten minutes",
        image_prompt: "Pixar 3D render of the clock opening curtains. Aspect Ratio 9:16.",
        video_prompt: "Pan across the room, cheerful voice says let the day in, bright whoosh sfx.",
      },
      {
        id: "clip-3",
        clip_id: 3,
        concept_title: "The payoff",
        image_prompt: "Pixar 3D render of the clock dancing. Aspect Ratio 9:16.",
        video_prompt: "Orbit around the clock, upbeat voice says feel the difference, pop sfx.",
      },
    ],
    thumbnails: [
      "Pixar 3D close-up of the clock smiling. Aspect Ratio 9:16.",
      "Pixar 3D the clock opening curtains. Aspect Ratio 9:16.",
      "Pixar 3D the clock dancing. Aspect Ratio 9:16.",
    ],
    ...overrides,
  };
}

describe("characterExplainerCompanies — wires a saved Character Explainer Spec into CopyInput.companies (issue #125)", () => {
  it("carries a non-empty companies list through UNCHANGED", () => {
    const spec = sampleSpec({ companies: ["OpenAI", "Anthropic"] });
    assert.deepEqual(characterExplainerCompanies(spec), ["OpenAI", "Anthropic"]);
  });

  it("carries an explicit empty companies list through as [] — present, never fabricated", () => {
    const spec = sampleSpec({ companies: [] });
    assert.deepEqual(characterExplainerCompanies(spec), []);
  });

  it("normalizes an ABSENT companies field to [] — never fabricated, never throws", () => {
    const spec = sampleSpec();
    assert.equal("companies" in spec, false);
    assert.deepEqual(characterExplainerCompanies(spec), []);
  });

  it("never mutates the source Spec", () => {
    const spec = sampleSpec({ companies: ["OpenAI"] });
    const before = structuredClone(spec);
    characterExplainerCompanies(spec);
    assert.deepEqual(spec, before);
  });

  it("is deterministic: same Spec in, same result out", () => {
    const spec = sampleSpec({ companies: ["OpenAI"] });
    assert.deepEqual(characterExplainerCompanies(spec), characterExplainerCompanies(spec));
  });
});

/**
 * AC5's concrete proof (issue #125): "A Spec with no companies produces the same caption behavior as
 * before this change." Compares the composed caption from a wired-through, absent-companies Spec's
 * `CopyInput.companies` against the SAME input with `companies` omitted entirely (the pre-#125 shape)
 * — they must be byte-identical, proving an absent/empty companies list never fabricates a mention.
 */
describe("characterExplainerCompanies — an absent-companies Spec changes nothing about drafting (issue #125 AC5)", () => {
  const SHAPE: CopyShape = { maxChars: 180, minEmojis: 1, maxEmojis: 3 };

  it("skillDraftCopy's output is IDENTICAL with a wired-through absent-companies field vs. no companies field at all", () => {
    const spec = sampleSpec();
    const companies = characterExplainerCompanies(spec);

    const base: CopyInput = { title: "The groggy wake-up trick", mediaContext: "The cheerful alarm clock" };
    const withCompanies: CopyInput = { ...base, companies };
    const withoutCompaniesField: CopyInput = { ...base };

    assert.deepEqual(skillDraftCopy(withCompanies, SHAPE), skillDraftCopy(withoutCompaniesField, SHAPE));
  });

  it("skillDraftCopy's output is IDENTICAL whether a non-empty companies list is present or absent — naming is the Skill's own LLM job, never the deterministic drafter's", () => {
    const base: CopyInput = { title: "The groggy wake-up trick", mediaContext: "The cheerful alarm clock" };
    const withCompanies: CopyInput = { ...base, companies: ["OpenAI", "Anthropic"] };

    assert.deepEqual(skillDraftCopy(withCompanies, SHAPE), skillDraftCopy(base, SHAPE));
  });
});
