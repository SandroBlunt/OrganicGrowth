/**
 * Production Queue persistence — the plain-file boundary for `data/queue.json`.
 *
 * Kept thin and separate from the pure logic in `queue.ts`. Defensive on read: a missing file loads
 * as the empty queue (a fresh repo has no queued work yet), so callers never crash on first run.
 */

import { readFile, writeFile } from "node:fs/promises";
import { emptyQueue, type QueueJob, type QueueState } from "./queue.ts";

const VALID_PHASES = new Set(["cast", "render"]);
const VALID_STATUSES = new Set(["queued", "running", "awaiting_cast", "done", "failed"]);

/** Default on-disk location of the Production Queue. */
export const DEFAULT_QUEUE_PATH = "data/queue.json";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Coerce one raw record into a QueueJob, or null if it is malformed. */
function parseJob(raw: unknown): QueueJob | null {
  if (!isObject(raw)) return null;
  const { idea_id, phase, status, enqueued_at } = raw;
  if (typeof idea_id !== "string" || idea_id.length === 0) return null;
  if (typeof phase !== "string" || !VALID_PHASES.has(phase)) return null;
  if (typeof status !== "string" || !VALID_STATUSES.has(status)) return null;
  if (typeof enqueued_at !== "string") return null;
  return {
    idea_id,
    phase: phase as QueueJob["phase"],
    status: status as QueueJob["status"],
    enqueued_at,
  };
}

/** Coerce arbitrary parsed JSON into a well-formed QueueState (drops malformed jobs defensively). */
export function parseQueueState(raw: unknown): QueueState {
  if (!isObject(raw)) return emptyQueue();
  const jobsRaw = Array.isArray(raw.jobs) ? raw.jobs : [];
  const jobs = jobsRaw.map(parseJob).filter((j): j is QueueJob => j !== null);
  const lockRaw = isObject(raw.lock) ? raw.lock : {};
  const active = lockRaw.active_job;
  const active_job = typeof active === "string" ? active : null;
  return { jobs, lock: { active_job } };
}

/** Load the queue from disk; a missing file (fresh repo) loads as the empty queue. */
export async function loadQueue(path: string = DEFAULT_QUEUE_PATH): Promise<QueueState> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err: unknown) {
    if (isObject(err) && (err as { code?: string }).code === "ENOENT") {
      return emptyQueue();
    }
    throw err;
  }
  return parseQueueState(JSON.parse(text));
}

/** Persist the queue to disk (pretty-printed, trailing newline). */
export async function saveQueue(
  state: QueueState,
  path: string = DEFAULT_QUEUE_PATH,
): Promise<void> {
  await writeFile(path, JSON.stringify(state, null, 2) + "\n", "utf8");
}
