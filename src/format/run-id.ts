/**
 * Run id — the safe-path-segment guard for a Format's Run identifier, plus the pure derivation of a
 * Run's DEFAULT name from its Format's cadence (ADR-0022, `docs/adr/0022-cadence-is-a-format-property.md`;
 * CONTEXT.md "Run"; issue #172), plus the cadence-aware derivation of the Run's ACTUAL ideas
 * directory (ADR-0023, `docs/adr/0023-daily-runs-nest-under-their-iso-week-weekday-named.md`; issue
 * #185).
 *
 * A Run id is an OPAQUE label everywhere in this codebase EXCEPT for path derivation: no code parses
 * week (or date) semantics out of it for anything else — every other reader treats it as an
 * exact-match filter (`record.run === run`, `src/schedule-batch/select.ts`). For path derivation, a
 * Run id is joined straight into a filesystem path by several deep modules — so, mirroring
 * `BRAND_SLUG_PATTERN` (`src/brand/resolver.ts`) and `FORMAT_SLUG_PATTERN` (`./store.ts`), it is
 * validated against a safe-slug shape BEFORE any of those callers touch the filesystem
 * (`src/production-spec/store.ts`'s `specPathFor`, `src/asset/output-bundle.ts`'s `outputDirFor`,
 * `src/asset/cast-candidates.ts`'s `castCandidatesDirFor`, `src/commands/export-schedule.ts`'s
 * `exportScheduleCommand`).
 *
 * **ADR-0023's exception, ONE function only.** `runPathSegments`/`runIdeasDirFor` below are the ONE
 * place in this codebase that parses date semantics OUT of a `cadence: daily` Run id — consciously
 * relaxing the "opaque label" rule above, for PATH DERIVATION ONLY. The Run id itself stays the plain
 * ISO date everywhere it is a KEY (the ledger's `run:` field, queue job keys, `/run-trends`'s and
 * `/export-schedule`'s arguments, `defaultRunId`'s own return value) — only the FOLDER a daily Run's
 * files are written under changes, nesting under its ISO week then a weekday-named leaf. A weekly
 * Run's folder is untouched (still just `<ISO-week>/`, byte-identical).
 *
 * Colocated with the Format module because a Run's cadence-derived DEFAULT name is a Format property
 * (ADR-0022): `"weekly"` (the default) names a Run by the current ISO week (`2026-W32`); `"daily"`
 * names it by the current ISO date (`2026-08-11`). This module does not itself decide which cadence
 * applies — that is `FormatFile.cadence` (`./store.ts`) — it only turns a chosen cadence + a clock
 * reading into the default label, and validates any Run id (of either cadence, or hand-typed) before
 * it is used as a path segment.
 */

import { join } from "node:path";

import type { FormatCadence } from "./store.ts";
import { formatIdeasRoot } from "./store.ts";

// ---------------------------------------------------------------------------
// Run-id validation (tenancy/path-traversal boundary)
// ---------------------------------------------------------------------------

/**
 * The set of strings safe to join into a Run-scoped path: 1–64 characters of letters, digits,
 * underscores, and hyphens. Wider than `BRAND_SLUG_PATTERN`/`FORMAT_SLUG_PATTERN` (which are
 * lowercase-only) because a real weekly Run id carries an uppercase `W` (`2026-W32`); still rejects
 * `.` (which is what makes `..` dangerous), `/`, `\`, and whitespace.
 */
export const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Pure predicate: does `run` match `RUN_ID_PATTERN`? */
export function isValidRunId(run: string): boolean {
  return RUN_ID_PATTERN.test(run);
}

/** Throw a clear error unless `run` is a safe Run id. Call this BEFORE joining `run` into any path. */
export function assertValidRunId(run: string): void {
  if (!isValidRunId(run)) {
    throw new Error(
      `Invalid Run id ${JSON.stringify(run)}: a Run id must be 1–64 characters of letters, digits, ` +
        `underscores, and hyphens (matching ${RUN_ID_PATTERN.source}). This rejects path traversal ` +
        `(e.g. "../.." or a value containing "/") before it is joined into any Run-scoped path.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Cadence-derived default Run naming (ADR-0022)
// ---------------------------------------------------------------------------

/**
 * Return the ISO 8601 week string for a given Date (e.g. `"2026-W23"`) — a weekly Format's default
 * Run name. Pure: deterministic for a given date input. Uses UTC date components to avoid
 * timezone drift when the caller passes a UTC midnight.
 */
export function isoWeek(date: Date): string {
  // Use UTC date components to avoid local-timezone drift when the caller passes a UTC midnight.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO week: Thursday of the week determines the year.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Return the ISO 8601 calendar-date string for a given Date (e.g. `"2026-08-11"`) — a daily Format's
 * default Run name (ADR-0022). Pure, UTC-based (mirrors `isoWeek`'s timezone handling).
 */
export function isoDateString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The default Run name for a Format of the given `cadence`, at `date` (ADR-0022): the current ISO
 * week for `"weekly"`, the current ISO date for `"daily"`. This is a DEFAULT only — `/run-trends`
 * still accepts an explicit `<run-id>` override; this is what fills it in when the Operator omits it.
 */
export function defaultRunId(cadence: FormatCadence, date: Date): string {
  return cadence === "daily" ? isoDateString(date) : isoWeek(date);
}

// ---------------------------------------------------------------------------
// Run ideas-directory derivation (ADR-0023) — the ONE date-parsing exception
// ---------------------------------------------------------------------------

const WEEKDAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
] as const;

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const;

/**
 * Parse a Run id as a STRICT `YYYY-MM-DD` calendar date (the ONLY shape `isoDateString`/`defaultRunId`
 * ever produce for a daily Run), returning `null` for anything else — including a syntactically
 * matching but non-existent calendar date (e.g. `2026-02-30`). Never throws: a hand-typed, non-date
 * Run id on a `cadence: daily` Format degrades gracefully (see `runPathSegments` below) rather than
 * crashing a Run.
 */
function parseDailyRunDate(runId: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(runId);
  if (match === null) return null;
  const year = Number(match[1]!);
  const month = Number(match[2]!);
  const day = Number(match[3]!);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject calendar-invalid input (e.g. "2026-02-30") by round-tripping the UTC components — an
  // out-of-range day/month rolls forward in `Date`, so a mismatch means it wasn't a real date.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

/** True when `runId` is shaped like a daily Run id (`YYYY-MM-DD`, a real calendar date) — used by
 *  `src/format/brief-path.ts` to decide whether a nested-daily candidate is even worth trying,
 *  without needing to load the owning Format's `cadence` (which that pure module never reads). */
export function isDailyRunIdShape(runId: string): boolean {
  return parseDailyRunDate(runId) !== null;
}

/**
 * Render `date`'s weekday-day-month leaf, e.g. `"wednesday-12-august"` (ADR-0023): weekday and month
 * spelled out in lowercase English, day zero-padded. Pure, UTC-based (mirrors `isoWeek`'s/
 * `isoDateString`'s own timezone handling).
 */
function weekdayDayMonthLeaf(date: Date): string {
  const weekday = WEEKDAY_NAMES[date.getUTCDay()];
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = MONTH_NAMES[date.getUTCMonth()];
  return `${weekday}-${day}-${month}`;
}

/**
 * The `ideas/<format>/...` PATH SEGMENTS a Run of the given `cadence` contributes, given its own Run
 * id (ADR-0023). A weekly Run contributes exactly its own id as the ONE segment (`["2026-W32"]`) —
 * BYTE-IDENTICAL to every shape this codebase used before this function existed. A daily Run instead
 * contributes TWO segments: the ISO week containing its date, then a weekday-named leaf
 * (`["2026-W33", "wednesday-12-august"]`) — computed from the Run id's OWN date (this is the one
 * function ADR-0023 authorizes to parse date semantics out of a Run id, for path derivation only).
 *
 * Defensive: a `cadence: "daily"` Run whose id does NOT parse as a real calendar date (a hand-typed,
 * non-standard run id) degrades to the flat, single-segment shape rather than throwing or guessing —
 * mirroring this codebase's never-fabricate posture (data-handling rule 4).
 */
export function runPathSegments(runId: string, cadence: FormatCadence): readonly string[] {
  if (cadence !== "daily") return [runId];
  const date = parseDailyRunDate(runId);
  if (date === null) return [runId];
  return [isoWeek(date), weekdayDayMonthLeaf(date)];
}

/**
 * The on-disk ideas directory for one Run of one Format (ADR-0023) — the ONE deep function every
 * module that reconstructs `ideas/<format>/<run>/...` routes through: `join(formatIdeasRoot(brand,
 * formatSlug, brandsRoot), ...runPathSegments(runId, cadence))`. For a weekly Format this is
 * BYTE-IDENTICAL to the pre-existing flat `ideas/<format>/<run>/` shape; for a daily Format it nests
 * under the Run's ISO week, then a weekday-named leaf: `ideas/<format>/<ISO-week>/
 * <weekday>-<DD>-<month>/`.
 *
 * `runId` is validated (`assertValidRunId`) BEFORE it is joined into any path — same tenancy-boundary
 * reasoning as every other Run-scoped path builder in this codebase.
 */
export function runIdeasDirFor(
  brand: string,
  formatSlug: string,
  runId: string,
  cadence: FormatCadence,
  brandsRoot?: string,
): string {
  assertValidRunId(runId);
  return join(formatIdeasRoot(brand, formatSlug, brandsRoot), ...runPathSegments(runId, cadence));
}
