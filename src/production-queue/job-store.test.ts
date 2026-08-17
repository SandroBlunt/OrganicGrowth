/**
 * Tests for JobStore (`src/production-queue/job-store.ts`) — issue #203.
 *
 * `{ db }`-only, genuinely new (mirrors `src/idea/store.test.ts`'s own shape). Every test opens a real,
 * throwaway SQLite file via `withTempDb` — never `:memory:`. The GENUINELY CONCURRENT proofs (two
 * concurrent claims yield exactly one winner; an expired lease is reclaimable; a lost update is
 * impossible) live in the sibling `claim-concurrency.test.ts` — this file covers the store's ordinary,
 * single-caller behaviour.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { seedAsset, FIXTURE_RECIPE as RECIPE } from "../db/fixtures/seed-chain.ts";
import {
  createJob,
  getJob,
  listJobsForComposite,
  claimJob,
  releaseJob,
  requeueJob,
  findNextQueuedJob,
  listAllJobs,
  type JobRecord,
} from "./job-store.ts";

describe("createJob / getJob", () => {
  it("inserts a job at status: 'queued', attempt: 0, with no lock held", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const id = createJob(db, { assetId, brandId, gate: "cast" });
      const job = getJob(db, id) as JobRecord;
      assert.equal(job.status, "queued");
      assert.equal(job.attempt, 0);
      assert.equal(job.gate, "cast");
      assert.equal(job.assetId, assetId);
      assert.equal(job.brandId, brandId);
      assert.equal("lockedBy" in job, false);
      assert.equal("lockedUntil" in job, false);
      assert.equal("startedAt" in job, false);
    });
  });

  it("a gateless job omits the gate field", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const id = createJob(db, { assetId, brandId });
      const job = getJob(db, id) as JobRecord;
      assert.equal("gate" in job, false);
    });
  });

  it("getJob returns null for an unknown id — never throws", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.equal(getJob(db, "does-not-exist"), null);
    });
  });

  it("throws a FOREIGN KEY error for an unknown assetId", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId } = await seedAsset(db);
      assert.throws(() => createJob(db, { assetId: "does-not-exist", brandId }), /FOREIGN KEY/);
    });
  });
});

describe("listJobsForComposite — a NON-UNIQUE (brand, idea, recipe) lookup (issue #203 AC1)", () => {
  it("returns every job sharing one composite, oldest first", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, ideaId, assetId } = await seedAsset(db);
      const first = createJob(db, { assetId, brandId, gate: "cast" }, () => "2026-06-05T10:00:00.000Z");
      const second = createJob(db, { assetId, brandId }, () => "2026-06-05T11:00:00.000Z");
      const jobs = listJobsForComposite(db, brandId, ideaId, RECIPE);
      assert.deepEqual(jobs.map((j) => j.id), [first, second]);
    });
  });

  it("returns [] for a composite with no jobs — never throws", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, ideaId } = await seedAsset(db);
      assert.deepEqual(listJobsForComposite(db, brandId, ideaId, RECIPE), []);
    });
  });

  it("is scoped to the named Brand — a different brandId on the SAME asset row matches nothing", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, ideaId, assetId } = await seedAsset(db);
      createJob(db, { assetId, brandId });
      assert.deepEqual(listJobsForComposite(db, "some-other-brand-id", ideaId, RECIPE), []);
    });
  });
});

describe("claimJob — atomic claim-with-owner-and-expiry", () => {
  it("claims a queued job: status becomes running, owner + lease are set, attempt increments", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const id = createJob(db, { assetId, brandId });
      const claimed = claimJob(db, id, "worker-1", 30000, () => "2026-06-05T10:00:00.000Z");
      assert.notEqual(claimed, null);
      assert.equal(claimed!.status, "running");
      assert.equal(claimed!.lockedBy, "worker-1");
      assert.equal(claimed!.lockedUntil, "2026-06-05T10:00:30.000Z");
      assert.equal(claimed!.attempt, 1);
      assert.equal(claimed!.startedAt, "2026-06-05T10:00:00.000Z");
    });
  });

  it("a second claim of the SAME queued job (sequential) fails once the first has landed", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const id = createJob(db, { assetId, brandId });
      const first = claimJob(db, id, "worker-1", 30000);
      const second = claimJob(db, id, "worker-2", 30000);
      assert.notEqual(first, null);
      assert.equal(second, null, "the job is no longer queued, so a second claim finds nothing eligible");
    });
  });

  it("returns null for an unknown job id", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.equal(claimJob(db, "does-not-exist", "worker-1", 30000), null);
    });
  });

  it("returns null for a job already terminal (done/failed)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const id = createJob(db, { assetId, brandId });
      claimJob(db, id, "worker-1", 30000);
      releaseJob(db, id, "done");
      assert.equal(claimJob(db, id, "worker-2", 30000), null);
    });
  });

  it("startedAt is stamped only on the FIRST claim — a later re-claim keeps it (COALESCE)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const id = createJob(db, { assetId, brandId });
      claimJob(db, id, "worker-1", 1, () => "2026-06-05T10:00:00.000Z"); // 1ms lease — expires almost instantly
      const reclaimed = claimJob(db, id, "worker-2", 30000, () => "2026-06-05T10:05:00.000Z");
      assert.notEqual(reclaimed, null);
      assert.equal(reclaimed!.startedAt, "2026-06-05T10:00:00.000Z", "the original start time survives a re-claim");
      assert.equal(reclaimed!.attempt, 2, "attempt increments on every successful claim, including a re-claim");
    });
  });

  it("an expired lease makes a running job claimable again (issue #203 AC — deterministic, injected clock)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const id = createJob(db, { assetId, brandId });
      const firstClaim = claimJob(db, id, "worker-crashed", 1000, () => "2026-06-05T10:00:00.000Z");
      assert.notEqual(firstClaim, null);
      assert.equal(firstClaim!.lockedUntil, "2026-06-05T10:00:01.000Z");

      // Before the lease expires, a second claim finds nothing eligible.
      const tooSoon = claimJob(db, id, "worker-2", 30000, () => "2026-06-05T10:00:00.500Z");
      assert.equal(tooSoon, null, "a live lease is not yet claimable");

      // Once the lease has expired, the SAME job becomes claimable again by a DIFFERENT owner.
      const afterExpiry = claimJob(db, id, "worker-2", 30000, () => "2026-06-05T10:00:02.000Z");
      assert.notEqual(afterExpiry, null, "a crashed worker's job must not stay stuck");
      assert.equal(afterExpiry!.lockedBy, "worker-2");
      assert.equal(afterExpiry!.status, "running");
    });
  });
});

describe("releaseJob — ends a claim, atomically", () => {
  it("moves a running job to done, clearing the claim", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const id = createJob(db, { assetId, brandId });
      claimJob(db, id, "worker-1", 30000);
      const released = releaseJob(db, id, "done");
      assert.notEqual(released, null);
      assert.equal(released!.status, "done");
      assert.equal("lockedBy" in released!, false);
      assert.equal("lockedUntil" in released!, false);
    });
  });

  it("moves a running job to awaiting_pick, clearing the claim (the gate does not hold the Space)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const id = createJob(db, { assetId, brandId, gate: "cast" });
      claimJob(db, id, "worker-1", 30000);
      const released = releaseJob(db, id, "awaiting_pick");
      assert.equal(released!.status, "awaiting_pick");
      assert.equal("lockedBy" in released!, false);
    });
  });

  it("moves a running job to failed, clearing the claim", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const id = createJob(db, { assetId, brandId });
      claimJob(db, id, "worker-1", 30000);
      const released = releaseJob(db, id, "failed");
      assert.equal(released!.status, "failed");
    });
  });

  it("returns null when the job is not currently running", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const id = createJob(db, { assetId, brandId });
      // never claimed — still queued
      assert.equal(releaseJob(db, id, "done"), null);
    });
  });

  it("returns null for an unknown job id", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.equal(releaseJob(db, "does-not-exist", "done"), null);
    });
  });
});

describe("requeueJob — revives a failed job (C4's SQL-backed sibling)", () => {
  it("moves a failed job back to queued, with no claim held", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const id = createJob(db, { assetId, brandId });
      claimJob(db, id, "worker-1", 30000);
      releaseJob(db, id, "failed");
      const revived = requeueJob(db, id);
      assert.notEqual(revived, null);
      assert.equal(revived!.status, "queued");
      assert.equal("lockedBy" in revived!, false);
      // the revived job is claimable again
      assert.notEqual(claimJob(db, id, "worker-2", 30000), null);
    });
  });

  it("returns null when the job is not currently failed", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const id = createJob(db, { assetId, brandId });
      assert.equal(requeueJob(db, id), null, "a queued job is not failed");
    });
  });
});

describe("findNextQueuedJob — the FIFO-oldest-queued read the worker's drain loop uses (issue #208)", () => {
  it("returns the queued job with the earliest enqueued_at, never a running/awaiting_pick/done/failed one", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const earlier = createJob(db, { assetId, brandId }, () => "2026-08-17T09:00:00.000Z");
      const later = createJob(db, { assetId, brandId }, () => "2026-08-17T09:05:00.000Z");
      const parked = createJob(db, { assetId, brandId }, () => "2026-08-17T08:00:00.000Z");
      claimJob(db, parked, "worker-1", 30000);
      releaseJob(db, parked, "awaiting_pick");

      const next = findNextQueuedJob(db);
      assert.notEqual(next, null);
      assert.equal(next!.id, earlier);
      assert.notEqual(next!.id, later);
      assert.notEqual(next!.id, parked);
    });
  });

  it("returns null when no job is queued", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const id = createJob(db, { assetId, brandId });
      claimJob(db, id, "worker-1", 30000);
      assert.equal(findNextQueuedJob(db), null);
    });
  });
});

describe("listAllJobs — every Job in the database, across every Brand/Asset (issue #210)", () => {
  it("returns [] for an empty database", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.deepEqual(listAllJobs(db), []);
    });
  });

  it("returns every Job, oldest-enqueued first, regardless of status", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const later = createJob(db, { assetId, brandId }, () => "2026-08-17T09:05:00.000Z");
      const earlier = createJob(db, { assetId, brandId }, () => "2026-08-17T09:00:00.000Z");
      claimJob(db, later, "worker-1", 30000);
      releaseJob(db, later, "failed");

      const all = listAllJobs(db);
      assert.deepEqual(all.map((j) => j.id), [earlier, later]);
      assert.equal(all.find((j) => j.id === later)!.status, "failed");
    });
  });
});
