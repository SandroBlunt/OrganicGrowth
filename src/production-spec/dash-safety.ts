/**
 * Dash "tell" scanner — pure deep module (issue #108).
 *
 * An em dash ("—"), an en dash ("–"), or a hyphen used AS a dash (surrounded by whitespace, " - ") is
 * a well-known AI-writing "tell" that hurts scannability — the fix is always to rewrite the joined
 * clauses as separate short sentences, never a silent substitution. This mirrors how
 * `brand-safety.ts`'s banned-word scan is REJECT-ONLY, never an auto-swap (always-rule 9's spirit,
 * extended here to a style rule rather than a brand-safety one).
 *
 * An ordinary hyphenated compound word ("state-of-the-art", "task-assistant") has NO whitespace
 * touching its hyphen, so it is never matched — only a hyphen with whitespace on BOTH sides counts as
 * a "used as a dash" tell, exactly the typewriter-era stand-in for an em dash. This also means a bare
 * negative number ("-3.7x") is never false-flagged: nothing follows its hyphen but a digit, never
 * whitespace.
 *
 * Pure and deterministic: no I/O, no clock, no Brand configuration. Unlike the banned-words list, this
 * rule is universal — it does not vary per Brand, so there is nothing to load from the Brand Profile.
 * Generic over `TextField[]` (`brand-safety.ts`'s shared shape) exactly like `scanTextFields`: this
 * module never decides which fields of a Spec/Copy count — each CALLER supplies its own scope
 * (`news-carousel-author-checklist.ts`'s on-slide "Card text" fields — `stat_callout`/`text` — and
 * `copy/validate.ts`'s `caption`/`hashtags[]`). Deliberately excluded by every current caller: a News
 * Carousel slide's `image_prompt` — the Baseline Prompt document's own FIXED, verbatim-required
 * clauses legitimately contain em dashes (e.g. "no wider than roughly a third of the frame width — so
 * it stays a quiet brand mark"); it is a media instruction fed to the image-generation model, never
 * itself reader-facing "Copy" (CONTEXT.md "Copy": "the tailored text that ships with one Asset").
 */

import type { TextField } from "./brand-safety.ts";

const EM_DASH = "—"; // —
const EN_DASH = "–"; // –

/** A hyphen with whitespace on BOTH sides — the typewriter-era stand-in for an em dash. Excludes an
 *  ordinary hyphenated compound ("state-of-the-art") and a leading minus sign ("-3.7x"), neither of
 *  which ever has whitespace touching both sides of the hyphen. */
const SPACED_HYPHEN = /\s-\s/;

/** One dash "tell" found in a text field. */
export interface DashHit {
  readonly field: string;
  /** The exact tell matched: an em dash, an en dash, or the spaced-hyphen run found (e.g. " - "). */
  readonly match: string;
}

/** The result of scanning for dash "tells". */
export interface DashSafetyResult {
  readonly ok: boolean;
  readonly hits: readonly DashHit[];
}

/** Every dash "tell" found in ONE string — zero, one, two, or all three kinds, in a fixed check order
 *  (em dash, en dash, spaced hyphen) so results are deterministic. */
function dashTellsIn(text: string): string[] {
  const found: string[] = [];
  if (text.includes(EM_DASH)) found.push(EM_DASH);
  if (text.includes(EN_DASH)) found.push(EN_DASH);
  const spaced = SPACED_HYPHEN.exec(text);
  if (spaced) found.push(spaced[0]);
  return found;
}

/**
 * Scan a flat list of `{ field, text }` pairs for a dash "tell" (an em dash, an en dash, or a hyphen
 * used as a spaced dash). Returns `{ ok, hits }`. REJECT-ONLY: this never rewrites anything — it only
 * ever reports where a tell was found, mirroring `scanTextFields`'s own "report, never rewrite"
 * contract.
 *
 * @param fields the text fields to scan — the CALLER decides which fields of its own artifact count
 */
export function scanTextFieldsForDashes(fields: readonly TextField[]): DashSafetyResult {
  const hits: DashHit[] = [];
  for (const { field, text } of fields) {
    for (const match of dashTellsIn(text)) {
      hits.push({ field, match });
    }
  }
  return { ok: hits.length === 0, hits };
}
