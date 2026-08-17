/**
 * `scheduleViaOutbox` / `reconcileScheduleOutbox` — the typed command surface's Schedule Outbox
 * operations (issue #209 — a NEW capability, not one of issue #205's original eight; every write this
 * surface allows still routes only through a store, never a store bypassed).
 *
 * Thin orchestration shells over `src/schedule-outbox/run.ts`. Not wired to any production caller by
 * this ticket — mirrors `src/production-queue/job-store.ts`'s own posture (issue #203): this PROVES the
 * outbox primitive against the schema this ticket ships; the worker (issue #208) is what will actually
 * call it.
 */

import type { DatabaseSync } from "node:sqlite";

import type { ZohoSchedulePort } from "../schedule-batch/mcp-schedule-port.ts";
import {
  reconcileScheduleOutboxEntry,
  runScheduleOutboxEntry,
  type ReconcileScheduleOutboxOutcome,
  type RunScheduleOutboxEntryInput,
  type RunScheduleOutboxOutcome,
} from "../schedule-outbox/run.ts";

export type { ReconcileScheduleOutboxOutcome, RunScheduleOutboxEntryInput, RunScheduleOutboxOutcome };

/**
 * Runs the full Schedule Outbox sequence for one `(idempotencyKey, assetId, request)`: reserve, then
 * decide whether Zoho needs to be called at all (a fresh reservation calls it directly; a resumed one
 * reconciles first), then confirm. See `src/schedule-outbox/run.ts`'s own doc comment for the full
 * crash-safety argument.
 */
export function scheduleViaOutbox(
  db: DatabaseSync,
  input: RunScheduleOutboxEntryInput,
  port: ZohoSchedulePort,
  now: () => string = () => new Date().toISOString(),
): Promise<RunScheduleOutboxOutcome> {
  return runScheduleOutboxEntry(db, input, port, now);
}

/**
 * Reconciles ONE `idempotencyKey` against Zoho, READ-ONLY toward Zoho — never calls `createSchedule`.
 * What a worker restart sweep calls over every `'reserved'`-but-unconfirmed entry
 * (`src/schedule-outbox/store.ts`'s `listReservedScheduleOutboxEntries`).
 */
export function reconcileScheduleOutbox(
  db: DatabaseSync,
  idempotencyKey: string,
  port: ZohoSchedulePort,
  now: () => string = () => new Date().toISOString(),
): Promise<ReconcileScheduleOutboxOutcome> {
  return reconcileScheduleOutboxEntry(db, idempotencyKey, port, now);
}
