import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { zonedTimeToUtcMs, formatZohoScheduleTime, utcOffsetMsAt } from "./timezone.ts";

describe("timezone — pure, deterministic zoned<->UTC math for Schedule Batch (issue #145)", () => {
  describe("utcOffsetMsAt", () => {
    it("reports CEST (+2h) for Europe/Berlin in August", () => {
      const instant = Date.UTC(2026, 7, 4, 12, 0, 0);
      assert.equal(utcOffsetMsAt(instant, "Europe/Berlin"), 2 * 60 * 60 * 1000);
    });

    it("reports CET (+1h) for Europe/Berlin in January (no DST)", () => {
      const instant = Date.UTC(2026, 0, 15, 12, 0, 0);
      assert.equal(utcOffsetMsAt(instant, "Europe/Berlin"), 1 * 60 * 60 * 1000);
    });

    it("reports EDT (-4h) for America/New_York in August", () => {
      const instant = Date.UTC(2026, 7, 4, 12, 0, 0);
      assert.equal(utcOffsetMsAt(instant, "America/New_York"), -4 * 60 * 60 * 1000);
    });

    it("reports 0 for UTC itself", () => {
      const instant = Date.UTC(2026, 7, 4, 12, 0, 0);
      assert.equal(utcOffsetMsAt(instant, "UTC"), 0);
    });
  });

  describe("zonedTimeToUtcMs", () => {
    it("converts a Berlin wall-clock time (CEST, +2h) to the matching UTC instant", () => {
      const utcMs = zonedTimeToUtcMs(2026, 8, 4, 16, 23, "Europe/Berlin");
      assert.equal(utcMs, Date.UTC(2026, 7, 4, 14, 23, 0));
    });

    it("converts an Eastern wall-clock time (EDT, -4h) to the matching UTC instant", () => {
      const utcMs = zonedTimeToUtcMs(2026, 8, 4, 9, 6, "America/New_York");
      assert.equal(utcMs, Date.UTC(2026, 7, 4, 13, 6, 0));
    });

    it("converts a winter Berlin wall-clock time (CET, +1h) to the matching UTC instant", () => {
      const utcMs = zonedTimeToUtcMs(2026, 1, 15, 9, 30, "Europe/Berlin");
      assert.equal(utcMs, Date.UTC(2026, 0, 15, 8, 30, 0));
    });

    it("round-trips through formatZohoScheduleTime for the SAME zone", () => {
      const utcMs = zonedTimeToUtcMs(2026, 8, 4, 16, 23, "Europe/Berlin");
      assert.equal(formatZohoScheduleTime(utcMs, "Europe/Berlin"), "08/04/2026 16:23");
    });

    it("is pure — the same inputs always produce the same output", () => {
      const a = zonedTimeToUtcMs(2026, 8, 4, 16, 23, "Europe/Berlin");
      const b = zonedTimeToUtcMs(2026, 8, 4, 16, 23, "Europe/Berlin");
      assert.equal(a, b);
    });
  });

  describe("formatZohoScheduleTime", () => {
    it("formats MM/DD/YYYY HH:mm, month-first, zero-padded, in the given zone", () => {
      const utcMs = Date.UTC(2026, 8, 8, 0, 0, 0); // 2026-09-08T00:00:00Z
      assert.equal(formatZohoScheduleTime(utcMs, "UTC"), "09/08/2026 00:00");
    });

    it("renders the SAME absolute instant differently in two different zones", () => {
      const utcMs = zonedTimeToUtcMs(2026, 8, 4, 16, 23, "Europe/Berlin");
      // Same instant, viewed from US-Eastern (EDT, -4h from UTC in August) — 14:23 UTC -> 10:23 EDT.
      assert.equal(formatZohoScheduleTime(utcMs, "America/New_York"), "08/04/2026 10:23");
    });

    it("never renders hour 24 at local midnight (always 00, never 24)", () => {
      const utcMs = Date.UTC(2026, 7, 3, 22, 0, 0); // 22:00 UTC = midnight Berlin (CEST, +2h)
      assert.equal(formatZohoScheduleTime(utcMs, "Europe/Berlin"), "08/04/2026 00:00");
    });
  });
});
