import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeMediaExpiry, EXPIRY_BUFFER_AFTER_SCHEDULED_MS } from "./media-expiry.ts";
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
