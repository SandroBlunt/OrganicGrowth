import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  actorUrlSegment,
  apifyRunSyncUrl,
  apifyRunSyncInput,
  buildApifyRunSyncRequest,
} from "./request.ts";

// A realistic-shaped but clearly-fake token, built by concatenation (never one contiguous literal) —
// same convention `src/secrets-scan/scanner.test.ts` uses for its own fixture values, so this file's
// own tracked source text never carries a credential-shaped run next to a secret-shaped key.
const FAKE_TOKEN = "test-fake-apify-token-" + "9f8e7d6c5b4a3210";

const POST_URL = "https://www.facebook.com/permalink.php?story_fbid=123&id=456";

describe("actorUrlSegment — converts a seeds.yaml actor slug into Apify's URL path segment (issue #200)", () => {
  it("replaces the first slash with a tilde", () => {
    assert.equal(actorUrlSegment("apify/facebook-post-scraper"), "apify~facebook-post-scraper");
    assert.equal(actorUrlSegment("streamers/youtube-scraper"), "streamers~youtube-scraper");
  });

  it("only replaces the FIRST slash, never a second one", () => {
    assert.equal(actorUrlSegment("a/b/c"), "a~b/c");
  });

  it("passes a slug with no slash through unchanged", () => {
    assert.equal(actorUrlSegment("no-slash-here"), "no-slash-here");
  });
});

describe("apifyRunSyncUrl — the run-sync-get-dataset-items endpoint, NEVER carrying a token or query string (issue #200)", () => {
  it("builds the expected URL for a Facebook actor slug", () => {
    assert.equal(
      apifyRunSyncUrl("apify/facebook-post-scraper"),
      "https://api.apify.com/v2/acts/apify~facebook-post-scraper/run-sync-get-dataset-items",
    );
  });

  it("never contains a '?' — no query string of any kind", () => {
    assert.ok(!apifyRunSyncUrl("apify/facebook-post-scraper").includes("?"));
  });

  it("never contains the substring 'token' in any casing", () => {
    const url = apifyRunSyncUrl("apify/facebook-post-scraper");
    assert.ok(!/token/i.test(url));
  });
});

describe("apifyRunSyncInput — per-platform actor input body (issue #200)", () => {
  it("Facebook and YouTube use a startUrls array", () => {
    assert.deepEqual(apifyRunSyncInput("facebook", POST_URL), { startUrls: [{ url: POST_URL }] });
    assert.deepEqual(apifyRunSyncInput("youtube", POST_URL), { startUrls: [{ url: POST_URL }] });
  });

  it("Instagram's oddly-named 'username' field carries the post URL (verified live, issue #48)", () => {
    assert.deepEqual(apifyRunSyncInput("instagram", POST_URL), { username: [POST_URL] });
  });

  it("linkedin throws rather than fabricate an unverified input shape", () => {
    assert.throws(() => apifyRunSyncInput("linkedin", POST_URL), /linkedin/i);
  });
});

// === The security-critical proof (issue #200 acceptance criterion) ===================================
//
// "The Apify token is sent in a header, never in a URL query string, so it does not reach shell
// history or any proxy log in the path." This is what would actually catch a regression back to
// query-string auth — it asserts on the concrete request the client builds, not merely that SOME
// header exists somewhere.

describe("buildApifyRunSyncRequest — the token travels ONLY in the Authorization header (issue #200)", () => {
  it("puts the token in the Authorization header as a Bearer token", () => {
    const request = buildApifyRunSyncRequest({
      platform: "facebook",
      actorSlug: "apify/facebook-post-scraper",
      postUrl: POST_URL,
      token: FAKE_TOKEN,
    });
    assert.equal(request.headers["Authorization"], `Bearer ${FAKE_TOKEN}`);
  });

  it("the URL NEVER contains the token value, in any form", () => {
    const request = buildApifyRunSyncRequest({
      platform: "facebook",
      actorSlug: "apify/facebook-post-scraper",
      postUrl: POST_URL,
      token: FAKE_TOKEN,
    });
    assert.ok(!request.url.includes(FAKE_TOKEN));
    assert.ok(!request.url.includes("token"));
    assert.ok(!request.url.includes("?"), "the URL must carry no query string at all");
  });

  it("the request body NEVER contains the token value either", () => {
    const request = buildApifyRunSyncRequest({
      platform: "facebook",
      actorSlug: "apify/facebook-post-scraper",
      postUrl: POST_URL,
      token: FAKE_TOKEN,
    });
    assert.ok(!request.body.includes(FAKE_TOKEN));
  });

  it("is a POST with a JSON Content-Type header", () => {
    const request = buildApifyRunSyncRequest({
      platform: "instagram",
      actorSlug: "apify/instagram-post-scraper",
      postUrl: POST_URL,
      token: FAKE_TOKEN,
    });
    assert.equal(request.method, "POST");
    assert.equal(request.headers["Content-Type"], "application/json");
  });

  it("routes each platform to its own actor URL and input body", () => {
    const fb = buildApifyRunSyncRequest({
      platform: "facebook",
      actorSlug: "apify/facebook-post-scraper",
      postUrl: POST_URL,
      token: FAKE_TOKEN,
    });
    assert.equal(fb.url, "https://api.apify.com/v2/acts/apify~facebook-post-scraper/run-sync-get-dataset-items");
    assert.deepEqual(JSON.parse(fb.body), { startUrls: [{ url: POST_URL }] });

    const ig = buildApifyRunSyncRequest({
      platform: "instagram",
      actorSlug: "apify/instagram-post-scraper",
      postUrl: POST_URL,
      token: FAKE_TOKEN,
    });
    assert.equal(ig.url, "https://api.apify.com/v2/acts/apify~instagram-post-scraper/run-sync-get-dataset-items");
    assert.deepEqual(JSON.parse(ig.body), { username: [POST_URL] });

    const yt = buildApifyRunSyncRequest({
      platform: "youtube",
      actorSlug: "streamers/youtube-scraper",
      postUrl: POST_URL,
      token: FAKE_TOKEN,
    });
    assert.equal(yt.url, "https://api.apify.com/v2/acts/streamers~youtube-scraper/run-sync-get-dataset-items");
    assert.deepEqual(JSON.parse(yt.body), { startUrls: [{ url: POST_URL }] });
  });
});
