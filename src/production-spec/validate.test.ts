import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validate, type ValidationCode } from "./validate.ts";
import {
  validSpec,
  fourConcepts,
  twoClips,
  longPostCopy,
  zeroEmojis,
  fourEmojis,
  missingThumbnails,
  nestedPostCopy,
  nestedThumbnails,
} from "./fixtures/specs.ts";

/** Whether the validation result carries an error with the given code. */
function hasCode(
  result: ReturnType<typeof validate>,
  code: ValidationCode,
): boolean {
  return result.errors.some((e) => e.code === code);
}

describe("validate — well-formed Spec", () => {
  it("accepts a valid Spec with no errors", () => {
    const result = validate(validSpec());
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });
});

describe("validate — character_concepts count", () => {
  it("rejects a Spec with 4 character_concepts", () => {
    const result = validate(fourConcepts());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "character_concepts_count"), true);
  });
});

describe("validate — clips count", () => {
  it("rejects a Spec with 2 clips", () => {
    const result = validate(twoClips());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "clips_count"), true);
  });
});

describe("validate — post_copy length", () => {
  it("rejects a Spec whose post_copy exceeds 180 chars", () => {
    const result = validate(longPostCopy());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "post_copy_length"), true);
  });
});

describe("validate — post_copy emoji count", () => {
  it("rejects a Spec whose post_copy has 0 emojis", () => {
    const result = validate(zeroEmojis());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "post_copy_emoji_count"), true);
  });

  it("rejects a Spec whose post_copy has 4 emojis", () => {
    const result = validate(fourEmojis());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "post_copy_emoji_count"), true);
  });
});

describe("validate — thumbnails presence", () => {
  it("rejects a Spec with no thumbnails field", () => {
    const result = validate(missingThumbnails());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "thumbnails_missing"), true);
  });
});

describe("validate — top-level placement", () => {
  it("rejects a Spec whose post_copy is nested inside a clip", () => {
    const result = validate(nestedPostCopy());
    assert.equal(result.ok, false);
    // post_copy is missing at top level AND found nested -> both signalled
    assert.equal(hasCode(result, "post_copy_not_top_level"), true);
  });

  it("rejects a Spec whose thumbnails are nested inside a clip", () => {
    const result = validate(nestedThumbnails());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "thumbnails_not_top_level"), true);
  });
});

describe("validate — defensive on non-object input", () => {
  it("rejects null / non-object input rather than throwing", () => {
    const result = validate(null);
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "not_an_object"), true);
  });
});

describe("validate — error reasons are specific", () => {
  it("every error carries a code and a human-readable message", () => {
    const result = validate(twoClips());
    assert.equal(result.ok, false);
    for (const err of result.errors) {
      assert.equal(typeof err.code, "string");
      assert.equal(typeof err.message, "string");
      assert.ok(err.message.length > 0);
    }
  });
});
