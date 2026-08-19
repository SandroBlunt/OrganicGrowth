import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { generateNewsShortScriptSpec } from "./news-short-script-generate.ts";
import { validateNewsShortScriptSpec } from "./news-short-script-validate.ts";
import { scanNewsShortScriptForBannedWords } from "./news-short-script-brand-safety.ts";
import { MIN_TOTAL_WORDS, MAX_TOTAL_WORDS, countWords } from "./news-short-script-contract.ts";
import type { Brief } from "./generate.ts";

const BRIEF: Brief = { id: "idea-01", run: "2026-W33", title: "A brand new headline about real news" };

describe("generateNewsShortScriptSpec — a deterministic stand-in for the news-short-script producer Skill (ADR-0031, issue #264)", () => {
  it("produces hook first, cta last, with at least one story beat between them", () => {
    const spec = generateNewsShortScriptSpec(BRIEF);
    assert.equal(spec.beats[0]!.role, "hook");
    assert.equal(spec.beats[spec.beats.length - 1]!.role, "cta");
    assert.ok(spec.beats.slice(1, -1).every((b) => b.role === "story"));
    assert.ok(spec.beats.length >= 3);
  });

  it("every beat carries a well-formed source_url, a non-empty show_cue, and 3-5 curiosity_queries", () => {
    const spec = generateNewsShortScriptSpec(BRIEF);
    for (const beat of spec.beats) {
      assert.match(beat.source_url, /^https?:\/\//);
      assert.ok(beat.show_cue.length > 0);
      assert.ok(beat.curiosity_queries.length >= 3 && beat.curiosity_queries.length <= 5);
      for (const q of beat.curiosity_queries) assert.ok(q.trim().length > 0);
    }
  });

  it("totals a word count inside [MIN_TOTAL_WORDS, MAX_TOTAL_WORDS]", () => {
    const spec = generateNewsShortScriptSpec(BRIEF);
    const total = spec.beats.reduce((sum, b) => sum + countWords(b.text), 0);
    assert.ok(total >= MIN_TOTAL_WORDS, `total ${total} < ${MIN_TOTAL_WORDS}`);
    assert.ok(total <= MAX_TOTAL_WORDS, `total ${total} > ${MAX_TOTAL_WORDS}`);
  });

  it("passes validateNewsShortScriptSpec — the SAME contract this Recipe's specShape.validate enforces", () => {
    const spec = generateNewsShortScriptSpec(BRIEF);
    const result = validateNewsShortScriptSpec(spec);
    assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  });

  it("passes scanNewsShortScriptForBannedWords when the Brand configures no banned words", () => {
    const spec = generateNewsShortScriptSpec(BRIEF);
    const result = scanNewsShortScriptForBannedWords(spec, []);
    assert.equal(result.ok, true);
  });

  it("carries a banned word through from the Brief's title — proves the Spec is grounded, not a fixed template", () => {
    const spec = generateNewsShortScriptSpec({ ...BRIEF, title: "VERBOTEN word in the headline" });
    const result = scanNewsShortScriptForBannedWords(spec, ["VERBOTEN"]);
    assert.equal(result.ok, false);
  });

  it("is deterministic: the SAME Brief always produces a deep-equal Spec", () => {
    const first = generateNewsShortScriptSpec(BRIEF);
    const second = generateNewsShortScriptSpec(BRIEF);
    assert.deepEqual(first, second);
  });

  it("stays in range for a short title and a long title alike", () => {
    for (const title of ["X", "A very long headline that runs on and on describing many real details of a complex unfolding story"]) {
      const spec = generateNewsShortScriptSpec({ ...BRIEF, title });
      const total = spec.beats.reduce((sum, b) => sum + countWords(b.text), 0);
      assert.ok(total >= MIN_TOTAL_WORDS && total <= MAX_TOTAL_WORDS, `title=${title} total=${total}`);
    }
  });

  // issue #273 regression proof: every beat used to sit on the SAME `example.com` host, which always
  // failed `news-short-script-author-checklist.ts`'s `shot-list-variety` item — undetected because
  // nothing ran that checklist at accept time.
  it("issue #273: no two beats' source_url share the same site/host", () => {
    const spec = generateNewsShortScriptSpec(BRIEF);
    const hosts = spec.beats.map((b) => new URL(b.source_url).hostname);
    const distinct = new Set(hosts);
    assert.equal(distinct.size, hosts.length, `expected every beat on a distinct host, got ${JSON.stringify(hosts)}`);
  });
});
