/**
 * GENUINE crash-recovery proofs for the Schedule Outbox (issue #209) — matching the seriousness bar
 * `src/production-queue/claim-concurrency.test.ts` set for issue #203: a real, separate OS process
 * reserves an idempotency key and (depending on the scenario) really calls the fake Zoho, then exits via
 * `process.exit()` WITHOUT ever confirming — a genuine crash between reserve and confirm, not merely an
 * asserted intermediate state. A SEPARATE call (this file's own process, using its own already-open `db`
 * connection to the SAME file) then re-runs the real `scheduleViaOutbox` (`src/command-surface/
 * schedule-outbox.ts` — the command surface itself, since Round 2 collapsed the separate `run.ts` deep
 * module into it; see that file's own doc comment) and proves neither failure mode occurs: no
 * double-post, and no silently-dropped post.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { seedAsset } from "../db/fixtures/seed-chain.ts";
import type { ZohoPostRequest } from "../schedule-batch/mcp-schedule-port.ts";
import { getScheduleOutboxEntry } from "./store.ts";
import { scheduleViaOutbox } from "../command-surface/schedule-outbox.ts";
import { DbBackedFakeZohoSchedulePort, countFakeZohoSchedules } from "./fixtures/db-backed-fake-zoho.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(HERE, "fixtures", "crash-schedule-worker.ts");

function request(): ZohoPostRequest {
  return {
    target: { zohoBrandName: "Straw Motion", platform: "facebook", label: "facebook" },
    mediaIds: ["fake-media-1"],
    content: "caption\n\n#AInews",
    scheduledAtLocal: "08/11/2026 15:06",
  };
}

/** Spawns ONE real child process running `fixtures/crash-schedule-worker.ts` against `dbPath`, and
 *  resolves once it has exited (its own `process.exit(1)` — a NON-zero exit is the EXPECTED, simulated
 *  crash, not a test failure). */
function spawnCrashWorker(
  dbPath: string,
  idempotencyKey: string,
  assetId: string,
  req: ZohoPostRequest,
  mode: "crash-after-reserve" | "crash-after-create",
): Promise<void> {
  return new Promise((resolveSpawn, reject) => {
    const child = spawn(process.execPath, [
      "--import",
      "tsx",
      WORKER_PATH,
      dbPath,
      idempotencyKey,
      assetId,
      JSON.stringify(req),
      mode,
    ]);
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      // The worker ALWAYS exits 1 (it calls process.exit(1) to simulate a crash) — a DIFFERENT code, or
      // no output at all, means it failed before even reaching the simulated crash point.
      if (code !== 1) {
        reject(new Error(`crash-schedule-worker exited ${String(code)} (expected the simulated crash exit 1): ${stderr}`));
        return;
      }
      resolveSpawn();
    });
  });
}

describe("A crash AFTER Zoho already accepted the schedule, but BEFORE the local confirm write, cannot cause a re-run to double-post (issue #209 AC)", () => {
  it("a real, separate OS process reserves AND calls the real (fake) Zoho, then crashes before confirming; a retry in THIS process reconciles instead of re-posting", async () => {
    await withTempDb(async (db, dbPath) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);
      const req = request();
      const idempotencyKey = `${assetId}:facebook`;

      // The real, separate OS process: reserves, calls Zoho for real (against the file-backed fake —
      // durably visible to any other connection to this SAME file), then crashes WITHOUT confirming.
      await spawnCrashWorker(dbPath, idempotencyKey, assetId, req, "crash-after-create");

      // Pre-condition, verified through THIS process's own already-open connection: the ambiguous state
      // genuinely exists on disk, written by a process that is now dead — Zoho has it, the outbox does
      // not yet know that.
      assert.equal(getScheduleOutboxEntry(db, idempotencyKey)?.status, "reserved");
      assert.equal(countFakeZohoSchedules(db), 1, "the crashed process's real Zoho call must have landed");

      // The retry: the REAL scheduleViaOutbox, run against the SAME file, using a NEW
      // DbBackedFakeZohoSchedulePort instance over THIS process's own db connection (exactly what a
      // restarted worker process would do).
      const port = new DbBackedFakeZohoSchedulePort(db);
      const outcome = await scheduleViaOutbox(db, { idempotencyKey, assetId, request: req }, port);

      assert.equal(outcome.calledCreateSchedule, false, "must NOT call createSchedule again — that would double-post");
      const liveRow = db.prepare(`SELECT reference FROM fake_zoho_schedule`).get() as { readonly reference: string };
      assert.equal(outcome.reference, liveRow.reference, "the confirmed reference must be the CRASHED process's own Zoho reference, discovered by reconciliation");
      assert.equal(countFakeZohoSchedules(db), 1, "still exactly ONE schedule on Zoho — no double-post");
      assert.equal(getScheduleOutboxEntry(db, idempotencyKey)?.status, "confirmed");
      assert.equal(getScheduleOutboxEntry(db, idempotencyKey)?.reference, outcome.reference);
    });
  });
});

describe("A crash BEFORE Zoho was ever called allows a retry to proceed, and schedules exactly once (issue #209 AC)", () => {
  it("a real, separate OS process reserves and crashes before calling Zoho; a retry finds nothing to reconcile and schedules for the first time", async () => {
    await withTempDb(async (db, dbPath) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);
      const req = request();
      const idempotencyKey = `${assetId}:facebook`;

      await spawnCrashWorker(dbPath, idempotencyKey, assetId, req, "crash-after-reserve");

      assert.equal(getScheduleOutboxEntry(db, idempotencyKey)?.status, "reserved");
      assert.equal(countFakeZohoSchedules(db), 0, "Zoho was never actually called by the crashed process");

      const port = new DbBackedFakeZohoSchedulePort(db);
      const outcome = await scheduleViaOutbox(db, { idempotencyKey, assetId, request: req }, port);

      assert.equal(outcome.calledCreateSchedule, true, "reconciliation found nothing — safe (and necessary) to schedule now");
      assert.equal(countFakeZohoSchedules(db), 1, "exactly one schedule now exists — the post was not silently dropped");
      assert.equal(getScheduleOutboxEntry(db, idempotencyKey)?.status, "confirmed");
    });
  });
});
