import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generate, type Brief } from "./generate.ts";
import { validate } from "./validate.ts";
import { scanForBannedWords } from "./brand-safety.ts";
import {
  REQUIRED_CHARACTER_CONCEPTS,
  REQUIRED_CLIPS,
  REQUIRED_THUMBNAILS,
  ASPECT_RATIO_LINE,
} from "./contract.ts";

/** A representative accepted Brief (mirrors ideas/<run>/idea-NN.md front-matter + body fields). */
function sampleBrief(): Brief {
  return {
    id: "idea-2026-W22-01",
    run: "2026-W22",
    title: "El truco de los primeros 10 minutos al despertar",
    angle: "A small home habit in the first minutes of the day fixes your energy.",
    character_concepts: [
      "A cheerful anthropomorphic alarm clock",
      "A sleepy anthropomorphic coffee mug",
      "A bright anthropomorphic window curtain",
    ],
    beats: ["The groggy wake-up", "The first ten minutes", "The energized payoff"],
    post_copy: "Your first ten minutes decide your whole day ☀️☕",
  };
}

describe("generate — produces a contract-conformant Spec", () => {
  it("the generated Spec passes validate()", () => {
    const spec = generate(sampleBrief());
    const result = validate(spec);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
  });

  it("has exactly the required counts", () => {
    const spec = generate(sampleBrief());
    assert.equal(spec.character_concepts.length, REQUIRED_CHARACTER_CONCEPTS);
    assert.equal(spec.clips.length, REQUIRED_CLIPS);
    assert.equal(spec.thumbnails.length, REQUIRED_THUMBNAILS);
  });

  it("places post_copy and thumbnails at the TOP level (not in clips)", () => {
    const spec = generate(sampleBrief());
    assert.equal(typeof spec.post_copy, "string");
    assert.ok(Array.isArray(spec.thumbnails));
    for (const clip of spec.clips) {
      assert.equal("post_copy" in clip, false);
      assert.equal("thumbnails" in clip, false);
    }
  });

  it("every clip image_prompt ends with the 9:16 aspect-ratio line", () => {
    const spec = generate(sampleBrief());
    for (const clip of spec.clips) {
      assert.ok(clip.image_prompt.trimEnd().endsWith(ASPECT_RATIO_LINE));
    }
  });

  it("uses character_concepts[0] across the clips (the lead concept)", () => {
    const spec = generate(sampleBrief());
    const lead = spec.character_concepts[0]!;
    for (const clip of spec.clips) {
      assert.ok(clip.image_prompt.includes(lead));
    }
  });

  it("is deterministic: same Brief in, same Spec out", () => {
    assert.deepEqual(generate(sampleBrief()), generate(sampleBrief()));
  });
});

describe("generate — degenerate Briefs still yield a valid Spec", () => {
  it("synthesizes missing concepts/beats/post_copy to satisfy the contract", () => {
    const sparse: Brief = {
      id: "idea-2026-W22-09",
      run: "2026-W22",
      title: "A minimal brief",
    };
    const spec = generate(sparse);
    assert.equal(validate(spec).ok, true, JSON.stringify(validate(spec).errors));
  });

  it("truncates an over-long title into a contract-valid post_copy", () => {
    const longTitle: Brief = {
      id: "idea-2026-W22-10",
      run: "2026-W22",
      title: "Lorem ipsum dolor sit amet ".repeat(20), // > 180 chars, no emoji
    };
    const spec = generate(longTitle);
    const result = validate(spec);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.ok([...spec.post_copy].length <= 180);
  });
});

describe("generate — defaults are brand-safe against a configured banned list", () => {
  it("the generated Spec contains no banned words from a sample list", () => {
    // The generator must not bake in words a brand might ban; assert against a representative list.
    const spec = generate(sampleBrief());
    const result = scanForBannedWords(spec, ["cure", "miracle", "guaranteed"]);
    assert.equal(result.ok, true, JSON.stringify(result.hits));
  });
});
