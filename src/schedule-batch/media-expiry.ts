/**
 * Media link expiry — pure deep module deriving how long a hosted Asset's SIGNED media link stays
 * fetchable, from that Asset's OWN `scheduled_at` (issue #198, parent #195).
 *
 * "Access ends when the schedule does" (the issue's own framing): a link's natural target expiry is
 * `scheduledAt + EXPIRY_BUFFER_AFTER_SCHEDULED_MS` — comfortably past the moment Zoho is expected to
 * actually fetch the media (PRD #140's "assume posting time" note), without leaving the link valid for
 * long after. That buffer is deliberately small (1 hour) and, critically, well UNDER
 * `CLEANUP_AFTER_MS` (`./cleanup.ts`, 24 hours) — the window `runScheduleCleanup` waits before it will
 * even consider deleting the underlying object. Because `EXPIRY_BUFFER_AFTER_SCHEDULED_MS <
 * CLEANUP_AFTER_MS` always, a link is ALWAYS already expired for many hours before the cleanup routine
 * could ever become eligible to delete the object it points at — expiry and deletion can never race into
 * a state where Zoho holds a link that looks unexpired against an object that's already gone.
 *
 * AWS's own SigV4 presign ceiling (`MAX_PRESIGN_SECONDS`, `src/media-host/aws-presign-limit.ts`, 7 days)
 * is a hard, real constraint no code here can lift: a single presigned URL can never be asked to stay
 * valid longer than 7 days from the moment it's minted. For a schedule sitting comfortably within that
 * window (every Format built so far), the natural target above is reachable exactly. For one sitting
 * further out (a long multi-week batch exported all at once), the returned expiry is CAPPED at the
 * 7-day ceiling instead — `cappedByAwsLimit` is `true` — and the resulting link expires BEFORE the
 * Asset's own `scheduled_at`, a genuine, documented limitation (see `handoff.md`'s Known Limits): the
 * only way around it today is exporting/re-hosting closer to the event.
 */

import { MAX_PRESIGN_SECONDS } from "../media-host/aws-presign-limit.ts";

/** How long past an Asset's own scheduled time its signed media link stays valid: enough slack for
 *  Zoho's own scheduler to actually fire the post and fetch the media a little late, without leaving
 *  the link valid for long after (issue #198). Deliberately well under `CLEANUP_AFTER_MS` — see the
 *  module doc's "no-race" argument. */
export const EXPIRY_BUFFER_AFTER_SCHEDULED_MS = 60 * 60 * 1000; // 1 hour

export interface MediaExpiry {
  /** ISO-8601 — the actual instant the signed link stops working. Equal to `scheduledAt +
   *  EXPIRY_BUFFER_AFTER_SCHEDULED_MS` UNLESS that target sits beyond AWS's 7-day presign ceiling from
   *  `uploadedAt`, in which case it is `uploadedAt + MAX_PRESIGN_SECONDS` instead (earlier than the
   *  natural target — see `cappedByAwsLimit`). */
  readonly expiresAt: string;
  /** Seconds from `uploadedAt` to `expiresAt` — what a live `upload` call actually asks the AWS CLI's
   *  presign for. Always in `[1, MAX_PRESIGN_SECONDS]`. */
  readonly expiresInSeconds: number;
  /** `true` when AWS's 7-day ceiling forced `expiresAt` earlier than `scheduledAt +
   *  EXPIRY_BUFFER_AFTER_SCHEDULED_MS` — i.e. this Asset's schedule sits more than ~7 days beyond
   *  `uploadedAt`, so the link will expire BEFORE the Asset's own scheduled time. */
  readonly cappedByAwsLimit: boolean;
}

function assertValidInstant(label: string, iso: string, ms: number): void {
  if (!Number.isFinite(ms)) {
    throw new Error(`media-expiry: ${label} is not a valid ISO-8601 timestamp (got ${JSON.stringify(iso)}).`);
  }
}

/**
 * Derive a hosted media link's expiry from an Asset's own `scheduledAtIso`, anchored at `uploadedAtIso`
 * (always the caller's explicit clock — this function never reads the system clock). PURE: no I/O, no
 * randomness. See the module doc for the full derivation and the AWS-ceiling capping behavior.
 */
export function computeMediaExpiry(scheduledAtIso: string, uploadedAtIso: string): MediaExpiry {
  const scheduledMs = Date.parse(scheduledAtIso);
  const uploadedMs = Date.parse(uploadedAtIso);
  assertValidInstant("scheduledAt", scheduledAtIso, scheduledMs);
  assertValidInstant("uploadedAt", uploadedAtIso, uploadedMs);

  const naturalTargetMs = scheduledMs + EXPIRY_BUFFER_AFTER_SCHEDULED_MS;
  const rawSeconds = Math.ceil((naturalTargetMs - uploadedMs) / 1000);
  const cappedByAwsLimit = rawSeconds > MAX_PRESIGN_SECONDS;
  const expiresInSeconds = Math.min(Math.max(rawSeconds, 1), MAX_PRESIGN_SECONDS);
  const expiresAtMs = uploadedMs + expiresInSeconds * 1000;

  return {
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresInSeconds,
    cappedByAwsLimit,
  };
}
