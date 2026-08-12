/**
 * Tests for the Run-id deep module (`src/format/run-id.ts`, ADR-0022, issue #172):
 *   - `RUN_ID_PATTERN` / `isValidRunId` / `assertValidRunId` — the safe-path-segment guard.
 *   - `isoWeek` / `isoDateString` / `defaultRunId` — the cadence-derived default Run naming.
 *
 * No live Magnific Space, no Apify, no network — pure string/date computation only.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  RUN_ID_PATTERN,
  isValidRunId,
  assertValidRunId,
  isoWeek,
  isoDateString,
  defaultRunId,
  isDailyRunIdShape,
  runPathSegments,
  runIdeasDirFor,
} from "./run-id.ts";

// ---------------------------------------------------------------------------
// RUN_ID_PATTERN / isValidRunId
// ---------------------------------------------------------------------------

describe("RUN_ID_PATTERN / isValidRunId — accepts only safe path segments", () => {
  const valid = [
    "2026-W22", "2026-W29", "2026-W30", "2026-W32", "2026-W1", // real weekly Run ids on disk
    "2026-08-11", // a daily Run id (ADR-0022)
    "r", "a".repeat(64),
  ];
  const invalid = [
    "", "../..", "..", "a/b", "a\\b", "a b", "café",
    "a".repeat(65),
    "2026.W22", // a dot must be rejected (it is what makes ".." dangerous)
  ];

  for (const s of valid) {
    it(`accepts ${JSON.stringify(s)}`, () => {
      assert.equal(isValidRunId(s), true);
      assert.equal(RUN_ID_PATTERN.test(s), true);
    });
  }
  for (const s of invalid) {
    it(`rejects ${JSON.stringify(s)}`, () => {
      assert.equal(isValidRunId(s), false);
    });
  }
});

describe("assertValidRunId — throws a clear, run-naming error on invalid input, before any path join", () => {
  it("does not throw for a real weekly or daily Run id", () => {
    assert.doesNotThrow(() => assertValidRunId("2026-W32"));
    assert.doesNotThrow(() => assertValidRunId("2026-08-11"));
  });

  it("throws for a path-traversal Run id and names it", () => {
    assert.throws(
      () => assertValidRunId("../.."),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("../.."), "error must name the offending Run id");
        return true;
      },
    );
  });

  it("throws for a Run id containing a path separator", () => {
    assert.throws(() => assertValidRunId("2026-W32/../../etc"));
    assert.throws(() => assertValidRunId("a/b"));
  });
});

// ---------------------------------------------------------------------------
// isoWeek — moved here from src/commands/run-pipeline.ts (re-exported there, unchanged behavior)
// ---------------------------------------------------------------------------

describe("isoWeek — pure ISO 8601 week number", () => {
  it("computes the correct ISO week for a known date", () => {
    assert.equal(isoWeek(new Date("2026-06-01T00:00:00.000Z")), "2026-W23");
  });

  it("computes week 1 for a date at the very start of the year", () => {
    assert.equal(isoWeek(new Date("2026-01-01T00:00:00.000Z")), "2026-W01");
  });

  it("handles a year-boundary date that belongs to the PRIOR year's last week", () => {
    assert.equal(isoWeek(new Date("2021-01-01T00:00:00.000Z")), "2020-W53");
  });

  it("is deterministic for the same date", () => {
    const d = new Date("2026-07-16T12:00:00.000Z");
    assert.equal(isoWeek(d), isoWeek(d));
  });
});

// ---------------------------------------------------------------------------
// isoDateString — the daily Format's default Run naming (ADR-0022)
// ---------------------------------------------------------------------------

describe("isoDateString — pure ISO 8601 calendar date (UTC)", () => {
  it("formats a date as YYYY-MM-DD", () => {
    assert.equal(isoDateString(new Date("2026-08-11T00:00:00.000Z")), "2026-08-11");
  });

  it("pads single-digit month and day", () => {
    assert.equal(isoDateString(new Date("2026-01-05T00:00:00.000Z")), "2026-01-05");
  });

  it("uses UTC date components — a late-night UTC timestamp does not roll to the next day", () => {
    assert.equal(isoDateString(new Date("2026-08-11T23:59:59.000Z")), "2026-08-11");
  });
});

// ---------------------------------------------------------------------------
// defaultRunId — the Format-cadence-derived default (ADR-0022, issue #172 AC2)
// ---------------------------------------------------------------------------

describe("defaultRunId — weekly Formats default to the ISO week, daily Formats to the ISO date", () => {
  const date = new Date("2026-08-11T09:00:00.000Z");

  it("defaults a weekly Format's Run to the current ISO week", () => {
    assert.equal(defaultRunId("weekly", date), isoWeek(date));
    assert.equal(defaultRunId("weekly", date), "2026-W33");
  });

  it("defaults a daily Format's Run to the current ISO date", () => {
    assert.equal(defaultRunId("daily", date), isoDateString(date));
    assert.equal(defaultRunId("daily", date), "2026-08-11");
  });
});

// ---------------------------------------------------------------------------
// isDailyRunIdShape — structural (no cadence needed) daily-Run-id detection (ADR-0023, issue #185)
// ---------------------------------------------------------------------------

describe("isDailyRunIdShape — recognizes a genuine YYYY-MM-DD calendar date, nothing else", () => {
  it("accepts real daily Run ids", () => {
    assert.equal(isDailyRunIdShape("2026-08-11"), true);
    assert.equal(isDailyRunIdShape("2026-08-12"), true);
    assert.equal(isDailyRunIdShape("2026-01-01"), true);
    assert.equal(isDailyRunIdShape("2026-12-31"), true);
  });

  it("rejects weekly Run ids", () => {
    assert.equal(isDailyRunIdShape("2026-W32"), false);
    assert.equal(isDailyRunIdShape("2026-W1"), false);
  });

  it("rejects a syntactically date-shaped but calendar-invalid date", () => {
    assert.equal(isDailyRunIdShape("2026-02-30"), false, "February never has a 30th");
    assert.equal(isDailyRunIdShape("2026-13-01"), false, "month 13 does not exist");
    assert.equal(isDailyRunIdShape("2026-00-01"), false, "month 0 does not exist");
  });

  it("rejects hand-typed/garbled run ids", () => {
    assert.equal(isDailyRunIdShape("smoke-test"), false);
    assert.equal(isDailyRunIdShape(""), false);
    assert.equal(isDailyRunIdShape("2026-8-11"), false, "month/day must be zero-padded, matching isoDateString");
  });
});

// ---------------------------------------------------------------------------
// runPathSegments — the ONE date-parsing exception (ADR-0023, issue #185)
// ---------------------------------------------------------------------------

describe("runPathSegments — weekly is BYTE-IDENTICAL (one segment); daily nests under ISO-week + weekday leaf", () => {
  it("returns exactly [runId] for a weekly cadence, whatever the run id looks like", () => {
    assert.deepEqual(runPathSegments("2026-W32", "weekly"), ["2026-W32"]);
    assert.deepEqual(runPathSegments("2026-08-11", "weekly"), ["2026-08-11"]);
    assert.deepEqual(runPathSegments("smoke-test", "weekly"), ["smoke-test"]);
  });

  it("nests a daily Run under its ISO week + a lowercase weekday-DD-month leaf", () => {
    // ADR-0023's own worked example.
    assert.deepEqual(runPathSegments("2026-08-11", "daily"), ["2026-W33", "tuesday-11-august"]);
  });

  it("matches issue #185's exact AC1 example for 2026-08-12", () => {
    assert.deepEqual(runPathSegments("2026-08-12", "daily"), ["2026-W33", "wednesday-12-august"]);
  });

  it("zero-pads a single-digit day", () => {
    assert.deepEqual(runPathSegments("2026-08-05", "daily"), ["2026-W32", "wednesday-05-august"]);
  });

  it("spells out every month in lowercase English", () => {
    assert.deepEqual(runPathSegments("2026-01-01", "daily"), ["2026-W01", "thursday-01-january"]);
    assert.deepEqual(runPathSegments("2026-12-31", "daily"), ["2026-W53", "thursday-31-december"]);
  });

  it("degrades to the flat, single-segment shape for a hand-typed, non-date daily run id (never throws)", () => {
    assert.doesNotThrow(() => runPathSegments("smoke-test", "daily"));
    assert.deepEqual(runPathSegments("smoke-test", "daily"), ["smoke-test"]);
  });
});

// ---------------------------------------------------------------------------
// runIdeasDirFor — the one deep function every consumer routes through (ADR-0023, issue #185)
// ---------------------------------------------------------------------------

describe("runIdeasDirFor — the one deep function every consumer routes through", () => {
  it("weekly Format: byte-identical to the pre-existing flat ideas/<format>/<run>/ shape", () => {
    assert.equal(
      runIdeasDirFor("straw-motion", "unhypped-news", "2026-W32", "weekly", "data/brands"),
      "data/brands/straw-motion/ideas/unhypped-news/2026-W32",
    );
  });

  it("daily Format: nests under ISO week + weekday-DD-month (matches issue #185's AC1 exactly)", () => {
    assert.equal(
      runIdeasDirFor("straw-motion", "unhypped-daily", "2026-08-12", "daily", "data/brands"),
      "data/brands/straw-motion/ideas/unhypped-daily/2026-W33/wednesday-12-august",
    );
  });

  it("rejects a path-traversal run id before any join", () => {
    assert.throws(() =>
      runIdeasDirFor("straw-motion", "unhypped-daily", "../../evil", "daily", "data/brands"),
    );
  });
});
