import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { withTempDb } from "../db/test-support.ts";
import { runMigrations } from "../db/migrate.ts";
import { seedAsset } from "../db/fixtures/seed-chain.ts";
import { FakeZohoSchedulePort } from "../schedule-batch/fixtures/fake-zoho-schedule-port.ts";
import type { ZohoPostRequest } from "../schedule-batch/mcp-schedule-port.ts";
import { getScheduleOutboxEntry, reserveScheduleOutboxEntry } from "./store.ts";
import { reconcileScheduleOutboxEntry, runScheduleOutboxEntry } from "./run.ts";

function request(overrides: Partial<ZohoPostRequest> = {}): ZohoPostRequest {
  return {
    target: { zohoBrandName: "Straw Motion", platform: "facebook", label: "facebook" },
    mediaIds: ["fake-media-1"],
    content: "caption\n\n#AInews",
    scheduledAtLocal: "08/11/2026 15:06",
    ...overrides,
  };
}

describe("runScheduleOutboxEntry — a brand-new reservation goes straight to createSchedule", () => {
  it("reserves, calls createSchedule exactly once, confirms with its reference", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);
      const port = new FakeZohoSchedulePort();

      const outcome = await runScheduleOutboxEntry(db, { idempotencyKey: "key-1", assetId, request: request() }, port);

      assert.equal(outcome.calledCreateSchedule, true);
      assert.equal(outcome.alreadyConfirmed, false);
      assert.equal(outcome.reference, "fake-ref-1");
      assert.deepEqual(
        port.calls.map((c) => c.kind),
        ["schedule"],
        "a fresh reservation must not call listSchedules first — nothing to reconcile yet",
      );

      const entry = getScheduleOutboxEntry(db, "key-1");
      assert.equal(entry?.status, "confirmed");
      assert.equal(entry?.reference, "fake-ref-1");
    });
  });
});

describe("runScheduleOutboxEntry — an already-CONFIRMED key short-circuits: zero Zoho calls", () => {
  it("a second call with the same idempotencyKey calls Zoho zero times and returns the same reference", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);
      const port = new FakeZohoSchedulePort();

      const first = await runScheduleOutboxEntry(db, { idempotencyKey: "key-2", assetId, request: request() }, port);
      const callsAfterFirst = port.calls.length;

      const second = await runScheduleOutboxEntry(db, { idempotencyKey: "key-2", assetId, request: request() }, port);

      assert.equal(second.alreadyConfirmed, true);
      assert.equal(second.calledCreateSchedule, false);
      assert.equal(second.reference, first.reference);
      assert.equal(port.calls.length, callsAfterFirst, "no new port call of any kind on the already-confirmed retry");
    });
  });
});

describe("runScheduleOutboxEntry — a RESUMED reservation reconciles before ever calling createSchedule again", () => {
  it("Zoho already has a matching schedule (simulating a crash AFTER Zoho accepted it): confirms via reconciliation, createSchedule is NOT called again", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);
      const port = new FakeZohoSchedulePort();

      // Simulate: a PRIOR attempt reserved this key and successfully called Zoho, but crashed before
      // confirming locally — reserve directly (bypassing runScheduleOutboxEntry), then seed the fake's
      // own "Zoho already has this" state directly onto `created` (never via createSchedule, so this
      // call's own createSchedule count starts at zero).
      reserveScheduleOutboxEntry(db, { idempotencyKey: "key-3", assetId, request: request() });
      port.created.push({
        target: request().target,
        reference: "already-live-ref",
        content: request().content,
        scheduledAtLocal: request().scheduledAtLocal,
      });

      const outcome = await runScheduleOutboxEntry(db, { idempotencyKey: "key-3", assetId, request: request() }, port);

      assert.equal(outcome.calledCreateSchedule, false, "must NOT call createSchedule again — Zoho already had it");
      assert.equal(outcome.reference, "already-live-ref");
      assert.deepEqual(
        port.calls.map((c) => c.kind),
        ["list"],
      );

      const entry = getScheduleOutboxEntry(db, "key-3");
      assert.equal(entry?.status, "confirmed");
      assert.equal(entry?.reference, "already-live-ref");
    });
  });

  it("Zoho never received the request (simulating a crash BEFORE Zoho was ever called): reconciliation finds nothing, createSchedule proceeds exactly once", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);
      const port = new FakeZohoSchedulePort();

      // Simulate: a PRIOR attempt reserved this key but crashed BEFORE ever calling Zoho.
      reserveScheduleOutboxEntry(db, { idempotencyKey: "key-4", assetId, request: request() });

      const outcome = await runScheduleOutboxEntry(db, { idempotencyKey: "key-4", assetId, request: request() }, port);

      assert.equal(outcome.calledCreateSchedule, true);
      assert.deepEqual(
        port.calls.map((c) => c.kind),
        ["list", "schedule"],
        "reconciliation runs FIRST, finds nothing, THEN (and only then) createSchedule is called",
      );
      assert.equal(port.created.length, 1, "exactly one schedule now exists on Zoho — no double post, no drop");
    });
  });
});

describe("reconcileScheduleOutboxEntry — read-only toward Zoho, never calls createSchedule", () => {
  it("returns 'unknown-key' for a key that was never reserved", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const port = new FakeZohoSchedulePort();
      const outcome = await reconcileScheduleOutboxEntry(db, "never-reserved", port);
      assert.deepEqual(outcome, { status: "unknown-key" });
      assert.equal(port.calls.length, 0);
    });
  });

  it("returns 'already-confirmed' without calling Zoho at all", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);
      const port = new FakeZohoSchedulePort();
      await runScheduleOutboxEntry(db, { idempotencyKey: "key-5", assetId, request: request() }, port);
      const callsAfterRun = port.calls.length;

      const outcome = await reconcileScheduleOutboxEntry(db, "key-5", port);
      assert.equal(outcome.status, "already-confirmed");
      assert.equal(port.calls.length, callsAfterRun);
    });
  });

  it("returns 'still-unconfirmed' and changes nothing when Zoho reports no match", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);
      const port = new FakeZohoSchedulePort();
      reserveScheduleOutboxEntry(db, { idempotencyKey: "key-6", assetId, request: request() });

      const outcome = await reconcileScheduleOutboxEntry(db, "key-6", port);
      assert.deepEqual(outcome, { status: "still-unconfirmed" });
      assert.equal(getScheduleOutboxEntry(db, "key-6")?.status, "reserved");
      assert.deepEqual(
        port.calls.map((c) => c.kind),
        ["list"],
        "never calls createSchedule itself",
      );
    });
  });
});
