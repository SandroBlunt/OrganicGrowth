/**
 * Crash-simulation fixture — NOT a `*.test.ts` file (excluded from `npm test`'s glob), spawned as its
 * own real OS process by `../crash-recovery.test.ts` (issue #209). Mirrors
 * `src/production-queue/fixtures/claim-worker.ts`'s own real-process-crash pattern exactly.
 *
 * Opens ITS OWN `DatabaseSync` connection to the SAME on-disk SQLite file the parent test also has open,
 * calls the REAL `reserveScheduleOutboxEntry` (never a re-implemented copy), and then — depending on
 * `mode` — either exits immediately, or first calls the REAL `DbBackedFakeZohoSchedulePort.createSchedule`
 * (which durably writes "Zoho accepted this" to the SAME shared file) and THEN exits. Either way this
 * process calls `process.exit()` directly, WITHOUT ever calling `confirmScheduleOutboxEntry` — exactly
 * what a crash between reserve and confirm looks like from the database's point of view. Every write
 * already made before `process.exit()` is already durably committed (each `db.prepare().run()` call
 * auto-commits outside an explicit transaction) — not closing the connection cleanly does not lose it.
 *
 * argv: [dbPath, idempotencyKey, assetId, requestJson, mode]
 *   mode = "crash-after-reserve" -> exits right after reserving, BEFORE ever calling Zoho.
 *   mode = "crash-after-create"  -> ALSO calls Zoho's createSchedule for real (against the fake) before
 *                                    exiting — the dangerous case: Zoho DID accept it, but the local
 *                                    confirm write never happens.
 */

import { openDatabase } from "../../db/connection.ts";
import { reserveScheduleOutboxEntry } from "../store.ts";
import { DbBackedFakeZohoSchedulePort } from "./db-backed-fake-zoho.ts";
import type { ZohoPostRequest } from "../../schedule-batch/mcp-schedule-port.ts";

type Mode = "crash-after-reserve" | "crash-after-create";

async function main(): Promise<void> {
  const [dbPath, idempotencyKey, assetId, requestJson, modeRaw] = process.argv.slice(2);
  if (dbPath === undefined || idempotencyKey === undefined || assetId === undefined || requestJson === undefined || modeRaw === undefined) {
    throw new Error("usage: crash-schedule-worker.ts <dbPath> <idempotencyKey> <assetId> <requestJson> <mode>");
  }
  const mode = modeRaw as Mode;
  const request = JSON.parse(requestJson) as ZohoPostRequest;

  const db = await openDatabase(dbPath);
  const { record } = reserveScheduleOutboxEntry(db, { idempotencyKey, assetId, request });

  if (mode === "crash-after-create") {
    const port = new DbBackedFakeZohoSchedulePort(db);
    await port.createSchedule(record.request);
  }

  // Simulate the crash: exit right here, WITHOUT calling confirmScheduleOutboxEntry and WITHOUT closing
  // the connection cleanly — a real crash affords neither.
  process.stdout.write(JSON.stringify({ mode }) + "\n");
  process.exit(1);
}

main().catch((err: unknown) => {
  process.stderr.write(String(err) + "\n");
  process.exitCode = 1;
});
