/**
 * The `upload`/`delete` half of the live Media Host adapter (issue #144): shells out to the AWS CLI —
 * no new npm dependency, exactly as the issue specifies. Consulted Amazon's official agent skills for
 * AWS (github.com/aws/agent-toolkit-for-aws) before writing this: the live bucket
 * (`strawmotion-schedule-media`, us-east-1) already has Block Public Access left alone and instead
 * carries its OWN bucket policy granting public `GetObject` (per the issue) — so uploads here never
 * pass an object ACL; the object inherits public read from that bucket policy. Object keys are always
 * validated `.jpg` (`assertJpgKey`) before any command runs.
 */

import { execFileRunner, type CommandRunner } from "./command-runner.ts";
import { redactSecrets } from "./redact.ts";
import { assertJpgKey } from "../key.ts";
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

/** The bucket's public, direct virtual-hosted-style URL for `key`. Throws unless `key` ends `.jpg`. */
export function publicJpgUrl(config: S3Config, key: string): string {
  assertJpgKey(key);
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
}

/**
 * Upload `localPath` to `s3://bucket/key` via `aws s3 cp`, returning the object's public direct
 * `.jpg` URL. Throws (without running any command) unless `key` ends `.jpg`.
 */
export async function uploadViaAwsCli(
  localPath: string,
  key: string,
  config: S3Config,
  options: S3AdapterOptions = {},
): Promise<UploadResult> {
  assertJpgKey(key);
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
  return { url: publicJpgUrl(config, key) };
}

/** Delete `s3://bucket/key` via `aws s3 rm`. */
export async function deleteViaAwsCli(
  key: string,
  config: S3Config,
  options: S3AdapterOptions = {},
): Promise<void> {
  await runAwsCommand(options, ["s3", "rm", s3Uri(config, key), "--region", config.region]);
}

async function runAwsCommand(options: S3AdapterOptions, args: readonly string[]): Promise<void> {
  const runner = options.runner ?? execFileRunner;
  const command = options.awsCommand ?? DEFAULT_AWS_COMMAND;
  try {
    await runner(command, args, { env: options.env });
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
