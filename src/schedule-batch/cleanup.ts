/**
 * Cleanup decision — pure deep module deciding WHICH manifest Asset entries a Schedule Batch cleanup
 * pass should delete (issue #147, parent #140).
 *
 * PRD #140: "whether Zoho fetches media at CSV-upload or at posting time is unconfirmed — assume
 * posting time" — so this module deletes LATE, never EARLY. An Asset entry becomes due only once its
 * `scheduled_at` is MORE THAN 1 day in the past; an entry scheduled less than or exactly 1 day ago, or
 * still in the future, is never touched. The 30-day S3 bucket lifecycle rule (already live on the
 * bucket, documented as a one-time setup step) stays the backstop for an abandoned batch — it is not
 * reimplemented here, and this module never reasons about it.
 *
 * PURE: no I/O, no clock read — `nowMs` is always the caller's explicit argument (mirrors
 * `schedule.ts`'s `validateSlotsFuture`). The I/O shell that discovers manifests on disk, deletes the
 * hosted keys, and records the result back onto each manifest file lives in `cleanup-runner.ts`.
 */

/** The load-bearing cutoff: an Asset entry is due for cleanup only once its `scheduled_at` is STRICTLY
 *  more than this far in the past — exactly 1 day (or less) ago is never touched (issue #147 AC2). */
export const CLEANUP_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Is `scheduledAt` (ISO-8601) due for cleanup relative to `nowMs`? Strictly more than `CLEANUP_AFTER_MS`
 * in the past only — a future time, a time within the last day, or a genuinely unparseable string all
 * return `false` (never fabricate a decision from garbled input; data-handling rule 4).
 */
export function isDueForCleanup(scheduledAt: string, nowMs: number): boolean {
  const scheduledMs = Date.parse(scheduledAt);
  if (!Number.isFinite(scheduledMs)) return false;
  return nowMs - scheduledMs > CLEANUP_AFTER_MS;
}

/** One manifest Asset entry's cleanup-relevant fields — deliberately NOT the whole `ScheduleManifest`
 *  shape (the I/O shell reads/writes each manifest's raw JSON directly, so a full typed round-trip
 *  through this module is never needed and would risk losing fields this module doesn't know about). */
export interface CleanupCandidateEntry {
  readonly ideaId: string;
  readonly recipe: string;
  /** ISO-8601 — this Asset's manifest `scheduled_at`. */
  readonly scheduledAt: string;
  /** This Asset's hosted S3 object keys, in the SAME order the manifest recorded them. */
  readonly keys: readonly string[];
  /** Whether this entry already carries a `cleaned_at` — an already-cleaned entry is never re-planned,
   *  even if it happens to still read as "due" (issue #147 AC3 — a re-run must not double-delete). */
  readonly alreadyCleaned: boolean;
}

/** One manifest file's worth of cleanup candidates. */
export interface ManifestCleanupTarget {
  readonly manifestPath: string;
  readonly entries: readonly CleanupCandidateEntry[];
}

/** One decided cleanup action: delete `keys` (this Asset's hosted media) and record the removal back
 *  onto `manifestPath`. */
export interface CleanupAction {
  readonly manifestPath: string;
  readonly ideaId: string;
  readonly recipe: string;
  readonly scheduledAt: string;
  readonly keys: readonly string[];
}

/**
 * Decide, across every given manifest, which Asset entries are due for cleanup: not already recorded as
 * cleaned AND more than 1 day past their `scheduled_at`. PURE: no I/O, no clock read. Each manifest is
 * judged independently; the returned order follows the input order.
 */
export function planManifestCleanup(
  targets: readonly ManifestCleanupTarget[],
  nowMs: number,
): CleanupAction[] {
  const actions: CleanupAction[] = [];
  for (const target of targets) {
    for (const entry of target.entries) {
      if (entry.alreadyCleaned) continue;
      if (!isDueForCleanup(entry.scheduledAt, nowMs)) continue;
      actions.push({
        manifestPath: target.manifestPath,
        ideaId: entry.ideaId,
        recipe: entry.recipe,
        scheduledAt: entry.scheduledAt,
        keys: entry.keys,
      });
    }
  }
  return actions;
}
