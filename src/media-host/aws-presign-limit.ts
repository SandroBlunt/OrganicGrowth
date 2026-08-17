/**
 * AWS SigV4's own hard ceiling on a presigned URL's lifetime (issue #198) — 604,800 seconds (7 days),
 * enforced by S3/the AWS CLI itself regardless of credential type. Shared by the live adapter (which
 * refuses to ask the AWS CLI for more) and `src/schedule-batch/media-expiry.ts` (which derives an
 * Asset's own expiry from its `scheduled_at` and caps it at this SAME ceiling) — ONE constant, never
 * duplicated, so the two can never drift.
 */

/** AWS's own presigned-URL lifetime ceiling, in seconds: 7 * 24 * 60 * 60. */
export const MAX_PRESIGN_SECONDS = 7 * 24 * 60 * 60;

/**
 * Throws unless `expiresInSeconds` is a positive integer no greater than `MAX_PRESIGN_SECONDS`. Pure —
 * never touches a file, the network, or a command. Called BEFORE any command runs, mirroring
 * `assertJpgKey`'s own "refuse before any I/O" posture.
 */
export function assertValidExpiresInSeconds(expiresInSeconds: number): void {
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1) {
    throw new Error(
      `Media Host expiresInSeconds must be a positive integer (got ${JSON.stringify(expiresInSeconds)}).`,
    );
  }
  if (expiresInSeconds > MAX_PRESIGN_SECONDS) {
    throw new Error(
      `Media Host expiresInSeconds must not exceed AWS's ${MAX_PRESIGN_SECONDS}s (7-day) SigV4 ` +
        `presign ceiling (got ${expiresInSeconds}).`,
    );
  }
}
