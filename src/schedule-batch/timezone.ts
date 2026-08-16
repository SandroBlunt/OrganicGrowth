/**
 * Pure timezone math for the Schedule Batch export (issue #145, parent #140) — deep module, no I/O, no
 * clock reads. Converts between a NAMED zone's wall-clock time (e.g. "2026-08-04 16:23 Europe/Berlin")
 * and the absolute UTC instant it represents, and formats an instant back into Zoho's own
 * `MM/DD/YYYY HH:mm` dialect for a given zone.
 *
 * Uses only `Intl.DateTimeFormat` (standard library, full ICU — no new dependency, per CLAUDE.md) via
 * the classic two-pass "guess, measure the offset, correct" technique: DST transitions mean a zone's
 * UTC offset is itself a function of the instant, so a single Date.UTC() construction cannot be trusted
 * blindly — `zonedTimeToUtcMs` measures the offset at an initial guess, corrects once, then re-measures
 * at the corrected instant and corrects again. Two passes are enough for any offset that does not
 * itself change within the width of one correction (true for every zone in real-world use); this
 * function is never called near the exact wall-clock instant of a DST transition in this codebase's own
 * use (schedule slots always land at a fixed, non-transition daytime hour).
 */

/** True for `Intl.DateTimeFormat`'s `formatToParts` output when a part carries a numeric value. */
function partValue(parts: readonly Intl.DateTimeFormatPart[], type: string): string {
  const part = parts.find((p) => p.type === type);
  if (part === undefined) {
    throw new Error(`timezone: Intl.DateTimeFormat did not return a "${type}" part.`);
  }
  return part.value;
}

const OFFSET_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function offsetFormatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = OFFSET_FORMATTER_CACHE.get(timeZone);
  if (cached !== undefined) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  OFFSET_FORMATTER_CACHE.set(timeZone, formatter);
  return formatter;
}

/**
 * The UTC offset (in ms; POSITIVE east of UTC, e.g. `+2h` for Europe/Berlin in summer) that `timeZone`
 * observes AT `instantMs` — i.e. `localTime = instantMs + offset`. Pure and deterministic given ICU's
 * timezone database; no clock read (the instant is always an explicit argument).
 */
export function utcOffsetMsAt(instantMs: number, timeZone: string): number {
  const parts = offsetFormatterFor(timeZone).formatToParts(new Date(instantMs));
  const asUtcMs = Date.UTC(
    Number(partValue(parts, "year")),
    Number(partValue(parts, "month")) - 1,
    Number(partValue(parts, "day")),
    Number(partValue(parts, "hour")),
    Number(partValue(parts, "minute")),
    Number(partValue(parts, "second")),
  );
  return asUtcMs - instantMs;
}

/**
 * Convert a WALL-CLOCK date/time in `timeZone` (e.g. 2026-08-04 16:23 in "Europe/Berlin") to the
 * absolute UTC instant (ms since epoch) it represents. Pure: no clock read — every input is explicit.
 *
 * @param year    full calendar year (e.g. 2026)
 * @param month   1-based month (1 = January)
 * @param day     1-based day of month
 * @param hour    0-23 local hour
 * @param minute  0-59 local minute
 * @param timeZone  an IANA timezone identifier (e.g. "Europe/Berlin")
 */
export function zonedTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset1 = utcOffsetMsAt(guess, timeZone);
  const correctedOnce = guess - offset1;
  const offset2 = utcOffsetMsAt(correctedOnce, timeZone);
  return guess - offset2;
}

/**
 * Format the UTC instant `utcMs` in `timeZone`, in Zoho's own bulk-scheduler CSV dialect:
 * `MM/DD/YYYY HH:mm`, month-first, zero-padded, 24-hour (never a stray "24:00" at local midnight — the
 * `hourCycle: "h23"` formatter always reports midnight as "00").
 */
export function formatZohoScheduleTime(utcMs: number, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(utcMs));
  const month = partValue(parts, "month");
  const day = partValue(parts, "day");
  const year = partValue(parts, "year");
  const hour = partValue(parts, "hour");
  const minute = partValue(parts, "minute");
  return `${month}/${day}/${year} ${hour}:${minute}`;
}
