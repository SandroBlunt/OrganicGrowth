import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  computeMediaExpiry,
  validateWithinPresignWindow,
  formatOverageDuration,
  EXPIRY_BUFFER_AFTER_SCHEDULED_MS,
} from "./media-expiry.ts";
import { CLEANUP_AFTER_MS } from "./cleanup.ts";
import { MAX_PRESIGN_SECONDS } from "../media-host/aws-presign-limit.ts";

const UPLOADED_AT = "2026-08-04T00:00:00.000Z";

describe("computeMediaExpiry (issue #198 — the link's expiry is derived from the scheduled time)", () => {
  it("expires EXPIRY_BUFFER_AFTER_SCHEDULED_MS after scheduledAt for a schedule well within the AWS window", () => {
    const scheduledAt = "2026-08-05T09:06:00.000Z"; // ~33h after uploadedAt
    const result = computeMediaExpiry(scheduledAt, UPLOADED_AT);

    assert.equal(result.expiresAt, "2026-08-05T10:06:00.000Z"); // scheduledAt + 1h
    assert.equal(result.cappedByAwsLimit, false);
    assert.equal(result.expiresInSeconds, 34 * 3600 + 6 * 60); // 34h06m in seconds
  });

  it("is pure — the same inputs always produce the same output", () => {
    const a = computeMediaExpiry("2026-08-05T09:06:00.000Z", UPLOADED_AT);
    const b = computeMediaExpiry("2026-08-05T09:06:00.000Z", UPLOADED_AT);
    assert.deepEqual(a, b);
  });

  it("caps at MAX_PRESIGN_SECONDS (AWS's 7-day SigV4 ceiling) when the schedule sits further out", () => {
    const scheduledAt = "2026-08-20T00:00:00.000Z"; // 16 days after uploadedAt
    const result = computeMediaExpiry(scheduledAt, UPLOADED_AT);

    assert.equal(result.expiresInSeconds, MAX_PRESIGN_SECONDS);
    assert.equal(result.cappedByAwsLimit, true);
    // The capped expiry is EARLIER than the Asset's own scheduled time — a genuine, documented limit.
    assert.ok(Date.parse(result.expiresAt) < Date.parse(scheduledAt));
    assert.equal(result.expiresAt, new Date(Date.parse(UPLOADED_AT) + MAX_PRESIGN_SECONDS * 1000).toISOString());
  });

  it("is NOT capped at exactly the 7-day boundary (boundary is inclusive, not just-over)", () => {
    const scheduledAt = new Date(
      Date.parse(UPLOADED_AT) + MAX_PRESIGN_SECONDS * 1000 - EXPIRY_BUFFER_AFTER_SCHEDULED_MS,
    ).toISOString();
    const result = computeMediaExpiry(scheduledAt, UPLOADED_AT);

    assert.equal(result.cappedByAwsLimit, false);
    assert.equal(result.expiresInSeconds, MAX_PRESIGN_SECONDS);
  });

  it("throws on an unparseable scheduledAt — never fabricates an expiry", () => {
    assert.throws(() => computeMediaExpiry("not-a-date", UPLOADED_AT), /scheduledAt/);
  });

  it("throws on an unparseable uploadedAt — never fabricates an expiry", () => {
    assert.throws(() => computeMediaExpiry("2026-08-05T09:06:00.000Z", "also-not-a-date"), /uploadedAt/);
  });

  it("returns an ISO-8601 expiresAt round-tripping through Date", () => {
    const result = computeMediaExpiry("2026-08-05T09:06:00.000Z", UPLOADED_AT);
    assert.equal(new Date(result.expiresAt).toISOString(), result.expiresAt);
  });
});

describe("no race between a link's expiry and the cleanup routine's earliest possible deletion (issue #198)", () => {
  it("EXPIRY_BUFFER_AFTER_SCHEDULED_MS is strictly less than CLEANUP_AFTER_MS", () => {
    // If this ever regresses, a signed link could still read as "not yet expired" after the cleanup
    // routine (`runScheduleCleanup`) has already deleted its underlying object — exactly the race this
    // ticket exists to rule out. See media-expiry.ts's own module doc for the full argument.
    assert.ok(EXPIRY_BUFFER_AFTER_SCHEDULED_MS < CLEANUP_AFTER_MS);
  });

  it("a link minted for a due-for-cleanup entry is always already expired by the time cleanup could touch it", () => {
    const uploadedAt = "2026-08-01T00:00:00.000Z";
    const scheduledAt = "2026-08-02T00:00:00.000Z"; // 1 day after upload
    const { expiresAt } = computeMediaExpiry(scheduledAt, uploadedAt);

    // The EARLIEST instant runScheduleCleanup could consider this entry due (isDueForCleanup requires
    // STRICTLY more than CLEANUP_AFTER_MS past scheduledAt).
    const earliestCleanupEligibleMs = Date.parse(scheduledAt) + CLEANUP_AFTER_MS + 1;

    assert.ok(Date.parse(expiresAt) < earliestCleanupEligibleMs);
  });
});

describe("validateWithinPresignWindow (issue #198 QA Round 1 Defect #1 — a link that cannot survive to its own post time must refuse loudly, never ship silently)", () => {
  /** The TRUE boundary: a signed link is minted for at most `MAX_PRESIGN_SECONDS` from `uploadedAt`, so
   *  a scheduled time exactly `MAX_PRESIGN_SECONDS` after `uploadedAt` is the LAST instant a link can
   *  still just barely reach (even though it is already `cappedByAwsLimit` — the ideal extra 1-hour
   *  post-scheduled buffer is gone, but the link still covers the post time itself). One millisecond
   *  later, it can't. */
  const BOUNDARY_SCHEDULED_AT = new Date(Date.parse(UPLOADED_AT) + MAX_PRESIGN_SECONDS * 1000).toISOString();

  it("ok: true when every scheduled time is well within the AWS window", () => {
    const result = validateWithinPresignWindow(
      ["2026-08-05T09:06:00.000Z", "2026-08-06T13:23:00.000Z"],
      UPLOADED_AT,
    );
    assert.deepEqual(result, { ok: true });
  });

  it("just INSIDE the 7-day ceiling (exactly at the boundary): ok: true, even though cappedByAwsLimit is true", () => {
    // Sanity-check the premise: this scheduled time IS capped (its ideal buffer is trimmed away)...
    assert.equal(computeMediaExpiry(BOUNDARY_SCHEDULED_AT, UPLOADED_AT).cappedByAwsLimit, true);
    // ...but the link still reaches the post's own scheduled time exactly, so this is NOT a violation.
    const result = validateWithinPresignWindow([BOUNDARY_SCHEDULED_AT], UPLOADED_AT);
    assert.deepEqual(result, { ok: true });
  });

  it("just OUTSIDE the 7-day ceiling (1 millisecond past the boundary): ok: false, naming the violation", () => {
    const justOutside = new Date(Date.parse(BOUNDARY_SCHEDULED_AT) + 1).toISOString();
    const result = validateWithinPresignWindow([justOutside], UPLOADED_AT);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0]!.index, 0);
    assert.equal(result.violations[0]!.scheduledAtIso, justOutside);
    assert.equal(result.violations[0]!.overageMs, 1);
    assert.ok(Date.parse(result.violations[0]!.expiresAt) < Date.parse(justOutside));
  });

  it("returns EVERY violating index, never stopping at the first, and leaves compliant rows out", () => {
    const wellWithin = "2026-08-05T09:06:00.000Z";
    const farOut = "2026-08-25T00:00:00.000Z"; // ~21 days after uploadedAt
    const alsoFarOut = "2026-09-01T00:00:00.000Z";
    const result = validateWithinPresignWindow([wellWithin, farOut, alsoFarOut], UPLOADED_AT);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(
      result.violations.map((v) => v.index),
      [1, 2],
    );
  });

  it("an empty list is trivially ok: true", () => {
    assert.deepEqual(validateWithinPresignWindow([], UPLOADED_AT), { ok: true });
  });

  it("is pure — the same inputs always produce the same output", () => {
    const scheduledAtIsos = ["2026-08-05T09:06:00.000Z", "2026-08-25T00:00:00.000Z"];
    const a = validateWithinPresignWindow(scheduledAtIsos, UPLOADED_AT);
    const b = validateWithinPresignWindow(scheduledAtIsos, UPLOADED_AT);
    assert.deepEqual(a, b);
  });
});

describe("formatOverageDuration", () => {
  it("rounds up to whole days, minimum 1 day", () => {
    assert.equal(formatOverageDuration(1), "1 day");
    assert.equal(formatOverageDuration(60 * 60 * 1000), "1 day"); // 1 hour rounds up to 1 day
    assert.equal(formatOverageDuration(24 * 60 * 60 * 1000), "1 day"); // exactly 1 day
  });

  it("pluralizes for more than 1 day, rounding up a partial day", () => {
    assert.equal(formatOverageDuration(24 * 60 * 60 * 1000 + 1), "2 days");
    assert.equal(formatOverageDuration(3 * 24 * 60 * 60 * 1000), "3 days");
  });
});
