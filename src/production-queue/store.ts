/**
 * Production Queue persistence — the plain-file boundary for `data/queue.json`.
 *
 * Kept thin and separate from the pure logic in `queue.ts`. Defensive on read: a missing file loads
 * as the empty queue (a fresh repo has no queued work yet), so callers never crash on first run. Every
 * dropped record is WARNED about (never silently discarded), so a hand-typo'd job leaves a trace
 * instead of vanishing from `/queue`.
 *
 * No `lock` field is read or written here (issue #203 — see `queue.ts`'s own doc comment, "No stored
 * lock field"). A stray `lock` key on a hand-edited or pre-#203 `data/queue.json` is simply ignored on
 * load and never re-written on save — it is not ported into `QueueState`.
 */

import { readJsonFile, writeFileAtomic } from "../fs/safe-io.ts";
import { emptyQueue, type QueueJob, type QueueState } from "./queue.ts";

const VALID_STATUSES = new Set(["queued", "running", "awaiting_pick", "done", "failed"]);

/** Default on-disk location of the Production Queue. */
export const DEFAULT_QUEUE_PATH = "data/queue.json";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Coerce a raw `gate` value into the well-formed cursor type, or `undefined` if malformed. */
function parseGate(raw: unknown): { readonly ok: true; readonly gate: string | null } | { readonly ok: false } {
  if (raw === null) return { ok: true, gate: null };
  if (typeof raw === "string" && raw.length > 0) return { ok: true, gate: raw };
  return { ok: false };
}

/** Coerce one raw record into a QueueJob, or null if it is malformed. Every drop warns (C38). */
function parseJob(raw: unknown): QueueJob | null {
  if (!isObject(raw)) {
    console.warn("[queue] parseJob: dropping non-object job record");
    return null;
  }
  const { idea_id, brand, recipe, gate, status, enqueued_at, pick } = raw;
  if (typeof idea_id !== "string" || idea_id.length === 0) {
    console.warn("[queue] parseJob: dropping job with missing/empty idea_id");
    return null;
  }
  if (typeof brand !== "string" || brand.length === 0) {
    // A job with no resolvable Brand is dropped/logged rather than crashing the drain (AC1).
    console.warn(`[queue] parseJob: dropping job for idea_id="${idea_id}" — missing or empty brand field`);
    return null;
  }
  const label = `idea_id="${idea_id}" (brand="${brand}")`;
  if (typeof recipe !== "string" || recipe.length === 0) {
    console.warn(`[queue] parseJob: dropping job ${label} — missing or empty recipe field`);
    return null;
  }
  const gateResult = parseGate(gate);
  if (!gateResult.ok) {
    console.warn(`[queue] parseJob: dropping job ${label} — invalid gate ${JSON.stringify(gate)} (must be a non-empty string or null)`);
    return null;
  }
  // Invalid status/enqueued_at are logged too (C38) — a typo'd job must not vanish silently.
  if (typeof status !== "string" || !VALID_STATUSES.has(status)) {
    console.warn(`[queue] parseJob: dropping job ${label} — invalid status ${JSON.stringify(status)}`);
    return null;
  }
  if (typeof enqueued_at !== "string") {
    console.warn(`[queue] parseJob: dropping job ${label} — missing/invalid enqueued_at`);
    return null;
  }
  const base: QueueJob = {
    idea_id,
    brand,
    recipe,
    gate: gateResult.gate,
    status: status as QueueJob["status"],
    enqueued_at,
  };
  // The Operator's resolved gate pick rides on a next-leg job (C1, generalized) and must survive the
  // disk round-trip so a restarted driver drives against the actual pick. Preserve it when present as a
  // non-empty string; this is never validated against the job's own `gate` here (that would require the
  // Recipe registry, which this plain-file boundary does not depend on).
  if (typeof pick === "string" && pick.length > 0) {
    return { ...base, pick };
  }
  return base;
}

/** Coerce arbitrary parsed JSON into a well-formed QueueState (drops malformed jobs defensively). */
export function parseQueueState(raw: unknown): QueueState {
  if (!isObject(raw)) return emptyQueue();
  const jobsRaw = Array.isArray(raw.jobs) ? raw.jobs : [];
  const jobs = jobsRaw.map(parseJob).filter((j): j is QueueJob => j !== null);
  return { jobs };
}

/**
 * Load the queue from disk; a missing file (fresh repo) loads as the empty queue. Reads go through
 * `readJsonFile` (C13), so a truncated/hand-edited `data/queue.json` throws an Error that NAMES the
 * path instead of a bare `SyntaxError`; a genuinely absent file still loads as the empty queue.
 */
export async function loadQueue(path: string = DEFAULT_QUEUE_PATH): Promise<QueueState> {
  let raw: unknown;
  try {
    raw = await readJsonFile(path);
  } catch (err: unknown) {
    if (isObject(err) && (err as { code?: string }).code === "ENOENT") {
      return emptyQueue();
    }
    throw err;
  }
  return parseQueueState(raw);
}

/**
 * Persist the queue to disk (pretty-printed, trailing newline). Writes atomically (temp file +
 * rename, C13) so a crash mid-write cannot truncate the canonical `data/queue.json`.
 */
export async function saveQueue(
  state: QueueState,
  path: string = DEFAULT_QUEUE_PATH,
): Promise<void> {
  await writeFileAtomic(path, JSON.stringify(state, null, 2) + "\n");
}
