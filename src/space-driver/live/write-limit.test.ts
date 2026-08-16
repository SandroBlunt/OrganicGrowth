import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SPACES_EDIT_WRITE_LIMIT_CHARS,
  WriteLimitExceededError,
  assertWithinWriteLimit,
  exceedsWriteLimit,
} from "./write-limit.ts";

describe("SPACES_EDIT_WRITE_LIMIT_CHARS — the modelled live write cap (issue #207)", () => {
  it("is 4000, the measured live spaces_edit query cap", () => {
    assert.equal(SPACES_EDIT_WRITE_LIMIT_CHARS, 4000);
  });
});

describe("exceedsWriteLimit — pure length check against the modelled cap", () => {
  it("is false for a goal strictly under the limit", () => {
    assert.equal(exceedsWriteLimit("x".repeat(SPACES_EDIT_WRITE_LIMIT_CHARS - 1)), false);
  });

  it("is false for a goal exactly AT the limit (the boundary is inclusive)", () => {
    assert.equal(exceedsWriteLimit("x".repeat(SPACES_EDIT_WRITE_LIMIT_CHARS)), false);
  });

  it("is true for a goal one character over the limit", () => {
    assert.equal(exceedsWriteLimit("x".repeat(SPACES_EDIT_WRITE_LIMIT_CHARS + 1)), true);
  });

  it("respects an explicitly injected limit rather than always using the default", () => {
    assert.equal(exceedsWriteLimit("x".repeat(10), 5), true);
    assert.equal(exceedsWriteLimit("x".repeat(5), 5), false);
  });
});

describe("assertWithinWriteLimit — fails clearly and early, never silently truncates", () => {
  it("does not throw for a goal within the limit", () => {
    assert.doesNotThrow(() => assertWithinWriteLimit("a short goal", "edit() goal"));
  });

  it("throws WriteLimitExceededError for a goal over the limit, citing the length and the cap", () => {
    const goal = "x".repeat(SPACES_EDIT_WRITE_LIMIT_CHARS + 137);
    assert.throws(
      () => assertWithinWriteLimit(goal, "edit() goal"),
      (error: unknown) => {
        assert.ok(error instanceof WriteLimitExceededError);
        assert.equal(error.length, SPACES_EDIT_WRITE_LIMIT_CHARS + 137);
        assert.equal(error.limit, SPACES_EDIT_WRITE_LIMIT_CHARS);
        assert.match(error.message, /4000/);
        assert.match(error.message, /4137/);
        assert.match(error.message, /edit\(\) goal/);
        return true;
      },
    );
  });

  it("never truncates the goal before throwing — the caller gets a clear refusal, not a silent partial", () => {
    // The refusal is a thrown error, not a mutated/shortened return value — there is nothing to
    // "silently truncate": the function returns void on success and throws on refusal.
    const goal = "y".repeat(SPACES_EDIT_WRITE_LIMIT_CHARS + 1);
    assert.throws(() => assertWithinWriteLimit(goal, "context"));
  });
});
