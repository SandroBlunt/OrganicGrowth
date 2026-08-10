/**
 * FAKE Zoho Schedule port implementing the narrow `ZohoSchedulePort` — THIS IS THE ZOHO MCP FAKE
 * (issue #163, ADR-0020).
 *
 * Mirrors `FakeMediaHost` (`src/media-host/fixtures/fake-media-host.ts`) and `FakeSpace`
 * (`src/space-driver/fixtures/fake-space.ts`): entirely in-memory, deterministic, and it records every
 * call it receives, IN ORDER, so a downstream test can assert on exactly what it asked Zoho to do —
 * without touching the network, a real Zoho account, or credits. No real MCP call happens here.
 */

import type {
  ZohoCreateScheduleResult,
  ZohoPostRequest,
  ZohoSchedulePort,
  ZohoUploadedMedia,
  ZohoValidateResult,
} from "../mcp-schedule-port.ts";

/** One recorded call, tagged by kind, in the exact order it was made — the sequence itself is the
 *  thing several tests assert on (ADR-0020 AC2: upload, then validate, then schedule). */
export type FakeZohoScheduleCall =
  | { readonly kind: "upload"; readonly url: string }
  | { readonly kind: "validate"; readonly request: ZohoPostRequest }
  | { readonly kind: "schedule"; readonly request: ZohoPostRequest };

export interface FakeZohoSchedulePortOptions {
  /** Called for every `validatePost`; return `{ ok: false }` to model Zoho refusing THIS ONE request.
   *  Defaults to always-`ok`. */
  readonly validate?: (request: ZohoPostRequest) => ZohoValidateResult;
  /** Assigns each successful `createSchedule` call its own reference. Defaults to an incrementing
   *  `"fake-ref-N"` string (1-based, across the whole fake's lifetime). */
  readonly reference?: (request: ZohoPostRequest, callIndex: number) => string;
}

export class FakeZohoSchedulePort implements ZohoSchedulePort {
  /** Every call, in order — upload, validate, and schedule calls interleaved exactly as they happened. */
  public readonly calls: FakeZohoScheduleCall[] = [];

  private uploadCount = 0;
  private scheduleCount = 0;
  private readonly options: FakeZohoSchedulePortOptions;

  constructor(options: FakeZohoSchedulePortOptions = {}) {
    this.options = options;
  }

  async uploadMediaFromUrl(url: string): Promise<ZohoUploadedMedia> {
    this.calls.push({ kind: "upload", url });
    this.uploadCount += 1;
    return { mediaId: `fake-media-${this.uploadCount}` };
  }

  async validatePost(request: ZohoPostRequest): Promise<ZohoValidateResult> {
    this.calls.push({ kind: "validate", request });
    return this.options.validate?.(request) ?? { ok: true };
  }

  async createSchedule(request: ZohoPostRequest): Promise<ZohoCreateScheduleResult> {
    this.calls.push({ kind: "schedule", request });
    this.scheduleCount += 1;
    const reference = this.options.reference?.(request, this.scheduleCount) ?? `fake-ref-${this.scheduleCount}`;
    return { reference };
  }
}
