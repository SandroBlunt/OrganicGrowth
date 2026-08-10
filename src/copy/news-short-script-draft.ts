/**
 * News Short Script Recipe's own deterministic Copy drafter — a title + description shape (issue
 * #174).
 *
 * Mirrors `draft.ts`'s `defaultDraftCopy`/`skillDraftCopy`'s own role exactly: no model call, no I/O,
 * no clock, and it always produces a `Copy` that passes `validateCopy` for the SAME `CopyShape` it was
 * drafted for — this is the "deterministic, testable proof" stand-in for what the real
 * `write-social-copy` Skill's LLM step does when composing a title + description Copy (a Recipe whose
 * `copyShape` declares `titleMaxChars`, today: this Recipe alone).
 *
 * The **title** is derived from the Idea's own `title` (its hook), trimmed to fit `shape.titleMaxChars`
 * — the video title IS the story, kept punchy. The **description** (stored in `Copy.caption`, per
 * `contract.ts`'s documented reuse) is built from `angle`/`mediaContext` — richer material than the bare
 * title, joined as separate short sentences (never a dash, issue #108) — falling back to the title
 * itself when neither is supplied, then handed to `draft.ts`'s SHARED `assembleCaption` envelope so the
 * length/emoji bounds and hashtag pass-through can never drift from every other drafter's own guarantee.
 */

import { assembleCaption, joinSentences } from "./draft.ts";
import type { CopyInput } from "./draft.ts";
import type { Copy, CopyShape } from "./contract.ts";

/** A safe fallback title bound for a caller that (unexpectedly) omits `shape.titleMaxChars` — never
 *  crashes; a Recipe wiring this drafter in without declaring the field is a caller error this module
 *  degrades gracefully from rather than throwing on. */
const DEFAULT_TITLE_MAX_CHARS = 100;

/** Trim `text` to at most `maxChars` characters (code-point aware), never adding an ellipsis — a
 *  hard-truncated title is still a valid, readable title. */
function truncate(text: string, maxChars: number): string {
  const chars = [...text.trim()];
  return chars.length <= maxChars ? chars.join("") : chars.slice(0, maxChars).join("").trimEnd();
}

/**
 * Draft a title + description Copy for the News Short Script Recipe (issue #174). Deterministic — the
 * SAME `input`/`shape` always yields the SAME `Copy`.
 *
 * @param input the Idea's material (`title` becomes the video title; `angle`/`mediaContext` become the
 *              description body)
 * @param shape THIS Recipe's own `copyShape` — `titleMaxChars` bounds the title, `maxChars`/
 *              `minEmojis`/`maxEmojis` bound the description via the shared `assembleCaption` envelope
 */
export function newsShortScriptDraftCopy(input: CopyInput, shape: CopyShape): Copy {
  const titleMaxChars = shape.titleMaxChars ?? DEFAULT_TITLE_MAX_CHARS;
  const title = truncate(input.title, titleMaxChars);

  const descriptionBody = joinSentences([input.angle, input.mediaContext]);
  const body = descriptionBody.length > 0 ? descriptionBody : input.title;
  const composed = assembleCaption(body, input, shape);

  return { title, caption: composed.caption, hashtags: composed.hashtags };
}
