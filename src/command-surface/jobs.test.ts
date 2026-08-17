/**
 * Tests for the typed command surface's job operations (`enqueueJob`, `claimJob`, `releaseJob`, issue
 * #205 AC1/AC3).
 *
 * In-process against a real, throwaway SQLite file (`withTempDb`, never `:memory:`).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { seedAsset } from "../db/fixtures/seed-chain.ts";
import { getJob } from "../production-queue/job-store.ts";

import { enqueueJob, claimJob, releaseJob } from "./jobs.ts";

describe("enqueueJob — the command surface's write over JobStore (issue #205)", () => {
  it("inserts a job at status: 'queued', attempt: 0, readable back through getJob", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);

      const id = enqueueJob(db, { assetId, brandId, gate: "cast" });

      const job = getJob(db, id);
      assert.ok(job);
      assert.equal(job.status, "queued");
      assert.equal(job.attempt, 0);
      assert.equal(job.gate, "cast");
    });
  });
});

describe("claimJob — the command surface's atomic claim (issue #205)", () => {
  it("claims a queued job, moving it to 'running' with an owner and a lease", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const id = enqueueJob(db, { assetId, brandId });

      const claimed = claimJob(db, id, "worker-1", 60_000);

      assert.ok(claimed);
      assert.equal(claimed.status, "running");
      assert.equal(claimed.lockedBy, "worker-1");
    });
  });

  it("returns null for a job already claimed by a live lease", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const id = enqueueJob(db, { assetId, brandId });

      claimJob(db, id, "worker-1", 60_000);
      const secondAttempt = claimJob(db, id, "worker-2", 60_000);

      assert.equal(secondAttempt, null);
    });
  });
});

describe("releaseJob — the command surface's claim-release (issue #205)", () => {
  it("moves a running job to done, clearing its claim", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const id = enqueueJob(db, { assetId, brandId });
      claimJob(db, id, "worker-1", 60_000);

      const released = releaseJob(db, id, "done");

      assert.ok(released);
      assert.equal(released.status, "done");
      assert.equal("lockedBy" in released, false);
    });
  });

  it("returns null when releasing a job that is not currently running", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const id = enqueueJob(db, { assetId, brandId });

      const released = releaseJob(db, id, "done");

      assert.equal(released, null);
    });
  });
});
