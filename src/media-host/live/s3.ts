/**
 * The `upload`/`delete` half of the live Media Host adapter (issue #144; locked down in issue #198):
 * shells out to the AWS CLI — no new npm dependency, exactly as the issue specifies. Consulted Amazon's
 * official agent skills for AWS (github.com/aws/agent-toolkit-for-aws) before writing this.
 *
 * Since issue #198 the live bucket carries NO public bucket policy at all (Block Public Access stays ON,
 * and no principal `"*"` grant exists) — `aws s3 cp` uploads a private object exactly as any other `aws
 * s3 cp` would (still never passing an object ACL; the object simply inherits the bucket's own default,
 * private access), and `upload` then asks the AWS CLI to mint a SIGNED, TEMPORARY `aws s3 presign` URL
 * for that object, valid only for the caller-given `expiresInSeconds` — the SAME credentials that ran the
 * `cp` are what the presigned URL is signed with, so they must carry `s3:GetObject` on the bucket (see
 * `docs/schedule-batch-s3-setup.md`'s Operator setup steps). Object keys are always validated `.jpg`
 * (`assertJpgKey`) and `expiresInSeconds` always validated against AWS's own SigV4 ceiling
 * (`assertValidExpiresInSeconds`) BEFORE any command runs.
 */

import { execFileRunner, type CommandRunner, type CommandResult } from "./command-runner.ts";
import { redactSecrets } from "./redact.ts";
import { assertJpgKey } from "../key.ts";
import { assertValidExpiresInSeconds } from "../aws-presign-limit.ts";
import type { UploadResult } from "../port.ts";

export interface S3Config {
  readonly bucket: string;
  readonly region: string;
}

export interface S3AdapterOptions {
  /** Override the `aws` binary/path. Default: `"aws"` (resolved via `PATH`). */
  readonly awsCommand?: string | undefined;
  /** Injected in tests to prove argv construction without a real process. Default: `execFileRunner`. */
  readonly runner?: CommandRunner | undefined;
  /** The env the AWS CLI runs with (credentials live here — never in argv). */
  readonly env?: NodeJS.ProcessEnv | undefined;
}

const DEFAULT_AWS_COMMAND = "aws";

function s3Uri(config: S3Config, key: string): string {
  return `s3://${config.bucket}/${key}`;
}

/**
 * The bucket's DIRECT, UNSIGNED virtual-hosted-style URL for `key` — since issue #198 this is NEVER
 * what `uploadViaAwsCli` returns (the bucket is private; only a signed URL from `presignViaAwsCli` is
 * fetchable). Kept because it is still useful for PROVING the bucket is actually locked down — e.g.
 * `live/smoke.ts` fetches this exact URL and expects it to be refused. Throws unless `key` ends `.jpg`.
 */
export function directJpgUrl(config: S3Config, key: string): string {
  assertJpgKey(key);
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
}

/**
 * Upload `localPath` to `s3://bucket/key` via `aws s3 cp` (never passing an object ACL — the object
 * inherits the bucket's own, private-by-default access), then ask the AWS CLI to mint a signed,
 * temporary `aws s3 presign` URL for it, valid for `expiresInSeconds`. Throws (without running any
 * command) unless `key` ends `.jpg` or `expiresInSeconds` is outside AWS's own SigV4 ceiling.
 */
export async function uploadViaAwsCli(
  localPath: string,
  key: string,
  config: S3Config,
  expiresInSeconds: number,
  options: S3AdapterOptions = {},
): Promise<UploadResult> {
  assertJpgKey(key);
  assertValidExpiresInSeconds(expiresInSeconds);
  await runAwsCommand(options, [
    "s3",
    "cp",
    localPath,
    s3Uri(config, key),
    "--region",
    config.region,
    "--content-type",
    "image/jpeg",
  ]);
  const url = await presignViaAwsCli(key, config, expiresInSeconds, options);
  return { url };
}

/**
 * Ask the AWS CLI for a signed, temporary GET URL for `s3://bucket/key`, valid for `expiresInSeconds`
 * (`aws s3 presign ... --expires-in <seconds>`). This is the ONLY way `key` is ever readable once the
 * bucket's public-read policy is gone (issue #198). Throws (without running any command) unless `key`
 * ends `.jpg` or `expiresInSeconds` is outside AWS's own SigV4 ceiling.
 */
export async function presignViaAwsCli(
  key: string,
  config: S3Config,
  expiresInSeconds: number,
  options: S3AdapterOptions = {},
): Promise<string> {
  assertJpgKey(key);
  assertValidExpiresInSeconds(expiresInSeconds);
  const result = await runAwsCommand(options, [
    "s3",
    "presign",
    s3Uri(config, key),
    "--region",
    config.region,
    "--expires-in",
    String(expiresInSeconds),
  ]);
  const url = result.stdout.trim();
  if (url.length === 0) {
    throw new Error(`aws s3 presign returned no URL for key "${key}" — cannot host without a signed link.`);
  }
  return url;
}

/** Delete `s3://bucket/key` via `aws s3 rm`. */
export async function deleteViaAwsCli(
  key: string,
  config: S3Config,
  options: S3AdapterOptions = {},
): Promise<void> {
  await runAwsCommand(options, ["s3", "rm", s3Uri(config, key), "--region", config.region]);
}

async function runAwsCommand(options: S3AdapterOptions, args: readonly string[]): Promise<CommandResult> {
  const runner = options.runner ?? execFileRunner;
  const command = options.awsCommand ?? DEFAULT_AWS_COMMAND;
  try {
    return await runner(command, args, { env: options.env });
  } catch (error) {
    throw redactCommandError(error, options.env);
  }
}

/**
 * Scrub any AWS credential VALUE out of a thrown error's message before it can reach a caller, a log,
 * or a test failure output (defense in depth — this port never puts a credential in argv to begin
 * with, since the AWS CLI reads credentials from its own env/config, never a flag we construct).
 */
function redactCommandError(error: unknown, env: NodeJS.ProcessEnv | undefined): Error {
  const secrets = [env?.AWS_ACCESS_KEY_ID, env?.AWS_SECRET_ACCESS_KEY, env?.AWS_SESSION_TOKEN];
  const message = error instanceof Error ? error.message : String(error);
  return new Error(redactSecrets(message, secrets));
}
