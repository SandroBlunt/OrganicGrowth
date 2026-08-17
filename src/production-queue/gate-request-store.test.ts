/**
 * Tests for GateRequestStore (`src/production-queue/gate-request-store.ts`) — issue #203.
 *
 * `{ db }`-only. Every test opens a real, throwaway SQLite file via `withTempDb` — never `:memory:`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { DatabaseSync } from "node:sqlite";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { seedAsset } from "./fixtures/seed-job.ts";
import { createJob } from "./job-store.ts";
import {
  createGateRequest,
  getGateRequest,
  listGateRequestsForJob,
  recordGateDecision,
  GateRequestNotFoundError,
  type GateRequestRecord,
} from "./gate-request-store.ts";

/** Seeds brand -> format -> run -> idea -> asset -> job, returning the job id a gate request needs. */
async function seedJob(db: DatabaseSync): Promise<string> {
  const { brandId, assetId } = await seedAsset(db);
  return createJob(db, { assetId, brandId, gate: "cast" });
}

const CANDIDATES = [{ index: 1, url: "https://example.com/cast-1.png" }, { index: 2, url: "https://example.com/cast-2.png" }];

describe("createGateRequest / getGateRequest", () => {
  it("records the gate's name and candidates, undecided", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const jobId = await seedJob(db);
      const id = createGateRequest(db, { jobId, gateName: "cast", candidates: CANDIDATES });
      const record = getGateRequest(db, id) as GateRequestRecord;
      assert.equal(record.jobId, jobId);
      assert.equal(record.gateName, "cast");
      assert.deepEqual(record.candidates, CANDIDATES);
      assert.equal("decidedBy" in record, false);
      assert.equal("decidedAt" in record, false);
      assert.equal("choice" in record, false);
    });
  });

  it("getGateRequest returns null for an unknown id — never throws", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.equal(getGateRequest(db, "does-not-exist"), null);
    });
  });

  it("throws a FOREIGN KEY error for an unknown jobId", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.throws(() => createGateRequest(db, { jobId: "does-not-exist", gateName: "cast", candidates: [] }), /FOREIGN KEY/);
    });
  });
});

describe("listGateRequestsForJob", () => {
  it("returns every gate request for a job, oldest first", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const jobId = await seedJob(db);
      const first = createGateRequest(db, { jobId, gateName: "cast", candidates: CANDIDATES }, () => "2026-06-05T10:00:00.000Z");
      const second = createGateRequest(db, { jobId, gateName: "cast", candidates: CANDIDATES }, () => "2026-06-05T11:00:00.000Z");
      const rows = listGateRequestsForJob(db, jobId);
      assert.deepEqual(rows.map((r) => r.id), [first, second]);
    });
  });

  it("returns [] for a job with no gate requests yet", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const jobId = await seedJob(db);
      assert.deepEqual(listGateRequestsForJob(db, jobId), []);
    });
  });
});

describe("recordGateDecision — who decided, when, and the choice", () => {
  it("records decidedBy, a fresh decidedAt, and the choice onto an undecided gate request", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const jobId = await seedJob(db);
      const id = createGateRequest(db, { jobId, gateName: "cast", candidates: CANDIDATES });
      recordGateDecision(db, id, { decidedBy: "operator", choice: "cast-2" }, () => "2026-06-05T12:00:00.000Z");
      const record = getGateRequest(db, id) as GateRequestRecord;
      assert.equal(record.decidedBy, "operator");
      assert.equal(record.decidedAt, "2026-06-05T12:00:00.000Z");
      assert.equal(record.choice, "cast-2");
    });
  });

  it("a re-decision overwrites the prior fields rather than appending a second row", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const jobId = await seedJob(db);
      const id = createGateRequest(db, { jobId, gateName: "cast", candidates: CANDIDATES });
      recordGateDecision(db, id, { decidedBy: "operator", choice: "cast-1" }, () => "2026-06-05T12:00:00.000Z");
      recordGateDecision(db, id, { decidedBy: "operator", choice: "cast-2" }, () => "2026-06-05T12:05:00.000Z");
      const record = getGateRequest(db, id) as GateRequestRecord;
      assert.equal(record.choice, "cast-2");
      assert.equal(record.decidedAt, "2026-06-05T12:05:00.000Z");
      assert.equal(listGateRequestsForJob(db, jobId).length, 1, "no second row was appended");
    });
  });

  it("throws GateRequestNotFoundError for an unknown gateRequestId, before any write", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.throws(
        () => recordGateDecision(db, "does-not-exist", { decidedBy: "operator", choice: "cast-1" }),
        GateRequestNotFoundError,
      );
    });
  });
});
