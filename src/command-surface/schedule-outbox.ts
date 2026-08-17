/**
 * `scheduleViaOutbox` / `reconcileScheduleOutbox` — the typed command surface's Schedule Outbox
 * operations (issue #209 — a NEW capability, not one of issue #205's original eight). Reverses
 * Zoho scheduling's "call, then write" order into reserve the idempotency key, call Zoho, confirm —
 * the crash-between-the-two failure mode of the old order is a public double-post.
 *
 * Composes `src/schedule-outbox/store.ts` (the SQL primitives — `reserveScheduleOutboxEntry`,
 * `confirmScheduleOutboxEntry`, `getScheduleOutboxEntry`) and `src/schedule-outbox/reconcile.ts` (the
 * PURE matching logic, `findMatchingSchedule`) directly, mirroring `ideas.ts`'s own
 * `recordReviewDecision`: a command-surface function composing more than one store call behind real
 * branching logic is an established shape here — "thin" means "no store bypassed, no business logic
 * DUPLICATED from what a store already implements", not "no logic of any kind". (Round 1 of this ticket
 * shipped a separate `src/schedule-outbox/run.ts` deep module calling the store directly, underneath
 * this surface — a three-layer shape with no precedent anywhere else in this codebase, and never
 * registered against the store-write boundary guard, issue #233. Round 2 collapses it into this file,
 * the SAME shape every other command-surface module already uses, so the guard's existing
 * `STORE_WRITE_FUNCTIONS`/`isCommandSurfacePath` machinery covers it by construction — see this
 * capability's own `store-write-boundary/scan.ts` entry.)
 *
 * Two entry points:
 *
 *   - `reconcileScheduleOutbox` — READ-ONLY toward Zoho (never calls `createSchedule`): given an
 *     idempotency key, asks Zoho what it already knows and confirms locally if a match is found. This is
 *     the operation a worker restart sweep (`listReservedScheduleOutboxEntries`) would call over every
 *     dangling `'reserved'` row.
 *   - `scheduleViaOutbox` — the full attempt: reserve, and only THEN decide whether Zoho needs to be
 *     called at all.
 *
 * **The crash-safety argument.** A BRAND NEW reservation (`alreadyReserved: false`) has, by construction,
 * never been attempted before — nothing could have reached Zoho yet, so `scheduleViaOutbox` goes
 * straight to `createSchedule`. An ALREADY-RESERVED entry (`alreadyReserved: true`) means this exact
 * idempotency key was reserved by SOME earlier call that never reached its own confirm — which is
 * PRECISELY the ambiguous state a crash between reserve and confirm leaves behind (it is
 * indistinguishable, from here, from a merely-slow concurrent retry). Rather than guessing,
 * `scheduleViaOutbox` reconciles FIRST: it asks Zoho (`reconcileScheduleOutbox`) whether the post already
 * exists, and only calls `createSchedule` when Zoho confirms it does not. A genuinely already-
 * `'confirmed'` key short-circuits immediately, calling Zoho zero times.
 *
 * Not wired to any production caller by this ticket — mirrors `src/production-queue/job-store.ts`'s own
 * posture (issue #203): this PROVES the outbox primitive against the schema this ticket ships; the
 * worker (issue #208) is what will actually call it.
 */

import type { DatabaseSync } from "node:sqlite";

import type { ZohoScheduleReference } from "../asset/asset.ts";
import type { ZohoSchedulePort } from "../schedule-batch/mcp-schedule-port.ts";
import {
  confirmScheduleOutboxEntry,
  getScheduleOutboxEntry,
  reserveScheduleOutboxEntry,
  type ScheduleOutboxReserveInput,
} from "../schedule-outbox/store.ts";
import { findMatchingSchedule } from "../schedule-outbox/reconcile.ts";

export type { ScheduleOutboxReserveInput as ScheduleViaOutboxInput };

// ---------------------------------------------------------------------------
// reconcileScheduleOutbox — read-only toward Zoho
// ---------------------------------------------------------------------------

export type ReconcileScheduleOutboxOutcome =
  | { readonly status: "unknown-key" }
  | { readonly status: "already-confirmed"; readonly reference: ZohoScheduleReference }
  | { readonly status: "confirmed-by-reconciliation"; readonly reference: ZohoScheduleReference }
  /** `'reserved'`, and Zoho does NOT (yet) report a matching schedule — safe for the caller to attempt
   *  `createSchedule` now. */
  | { readonly status: "still-unconfirmed" };

/**
 * Reconciles ONE `idempotencyKey` against Zoho — NEVER calls `createSchedule`. For an unknown key,
 * returns `"unknown-key"`. For an already-`'confirmed'` key, returns its reference without touching Zoho
 * at all. For a `'reserved'` key, calls `port.listSchedules` for that entry's own target and looks for a
 * match (`findMatchingSchedule`): a match confirms the entry locally (with THAT match's reference) and
 * returns `"confirmed-by-reconciliation"`; no match returns `"still-unconfirmed"`, changing nothing.
 */
export async function reconcileScheduleOutbox(
  db: DatabaseSync,
  idempotencyKey: string,
  port: ZohoSchedulePort,
  now: () => string = () => new Date().toISOString(),
): Promise<ReconcileScheduleOutboxOutcome> {
  const existing = getScheduleOutboxEntry(db, idempotencyKey);
  if (existing === null) return { status: "unknown-key" };
  if (existing.status === "confirmed") {
    return { status: "already-confirmed", reference: existing.reference! };
  }

  const reported = await port.listSchedules(existing.request.target);
  const match = findMatchingSchedule(reported, existing.request);
  if (match === null) return { status: "still-unconfirmed" };

  const confirmed = confirmScheduleOutboxEntry(db, idempotencyKey, match.reference, now);
  return { status: "confirmed-by-reconciliation", reference: confirmed!.reference! };
}

// ---------------------------------------------------------------------------
// scheduleViaOutbox — the full reserve -> (reconcile if resuming) -> create-if-needed -> confirm
// ---------------------------------------------------------------------------

export interface ScheduleViaOutboxOutcome {
  readonly reference: ZohoScheduleReference;
  /** Whether THIS call actually issued a NEW `createSchedule` call to Zoho. `false` when the entry was
   *  already confirmed, or when reconciliation found Zoho already had it — nothing new was sent either
   *  way, so a caller checking "did I just post something" can rely on this alone. */
  readonly calledCreateSchedule: boolean;
  /** Whether the entry was ALREADY `'confirmed'` before this call — a genuine no-op re-invocation. */
  readonly alreadyConfirmed: boolean;
}

/**
 * Runs the full outbox sequence for one `(idempotencyKey, assetId, request)`. See the module doc for the
 * crash-safety argument. Never calls `createSchedule` more than once for the SAME idempotency key across
 * however many times this function is invoked for it.
 */
export async function scheduleViaOutbox(
  db: DatabaseSync,
  input: ScheduleOutboxReserveInput,
  port: ZohoSchedulePort,
  now: () => string = () => new Date().toISOString(),
): Promise<ScheduleViaOutboxOutcome> {
  const { record, alreadyReserved } = reserveScheduleOutboxEntry(db, input, now);

  if (!alreadyReserved) {
    // A brand-new reservation — nothing could have reached Zoho yet under this key.
    const result = await port.createSchedule(record.request);
    const confirmed = confirmScheduleOutboxEntry(db, input.idempotencyKey, result.reference, now);
    return { reference: confirmed!.reference!, calledCreateSchedule: true, alreadyConfirmed: false };
  }

  // Resuming an existing reservation: ask Zoho before doing anything else.
  const outcome = await reconcileScheduleOutbox(db, input.idempotencyKey, port, now);
  if (outcome.status === "already-confirmed") {
    return { reference: outcome.reference, calledCreateSchedule: false, alreadyConfirmed: true };
  }
  if (outcome.status === "confirmed-by-reconciliation") {
    return { reference: outcome.reference, calledCreateSchedule: false, alreadyConfirmed: false };
  }
  // "still-unconfirmed" (or, defensively, "unknown-key" — unreachable, we just reserved it ourselves
  // above): Zoho genuinely never received this request. Safe to send it now.
  const result = await port.createSchedule(record.request);
  const confirmed = confirmScheduleOutboxEntry(db, input.idempotencyKey, result.reference, now);
  return { reference: confirmed!.reference!, calledCreateSchedule: true, alreadyConfirmed: false };
}
