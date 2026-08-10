import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { newsShortScriptDraftCopy } from "./news-short-script-draft.ts";
import { validateCopy } from "./validate.ts";
import type { CopyInput } from "./draft.ts";
import type { CopyShape } from "./contract.ts";
import type { BrandCopyRules } from "../production-spec/brand-profile.ts";

const NO_RULES: BrandCopyRules = { requiredCta: null, requiredHashtags: [], bannedWords: [] };
const SHAPE: CopyShape = { maxChars: 1000, minEmojis: 0, maxEmojis: 2, titleMaxChars: 100 };

describe("newsShortScriptDraftCopy — deterministic title + description drafter (issue #174)", () => {
  it("always produces a Copy that passes validateCopy for the shape it was drafted for", () => {
    const input: CopyInput = {
      title: "This AI tool just replaced three job roles overnight",
      angle: "A support-agent rollout with barely two weeks' notice.",
      mediaContext: "the collected Shot List of the announcement + an interview clip",
    };
    const copy = newsShortScriptDraftCopy(input, SHAPE);
    const result = validateCopy(copy, SHAPE, NO_RULES);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
  });

  it("derives the title from the Idea's own title, unchanged when it already fits", () => {
    const input: CopyInput = { title: "A short, punchy title" };
    const copy = newsShortScriptDraftCopy(input, SHAPE);
    assert.equal(copy.title, "A short, punchy title");
  });

  it("truncates a too-long title to titleMaxChars, never throwing or exceeding the bound", () => {
    const input: CopyInput = { title: "T".repeat(150) };
    const copy = newsShortScriptDraftCopy(input, SHAPE);
    assert.equal([...copy.title!].length, 100);
  });

  it("builds the description from angle + mediaContext when both are present, never a dash join", () => {
    const input: CopyInput = {
      title: "Title here",
      angle: "The rollout felt sudden to former support leads",
      mediaContext: "an interview clip with three former leads",
    };
    const copy = newsShortScriptDraftCopy(input, SHAPE);
    assert.match(copy.caption, /rollout felt sudden/);
    assert.match(copy.caption, /interview clip/);
    assert.doesNotMatch(copy.caption, /—|–/);
  });

  it("falls back to the title as the description body when angle/mediaContext are both absent", () => {
    const input: CopyInput = { title: "This AI tool just replaced three job roles overnight" };
    const copy = newsShortScriptDraftCopy(input, SHAPE);
    assert.match(copy.caption, /This AI tool just replaced three job roles overnight/);
  });

  it("passes the Idea's own hashtags through, exactly as every other drafter does", () => {
    const input: CopyInput = { title: "Title", hashtags: ["#AI", "#news"] };
    const copy = newsShortScriptDraftCopy(input, SHAPE);
    assert.deepEqual(copy.hashtags, ["#AI", "#news"]);
  });

  it("respects an arbitrary shape, not a hardcoded 100/1000 — mirrors every other drafter's genericity", () => {
    const narrowShape: CopyShape = { maxChars: 40, minEmojis: 0, maxEmojis: 0, titleMaxChars: 10 };
    const input: CopyInput = {
      title: "A much longer title than ten characters allows",
      angle: "Plenty of extra description material here to trim down to size.",
    };
    const copy = newsShortScriptDraftCopy(input, narrowShape);
    const result = validateCopy(copy, narrowShape, NO_RULES);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.ok([...copy.title!].length <= 10);
  });

  it("degrades to a safe default title bound when the caller omits titleMaxChars — never crashes", () => {
    const shapeWithNoTitleBound: CopyShape = { maxChars: 1000, minEmojis: 0, maxEmojis: 2 };
    const input: CopyInput = { title: "T".repeat(150) };
    const copy = newsShortScriptDraftCopy(input, shapeWithNoTitleBound);
    assert.equal([...copy.title!].length, 100);
  });
});
