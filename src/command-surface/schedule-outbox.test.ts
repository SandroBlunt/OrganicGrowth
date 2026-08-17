/**
 * Tests for the typed command surface's Schedule Outbox operations (`scheduleViaOutbox`,
 * `reconcileScheduleOutbox`, issue #209).
 *
 * Thin shells — proving the forwarding, not re-proving `src/schedule-outbox/run.ts`'s own full behavior
 * matrix (already covered by `src/schedule-outbox/run.test.ts` and `crash-recovery.test.ts`).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { seedAsset } from "../db/fixtures/seed-chain.ts";
import { FakeZohoSchedulePort } from "../schedule-batch/fixtures/fake-zoho-schedule-port.ts";
import type { ZohoPostRequest } from "../schedule-batch/mcp-schedule-port.ts";
import { getScheduleOutboxEntry } from "../schedule-outbox/store.ts";

import { scheduleViaOutbox, reconcileScheduleOutbox } from "./schedule-outbox.ts";

function request(): ZohoPostRequest {
  return {
    target: { zohoBrandName: "Straw Motion", platform: "facebook", label: "facebook" },
    mediaIds: ["fake-media-1"],
    content: "caption\n\n#AInews",
    scheduledAtLocal: "08/11/2026 15:06",
  };
}

describe("scheduleViaOutbox — the command surface's write over the Schedule Outbox (issue #209)", () => {
  it("reserves, calls Zoho, and confirms — readable back through getScheduleOutboxEntry", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);
      const port = new FakeZohoSchedulePort();

      const outcome = await scheduleViaOutbox(db, { idempotencyKey: "cs-key-1", assetId, request: request() }, port);

      assert.equal(outcome.calledCreateSchedule, true);
      assert.equal(getScheduleOutboxEntry(db, "cs-key-1")?.status, "confirmed");
      assert.equal(getScheduleOutboxEntry(db, "cs-key-1")?.reference, outcome.reference);
    });
  });
});

describe("reconcileScheduleOutbox — the command surface's read-only reconciliation (issue #209)", () => {
  it("returns 'unknown-key' for a key never reserved, touching Zoho zero times", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const port = new FakeZohoSchedulePort();
      const outcome = await reconcileScheduleOutbox(db, "never-reserved", port);
      assert.deepEqual(outcome, { status: "unknown-key" });
      assert.equal(port.calls.length, 0);
    });
  });
});
