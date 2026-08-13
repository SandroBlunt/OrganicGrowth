import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { splitChapters } from "./chapters.ts";

describe("splitChapters — the one text-shaping rule behind Camera Hub's Texts/<GUID>.json (issue #189)", () => {
  it("splits on a single blank line into one chapter per paragraph", () => {
    assert.deepEqual(splitChapters("First paragraph.\n\nSecond paragraph.\n\nThird paragraph."), [
      "First paragraph.",
      "Second paragraph.",
      "Third paragraph.",
    ]);
  });

  it("collapses internal newlines (and their surrounding whitespace) inside one paragraph to a single space", () => {
    assert.deepEqual(splitChapters("Line one\nline two\nline three"), ["Line one line two line three"]);
  });

  it("collapses multiple consecutive blank lines to one split point, never an empty chapter between them", () => {
    assert.deepEqual(splitChapters("Para one.\n\n\n\nPara two."), ["Para one.", "Para two."]);
  });

  it("drops leading and trailing blank lines, never producing an empty first/last chapter", () => {
    assert.deepEqual(splitChapters("\n\nPara one.\n\nPara two.\n\n"), ["Para one.", "Para two."]);
  });

  it("a single paragraph with no blank line yields exactly one chapter", () => {
    assert.deepEqual(splitChapters("Just one paragraph, no blank lines."), ["Just one paragraph, no blank lines."]);
  });

  it("an empty string yields zero chapters", () => {
    assert.deepEqual(splitChapters(""), []);
  });

  it("whitespace-only input yields zero chapters", () => {
    assert.deepEqual(splitChapters("   \n\n   \n\n  "), []);
  });

  it("trims leading/trailing whitespace off each chapter", () => {
    assert.deepEqual(splitChapters("  Padded paragraph.  \n\n  Another one.  "), [
      "Padded paragraph.",
      "Another one.",
    ]);
  });
});
