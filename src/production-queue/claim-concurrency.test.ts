/**
 * GENUINELY concurrent proofs for `job-store.ts`'s atomic `claimJob` — issue #203.
 *
 * There is no prior art for these in the repo (stated in the issue itself): the file-based Production
 * Queue's single-process, single-connection model could never express a real race. `node:sqlite`'s
 * `DatabaseSync` calls are SYNCHRONOUS, so two calls made back-to-back inside ONE Node process — even
 * via `Promise.all` over two `async` functions — can never actually overlap; the second one only ever
 * starts once the first has fully returned. A test built that way would pass even against a completely
 * broken (non-atomic) claim implementation, proving nothing.
 *
 * These tests instead spawn TWO REAL, SEPARATE OS processes (`fixtures/claim-worker.ts`, via
 * `node:child_process`), each opening its OWN `DatabaseSync` connection to the SAME on-disk SQLite
 * file, synchronized to attempt their claim at (as near as the OS allows) the SAME wall-clock instant.
 * That is what makes the proof genuine: SQLite's own writer-serialization (one write transaction holds
 * the file's write lock; `PRAGMA busy_timeout`, `connection.ts`, makes the loser WAIT for it rather than
 * error) is the ONLY thing standing between "exactly one winner" and "both processes see the row as
 * eligible and both win" — a property no single-process test can exercise. The setup/verification `db`
 * connection this file opens itself stays open THE WHOLE TIME alongside the two racing child
 * connections — SQLite supports several independent connections to one file — so there is never a
 * double-close, and the post-race verification reads through the SAME already-open handle.
 *
 * This was verified by BREAKING the atomicity locally (temporarily swapping `job-store.ts`'s single
 * atomic `UPDATE ... WHERE ... RETURNING` for a naive read-then-write: `SELECT` the row, wait briefly,
 * THEN `UPDATE` it unconditionally — the exact shape of the old `data/queue.json`
 * read-whole-file-then-write-whole-file bug this ticket exists to fix) and confirming
 * "exactly one winner" and "a lost update is impossible" both went RED (two winners; a written job
 * silently reverted), before restoring the real implementation. See this ticket's Build Report for the
 * measured before/after.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { seedAsset } from "./fixtures/seed-job.ts";
import { createJob, getJob } from "./job-store.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(HERE, "fixtures", "claim-worker.ts");

/** How far in the future (ms) both sibling processes are told to synchronize their attempt — generous
 *  enough that `node --import tsx` has always finished starting up on this machine (~150ms observed)
 *  well before the target instant, so neither process is late to the race. */
const SYNC_HORIZON_MS = 600;

interface WorkerResult {
  readonly owner: string;
  readonly claimedJobId: string | null;
}

/** Spawns ONE real child process running `fixtures/claim-worker.ts` against `dbPath`, targeting
 *  `startAt` (an epoch-ms instant), and resolves with its parsed one-line JSON result. */
function spawnClaimWorker(dbPath: string, jobId: string, owner: string, leaseMs: number, startAt: number): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", WORKER_PATH, dbPath, jobId, owner, String(leaseMs), String(startAt)]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`claim-worker for owner="${owner}" exited ${code}: ${stderr}`));
        return;
      }
      const line = stdout.trim().split("\n").pop() ?? "";
      try {
        resolve(JSON.parse(line) as WorkerResult);
      } catch {
        reject(new Error(`claim-worker for owner="${owner}" produced unparseable output: ${JSON.stringify(stdout)}`));
      }
    });
  });
}

describe("Two concurrent claims against ONE queued job yield exactly one winner (issue #203 AC)", () => {
  it("spawns two real OS processes racing the SAME job; exactly one claims it", async () => {
    await withTempDb(async (db, dbPath) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const jobId = createJob(db, { assetId, brandId });

      const startAt = Date.now() + SYNC_HORIZON_MS;
      const [a, b] = await Promise.all([
        spawnClaimWorker(dbPath, jobId, "worker-A", 30000, startAt),
        spawnClaimWorker(dbPath, jobId, "worker-B", 30000, startAt),
      ]);

      const winners = [a, b].filter((r) => r.claimedJobId === jobId);
      const losers = [a, b].filter((r) => r.claimedJobId === null);
      assert.equal(winners.length, 1, `expected exactly one winner, got: ${JSON.stringify([a, b])}`);
      assert.equal(losers.length, 1, `expected exactly one loser, got: ${JSON.stringify([a, b])}`);

      // The database's own final state agrees: the job is running, owned by the winner alone.
      const job = getJob(db, jobId)!;
      assert.equal(job.status, "running");
      assert.equal(job.lockedBy, winners[0]!.owner);
      assert.equal(job.attempt, 1, "only ONE claim actually landed — the loser's write never happened");
    });
  });
});

describe("A lost update is impossible: two concurrent writers cannot silently discard each other's work (issue #203 AC)", () => {
  it("spawns two real OS processes racing on TWO DIFFERENT queued jobs; BOTH writes survive", async () => {
    await withTempDb(async (db, dbPath) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const jobOne = createJob(db, { assetId, brandId });
      const jobTwo = createJob(db, { assetId, brandId });

      const startAt = Date.now() + SYNC_HORIZON_MS;
      const [a, b] = await Promise.all([
        spawnClaimWorker(dbPath, jobOne, "worker-A", 30000, startAt),
        spawnClaimWorker(dbPath, jobTwo, "worker-B", 30000, startAt),
      ]);

      // The old read-whole-file -> mutate -> write-whole-file bug this ticket fixes would let the LATER
      // writer's full-object write silently overwrite the EARLIER writer's — here, that would show up
      // as one of the two jobs never actually ending up claimed, even though its own worker reported
      // success. Prove neither write was lost: both workers report their OWN success...
      assert.equal(a.claimedJobId, jobOne);
      assert.equal(b.claimedJobId, jobTwo);

      // ...AND the database's own final state agrees for BOTH rows, independently.
      const one = getJob(db, jobOne)!;
      const two = getJob(db, jobTwo)!;
      assert.equal(one.status, "running");
      assert.equal(one.lockedBy, "worker-A");
      assert.equal(two.status, "running");
      assert.equal(two.lockedBy, "worker-B", "worker-B's claim of jobTwo must not have been discarded by worker-A's concurrent write");
    });
  });
});

describe("An expired lock makes its job claimable again, so a crashed worker's job does not stay stuck (issue #203 AC)", () => {
  it("a real process claims a job with a short lease and exits without releasing it (a simulated crash); a second real process later claims the SAME job", async () => {
    await withTempDb(async (db, dbPath) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const jobId = createJob(db, { assetId, brandId });

      // worker-crashed claims with a lease that expires almost immediately, then the process just exits
      // (no releaseJob call) — exactly what a crashed worker looks like from the database's point of
      // view: a `running` row whose lease quietly runs out.
      const crashResult = await spawnClaimWorker(dbPath, jobId, "worker-crashed", 50, Date.now() + 200);
      assert.equal(crashResult.claimedJobId, jobId, "the first (later-crashed) worker must have actually claimed it");

      // A SEPARATE real process, well after the 50ms lease has expired, claims the SAME job.
      const rescueResult = await spawnClaimWorker(dbPath, jobId, "worker-rescue", 30000, Date.now() + 300);
      assert.equal(rescueResult.claimedJobId, jobId, "the crashed worker's job must not stay stuck forever");
      assert.equal(rescueResult.owner, "worker-rescue");

      const job = getJob(db, jobId)!;
      assert.equal(job.status, "running");
      assert.equal(job.lockedBy, "worker-rescue");
      assert.equal(job.attempt, 2, "the rescue is a SECOND successful claim on top of the crashed first one");
    });
  });
});
