/**
 * FAKE Media Host implementing the narrow `MediaHostPort` — THIS IS THE MEDIA HOST FAKE (issue #144).
 *
 * Mirrors `FakeSpace` (`src/space-driver/fixtures/fake-space.ts`, the Magnific fake) and the
 * `PerformanceScrapePort` fakes used throughout `src/commands/track-performance.test.ts`: entirely
 * in-memory, deterministic, and it records every call it receives so a downstream test (the Schedule
 * Batch export, a later slice) can assert on exactly what it asked the Media Host to do — without
 * touching `sips`, the AWS CLI, S3, or the network.
 *
 * No real file I/O happens here. `convertToJpg` and `upload` only RECORD their arguments (issue #144
 * acceptance criterion 1: "the in-memory fake records calls so downstream tests can assert on them").
 */

import type { MediaHostPort, UploadOptions, UploadResult } from "../port.ts";
import { assertJpgKey } from "../key.ts";
import { assertValidExpiresInSeconds } from "../aws-presign-limit.ts";

/** One recorded `convertToJpg` call. */
export interface ConvertCall {
  readonly sourcePath: string;
  readonly destPath: string;
}

/** One recorded `upload` call. */
export interface UploadCall {
  readonly localPath: string;
  readonly key: string;
  /** The expiry (seconds) this call was given (issue #198). */
  readonly expiresInSeconds: number;
}

export interface FakeMediaHostOptions {
  /** The URL prefix `upload` returns results under. Default: `https://fake-media-host.example/`. */
  readonly baseUrl?: string;
  /** When true, every `convertToJpg` call throws (models a `sips` failure) — after being recorded. */
  readonly failConverts?: boolean;
  /** When true, every `upload` call throws (models an AWS CLI upload failure) — after being recorded. */
  readonly failUploads?: boolean;
  /** When true, every `delete` call throws (models an AWS CLI delete failure) — after being recorded. */
  readonly failDeletes?: boolean;
}

const DEFAULT_BASE_URL = "https://fake-media-host.example/";

export class FakeMediaHost implements MediaHostPort {
  /** Every `convertToJpg` call, in order. */
  public readonly convertCalls: ConvertCall[] = [];
  /** Every SUCCESSFULLY-VALIDATED `upload` call, in order (a rejected `.jpg`-less key is never recorded). */
  public readonly uploadCalls: UploadCall[] = [];
  /** Every `delete` call, in order. */
  public readonly deleteCalls: string[] = [];

  private readonly baseUrl: string;
  private readonly options: FakeMediaHostOptions;
  private readonly hosted = new Set<string>();

  constructor(options: FakeMediaHostOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.options = options;
  }

  async convertToJpg(sourcePath: string, destPath: string): Promise<void> {
    this.convertCalls.push({ sourcePath, destPath });
    if (this.options.failConverts) {
      throw new Error(`FakeMediaHost: convertToJpg failed (modelled failure) for "${sourcePath}"`);
    }
  }

  async upload(localPath: string, key: string, options: UploadOptions): Promise<UploadResult> {
    assertJpgKey(key);
    assertValidExpiresInSeconds(options.expiresInSeconds);
    this.uploadCalls.push({ localPath, key, expiresInSeconds: options.expiresInSeconds });
    if (this.options.failUploads) {
      throw new Error(`FakeMediaHost: upload failed (modelled failure) for "${key}"`);
    }
    this.hosted.add(key);
    return { url: `${this.baseUrl}${key}` };
  }

  async delete(key: string): Promise<void> {
    this.deleteCalls.push(key);
    if (this.options.failDeletes) {
      throw new Error(`FakeMediaHost: delete failed (modelled failure) for "${key}"`);
    }
    this.hosted.delete(key);
  }

  /** Whether `key` is currently considered hosted (uploaded and not since deleted). For assertions. */
  isHosted(key: string): boolean {
    return this.hosted.has(key);
  }
}
