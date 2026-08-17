/**
 * The live Apify request builder — pure deep module (issue #200).
 *
 * This is the ONE place the Apify bearer token is attached to an outgoing request. It exists to fix a
 * real leak: `.claude/agents/performance-tracker.md`'s hand-driven `curl` calls (and the default
 * `PerformanceScrapePort` this replaces) put the token in the URL as a `?token=...` query string. A
 * token in a URL query string reaches shell history (a pasted/typed curl command with the resolved
 * value) and any proxy or server access log that records full request URLs — both are places nobody
 * thinks to scrub. `buildApifyRunSyncRequest` puts the token ONLY in the `Authorization: Bearer <token>`
 * header; the URL it builds (`apifyRunSyncUrl`) never receives the token, or any other query-string
 * parameter, at all.
 *
 * Pure throughout: no I/O, no fetch, no clock, no env — fully unit-testable without a network call.
 */

import type { ApifyPlatform } from "../platform.ts";

/** One resolved HTTP request the live client is about to send. */
export interface ApifyRunSyncRequest {
  readonly url: string;
  readonly method: "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/**
 * Convert a `seeds.yaml` actor slug (e.g. `"apify/facebook-post-scraper"`) into the URL path segment
 * Apify's REST API expects (`"apify~facebook-post-scraper"`) — only the FIRST `/` is replaced (a real
 * actor slug never carries a second one). A slug with no `/` at all passes through unchanged.
 */
export function actorUrlSegment(actorSlug: string): string {
  const slash = actorSlug.indexOf("/");
  return slash === -1 ? actorSlug : `${actorSlug.slice(0, slash)}~${actorSlug.slice(slash + 1)}`;
}

/**
 * The Apify `run-sync-get-dataset-items` endpoint URL for one actor. NEVER carries a token or any other
 * query-string parameter — see the module docstring; this is half of the security fix, the other half
 * is `buildApifyRunSyncRequest` never appending one.
 */
export function apifyRunSyncUrl(actorSlug: string): string {
  return `https://api.apify.com/v2/acts/${actorUrlSegment(actorSlug)}/run-sync-get-dataset-items`;
}

/**
 * Build the per-platform actor input body for scraping ONE post by URL — the same shapes documented in
 * `.claude/agents/performance-tracker.md` and confirmed live for Instagram's oddly-named `username`
 * field (issue #48). `linkedin` has no verified actor or input shape yet (`src/apify/platform.ts`
 * already reports "not trackable" for it before a caller ever reaches here) — this throws rather than
 * fabricate a guessed shape (data-handling rule 8).
 */
export function apifyRunSyncInput(platform: ApifyPlatform, postUrl: string): Record<string, unknown> {
  switch (platform) {
    case "facebook":
    case "youtube":
      return { startUrls: [{ url: postUrl }] };
    case "instagram":
      return { username: [postUrl] };
    case "linkedin":
      throw new Error("apifyRunSyncInput: linkedin has no verified Apify actor input shape yet");
  }
}

export interface BuildApifyRunSyncRequestParams {
  readonly platform: ApifyPlatform;
  readonly actorSlug: string;
  readonly postUrl: string;
  readonly token: string;
}

/**
 * Build the exact HTTP request the live Apify client sends to scrape one post's public metrics.
 * SECURITY (issue #200): the token is placed ONLY in the `Authorization: Bearer <token>` header —
 * `apifyRunSyncUrl` never receives it, and this function never appends it (or anything else) to the URL
 * as a query string, so a captured request URL can never expose it.
 *
 * Pure: no I/O, deterministic, fully testable without a network call.
 */
export function buildApifyRunSyncRequest(params: BuildApifyRunSyncRequestParams): ApifyRunSyncRequest {
  const { platform, actorSlug, postUrl, token } = params;
  return {
    url: apifyRunSyncUrl(actorSlug),
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(apifyRunSyncInput(platform, postUrl)),
  };
}
