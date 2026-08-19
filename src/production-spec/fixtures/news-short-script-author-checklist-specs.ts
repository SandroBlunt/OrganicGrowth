/**
 * News Short Script author-phase-checklist test fixtures — focused mutations of the shared valid Spec
 * (issue #187), mirroring `news-carousel-author-checklist-specs.ts`'s own rationale: the shared valid
 * Spec (`validNewsShortScriptSpec`, already distinct-site + Curiosity-Query-carrying, issue #187) is the
 * single "baseline-adherent" source of truth for this checklist too; each broken variant below is
 * derived from it by ONE focused mutation, isolating exactly one NEW checklist item's failure.
 */

import { validNewsShortScriptSpec } from "./news-short-script-specs.ts";
import type { NewsShortScriptBeat } from "../news-short-script-contract.ts";

function clone(spec: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(spec);
}

/** The hook beat's spoken text states an explicit calendar date (issue #187). */
export function calendarDateInBeatText(): Record<string, unknown> {
  const s = clone(validNewsShortScriptSpec());
  const beats = s.beats as NewsShortScriptBeat[];
  beats[0] = { ...beats[0]!, text: `${beats[0]!.text} It shipped on August 11th, 2026.` };
  return s;
}

/** The first two beats' source_url point at the SAME site/host (issue #187: "no two beats repeat the
 *  same source page or the same site/company"). */
export function duplicateSourceSite(): Record<string, unknown> {
  const s = clone(validNewsShortScriptSpec());
  const beats = s.beats as NewsShortScriptBeat[];
  beats[1] = { ...beats[1]!, source_url: "https://example.com/news/a-different-page-same-site" };
  return s;
}

/** The first and last beats' source_url are the EXACT same page (a stricter case of the above — still
 *  the same site, caught by the same check). */
export function exactDuplicateSourcePage(): Record<string, unknown> {
  const s = clone(validNewsShortScriptSpec());
  const beats = s.beats as NewsShortScriptBeat[];
  beats[3] = { ...beats[3]!, source_url: beats[0]!.source_url };
  return s;
}

/**
 * The "story" beat's spoken text is a single ~20-word filler phrase concatenated ~4 times to hit a word
 * target — the exact live padding pattern issue #273 round 2 reproduced in
 * `news-short-script-generate.ts`'s stand-in BEFORE that round's fix (a real title's few words, padded
 * out to 90 with the SAME fixed filler cycle repeating).
 */
export function repeatedPhraseInStoryBeat(): Record<string, unknown> {
  const s = clone(validNewsShortScriptSpec());
  const beats = s.beats as NewsShortScriptBeat[];
  // 11 words x 3 = 33 words — deliberately close to the original beat's own 33-word length, so the
  // WHOLE Spec's total word count stays inside [120, 150] and this mutation isolates ONLY
  // no-repeated-phrases, never also tripping the structural word-count check.
  const filler = "today this story keeps moving fast and the facts keep shifting";
  beats[1] = { ...beats[1]!, text: `${filler} ${filler} ${filler}.` };
  return s;
}
