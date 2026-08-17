/**
 * The REAL Media Host (issue #144; `sips` replaced by a cross-platform pure-JS converter, issue #209):
 * converts via `convertPngToJpg` (`./png-to-jpg.ts` — no subprocess, no shelled-out binary), uploads/
 * deletes via the AWS CLI. Implements the exact same `MediaHostPort` a test's `FakeMediaHost` does, so a
 * future Schedule Batch export (parent #140) can be written once against the port and wired to either at
 * the composition root. NEVER used in `npm test` — every test in `src/media-host/**` injects either
 * `FakeMediaHost` or a stubbed `CommandRunner` (see `live/png-to-jpg.test.ts`, `live/s3.test.ts`).
 */

import type { MediaHostPort, UploadOptions, UploadResult } from "../port.ts";
import type { CommandRunner } from "./command-runner.ts";
import { convertPngToJpg } from "./png-to-jpg.ts";
import { uploadViaAwsCli, deleteViaAwsCli, type S3Config } from "./s3.ts";
import { loadEffectiveEnv } from "./env.ts";

export interface LiveMediaHostOptions {
  readonly config: S3Config;
  /** Injected in tests to prove wiring without a real process. Default: `execFileRunner`. Used ONLY for
   *  the AWS CLI upload/delete calls — `convertToJpg` (issue #209) no longer shells out to anything. */
  readonly runner?: CommandRunner | undefined;
  /** `jpeg-js`'s own 0–100 quality scale for `convertToJpg` (issue #209). Default: `convertPngToJpg`'s
   *  own default (90). */
  readonly jpegQuality?: number | undefined;
  /** Override the `aws` binary/path. Default: `"aws"`. */
  readonly awsCommand?: string | undefined;
  /**
   * A pre-resolved env for the AWS CLI (tests). Omit to lazily load `.env` merged under `process.env`
   * on first `upload`/`delete` (`env.ts`'s `loadEffectiveEnv`) — resolved once and reused.
   */
  readonly env?: NodeJS.ProcessEnv | undefined;
  /** Override the `.env` file path (tests). Default: `.env` at the current working directory. */
  readonly envFilePath?: string | undefined;
}

export class LiveMediaHost implements MediaHostPort {
  private readonly config: S3Config;
  private readonly runner: CommandRunner | undefined;
  private readonly jpegQuality: number | undefined;
  private readonly awsCommand: string | undefined;
  private readonly presetEnv: NodeJS.ProcessEnv | undefined;
  private readonly envFilePath: string | undefined;
  private envPromise: Promise<NodeJS.ProcessEnv> | undefined;

  constructor(options: LiveMediaHostOptions) {
    this.config = options.config;
    this.runner = options.runner;
    this.jpegQuality = options.jpegQuality;
    this.awsCommand = options.awsCommand;
    this.presetEnv = options.env;
    this.envFilePath = options.envFilePath;
  }

  async convertToJpg(sourcePath: string, destPath: string): Promise<void> {
    await convertPngToJpg(sourcePath, destPath, this.jpegQuality !== undefined ? { quality: this.jpegQuality } : {});
  }

  async upload(localPath: string, key: string, options: UploadOptions): Promise<UploadResult> {
    const env = await this.resolveEnv();
    return uploadViaAwsCli(localPath, key, this.config, options.expiresInSeconds, {
      runner: this.runner,
      awsCommand: this.awsCommand,
      env,
    });
  }

  async delete(key: string): Promise<void> {
    const env = await this.resolveEnv();
    await deleteViaAwsCli(key, this.config, {
      runner: this.runner,
      awsCommand: this.awsCommand,
      env,
    });
  }

  private resolveEnv(): Promise<NodeJS.ProcessEnv> {
    if (this.presetEnv !== undefined) return Promise.resolve(this.presetEnv);
    if (this.envPromise === undefined) {
      this.envPromise = loadEffectiveEnv({ envFilePath: this.envFilePath });
    }
    return this.envPromise;
  }
}
