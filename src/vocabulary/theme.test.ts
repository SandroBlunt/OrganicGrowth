import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { THEMES, UNCLASSIFIED_THEME, isTheme } from "./theme.ts";

describe("THEMES — the closed Theme vocabulary", () => {
  it("holds exactly ten distinct, non-empty values, each with a non-empty one-line meaning", () => {
    assert.equal(THEMES.length, 10);
    const values = THEMES.map((t) => t.value);
    assert.equal(new Set(values).size, 10, "every value must be distinct");
    for (const term of THEMES) {
      assert.ok(term.value.length > 0, "value must not be empty");
      assert.ok(term.meaning.length > 0, "meaning must not be empty");
      assert.match(term.value, /^[a-z][a-z_]*[a-z]$/, `"${term.value}" must be snake_case`);
    }
  });

  it("includes the explicit 'unclassified' member, as its own real value — not a nullable escape hatch (issue #219)", () => {
    const unclassified = THEMES.find((t) => t.value === "unclassified");
    assert.ok(unclassified, "THEMES must carry an 'unclassified' entry");
    assert.equal(UNCLASSIFIED_THEME, "unclassified");
  });
});

describe("isTheme", () => {
  it("returns true for every value in THEMES, including 'unclassified'", () => {
    for (const term of THEMES) {
      assert.equal(isTheme(term.value), true, `${term.value} should be recognized`);
    }
    assert.equal(isTheme(UNCLASSIFIED_THEME), true);
  });

  it("returns false for a value outside the closed set", () => {
    assert.equal(isTheme("miscellaneous"), false);
    assert.equal(isTheme(""), false);
  });
});
