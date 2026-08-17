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
 * further out, the returned expiry is CAPPED at the 7-day ceiling instead — `cappedByAwsLimit` is
 * `true`. That alone does NOT necessarily mean the link is broken: as long as the Asset's own
 * `scheduled_at` itself is still within 7 days of `uploadedAt`, the capped expiry still reaches (or
 * lands exactly at) the scheduled time — just with less than the ideal extra hour of slack. Only once
 * `scheduled_at` ITSELF sits more than ~7 days beyond `uploadedAt` does the capped expiry actually fall
 * BEFORE the Asset's own scheduled time — a genuinely broken link.
 *
 * That genuinely-broken case is NEVER allowed to ship silently (issue #198 QA Round 1 Defect #1 — this
 * repository has already been bitten once by a silent scheduling failure with no error anywhere).
 * `export-schedule.ts` already refuses loudly for the SYMMETRIC near-future case
 * (`validateSlotsFuture`/`MIN_LEAD_MS`, `schedule.ts`) — `validateWithinPresignWindow` below extends
 * that SAME treatment to the far-future case: a PURE function returning every violating row (never
 * stopping at the first), so a caller refuses the WHOLE export loudly, before writing anything, naming
 * every offending Asset — never a second, separate warning-only mechanism.
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
   *  `uploadedAt`. NOTE: this alone does NOT mean the link is broken — `expiresAt` can still land AT or
   *  AFTER `scheduledAt` itself, just with less than the ideal extra hour of slack. Use
   *  `validateWithinPresignWindow` (below) to detect an actually-broken (`expiresAt < scheduledAt`)
   *  link. */
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

// ---------------------------------------------------------------------------
// validateWithinPresignWindow — the loud-refusal guard for the far-future case
// ---------------------------------------------------------------------------

/** One scheduled time whose signed media link CANNOT survive to reach its own post time — the link
 *  will already be expired before Zoho could ever fetch it there. Note this is a NARROWER condition
 *  than `cappedByAwsLimit` alone: a schedule can be "capped" (trimmed below the ideal 1-hour
 *  post-scheduled buffer, `EXPIRY_BUFFER_AFTER_SCHEDULED_MS`) while its link still comfortably reaches
 *  the scheduled time itself — that is a reduced safety margin, not a broken post, and is NOT a
 *  violation here. Only `expiresAt < scheduledAt` — the link is provably dead before the post is even
 *  due — counts. */
export interface MediaExpiryCapViolation {
  readonly index: number;
  /** This Asset's own `scheduled_at`, unchanged. */
  readonly scheduledAtIso: string;
  /** The signed link's actual (capped) expiry — always EARLIER than `scheduledAtIso` here. */
  readonly expiresAt: string;
  /** How long the link will already be dead before its own Asset's scheduled post time, in
   *  milliseconds (`scheduledAtIso - expiresAt`, always positive here). */
  readonly overageMs: number;
}

/** The result of `validateWithinPresignWindow`: either every given scheduled time's link can reach its
 *  own post time, or a named list of every one that can't (never just the first — mirrors
 *  `schedule.ts`'s `validateSlotsFuture` exactly). */
export type MediaExpiryWindowValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly violations: readonly MediaExpiryCapViolation[] };

/**
 * Validate that EVERY given scheduled time (`scheduledAtIsos`, one per Asset) produces a signed-link
 * expiry that reaches at least as far as that Asset's own scheduled post time — i.e.
 * `computeMediaExpiry(...).expiresAt >= scheduledAtIso` for all of them (reusing `computeMediaExpiry`'s
 * own cap math directly; never a second, independently-derived boundary calculation). A schedule sitting
 * right at, or comfortably within, AWS's own ~7-day presign ceiling from `uploadedAtIso` always passes,
 * even when `cappedByAwsLimit` trimmed away some of the ideal 1-hour post-scheduled buffer — see
 * `MediaExpiryCapViolation`'s own doc for why that distinction matters. PURE: no I/O, no clock read,
 * `uploadedAtIso` is always the caller's explicit argument. Mirrors `schedule.ts`'s
 * `validateSlotsFuture(slots, nowMs)` exactly, so a caller extends that SAME refusal treatment to the
 * far-future case rather than inventing a second mechanism (issue #198 QA Round 1 Defect #1): a link
 * that cannot survive to its own post time must refuse the WHOLE export loudly, before any I/O, never
 * ship as a silent, doomed link.
 */
export function validateWithinPresignWindow(
  scheduledAtIsos: readonly string[],
  uploadedAtIso: string,
): MediaExpiryWindowValidation {
  const violations: MediaExpiryCapViolation[] = [];
  scheduledAtIsos.forEach((scheduledAtIso, index) => {
    const expiry = computeMediaExpiry(scheduledAtIso, uploadedAtIso);
    if (!expiry.cappedByAwsLimit) return; // fast path: never broken when not even capped
    const expiresAtMs = Date.parse(expiry.expiresAt);
    const scheduledMs = Date.parse(scheduledAtIso);
    if (expiresAtMs >= scheduledMs) return; // capped, but the link still reaches the actual post time
    violations.push({ index, scheduledAtIso, expiresAt: expiry.expiresAt, overageMs: scheduledMs - expiresAtMs });
  });
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

/** A short, human-readable "N day(s)" rendering of a violation's `overageMs` (rounding UP to whole
 *  days, minimum "1 day") — used only to make a refusal message's "how far past the ceiling" figure
 *  readable; never used for any actual timing decision (that is always exact milliseconds elsewhere). */
export function formatOverageDuration(overageMs: number): string {
  const days = Math.max(1, Math.ceil(overageMs / (24 * 60 * 60 * 1000)));
  return days === 1 ? "1 day" : `${days} days`;
}
