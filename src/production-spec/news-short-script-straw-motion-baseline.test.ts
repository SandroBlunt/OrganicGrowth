/**
 * Proves issue #187 AC1 against the REAL, committed Baseline Prompt document (not just the
 * `produce-news-short-script`/`write-social-copy` Skills' own prose): Straw Motion's Unhypped Daily
 * News Short Script Baseline Prompt rewrites its Sign-off family to invite a personal comment/question
 * about the viewer's own life and how AI is affecting them, replacing the old fixed "Follow Straw
 * Motion" family, while keeping the Sign-off's own ritual, fixed-family repetition (CONTEXT.md
 * "Sign-off"). Mirrors `news-carousel-straw-motion-fixture.test.ts`'s own "read the real document, never
 * assert by fiat" pattern.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { loadFormat } from "../format/store.ts";
import { loadBaselinePrompt } from "../format/baseline-prompt.ts";

/** Strips markdown blockquote/table decoration and collapses whitespace, mirroring
 *  `news-carousel-straw-motion-fixture.test.ts`'s own `normalizeBaselineDoc` — a sentence wrapped
 *  across lines is never a literal contiguous byte run in the raw file. */
function normalize(content: string): string {
  return content
    .split("\n")
    .map((line) => line.replace(/^>\s?/, ""))
    .join(" ")
    .replace(/\s+/g, " ");
}

describe("Straw Motion's real News Short Script Baseline Prompt rewrites the Sign-off family (issue #187 AC1)", () => {
  it("never states the old, generic 'Follow Straw Motion' family anywhere in the document", async () => {
    const format = await loadFormat("straw-motion", "unhypped-daily");
    const lookup = await loadBaselinePrompt("straw-motion", format, "news-short-script");
    assert.ok(lookup.found, "the real Baseline Prompt document must be found");
    if (!lookup.found) return;

    assert.doesNotMatch(lookup.content, /Follow Straw Motion/);
  });

  it("instructs the Sign-off to invite a comment/question about the viewer's own life and how AI affects it", async () => {
    const format = await loadFormat("straw-motion", "unhypped-daily");
    const lookup = await loadBaselinePrompt("straw-motion", format, "news-short-script");
    assert.ok(lookup.found);
    if (!lookup.found) return;
    const normalized = normalize(lookup.content);

    assert.match(normalized, /invites? a comment.{0,20}question/i);
    assert.match(normalized, /viewer's OWN life/);
    assert.match(normalized, /how AI is affecting/i);
  });

  it("still instructs rotating within a small fixed family — ritual repetition is intentional", async () => {
    const format = await loadFormat("straw-motion", "unhypped-daily");
    const lookup = await loadBaselinePrompt("straw-motion", format, "news-short-script");
    assert.ok(lookup.found);
    if (!lookup.found) return;
    const normalized = normalize(lookup.content);

    assert.match(normalized, /rotate within the family/i);
    assert.match(normalized, /ritual repetition/i);
  });

  it("the worked Sign-off family carries 3 sample lines, each within the 6-11 word budget", async () => {
    const format = await loadFormat("straw-motion", "unhypped-daily");
    const lookup = await loadBaselinePrompt("straw-motion", format, "news-short-script");
    assert.ok(lookup.found);
    if (!lookup.found) return;

    const bulletLines = lookup.content
      .split("\n")
      .filter((line) => /^-\s+"/.test(line.trim()))
      .map((line) => line.trim().replace(/^-\s+"/, "").replace(/"$/, ""));
    // The document's own worked examples section carries exactly 3 sample Sign-off lines.
    const signOffLines = bulletLines.filter((line) =>
      /\b(Tell us|Comment below|AI)\b/i.test(line) && /\?/.test(line),
    );
    assert.ok(signOffLines.length >= 3, `expected at least 3 Sign-off sample lines, found: ${signOffLines.join(" | ")}`);
    for (const line of signOffLines) {
      const words = line.trim().split(/\s+/).filter((w) => w.length > 0).length;
      assert.ok(words >= 6 && words <= 11, `Sign-off sample "${line}" has ${words} words (want 6-11)`);
    }
  });
});
