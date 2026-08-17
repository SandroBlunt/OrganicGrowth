/**
 * Tests for the typed command surface's Gate Request operations (`raiseGateRequest`, `resolveGate`,
 * issue #208).
 *
 * In-process against a real, throwaway SQLite file (`withTempDb`, never `:memory:`).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { seedAsset } from "../db/fixtures/seed-chain.ts";
import { enqueueJob } from "./jobs.ts";
import { getGateRequest, GateRequestNotFoundError } from "../production-queue/gate-request-store.ts";
import { getJob } from "../production-queue/job-store.ts";

import { raiseGateRequest, resolveGate } from "./gates.ts";

const CANDIDATES = [{ index: 1, url: "https://example.com/cast-1.png" }, { index: 2, url: "https://example.com/cast-2.png" }];

describe("raiseGateRequest — the command surface's write over GateRequestStore (issue #208)", () => {
  it("records the gate offer, undecided, readable back through getGateRequest", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const jobId = enqueueJob(db, { assetId, brandId, gate: "cast" });

      const id = raiseGateRequest(db, { jobId, gateName: "cast", candidates: CANDIDATES });

      const record = getGateRequest(db, id);
      assert.ok(record);
      assert.equal(record.gateName, "cast");
      assert.deepEqual(record.candidates, CANDIDATES);
      assert.equal("decidedBy" in record, false);
    });
  });
});

describe("resolveGate — records the Operator's decision and enqueues the resumed leg's job (issue #208)", () => {
  it("decides the gate request and enqueues a NEW queued job for the SAME asset, gate omitted", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const parkedJobId = enqueueJob(db, { assetId, brandId, gate: "cast" });
      const gateRequestId = raiseGateRequest(db, { jobId: parkedJobId, gateName: "cast", candidates: CANDIDATES });

      const outcome = resolveGate(db, gateRequestId, { decidedBy: "operator", choice: "cast-2" });

      const decided = getGateRequest(db, gateRequestId);
      assert.ok(decided);
      assert.equal(decided.decidedBy, "operator");
      assert.equal(decided.choice, "cast-2");

      assert.notEqual(outcome.resumedJobId, parkedJobId);
      const resumedJob = getJob(db, outcome.resumedJobId);
      assert.ok(resumedJob);
      assert.equal(resumedJob.status, "queued");
      assert.equal(resumedJob.assetId, assetId);
      assert.equal("gate" in resumedJob, false, "the resumed leg targets the final render, not another gate");
    });
  });

  it("throws GateRequestNotFoundError for an unknown gateRequestId, before any write", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.throws(
        () => resolveGate(db, "does-not-exist", { decidedBy: "operator", choice: "cast-1" }),
        GateRequestNotFoundError,
      );
    });
  });
});
