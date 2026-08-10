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
