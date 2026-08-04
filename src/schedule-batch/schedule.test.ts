import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  EASTERN_TIME_ZONE,
  MIN_LEAD_MS,
  deriveScheduleSlots,
  validateSlotsFuture,
} from "./schedule.ts";
import { zonedTimeToUtcMs, utcOffsetMsAt } from "./timezone.ts";

describe("schedule — pure, deterministic schedule derivation (issue #145)", () => {
  describe("deriveScheduleSlots", () => {
    it("returns one slot per requested count", () => {
      const slots = deriveScheduleSlots("2026-08-04", 3);
      assert.equal(slots.length, 3);
    });

    it("is pure — calling it twice with the same inputs returns the same output", () => {
      const a = deriveScheduleSlots("2026-08-04", 5);
      const b = deriveScheduleSlots("2026-08-04", 5);
      assert.deepEqual(
        a.map((s) => s.utcMs),
        b.map((s) => s.utcMs),
      );
    });

    it("schedules one Asset per day, strictly increasing calendar days from the start date", () => {
      const slots = deriveScheduleSlots("2026-08-04", 4);
      const days = slots.map((s) => {
        // Read the slot's own Eastern-local calendar date back out, since that's the day it was
        // derived against.
        const offset = utcOffsetMsAt(s.utcMs, EASTERN_TIME_ZONE);
        const local = new Date(s.utcMs + offset);
        return `${local.getUTCFullYear()}-${local.getUTCMonth() + 1}-${local.getUTCDate()}`;
      });
      assert.deepEqual(days, ["2026-8-4", "2026-8-5", "2026-8-6", "2026-8-7"]);
    });

    it("every slot's Eastern-local time falls within the 7:00-22:00 targeting window, off the round minute", () => {
      const slots = deriveScheduleSlots("2026-08-04", 20);
      for (const slot of slots) {
        const offset = utcOffsetMsAt(slot.utcMs, EASTERN_TIME_ZONE);
        const local = new Date(slot.utcMs + offset);
        const hour = local.getUTCHours();
        const minute = local.getUTCMinutes();
        assert.ok(hour >= 7 && hour <= 21, `hour ${hour} outside 7-21`);
        assert.notEqual(minute, 0, "minute must never be exactly on the hour");
      }
    });

    it("cycles the hour/minute rotation when the count exceeds the rotation length", () => {
      const short = deriveScheduleSlots("2026-08-04", 30);
      // No assertion on a specific value beyond determinism + window bounds (already covered above) —
      // this just proves a long run doesn't throw or produce fewer than the requested slots.
      assert.equal(short.length, 30);
    });

    it("matches the documented example: idea-01 at the W32 smoke test's own start date/time", () => {
      // Gold reference (2026-W32 smoke test, live-verified 2026-08-04): the FIRST slot of a batch
      // started same-day lands on 08/04/2026 in Eastern-anchored local terms.
      const slots = deriveScheduleSlots("2026-08-04", 1);
      const offset = utcOffsetMsAt(slots[0]!.utcMs, EASTERN_TIME_ZONE);
      const local = new Date(slots[0]!.utcMs + offset);
      assert.equal(local.getUTCFullYear(), 2026);
      assert.equal(local.getUTCMonth() + 1, 8);
      assert.equal(local.getUTCDate(), 4);
    });
  });

  describe("validateSlotsFuture", () => {
    it("passes when every slot is comfortably more than 1 hour in the future", () => {
      const nowMs = zonedTimeToUtcMs(2026, 8, 4, 8, 0, EASTERN_TIME_ZONE);
      const slots = deriveScheduleSlots("2026-08-05", 3); // tomorrow onward
      const result = validateSlotsFuture(slots, nowMs);
      assert.equal(result.ok, true);
    });

    it("fails loudly, naming every violating slot, when any slot is less than 1 hour away", () => {
      const utcMs = zonedTimeToUtcMs(2026, 8, 4, 9, 6, EASTERN_TIME_ZONE);
      const nowMs = utcMs - 30 * 60 * 1000; // 30 minutes before the slot — inside the 1h lead window
      const result = validateSlotsFuture([{ utcMs }], nowMs);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.violations.length, 1);
        assert.equal(result.violations[0]!.index, 0);
      }
    });

    it("fails when a slot is exactly at or after now (already past)", () => {
      const nowMs = zonedTimeToUtcMs(2026, 8, 4, 9, 6, EASTERN_TIME_ZONE);
      const pastSlot = { utcMs: nowMs - 60 * 1000 };
      const result = validateSlotsFuture([pastSlot], nowMs);
      assert.equal(result.ok, false);
    });

    it("passes at exactly the 1-hour boundary or later", () => {
      const nowMs = zonedTimeToUtcMs(2026, 8, 4, 9, 6, EASTERN_TIME_ZONE);
      const exactlyOneHourOut = { utcMs: nowMs + MIN_LEAD_MS };
      const result = validateSlotsFuture([exactlyOneHourOut], nowMs);
      assert.equal(result.ok, true);
    });

    it("reports every violating slot, not just the first", () => {
      const nowMs = zonedTimeToUtcMs(2026, 8, 4, 9, 6, EASTERN_TIME_ZONE);
      const slots = [
        { utcMs: nowMs + MIN_LEAD_MS }, // fine
        { utcMs: nowMs + 1000 }, // violation
        { utcMs: nowMs - 1000 }, // violation
      ];
      const result = validateSlotsFuture(slots, nowMs);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.deepEqual(
          result.violations.map((v) => v.index),
          [1, 2],
        );
      }
    });

    it("is pure — no clock read inside; 'now' is always the explicit argument", () => {
      const nowMs = zonedTimeToUtcMs(2026, 8, 4, 8, 0, EASTERN_TIME_ZONE);
      const slots = deriveScheduleSlots("2026-08-05", 2);
      const a = validateSlotsFuture(slots, nowMs);
      const b = validateSlotsFuture(slots, nowMs);
      assert.deepEqual(a, b);
    });
  });
});
