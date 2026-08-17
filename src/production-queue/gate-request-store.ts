/**
 * GateRequestStore — the SQL-backed store for the `gate_request` table (issue #203 AC, ADR-0029).
 *
 * A `gate_request` records ONE pick-gate a job paused at: its name, the candidates it offered, and —
 * once the Operator has decided — who decided, when, and their choice (CONTEXT.md "Cast": "the set of
 * candidate character images ... returns to the Operator to choose from"; generalizes to any Recipe
 * gate, not just Cast). `createGateRequest` records the OFFER; `recordGateDecision` records the
 * RESOLUTION — kept as two calls (never one "create-with-decision" call) because a gate is genuinely
 * offered before it is decided, often across a real time gap while the Producer works other queued
 * jobs (ADR-0008: a gate does not hold the Space).
 *
 * Genuinely NEW, `{ db }`-only, mirroring `job-store.ts`'s own shape and doc comment. `candidates` is
 * stored as JSON (mirrors `idea.source_urls_json`'s convention elsewhere in this schema) since a gate's
 * candidate set has no fixed shape of its own across Recipes — the *Character Explainer with Cast*
 * Recipe's Cast candidates are a different shape from any other Recipe's own gate.
 */

import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

/** The fields `createGateRequest` requires/accepts, minus id/timestamps (assigned by this module). */
export interface GateRequestInput {
  readonly jobId: string;
  readonly gateName: string;
  readonly candidates: readonly unknown[];
}

/** The fields `recordGateDecision` requires — the Operator's resolution of an already-offered gate. */
export interface GateDecisionInput {
  readonly decidedBy: string;
  readonly choice: string;
}

/** One `gate_request` row, fully typed. */
export interface GateRequestRecord {
  readonly id: string;
  readonly jobId: string;
  readonly gateName: string;
  readonly candidates: readonly unknown[];
  readonly decidedBy?: string;
  readonly decidedAt?: string;
  readonly choice?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface GateRequestRow {
  readonly id: string;
  readonly job_id: string;
  readonly gate_name: string;
  readonly candidates_json: string;
  readonly decided_by: string | null;
  readonly decided_at: string | null;
  readonly choice: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

function toGateRequestRecord(row: GateRequestRow): GateRequestRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    gateName: row.gate_name,
    candidates: JSON.parse(row.candidates_json) as readonly unknown[],
    ...(row.decided_by !== null ? { decidedBy: row.decided_by } : {}),
    ...(row.decided_at !== null ? { decidedAt: row.decided_at } : {}),
    ...(row.choice !== null ? { choice: row.choice } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Thrown by `recordGateDecision` for an unknown `gateRequestId` — before any SQL write. */
export class GateRequestNotFoundError extends Error {
  constructor(gateRequestId: string) {
    super(`Gate request "${gateRequestId}" not found.`);
    this.name = "GateRequestNotFoundError";
  }
}

/** Records ONE gate offer — a job pausing at a gate with its candidate set. Undecided (`decided_by` /
 *  `decided_at` / `choice` all unset) until `recordGateDecision` is called. Throws (SQLite FOREIGN KEY
 *  error) for an unknown `jobId`. */
export function createGateRequest(
  db: DatabaseSync,
  input: GateRequestInput,
  now: () => string = () => new Date().toISOString(),
): string {
  const id = randomUUID();
  const timestamp = now();
  db.prepare(
    `INSERT INTO gate_request (id, job_id, gate_name, candidates_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, input.jobId, input.gateName, JSON.stringify(input.candidates), timestamp, timestamp);
  return id;
}

/** Looks up one gate request by its stable id. Returns `null` for an unknown id — never throws. */
export function getGateRequest(db: DatabaseSync, id: string): GateRequestRecord | null {
  const row = db.prepare(`SELECT * FROM gate_request WHERE id = ?`).get(id) as unknown as GateRequestRow | undefined;
  return row ? toGateRequestRecord(row) : null;
}

/** Every gate request raised for one job, oldest first. `[]` for a job with none (or an unknown job
 *  id) — never throws. */
export function listGateRequestsForJob(db: DatabaseSync, jobId: string): readonly GateRequestRecord[] {
  const rows = db
    .prepare(`SELECT * FROM gate_request WHERE job_id = ? ORDER BY created_at ASC`)
    .all(jobId) as unknown as GateRequestRow[];
  return rows.map(toGateRequestRecord);
}

/**
 * Records who decided an already-offered gate, when, and their choice — the resolution half of the
 * gate's own lifecycle (candidates offered → Operator decides). Throws `GateRequestNotFoundError` for
 * an unknown `gateRequestId`, before any write. Idempotent on repeated calls: re-deciding overwrites
 * the prior decision fields (a corrected pick), never appends a second row — a gate request is decided
 * AT MOST once at a time, by design (mirrors `IdeaStore`'s single-decision Review gate).
 */
export function recordGateDecision(
  db: DatabaseSync,
  gateRequestId: string,
  decision: GateDecisionInput,
  now: () => string = () => new Date().toISOString(),
): void {
  const existing = getGateRequest(db, gateRequestId);
  if (existing === null) {
    throw new GateRequestNotFoundError(gateRequestId);
  }
  const timestamp = now();
  db.prepare(
    `UPDATE gate_request SET decided_by = ?, decided_at = ?, choice = ?, updated_at = ? WHERE id = ?`,
  ).run(decision.decidedBy, timestamp, decision.choice, timestamp, gateRequestId);
}
