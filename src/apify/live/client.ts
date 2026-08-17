/**
 * The live Apify client (issue #200): implements `PerformanceScrapePort` for real, replacing the
 * always-`null` deferred stub `track-performance.ts` shipped with. Mirrors `LiveMediaHost`'s shape
 * (`src/media-host/live/adapter.ts`) — a thin class over already-pure/injectable pieces:
 *
 *   - `resolveApifyToken` (`./token.ts`) for the credential (read-secrets-from-env, never hardcoded).
 *   - `buildApifyRunSyncRequest` (`./request.ts`) for the exact request — token in the Authorization
 *     header, NEVER the URL (the security fix this whole slice exists for).
 *   - `parseRunSyncDatasetItems` (`./response.ts`) for turning the raw response body into the first
 *     dataset item, or `null`.
 *
 * NEVER used in `npm test` — every test in `src/commands/track-performance*.test.ts` and
 * `src/producer/two-recipes-end-to-end.test.ts` injects a fake `PerformanceScrapePort` directly; this
 * class's OWN tests (`client.test.ts`) inject a fake `fetchImpl`, never the real global `fetch` — so no
 * test anywhere in this repository makes a network call or spends an Apify credit.
 */

import type { PerformanceScrapePort } from "../../commands/track-performance-port.ts";
import type { ApifyPlatform } from "../platform.ts";
import { buildApifyRunSyncRequest } from "./request.ts";
import { parseRunSyncDatasetItems } from "./response.ts";
import { resolveApifyToken } from "./token.ts";

/** The minimal shape of a `fetch` Response this client needs — real `fetch` satisfies this structurally. */
export interface ApifyHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  text(): Promise<string>;
}

/** The narrow HTTP seam this client calls through. Default: the real global `fetch`. Tests ALWAYS
 *  inject a fake — see the module docstring. */
export type ApifyFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<ApifyHttpResponse>;

export interface LiveApifyClientOptions {
  /** A pre-resolved token (tests). Omit to resolve `APIFY_API_TOKEN` lazily via `resolveApifyToken`. */
  readonly token?: string | undefined;
  /** Injected in tests to prove request construction without a real network call. Default: the real
   *  global `fetch`. */
  readonly fetchImpl?: ApifyFetch | undefined;
  /** A pre-resolved env for token resolution (tests). */
  readonly env?: NodeJS.ProcessEnv | undefined;
  /** Override the `.env` file path (tests). */
  readonly envFilePath?: string | undefined;
}

/** Thrown when `APIFY_API_TOKEN` cannot be resolved — never a silent/fabricated scrape. */
export class ApifyTokenMissingError extends Error {
  constructor() {
    super(
      "APIFY_API_TOKEN is not set — add it to .env (copy .env.example) or export it in the shell " +
        "before running a live /track-performance pull.",
    );
    this.name = "ApifyTokenMissingError";
  }
}

/** Thrown when the Apify API itself reports a non-ok HTTP status. */
export class ApifyRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
  ) {
    super(`Apify request failed: ${status} ${statusText}`);
    this.name = "ApifyRequestError";
  }
}

export class LiveApifyClient implements PerformanceScrapePort {
  private readonly presetToken: string | undefined;
  private readonly fetchImpl: ApifyFetch;
  private readonly env: NodeJS.ProcessEnv | undefined;
  private readonly envFilePath: string | undefined;
  private tokenPromise: Promise<string | null> | undefined;

  constructor(options: LiveApifyClientOptions = {}) {
    this.presetToken = options.token;
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as ApifyFetch);
    this.env = options.env;
    this.envFilePath = options.envFilePath;
  }

  /**
   * Scrape one post's public metrics via its platform's Apify actor. Returns the raw first dataset
   * item, or `null` when the actor found nothing (a routine, honestly-reported outcome — never
   * fabricated). Throws `ApifyTokenMissingError`/`ApifyRequestError`/a JSON-parse error on failure; the
   * caller (`trackPerformanceCommand`) already catches a thrown scrape and reports it as SKIPPED rather
   * than crashing the run.
   */
  async scrapePost(url: string, platform: ApifyPlatform, actorSlug: string): Promise<unknown | null> {
    const token = await this.resolveToken();
    if (token === null) throw new ApifyTokenMissingError();

    const request = buildApifyRunSyncRequest({ platform, actorSlug, postUrl: url, token });
    const response = await this.fetchImpl(request.url, {
      method: request.method,
      headers: request.headers as Record<string, string>,
      body: request.body,
    });
    if (!response.ok) throw new ApifyRequestError(response.status, response.statusText);

    const bodyText = await response.text();
    return parseRunSyncDatasetItems(bodyText);
  }

  private resolveToken(): Promise<string | null> {
    if (this.presetToken !== undefined) return Promise.resolve(this.presetToken);
    if (this.tokenPromise === undefined) {
      this.tokenPromise = resolveApifyToken({ env: this.env, envFilePath: this.envFilePath });
    }
    return this.tokenPromise;
  }
}
