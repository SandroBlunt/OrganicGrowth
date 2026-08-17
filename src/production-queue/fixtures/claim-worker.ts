/**
 * Concurrency-test fixture — NOT a `*.test.ts` file (excluded from `npm test`'s glob), spawned as its
 * own real OS process by `../claim-concurrency.test.ts`.
 *
 * Opens ITS OWN `DatabaseSync` connection to the SAME on-disk SQLite file a sibling process also has
 * open, spin-waits until a parent-supplied wall-clock instant, then calls the REAL `claimJob` from
 * `../job-store.ts` (never a re-implemented copy of the claim SQL — this proves the shipped code, not a
 * stand-in for it) and prints its result as one line of JSON. Two of these, spawned together and given
 * the SAME target instant, are what makes the parent test's proof GENUINE: `node:sqlite`'s
 * `DatabaseSync` calls are synchronous, so two calls inside ONE process can never actually overlap —
 * only two separate OS processes, each blocking on its own thread, can race for real.
 *
 * argv: [dbPath, jobId, ownerId, leaseMs, startAtEpochMs]
 */

import { openDatabase } from "../../db/connection.ts";
import { claimJob } from "../job-store.ts";

async function main(): Promise<void> {
  const [dbPath, jobId, ownerId, leaseMsRaw, startAtRaw] = process.argv.slice(2);
  if (dbPath === undefined || jobId === undefined || ownerId === undefined || leaseMsRaw === undefined || startAtRaw === undefined) {
    throw new Error("usage: claim-worker.ts <dbPath> <jobId> <ownerId> <leaseMs> <startAtEpochMs>");
  }
  const leaseMs = Number(leaseMsRaw);
  const startAt = Number(startAtRaw);

  const db = await openDatabase(dbPath);
  try {
    // Spin-wait (not setTimeout — this must block the event loop) until the target instant, so both
    // sibling processes attempt their claim as close to simultaneously as the OS will allow.
    while (Date.now() < startAt) {
      /* busy-wait */
    }
    const claimed = claimJob(db, jobId, ownerId, leaseMs);
    process.stdout.write(JSON.stringify({ owner: ownerId, claimedJobId: claimed ? claimed.id : null }) + "\n");
  } finally {
    db.close();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(String(err) + "\n");
  process.exitCode = 1;
});
