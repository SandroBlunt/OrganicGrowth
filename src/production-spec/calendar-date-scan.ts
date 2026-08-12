/**
 * Calendar-date "tell" scanner — pure deep module (issue #187).
 *
 * A News Short Script's spoken script body never states an explicit calendar date (Operator rule,
 * 2026-08-12 grilling; the Baseline Prompt document already dropped the old mid-intro date stamp for
 * the SAME reason — it costs words the budget doesn't have, and the platform shows the date itself).
 * This module is the mechanical, code-enforced half of that rule, mirroring `dash-safety.ts`'s own
 * "tell" pattern exactly: REJECT-ONLY, never a silent rewrite (always-rule 9's spirit, extended to a
 * style rule rather than a brand-safety one) — the fix is always for the author to drop the explicit
 * date and let the platform's own timestamp carry it.
 *
 * Catches the common ways a script could name a specific calendar date:
 *
 *   - a month name (full or abbreviated) followed by a day, with an optional ordinal suffix and/or year
 *     ("August 11", "August 11th", "Aug. 11, 2026");
 *   - a day followed by "of" and a month name, with an optional year ("the 11th of August, 2026");
 *   - an ISO date ("2026-08-11");
 *   - a numeric slash date ("8/11/2026").
 *
 * Month names are matched CASE-SENSITIVELY (capitalized, as a real proper-noun date reference always
 * reads) so this never false-flags an unrelated word that happens to share a month's name in lowercase
 * (e.g. "may" the auxiliary verb, "march" the verb "to march").
 *
 * Pure and deterministic: no I/O, no clock, no Brand configuration — this rule is universal, like the
 * dash-tell rule, not something that varies per Brand. Generic over `TextField[]` (`brand-safety.ts`'s
 * shared shape) exactly like `scanTextFieldsForDashes`: this module never decides which fields of a
 * Spec count — each CALLER supplies its own scope (`news-short-script-author-checklist.ts` scans only
 * each beat's spoken `text` field — never `source_url`/`media_url`, which legitimately carry a
 * publication date as part of their own URL path, and never `show_cue`, a document annotation rather
 * than spoken content).
 */

import type { TextField } from "./brand-safety.ts";

const MONTH_NAMES =
  "January|February|March|April|May|June|July|August|September|October|November|December";
const MONTH_ABBR = "Jan\\.?|Feb\\.?|Mar\\.?|Apr\\.?|Jun\\.?|Jul\\.?|Aug\\.?|Sept?\\.?|Oct\\.?|Nov\\.?|Dec\\.?";
const MONTH = `(?:${MONTH_NAMES}|${MONTH_ABBR})`;

/** "August 11", "August 11th", "Aug. 11, 2026" — a month name followed by a day (+ optional year). */
const MONTH_DAY = new RegExp(`\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b`);
/** "the 11th of August", "11 of August, 2026" — a day followed by "of" and a month name (+ optional year). */
const DAY_OF_MONTH = new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+of\\s+${MONTH}(?:,?\\s+\\d{4})?\\b`);
/** "2026-08-11" — an ISO calendar date. */
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/;
/** "8/11/2026", "08/11/26" — a numeric slash date. */
const SLASH_DATE = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/;

const DATE_PATTERNS: readonly RegExp[] = [MONTH_DAY, DAY_OF_MONTH, ISO_DATE, SLASH_DATE];

/** One calendar-date "tell" found in a text field. */
export interface DateHit {
  readonly field: string;
  /** The exact date-shaped substring matched (e.g. `"August 11th"`, `"2026-08-11"`). */
  readonly match: string;
}

/** The result of scanning for calendar-date "tells". */
export interface CalendarDateScanResult {
  readonly ok: boolean;
  readonly hits: readonly DateHit[];
}

/** Every calendar-date "tell" found in ONE string — zero, one, or several, in a fixed check order
 *  (month-day, day-of-month, ISO, slash) so results are deterministic. Reports at most one match per
 *  pattern kind, mirroring `dash-safety.ts`'s own "found or not, per tell kind" simplification. */
function dateTellsIn(text: string): string[] {
  const found: string[] = [];
  for (const pattern of DATE_PATTERNS) {
    const match = pattern.exec(text);
    if (match) found.push(match[0]);
  }
  return found;
}

/**
 * Scan a flat list of `{ field, text }` pairs for an explicit calendar-date "tell". Returns
 * `{ ok, hits }`. REJECT-ONLY: this never rewrites anything — it only ever reports where a date-shaped
 * substring was found, mirroring `scanTextFieldsForDashes`'s own "report, never rewrite" contract.
 *
 * @param fields the text fields to scan — the CALLER decides which fields of its own artifact count
 */
export function scanTextFieldsForDates(fields: readonly TextField[]): CalendarDateScanResult {
  const hits: DateHit[] = [];
  for (const { field, text } of fields) {
    for (const match of dateTellsIn(text)) {
      hits.push({ field, match });
    }
  }
  return { ok: hits.length === 0, hits };
}
