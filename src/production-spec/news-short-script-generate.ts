/**
 * News Short Script Production Spec composer — pure deep module (ADR-0031, issue #264).
 *
 * Mirrors `news-carousel-generate.ts`'s own doc comment exactly: a DETERMINISTIC template (no model
 * call, no I/O, no clock) standing in for the `news-short-script` Recipe's own `producerSkill`
 * (`"produce-news-short-script"`). The contract enforced is the one that Skill's real output would have
 * to pass — `news-short-script-validate.ts`'s `validateNewsShortScriptSpec` — including its whole-Spec
 * word-count band (`[MIN_TOTAL_WORDS, MAX_TOTAL_WORDS]`), which this module hits EXACTLY by construction
 * (never by chance): each beat's spoken `text` is built to a fixed target word count from the Brief's
 * own title (as many of its words as fit), padded out with a small, fixed filler phrase list when the
 * title runs short — so the total is always inside range regardless of how long or short the Brief's
 * title is (`news-short-script-generate.test.ts`'s own short-title/long-title regression proof).
 */

import {
  MIN_TOTAL_WORDS,
  MAX_TOTAL_WORDS,
  type NewsShortScriptBeat,
  type NewsShortScriptRole,
  type NewsShortScriptSpec,
} from "./news-short-script-contract.ts";
import type { Brief } from "./generate.ts";

/** Per-beat target word counts, summing to a value safely inside `[MIN_TOTAL_WORDS, MAX_TOTAL_WORDS]`
 *  regardless of rounding — 130 sits comfortably between 120 and 150. */
const BEAT_WORD_TARGETS: readonly { readonly role: NewsShortScriptRole; readonly words: number }[] = [
  { role: "hook", words: 20 },
  { role: "story", words: 90 },
  { role: "cta", words: 20 },
];

/** A small, fixed filler phrase — never randomness — used only to pad a beat's word count up to its
 *  target when the Brief's own title runs short. */
const FILLER_WORDS: readonly string[] = [
  "today",
  "this",
  "story",
  "keeps",
  "moving",
  "fast",
  "and",
  "the",
  "facts",
  "keep",
  "shifting",
  "as",
  "more",
  "details",
  "come",
  "in",
  "across",
  "the",
  "board",
  "right",
  "now",
];

/** Build a beat's spoken `text` at EXACTLY `target` words: the Brief's own title words first (grounding
 *  the beat in real material), then filler words cycling from `FILLER_WORDS` to reach the target. */
function wordsExactly(target: number, titleWords: readonly string[]): string {
  const words: string[] = [];
  for (const w of titleWords) {
    if (words.length >= target) break;
    words.push(w);
  }
  let i = 0;
  while (words.length < target) {
    words.push(FILLER_WORDS[i % FILLER_WORDS.length]!);
    i += 1;
  }
  return `${words.join(" ")}.`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "story";
}

function buildBeat(role: NewsShortScriptRole, words: number, index: number, brief: Brief): NewsShortScriptBeat {
  const titleWords = brief.title.trim().split(/\s+/).filter((w) => w.length > 0);
  const text = wordsExactly(words, titleWords);
  const slug = slugify(brief.title);
  return {
    role,
    text,
    source_url: `https://example.com/source/${slug}-${index}`,
    show_cue: `Show the "${brief.title}" story on screen (${role}).`,
    curiosity_queries: [
      `${brief.title} latest update`,
      `${brief.title} explained`,
      `${brief.title} background`,
    ],
  };
}

/**
 * Compose a contract-conformant News Short Script Production Spec from a minimal Brief. Deterministic
 * and pure — the SAME shape of stand-in `generate.ts`'s `generate` already is for the wired Recipe.
 *
 * @param brief a minimal Brief (`id`, `run`, `title`, optionally `angle`/`companies`)
 */
export function generateNewsShortScriptSpec(brief: Brief): NewsShortScriptSpec {
  const beats = BEAT_WORD_TARGETS.map((target, index) => buildBeat(target.role, target.words, index, brief));
  const total = beats.reduce((sum, b) => sum + b.text.trim().split(/\s+/).filter((w) => w.length > 0).length, 0);
  if (total < MIN_TOTAL_WORDS || total > MAX_TOTAL_WORDS) {
    // Defensive: BEAT_WORD_TARGETS is a static, committed constant summing to 130 — this can only fire
    // if that constant itself regresses, in which case failing loudly is far better than silently
    // emitting a Spec that would fail its own validator downstream.
    throw new Error(
      `news-short-script-generate: BEAT_WORD_TARGETS sums to ${total} words, outside ` +
        `[${MIN_TOTAL_WORDS}, ${MAX_TOTAL_WORDS}] — fix the target list.`,
    );
  }
  return { beats };
}
