import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { withTempDb } from "../db/test-support.ts";
import { runMigrations } from "../db/migrate.ts";
import { seedAsset } from "../db/fixtures/seed-chain.ts";
import type { ZohoPostRequest } from "../schedule-batch/mcp-schedule-port.ts";
import {
  confirmScheduleOutboxEntry,
  getScheduleOutboxEntry,
  listReservedScheduleOutboxEntries,
  reserveScheduleOutboxEntry,
} from "./store.ts";

function request(overrides: Partial<ZohoPostRequest> = {}): ZohoPostRequest {
  return {
    target: { zohoBrandName: "Straw Motion", platform: "facebook", label: "facebook" },
    mediaIds: ["fake-media-1"],
    content: "caption\n\n#AInews",
    scheduledAtLocal: "08/11/2026 15:06",
    ...overrides,
  };
}

describe("reserveScheduleOutboxEntry — insert-or-find, keyed on idempotencyKey", () => {
  it("a fresh key inserts a new 'reserved' row, alreadyReserved: false", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);
      const { record, alreadyReserved } = reserveScheduleOutboxEntry(db, {
        idempotencyKey: "key-1",
        assetId,
        request: request(),
      });
      assert.equal(alreadyReserved, false);
      assert.equal(record.status, "reserved");
      assert.equal(record.idempotencyKey, "key-1");
      assert.equal(record.assetId, assetId);
      assert.equal(record.platform, "facebook");
      assert.deepEqual(record.request, request());
      assert.equal(record.reference, undefined);
    });
  });

  it("a second reserve for the SAME key returns the EXISTING row, alreadyReserved: true — no second row", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);
      const first = reserveScheduleOutboxEntry(db, { idempotencyKey: "key-2", assetId, request: request() });
      const second = reserveScheduleOutboxEntry(db, {
        idempotencyKey: "key-2",
        assetId,
        request: request({ content: "a DIFFERENT caption — must be ignored" }),
      });
      assert.equal(second.alreadyReserved, true);
      assert.equal(second.record.id, first.record.id);
      // The SECOND call's request is ignored — the original reservation's own request is preserved.
      assert.equal(second.record.request.content, "caption\n\n#AInews");

      const count = db.prepare(`SELECT COUNT(*) AS n FROM schedule_outbox WHERE idempotency_key = ?`).get("key-2");
      assert.equal(count?.n, 1);
    });
  });

  it("two DIFFERENT idempotency keys for the SAME asset produce two independent rows", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);
      const a = reserveScheduleOutboxEntry(db, { idempotencyKey: "key-a", assetId, request: request() });
      const b = reserveScheduleOutboxEntry(db, { idempotencyKey: "key-b", assetId, request: request() });
      assert.notEqual(a.record.id, b.record.id);
    });
  });

  it("an unknown assetId is rejected (FOREIGN KEY)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.throws(
        () => reserveScheduleOutboxEntry(db, { idempotencyKey: "key-3", assetId: "does-not-exist", request: request() }),
        /FOREIGN KEY/,
      );
    });
  });
});

describe("confirmScheduleOutboxEntry — atomically moves reserved -> confirmed", () => {
  it("confirms a reserved entry, recording the reference and confirmedAt", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);
      reserveScheduleOutboxEntry(db, { idempotencyKey: "key-4", assetId, request: request() });

      const confirmed = confirmScheduleOutboxEntry(db, "key-4", "zoho-ref-1");
      assert.equal(confirmed?.status, "confirmed");
      assert.equal(confirmed?.reference, "zoho-ref-1");
      assert.ok(confirmed?.confirmedAt);
    });
  });

  it("confirming an ALREADY-confirmed key is a safe no-op — returns the existing record unchanged", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);
      reserveScheduleOutboxEntry(db, { idempotencyKey: "key-5", assetId, request: request() });
      const first = confirmScheduleOutboxEntry(db, "key-5", "zoho-ref-first");
      const second = confirmScheduleOutboxEntry(db, "key-5", "zoho-ref-SHOULD-BE-IGNORED");

      assert.equal(second?.reference, "zoho-ref-first", "a second confirm must not overwrite the first reference");
      assert.equal(second?.confirmedAt, first?.confirmedAt);
    });
  });

  it("confirming an array reference stores it verbatim (string vs array shape preserved)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);
      reserveScheduleOutboxEntry(db, { idempotencyKey: "key-6", assetId, request: request() });
      const confirmed = confirmScheduleOutboxEntry(db, "key-6", ["ref-a", "ref-b"]);
      assert.deepEqual(confirmed?.reference, ["ref-a", "ref-b"]);
    });
  });

  it("confirming an unknown key returns null", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.equal(confirmScheduleOutboxEntry(db, "no-such-key", "ref"), null);
    });
  });
});

describe("getScheduleOutboxEntry / listReservedScheduleOutboxEntries", () => {
  it("getScheduleOutboxEntry returns null for an unknown key", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.equal(getScheduleOutboxEntry(db, "unknown"), null);
    });
  });

  it("listReservedScheduleOutboxEntries returns only 'reserved' rows, oldest first, never 'confirmed' ones", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);
      const clock = ["2026-08-17T00:00:00.000Z", "2026-08-17T00:00:01.000Z", "2026-08-17T00:00:02.000Z"];
      let i = 0;
      const now = () => clock[i++]!;

      reserveScheduleOutboxEntry(db, { idempotencyKey: "reserved-1", assetId, request: request() }, now);
      reserveScheduleOutboxEntry(db, { idempotencyKey: "reserved-2", assetId, request: request() }, now);
      reserveScheduleOutboxEntry(db, { idempotencyKey: "confirmed-1", assetId, request: request() }, now);
      confirmScheduleOutboxEntry(db, "confirmed-1", "ref");

      const reserved = listReservedScheduleOutboxEntries(db);
      assert.deepEqual(
        reserved.map((r) => r.idempotencyKey),
        ["reserved-1", "reserved-2"],
      );
    });
  });
});
