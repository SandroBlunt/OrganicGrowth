/**
 * A REAL-file-backed (never in-memory) fake `ZohoSchedulePort` — the fixture that makes the crash
 * simulation in `../crash-recovery.test.ts` genuine (issue #209).
 *
 * Distinct from `src/schedule-batch/fixtures/fake-zoho-schedule-port.ts` (the in-process, in-memory
 * ZOHO MCP FAKE every other test in this codebase uses): that fake's state lives in a JS object inside
 * ONE process's memory, which cannot be shared with a genuinely separate OS process — and a crash
 * simulation that never actually spawns a separate process, and never actually crashes it mid-flight,
 * proves nothing (mirrors `src/production-queue/fixtures/claim-worker.ts`'s own reasoning for issue
 * #203). This fixture instead persists every "Zoho" schedule into its OWN ad-hoc SQLite table
 * (`fake_zoho_schedule`, NOT one of `src/db/schema.ts`'s real migrations — created here, on first use, via
 * `CREATE TABLE IF NOT EXISTS`) inside the SAME on-disk database file the Schedule Outbox itself uses —
 * exactly the same "share the real file across real processes" trick `claim-worker.ts`/
 * `claim-concurrency.test.ts` already proved out. This is what lets a crashed child process's own Zoho
 * call remain visible to a later, separate rescue process: the fake stands in for a real external
 * service, which is by nature durable and independent of any one of our own processes.
 */

import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import type {
  ZohoCreateScheduleResult,
  ZohoPostRequest,
  ZohoScheduleRecord,
  ZohoScheduleTarget,
  ZohoSchedulePort,
  ZohoUploadedMedia,
  ZohoValidateResult,
} from "../../schedule-batch/mcp-schedule-port.ts";

function ensureTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fake_zoho_schedule (
      id TEXT PRIMARY KEY,
      zoho_brand_name TEXT NOT NULL,
      platform TEXT NOT NULL,
      label TEXT NOT NULL,
      content TEXT NOT NULL,
      scheduled_at_local TEXT NOT NULL,
      reference TEXT NOT NULL
    );
  `);
}

/** A `ZohoSchedulePort` backed by a real on-disk SQLite table, shared across however many separate
 *  processes open their own connection to the SAME database file. `uploadMediaFromUrl`/`validatePost`
 *  are trivial always-ok stand-ins (the crash scenario this fixture exists for is specifically about
 *  `createSchedule`, the one non-idempotent, actually-posts-something call). */
export class DbBackedFakeZohoSchedulePort implements ZohoSchedulePort {
  constructor(private readonly db: DatabaseSync) {
    ensureTable(db);
  }

  async uploadMediaFromUrl(_url: string): Promise<ZohoUploadedMedia> {
    return { mediaId: `fake-media-${randomUUID()}` };
  }

  async validatePost(_request: ZohoPostRequest): Promise<ZohoValidateResult> {
    return { ok: true };
  }

  async createSchedule(request: ZohoPostRequest): Promise<ZohoCreateScheduleResult> {
    const reference = `fake-live-ref-${randomUUID()}`;
    this.db
      .prepare(
        `INSERT INTO fake_zoho_schedule (id, zoho_brand_name, platform, label, content, scheduled_at_local, reference)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), request.target.zohoBrandName, request.target.platform, request.target.label, request.content, request.scheduledAtLocal, reference);
    return { reference };
  }

  async listSchedules(target: ZohoScheduleTarget): Promise<readonly ZohoScheduleRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT content, scheduled_at_local, reference FROM fake_zoho_schedule
         WHERE zoho_brand_name = ? AND platform = ? AND label = ?`,
      )
      .all(target.zohoBrandName, target.platform, target.label) as unknown as {
      readonly content: string;
      readonly scheduled_at_local: string;
      readonly reference: string;
    }[];
    return rows.map((row) => ({ content: row.content, scheduledAtLocal: row.scheduled_at_local, reference: row.reference }));
  }
}

/** Every row currently in the fake's own backing table, for a test's own direct verification (bypassing
 *  the port's `target`-filtered `listSchedules` when a test wants the true, unfiltered count). */
export function countFakeZohoSchedules(db: DatabaseSync): number {
  ensureTable(db);
  const row = db.prepare(`SELECT COUNT(*) AS n FROM fake_zoho_schedule`).get() as { readonly n: number };
  return row.n;
}
