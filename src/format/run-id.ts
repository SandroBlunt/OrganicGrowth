/**
 * Run id — the safe-path-segment guard for a Format's Run identifier, plus the pure derivation of a
 * Run's DEFAULT name from its Format's cadence (ADR-0022, `docs/adr/0022-cadence-is-a-format-property.md`;
 * CONTEXT.md "Run"; issue #172).
 *
 * A Run id is an OPAQUE label everywhere in this codebase: no code parses week (or date) semantics out
 * of it — every reader treats it as an exact-match filter (`record.run === run`,
 * `src/schedule-batch/select.ts`) or a path segment (`ideas/<format>/<run>/...`). That second use is
 * the one that matters here: a Run id originates as UNTRUSTED input (a raw
 * `/run-trends <brand> <format> [<run-id>]` CLI argument, or a `/export-schedule` argument) and gets
 * joined straight into a filesystem path by several deep modules — so, mirroring `BRAND_SLUG_PATTERN`
 * (`src/brand/resolver.ts`) and `FORMAT_SLUG_PATTERN` (`./store.ts`), it is validated against a
 * safe-slug shape BEFORE any of those callers touch the filesystem
 * (`src/production-spec/store.ts`'s `specPathFor`, `src/asset/output-bundle.ts`'s `outputDirFor`,
 * `src/asset/cast-candidates.ts`'s `castCandidatesDirFor`, `src/commands/export-schedule.ts`'s
 * `exportScheduleCommand`).
 *
 * Colocated with the Format module because a Run's cadence-derived DEFAULT name is a Format property
 * (ADR-0022): `"weekly"` (the default) names a Run by the current ISO week (`2026-W32`); `"daily"`
 * names it by the current ISO date (`2026-08-11`). This module does not itself decide which cadence
 * applies — that is `FormatFile.cadence` (`./store.ts`) — it only turns a chosen cadence + a clock
 * reading into the default label, and validates any Run id (of either cadence, or hand-typed) before
 * it is used as a path segment.
 */

import type { FormatCadence } from "./store.ts";

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
