/**
 * News Short Script Production-Spec contract — pure types + constants (issue #174, ADR-0021,
 * ADR-0018).
 *
 * The News Short Script Recipe drives no Magnific Space at all (ADR-0021): its Asset is a
 * ready-to-record teleprompter script plus a **Shot List** (CONTEXT.md "Shot List") — for each beat of
 * the script, what to show on screen. This module defines that Spec shape: an ordered `beats` array,
 * `"hook"` first, `"cta"` last, at least one `"story"` beat between them, targeting **45-60 seconds,
 * fast-paced (~120-150 words)** total. Each beat carries the teleprompter line to read (`text`) plus its
 * own Shot List entry — the story's source page (`source_url`), the specific media URL when one is
 * identifiable (`media_url`, optional), and a one-line show cue (`show_cue`).
 *
 * Mirrors `news-carousel-contract.ts`'s own shape/philosophy exactly: plain types + named constants,
 * no logic here — the validator (`news-short-script-validate.ts`) and the banned-word scan
 * (`news-short-script-brand-safety.ts`) are separate, focused modules.
 */

/** The three beat roles a script's `beats` array is built from, in required narrative shape:
 *  `"hook"` (always first, exactly one), `"story"` (one or more, the middle), `"cta"` (always last,
 *  exactly one). */
export type NewsShortScriptRole = "hook" | "story" | "cta";

/** Every valid `NewsShortScriptRole`, for shape validation and iteration. */
export const NEWS_SHORT_SCRIPT_ROLES: readonly NewsShortScriptRole[] = ["hook", "story", "cta"];

/** A well-formed script SHALL declare at least this many `"story"` beats between its hook and cta
 *  (`"hook → story beats → CTA"` — issue #174's own wording, plural). */
export const MIN_STORY_BEATS = 1;

/** The whole Spec's total word count (summed across every beat's `text`) SHALL fall in this closed
 *  range — the issue's own "~120-150 words" target for a 45-60 second, fast-paced read. */
export const MIN_TOTAL_WORDS = 120;
export const MAX_TOTAL_WORDS = 150;

/** The target spoken duration this word-count band is calibrated for — documentation only; the
 *  validator enforces the word-count band above, not a literal timer. */
export const TARGET_SECONDS_MIN = 45;
export const TARGET_SECONDS_MAX = 60;

/** One beat of the script: the teleprompter line to read, plus its own Shot List entry. */
export interface NewsShortScriptBeat {
  readonly role: NewsShortScriptRole;
  /** The teleprompter line for THIS beat, in the Format's voice — what the Operator reads aloud. */
  readonly text: string;
  /** The story's source page URL — always present, even when no specific media is identifiable. */
  readonly source_url: string;
  /** The specific media URL for this beat's show cue, when one is identifiable (issue #174: "the
   *  specific media URL when one is identifiable") — absent when the author found none, in which case
   *  the Shot List falls back to `source_url` as the reference link. */
  readonly media_url?: string;
  /** A one-line description of what to show on screen for this beat (CONTEXT.md "Shot List"). */
  readonly show_cue: string;
}

/** The News Short Script Recipe's whole Production Spec: one ordered `beats` array. Media instructions
 *  only — no Copy (ADR-0012); the Copy step composes the YouTube title + description separately. */
export interface NewsShortScriptSpec {
  readonly beats: readonly NewsShortScriptBeat[];
}

/** Count words in `text` — split on any run of whitespace, dropping empty tokens. Used both by the
 *  validator (the whole-Spec word-count band) and by tests. */
export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}
