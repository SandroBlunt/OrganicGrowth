import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { countWords } from "./news-short-script-contract.ts";

describe("countWords — whitespace-separated token count (issue #174)", () => {
  it("counts whitespace-separated tokens, ignoring extra whitespace", () => {
    assert.equal(countWords("This    AI  tool   just replaced   three roles"), 7);
  });

  it("counts a single-space-separated sentence the same as a multi-space one", () => {
    const singleSpaced = "This AI tool just replaced three roles";
    const multiSpaced = "This  AI   tool    just     replaced      three       roles";
    assert.equal(countWords(multiSpaced), countWords(singleSpaced));
  });

  it("trims leading/trailing whitespace before counting", () => {
    assert.equal(countWords("   Hook line here.   "), 3);
  });

  it("returns 0 for an empty or whitespace-only string", () => {
    assert.equal(countWords(""), 0);
    assert.equal(countWords("     "), 0);
  });

  it("counts tabs and newlines as whitespace separators too", () => {
    assert.equal(countWords("hook\tstory\ncta"), 3);
  });

  it("counts a single word as one", () => {
    assert.equal(countWords("Hi."), 1);
  });
});
