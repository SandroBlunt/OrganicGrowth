import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validate, type ValidationCode } from "./validate.ts";
import {
  validSpec,
  fourConcepts,
  twoClips,
  numericClips,
  clipMissingAspectRatio,
  clipMissingVideoPrompt,
  missingThumbnails,
  nestedThumbnails,
  specWithCompanies,
  specWithEmptyCompanies,
  companiesNotArray,
  companiesBlankEntry,
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

describe("validate — per-clip contract (C18)", () => {
  it("rejects a clip array of plain numbers even though the count is right", () => {
    const result = validate(numericClips());
    assert.equal(result.ok, false);
    // The count is 3 (passes clips_count) but every entry fails the per-clip shape.
    assert.equal(hasCode(result, "clips_count"), false);
    assert.equal(hasCode(result, "clip_shape"), true);
  });

  it("rejects a clip whose image_prompt is missing the aspect-ratio suffix", () => {
    const result = validate(clipMissingAspectRatio());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "clip_shape"), true);
    // The failure names the missing aspect-ratio line.
    assert.ok(
      result.errors.some((e) => e.code === "clip_shape" && e.message.includes("Aspect Ratio 9:16.")),
    );
  });

  it("rejects a clip missing its video_prompt", () => {
    const result = validate(clipMissingVideoPrompt());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "clip_shape"), true);
  });
});

describe("validate — post_copy is retired from the contract (ADR-0012)", () => {
  it("accepts a well-formed Spec with no post_copy field at all", () => {
    const spec = validSpec() as Record<string, unknown>;
    assert.equal("post_copy" in spec, false);
    assert.equal(validate(spec).ok, true);
  });

  it("a stray post_copy field present on the Spec is simply ignored (not part of the contract)", () => {
    const spec = validSpec() as Record<string, unknown>;
    spec.post_copy = "A".repeat(500); // would have failed the old 180-char rule
    assert.equal(validate(spec).ok, true);
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
  it("rejects a Spec whose thumbnails are nested inside a clip", () => {
    const result = validate(nestedThumbnails());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "thumbnails_not_top_level"), true);
  });
});

describe("validate — companies is OPTIONAL, top-level (issue #125)", () => {
  it("accepts a well-formed Spec with no companies field at all — absent is valid, never required", () => {
    const spec = validSpec() as Record<string, unknown>;
    assert.equal("companies" in spec, false);
    assert.equal(validate(spec).ok, true);
  });

  it("accepts a well-formed Spec whose companies list is non-empty", () => {
    const result = validate(specWithCompanies());
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  it("accepts a well-formed Spec whose companies list is explicitly empty", () => {
    const result = validate(specWithEmptyCompanies());
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  it("rejects a Spec whose companies field is present but not an array", () => {
    const result = validate(companiesNotArray());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "companies_shape"), true);
  });

  it("rejects a Spec whose companies array contains a blank entry", () => {
    const result = validate(companiesBlankEntry());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "companies_shape"), true);
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
