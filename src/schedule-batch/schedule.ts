/**
 * Schedule derivation — pure deep module for the Schedule Batch export (issue #145, parent #140).
 *
 * Two responsibilities, both pure (no clock read, no I/O):
 *
 *   - `deriveScheduleSlots` — one Asset per calendar day, starting at a given date, with the hour
 *     varying across the 7:00-22:00 US-Eastern TARGETING window and always off the round minute (PRD
 *     #140 story 13). "Eastern" here is the shared reference clock the targeting window is defined in —
 *     each output CSV then re-renders the SAME absolute instant in its own Zoho Social Brand's
 *     configured clock (`timezone.ts`'s `formatZohoScheduleTime`, done by the caller). Deterministic: a
 *     fixed rotation of (hour, minute) pairs, indexed by the Asset's position from the start date — no
 *     randomness, "now" never enters this function at all.
 *   - `validateSlotsFuture` — the load-bearing guard PRD #140 story 14 calls for: Zoho's bulk uploader
 *     greys its own "Proceed to Review" button with NO error at all when a scheduled time has already
 *     passed (live-verified 2026-08-04) — so this export refuses FIRST, loudly, naming every violating
 *     slot, rather than ever handing the Operator a batch Zoho will silently reject. `now` is always an
 *     explicit argument here — never `Date.now()` read internally — so this stays pure and testable
 *     without faking the system clock.
 */

import { zonedTimeToUtcMs } from "./timezone.ts";

/** The shared reference clock the 7:00-22:00 targeting window is defined in (PRD #140). Each Zoho
 *  Social Brand's own configured clock is a SEPARATE thing — see `timezone.ts`'s `formatZohoScheduleTime`,
 *  used by the caller to render the SAME absolute instant this module derives into each output file's
 *  own zone. */
export const EASTERN_TIME_ZONE = "America/New_York";

/** The hard minimum lead time PRD #140 story 14 requires: an export refuses any row scheduled less
 *  than 1 hour from "now". */
export const MIN_LEAD_MS = 60 * 60 * 1000;

/** One (hour, minute) pair, in Eastern-local wall-clock terms. */
interface EasternSlot {
  readonly hour: number;
  readonly minute: number;
}

/**
 * A fixed, deterministic rotation of 12 distinct (hour, minute) pairs spanning the 7:00-22:00 Eastern
 * targeting window (PRD #140's own worked examples — 9:06, 13:23, 19:47 — are the first three entries).
 * Every hour stays in 7-21 (never 22) so that, combined with any minute 1-59, the resulting time never
 * exceeds the window's 22:00 upper bound; every minute is intentionally off the round hour (never :00).
 * `deriveScheduleSlots` cycles this list (`index % ROTATION.length`) for a batch longer than 12 Assets.
 */
const HOUR_MINUTE_ROTATION: readonly EasternSlot[] = [
  { hour: 9, minute: 6 },
  { hour: 13, minute: 23 },
  { hour: 19, minute: 47 },
  { hour: 7, minute: 14 },
  { hour: 11, minute: 38 },
  { hour: 16, minute: 52 },
  { hour: 21, minute: 9 },
  { hour: 8, minute: 41 },
  { hour: 14, minute: 27 },
  { hour: 18, minute: 33 },
  { hour: 20, minute: 58 },
  { hour: 12, minute: 16 },
];

/** One derived schedule slot: the absolute UTC instant (ms since epoch) an Asset is scheduled for. */
export interface ScheduleSlot {
  readonly utcMs: number;
}

/** Parse a `YYYY-MM-DD` start date into its numeric parts. Throws a clear error on a malformed date —
 *  never silently guesses a different date. */
function parseStartDate(startDate: string): { readonly year: number; readonly month: number; readonly day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
  if (match === null) {
    throw new Error(
      `schedule: <start-date> must be "YYYY-MM-DD" (got ${JSON.stringify(startDate)}).`,
    );
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Add `days` calendar days to a `YYYY-MM-DD`-parsed date, using UTC-based arithmetic throughout (never
 *  the host's local timezone) so the result is deterministic regardless of where this runs. */
function addCalendarDays(
  date: { readonly year: number; readonly month: number; readonly day: number },
  days: number,
): { readonly year: number; readonly month: number; readonly day: number } {
  const ms = Date.UTC(date.year, date.month - 1, date.day) + days * 24 * 60 * 60 * 1000;
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * Derive `count` schedule slots, one per calendar day starting at `startDate` (`YYYY-MM-DD`), with the
 * hour/minute drawn from the fixed `HOUR_MINUTE_ROTATION` (cycling for `count` > 12). PURE: no clock
 * read, no randomness — the same `(startDate, count)` always returns the same slots.
 */
export function deriveScheduleSlots(startDate: string, count: number): ScheduleSlot[] {
  const start = parseStartDate(startDate);
  const slots: ScheduleSlot[] = [];
  for (let i = 0; i < count; i++) {
    const date = addCalendarDays(start, i);
    const slot = HOUR_MINUTE_ROTATION[i % HOUR_MINUTE_ROTATION.length]!;
    const utcMs = zonedTimeToUtcMs(date.year, date.month, date.day, slot.hour, slot.minute, EASTERN_TIME_ZONE);
    slots.push({ utcMs });
  }
  return slots;
}

/** One slot that failed the `>= 1 hour in the future` check. */
export interface ScheduleFutureViolation {
  readonly index: number;
  readonly utcMs: number;
}

/** The result of `validateSlotsFuture`: either every slot clears `MIN_LEAD_MS`, or a named list of
 *  every slot that doesn't (never just the first — the whole export must refuse in one pass). */
export type ScheduleFutureValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly violations: readonly ScheduleFutureViolation[] };

/**
 * Validate that every slot in `slots` is at least `MIN_LEAD_MS` (1 hour) after `nowMs`. PURE: `nowMs`
 * is always the caller's explicit argument — this function never reads the system clock itself, which
 * is what keeps it deterministic and testable without faking `Date.now()`.
 */
export function validateSlotsFuture(
  slots: readonly ScheduleSlot[],
  nowMs: number,
): ScheduleFutureValidation {
  const violations: ScheduleFutureViolation[] = [];
  slots.forEach((slot, index) => {
    if (slot.utcMs - nowMs < MIN_LEAD_MS) {
      violations.push({ index, utcMs: slot.utcMs });
    }
  });
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
