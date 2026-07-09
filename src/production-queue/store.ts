/**
 * Production Queue persistence — the plain-file boundary for `data/queue.json`.
 *
 * Kept thin and separate from the pure logic in `queue.ts`. Defensive on read: a missing file loads
 * as the empty queue (a fresh repo has no queued work yet), so callers never crash on first run. Every
 * dropped record is WARNED about (never silently discarded), so a hand-typo'd job or a stale lock leaves
 * a trace instead of vanishing from `/queue`.
 */

import { readJsonFile, writeFileAtomic } from "../fs/safe-io.ts";
import { emptyQueue, type JobRef, type QueueJob, type QueueState } from "./queue.ts";

const VALID_PHASES = new Set(["cast", "render"]);
const VALID_STATUSES = new Set(["queued", "running", "awaiting_cast", "done", "failed"]);

/** Default on-disk location of the Production Queue. */
export const DEFAULT_QUEUE_PATH = "data/queue.json";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Coerce one raw record into a QueueJob, or null if it is malformed. Every drop warns (C38). */
function parseJob(raw: unknown): QueueJob | null {
  if (!isObject(raw)) {
    console.warn("[queue] parseJob: dropping non-object job record");
    return null;
  }
  const { idea_id, brand, phase, status, enqueued_at, character } = raw;
  if (typeof idea_id !== "string" || idea_id.length === 0) {
    console.warn("[queue] parseJob: dropping job with missing/empty idea_id");
    return null;
  }
  if (typeof brand !== "string" || brand.length === 0) {
    // A job with no resolvable Brand is dropped/logged rather than crashing the drain (AC1).
    console.warn(`[queue] parseJob: dropping job for idea_id="${idea_id}" — missing or empty brand field`);
    return null;
  }
  // Invalid phase/status/enqueued_at are logged too (C38) — a typo'd job must not vanish silently.
  const label = `idea_id="${idea_id}" (brand="${brand}")`;
  if (typeof phase !== "string" || !VALID_PHASES.has(phase)) {
    console.warn(`[queue] parseJob: dropping job ${label} — invalid phase ${JSON.stringify(phase)}`);
    return null;
  }
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
    phase: phase as QueueJob["phase"],
    status: status as QueueJob["status"],
    enqueued_at,
  };
  // The Operator's chosen Character rides on RENDER jobs (C1) and must survive the disk round-trip so a
  // restarted worker renders against the actual pick. Preserve it when present as a non-empty string;
  // a render job that arrives without one is a persistence bug — warn but keep the job (never invent one).
  if (typeof character === "string" && character.length > 0) {
    return { ...base, character };
  }
  if (phase === "render") {
    console.warn(`[queue] parseJob: render job ${label} has no chosen character — the pick was not persisted (C1)`);
  }
  return base;
}

/** Coerce a raw lock holder into a composite `JobRef`, or null if it is absent/malformed. */
function parseJobRef(raw: unknown): JobRef | null {
  if (!isObject(raw)) return null;
  const { brand, idea_id } = raw;
  if (typeof brand !== "string" || brand.length === 0) return null;
  if (typeof idea_id !== "string" || idea_id.length === 0) return null;
  return { brand, idea_id };
}

/** Coerce arbitrary parsed JSON into a well-formed QueueState (drops malformed jobs defensively). */
export function parseQueueState(raw: unknown): QueueState {
  if (!isObject(raw)) return emptyQueue();
  const jobsRaw = Array.isArray(raw.jobs) ? raw.jobs : [];
  const jobs = jobsRaw.map(parseJob).filter((j): j is QueueJob => j !== null);
  const lockRaw = isObject(raw.lock) ? raw.lock : {};
  let active_job = parseJobRef(lockRaw.active_job);
  // C39: a lock pointing at a dropped/nonexistent job is a phantom lock that reads the Space busy
  // forever. Null it (with a warning) when no loaded job matches its composite (brand, idea_id).
  if (active_job !== null) {
    const ref = active_job;
    const matched = jobs.some((j) => j.brand === ref.brand && j.idea_id === ref.idea_id);
    if (!matched) {
      console.warn(
        `[queue] parseQueueState: clearing phantom lock.active_job — no loaded job matches brand="${ref.brand}" idea_id="${ref.idea_id}"`,
      );
      active_job = null;
    }
  }
  return { jobs, lock: { active_job } };
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
