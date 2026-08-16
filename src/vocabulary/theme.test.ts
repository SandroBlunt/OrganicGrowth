import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { THEMES, isTheme } from "./theme.ts";

describe("THEMES — the closed Theme vocabulary", () => {
  it("holds exactly nine distinct, non-empty values, each with a non-empty one-line meaning", () => {
    assert.equal(THEMES.length, 9);
    const values = THEMES.map((t) => t.value);
    assert.equal(new Set(values).size, 9, "every value must be distinct");
    for (const term of THEMES) {
      assert.ok(term.value.length > 0, "value must not be empty");
      assert.ok(term.meaning.length > 0, "meaning must not be empty");
      assert.match(term.value, /^[a-z][a-z_]*[a-z]$/, `"${term.value}" must be snake_case`);
    }
  });
});

describe("isTheme", () => {
  it("returns true for every value in THEMES", () => {
    for (const term of THEMES) {
      assert.equal(isTheme(term.value), true, `${term.value} should be recognized`);
    }
  });

  it("returns false for a value outside the closed set", () => {
    assert.equal(isTheme("miscellaneous"), false);
    assert.equal(isTheme(""), false);
  });
});
