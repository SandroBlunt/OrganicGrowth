import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { validateNewsShortScriptSpec } from "./news-short-script-validate.ts";
import {
  validNewsShortScriptSpec,
  emptyBeats,
  firstBeatNotHook,
  lastBeatNotCta,
  middleBeatWrongRole,
  missingShowCue,
  sourceUrlNotAUrl,
  mediaUrlNotAUrl,
  wordCountTooLow,
  wordCountTooHigh,
  missingCuriosityQueries,
  curiosityQueriesTooFew,
  curiosityQueriesTooMany,
  curiosityQueriesBlankEntry,
} from "./fixtures/news-short-script-specs.ts";

describe("validateNewsShortScriptSpec — a well-formed Spec (issue #174)", () => {
  it("accepts the valid fixture", () => {
    const result = validateNewsShortScriptSpec(validNewsShortScriptSpec());
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.deepEqual(result.errors, []);
  });
});

describe("validateNewsShortScriptSpec — structural shape (issue #174)", () => {
  it("rejects a non-object Spec", () => {
    const result = validateNewsShortScriptSpec("not an object");
    assert.equal(result.ok, false);
    assert.equal(result.errors[0]!.code, "not_an_object");
  });

  it("rejects a Spec with no beats field at all", () => {
    const result = validateNewsShortScriptSpec({});
    assert.equal(result.ok, false);
    assert.equal(result.errors[0]!.code, "beats_missing");
  });

  it("rejects a Spec whose beats is not an array", () => {
    const result = validateNewsShortScriptSpec({ beats: "nope" });
    assert.equal(result.ok, false);
    assert.equal(result.errors[0]!.code, "beats_empty");
  });

  it("rejects an empty beats array", () => {
    const result = validateNewsShortScriptSpec(emptyBeats());
    assert.equal(result.ok, false);
    assert.equal(result.errors[0]!.code, "beats_empty");
  });

  it("rejects a beat missing a required field (show_cue)", () => {
    const result = validateNewsShortScriptSpec(missingShowCue());
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === "beat_shape"));
  });

  it("rejects a beat with an invalid role", () => {
    const spec = validNewsShortScriptSpec();
    (spec.beats as unknown[])[0] = { ...(spec.beats as Record<string, unknown>[])[0], role: "outro" };
    const result = validateNewsShortScriptSpec(spec);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === "beat_role_invalid"));
  });
});

describe("validateNewsShortScriptSpec — role order: hook first, cta last, story between (issue #174)", () => {
  it("rejects a Spec whose first beat is not hook", () => {
    const result = validateNewsShortScriptSpec(firstBeatNotHook());
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === "beat_role_order" && /beats\[0\]/.test(e.message)));
  });

  it("rejects a Spec whose last beat is not cta", () => {
    const result = validateNewsShortScriptSpec(lastBeatNotCta());
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === "beat_role_order" && /must be "cta"/.test(e.message)));
  });

  it("rejects a Spec whose middle beat is not story", () => {
    const result = validateNewsShortScriptSpec(middleBeatWrongRole());
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === "beat_role_order" && /must all be "story"/.test(e.message)));
  });

  it("accepts a Spec with more than one story beat between hook and cta", () => {
    const spec = validNewsShortScriptSpec(); // already has 2 story beats
    assert.equal(validateNewsShortScriptSpec(spec).ok, true);
  });

  it("rejects a Spec with only hook and cta (no story beat at all)", () => {
    const spec = validNewsShortScriptSpec();
    const beats = spec.beats as Record<string, unknown>[];
    spec.beats = [beats[0], beats[beats.length - 1]];
    const result = validateNewsShortScriptSpec(spec);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === "beat_role_order"));
  });
});

describe("validateNewsShortScriptSpec — URL-shaped fields (issue #174)", () => {
  it("rejects a source_url that doesn't look like a URL", () => {
    const result = validateNewsShortScriptSpec(sourceUrlNotAUrl());
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === "source_url_invalid"));
  });

  it("rejects a media_url that doesn't look like a URL, when present", () => {
    const result = validateNewsShortScriptSpec(mediaUrlNotAUrl());
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === "media_url_invalid"));
  });

  it("accepts a beat with no media_url at all — it is optional", () => {
    const spec = validNewsShortScriptSpec();
    const beats = spec.beats as Record<string, unknown>[];
    delete beats[1]!.media_url;
    const result = validateNewsShortScriptSpec(spec);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
  });
});

describe("validateNewsShortScriptSpec — total word-count band (issue #174: ~120-150 words, 45-60s)", () => {
  it("rejects a Spec whose total word count is below 120", () => {
    const result = validateNewsShortScriptSpec(wordCountTooLow());
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === "word_count_out_of_range"));
  });

  it("rejects a Spec whose total word count is above 150", () => {
    const result = validateNewsShortScriptSpec(wordCountTooHigh());
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === "word_count_out_of_range"));
  });

  it("accepts a Spec whose total word count sits inside the band (the valid fixture: 124 words)", () => {
    const result = validateNewsShortScriptSpec(validNewsShortScriptSpec());
    assert.equal(result.ok, true);
  });
});

describe("validateNewsShortScriptSpec — Curiosity Queries: 3-5 non-empty entries per beat (issue #187)", () => {
  it("rejects a beat missing curiosity_queries entirely", () => {
    const result = validateNewsShortScriptSpec(missingCuriosityQueries());
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === "curiosity_queries_invalid"));
  });

  it("rejects a beat with fewer than MIN_CURIOSITY_QUERIES (3) entries", () => {
    const result = validateNewsShortScriptSpec(curiosityQueriesTooFew());
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === "curiosity_queries_invalid"));
  });

  it("rejects a beat with more than MAX_CURIOSITY_QUERIES (5) entries", () => {
    const result = validateNewsShortScriptSpec(curiosityQueriesTooMany());
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === "curiosity_queries_invalid"));
  });

  it("rejects a beat whose curiosity_queries contains a blank entry", () => {
    const result = validateNewsShortScriptSpec(curiosityQueriesBlankEntry());
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === "curiosity_queries_invalid"));
  });

  it("accepts the valid fixture — every beat carries 3 Curiosity Queries", () => {
    const result = validateNewsShortScriptSpec(validNewsShortScriptSpec());
    assert.equal(result.ok, true, JSON.stringify(result.errors));
  });
});
