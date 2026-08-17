/**
 * Reconciliation matching — the PURE deep module behind the Schedule Outbox's "ask Zoho, don't guess"
 * recovery path (issue #209).
 *
 * After a crash, this system genuinely does not know whether Zoho accepted a `createSchedule` call: a
 * `'reserved'`-but-not-yet-`'confirmed'` entry is ambiguous by construction. "Assume it failed and
 * retry" would double-post if Zoho DID accept it; "assume it succeeded" would silently drop the post if
 * Zoho did NOT. This module resolves that by matching Zoho's own reported schedules
 * (`ZohoSchedulePort.listSchedules`) against the exact `ZohoPostRequest` this system itself generated —
 * identity by content, never by timing or inference (always-rules #5, mirroring
 * `src/schedule-batch/confirmed-live.ts`'s own `referencesMatch` posture for a related, but distinct,
 * reconciliation).
 *
 * No I/O here — `listSchedules` is called by `src/schedule-outbox/run.ts`'s orchestration; this module
 * only decides, given the results, whether one of them IS the request in question.
 */

import type { ZohoPostRequest, ZohoScheduleRecord } from "../schedule-batch/mcp-schedule-port.ts";

/**
 * True when `existing` (one of Zoho's own currently-reported schedules) IS the post `request` describes
 * — matched on the exact post content and the exact local schedule time, the two values THIS system
 * itself generated and would have sent. Never matched on Zoho's own reference (that is what we are
 * trying to DISCOVER) and never on "the only one returned" (a Channel can legitimately hold more than
 * one schedule at once).
 */
export function matchesRequest(existing: ZohoScheduleRecord, request: ZohoPostRequest): boolean {
  return existing.content === request.content && existing.scheduledAtLocal === request.scheduledAtLocal;
}

/**
 * Given every schedule Zoho currently reports for `request`'s own target, find the one (if any) that
 * IS `request` — PURE. Returns `null` when none match (Zoho genuinely never received this request, so a
 * fresh `createSchedule` call is safe), or the first match (there should only ever be one — this system
 * never issues the SAME content+time twice for one target under normal operation).
 */
export function findMatchingSchedule(
  existing: readonly ZohoScheduleRecord[],
  request: ZohoPostRequest,
): ZohoScheduleRecord | null {
  return existing.find((entry) => matchesRequest(entry, request)) ?? null;
}
