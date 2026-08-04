/**
 * The one redaction primitive backing issue #144's "secrets are never printed" acceptance criterion.
 * `live/s3.ts` uses this to scrub any AWS credential value out of an error message before it ever
 * reaches a caller, a log, or a test failure output — defense in depth on top of the fact that this
 * port never puts a credential into a command's argv in the first place (the AWS CLI reads credentials
 * from its own env/config, never a CLI flag we construct).
 */

/** The minimum length a value must have to be treated as a redactable secret (never mangles short text). */
const MIN_SECRET_LENGTH = 4;

/** Replace every occurrence of each defined `secrets` value in `text` with `"[REDACTED]"`. Pure. */
export function redactSecrets(text: string, secrets: readonly (string | undefined)[]): string {
  let redacted = text;
  for (const secret of secrets) {
    if (secret !== undefined && secret.length >= MIN_SECRET_LENGTH) {
      redacted = redacted.split(secret).join("[REDACTED]");
    }
  }
  return redacted;
}
