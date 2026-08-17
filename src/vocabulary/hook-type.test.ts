import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { HOOK_TYPES, UNCLASSIFIED_HOOK_TYPE, isHookType } from "./hook-type.ts";

describe("HOOK_TYPES — the closed Hook Type vocabulary", () => {
  it("holds exactly eleven distinct, non-empty values, each with a non-empty one-line meaning", () => {
    assert.equal(HOOK_TYPES.length, 11);
    const values = HOOK_TYPES.map((t) => t.value);
    assert.equal(new Set(values).size, 11, "every value must be distinct");
    for (const term of HOOK_TYPES) {
      assert.ok(term.value.length > 0, "value must not be empty");
      assert.ok(term.meaning.length > 0, "meaning must not be empty");
      assert.match(term.value, /^[a-z][a-z_]*[a-z]$/, `"${term.value}" must be snake_case`);
    }
  });

  it("includes the explicit 'unclassified' member, as its own real value — not a nullable escape hatch (issue #219)", () => {
    const unclassified = HOOK_TYPES.find((t) => t.value === "unclassified");
    assert.ok(unclassified, "HOOK_TYPES must carry an 'unclassified' entry");
    assert.equal(UNCLASSIFIED_HOOK_TYPE, "unclassified");
  });
});

describe("isHookType", () => {
  it("returns true for every value in HOOK_TYPES, including 'unclassified'", () => {
    for (const term of HOOK_TYPES) {
      assert.equal(isHookType(term.value), true, `${term.value} should be recognized`);
    }
    assert.equal(isHookType(UNCLASSIFIED_HOOK_TYPE), true);
  });

  it("returns false for a value outside the closed set", () => {
    assert.equal(isHookType("free_text_guess"), false);
    assert.equal(isHookType(""), false);
    assert.equal(isHookType("Reframe"), false, "matching is case-sensitive against the exact stored value");
  });
});
