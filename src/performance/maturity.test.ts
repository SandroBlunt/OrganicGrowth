import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { daysSince, assetMaturityStatus, TRACKING_MATURITY_DAYS } from "./maturity.ts";

describe("daysSince — fractional days between two ISO timestamps", () => {
  it("computes whole days for exact-day differences", () => {
    assert.equal(daysSince("2026-06-01T00:00:00.000Z", "2026-06-08T00:00:00.000Z"), 7);
  });

  it("computes a fractional day", () => {
    assert.equal(daysSince("2026-06-01T00:00:00.000Z", "2026-06-01T12:00:00.000Z"), 0.5);
  });

  it("returns null for an unparseable timestamp on either side — never throws", () => {
    assert.equal(daysSince("not-a-date", "2026-06-08T00:00:00.000Z"), null);
    assert.equal(daysSince("2026-06-01T00:00:00.000Z", "not-a-date"), null);
    assert.equal(daysSince("", ""), null);
  });
});

describe("assetMaturityStatus — per-Asset tracking/scored by the Post's OWN posted_at age", () => {
  it(`is "tracking" for a Post younger than ${TRACKING_MATURITY_DAYS} days`, () => {
    assert.equal(
      assetMaturityStatus("2026-06-01T00:00:00.000Z", "2026-06-03T00:00:00.000Z"),
      "tracking",
    );
  });

  it("is still tracking one second short of the maturity window", () => {
    assert.equal(
      assetMaturityStatus("2026-06-01T00:00:00.000Z", "2026-06-07T23:59:59.000Z"),
      "tracking",
    );
  });

  it(`is "scored" once a Post is exactly ${TRACKING_MATURITY_DAYS} days old`, () => {
    assert.equal(
      assetMaturityStatus("2026-06-01T00:00:00.000Z", "2026-06-08T00:00:00.000Z"),
      "scored",
    );
  });

  it("is scored for a Post well past the maturity window", () => {
    assert.equal(
      assetMaturityStatus("2026-01-01T00:00:00.000Z", "2026-06-08T00:00:00.000Z"),
      "scored",
    );
  });

  it("returns null for an unparseable posted_at — the caller must skip, never guess", () => {
    assert.equal(assetMaturityStatus("not-a-date", "2026-06-08T00:00:00.000Z"), null);
  });
});
