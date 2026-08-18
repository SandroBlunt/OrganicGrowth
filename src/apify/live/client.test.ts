import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { LiveApifyClient, ApifyTokenMissingError, ApifyRequestError, type ApifyFetch } from "./client.ts";

// A realistic-shaped but clearly-fake token, built by concatenation — see request.test.ts for why.
const FAKE_TOKEN = "test-fake-apify-token-" + "c0ffee1234567890";

const FB_URL = "https://www.facebook.com/permalink.php?story_fbid=123&id=456";

interface CapturedCall {
  readonly url: string;
  readonly init: { method: string; headers: Record<string, string>; body: string };
}

/** A fake `fetchImpl` that records every call and returns a canned response — NEVER a real network
 *  call. This is the hermetic seam every test in this file drives the client through. */
function fakeFetch(
  responder: (call: CapturedCall) => { ok: boolean; status?: number; statusText?: string; body: string },
  calls: CapturedCall[] = [],
): { fetchImpl: ApifyFetch; calls: CapturedCall[] } {
  const fetchImpl: ApifyFetch = async (url, init) => {
    calls.push({ url, init });
    const result = responder({ url, init });
    return {
      ok: result.ok,
      status: result.status ?? (result.ok ? 200 : 500),
      statusText: result.statusText ?? (result.ok ? "OK" : "Internal Server Error"),
      async text() {
        return result.body;
      },
    };
  };
  return { fetchImpl, calls };
}

describe("LiveApifyClient.scrapePost — never a real network call in this suite (issue #200)", () => {
  it("sends the token ONLY in the Authorization header, never the URL, for a real end-to-end call", async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ ok: true, body: JSON.stringify([{ likes: 40 }]) }));
    const client = new LiveApifyClient({ token: FAKE_TOKEN, fetchImpl });

    const item = await client.scrapePost(FB_URL, "facebook", "apify/facebook-posts-scraper");

    assert.deepEqual(item, { likes: 40 });
    assert.equal(calls.length, 1);
    const call = calls[0]!;
    assert.equal(call.init.headers["Authorization"], `Bearer ${FAKE_TOKEN}`);
    assert.ok(!call.url.includes(FAKE_TOKEN), "the token must never appear in the URL");
    assert.ok(!call.url.includes("?"), "the URL must carry no query string at all");
    assert.equal(call.url, "https://api.apify.com/v2/acts/apify~facebook-posts-scraper/run-sync-get-dataset-items");
  });

  it("resolves the token from an injected env when no token option is given (real token-resolution path, still hermetic)", async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ ok: true, body: JSON.stringify([{ likes: 1 }]) }));
    const client = new LiveApifyClient({ env: { APIFY_API_TOKEN: FAKE_TOKEN }, fetchImpl });

    await client.scrapePost(FB_URL, "facebook", "apify/facebook-posts-scraper");

    assert.equal(calls[0]!.init.headers["Authorization"], `Bearer ${FAKE_TOKEN}`);
  });

  it("throws ApifyTokenMissingError when no token can be resolved — never a silent/fabricated scrape", async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ ok: true, body: "[]" }));
    const client = new LiveApifyClient({ env: {}, fetchImpl });

    await assert.rejects(
      () => client.scrapePost(FB_URL, "facebook", "apify/facebook-posts-scraper"),
      ApifyTokenMissingError,
    );
    assert.equal(calls.length, 0, "no request is ever sent without a token");
  });

  it("returns null when the actor's dataset is empty — a routine 'no data', never fabricated", async () => {
    const { fetchImpl } = fakeFetch(() => ({ ok: true, body: "[]" }));
    const client = new LiveApifyClient({ token: FAKE_TOKEN, fetchImpl });

    assert.equal(await client.scrapePost(FB_URL, "facebook", "apify/facebook-posts-scraper"), null);
  });

  it("throws ApifyRequestError on a non-ok HTTP response", async () => {
    const { fetchImpl } = fakeFetch(() => ({ ok: false, status: 401, statusText: "Unauthorized", body: "" }));
    const client = new LiveApifyClient({ token: FAKE_TOKEN, fetchImpl });

    await assert.rejects(
      () => client.scrapePost(FB_URL, "facebook", "apify/facebook-posts-scraper"),
      ApifyRequestError,
    );
  });

  it("routes Instagram's oddly-named 'username' input field and its own actor URL", async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ ok: true, body: JSON.stringify([{ likesCount: 5 }]) }));
    const client = new LiveApifyClient({ token: FAKE_TOKEN, fetchImpl });

    const igUrl = "https://www.instagram.com/p/abc123/";
    await client.scrapePost(igUrl, "instagram", "apify/instagram-post-scraper");

    const call = calls[0]!;
    assert.equal(call.url, "https://api.apify.com/v2/acts/apify~instagram-post-scraper/run-sync-get-dataset-items");
    assert.deepEqual(JSON.parse(call.init.body), { username: [igUrl] });
  });

  it("routes YouTube to a startUrls body and its own actor URL", async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ ok: true, body: JSON.stringify([{ viewCount: 5 }]) }));
    const client = new LiveApifyClient({ token: FAKE_TOKEN, fetchImpl });

    const ytUrl = "https://www.youtube.com/watch?v=abc123";
    await client.scrapePost(ytUrl, "youtube", "streamers/youtube-scraper");

    const call = calls[0]!;
    assert.equal(call.url, "https://api.apify.com/v2/acts/streamers~youtube-scraper/run-sync-get-dataset-items");
    assert.deepEqual(JSON.parse(call.init.body), { startUrls: [{ url: ytUrl }] });
  });

  it("a token passed directly as an option is used without ever consulting env/file", async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ ok: true, body: "[]" }));
    // env deliberately carries a DIFFERENT (also fake) value — proves the explicit token option wins,
    // never silently falling through to env resolution.
    const otherToken = "test-fake-apify-token-" + "aaaaaaaaaaaaaaaa";
    const client = new LiveApifyClient({ token: FAKE_TOKEN, env: { APIFY_API_TOKEN: otherToken }, fetchImpl });

    await client.scrapePost(FB_URL, "facebook", "apify/facebook-posts-scraper");

    assert.equal(calls[0]!.init.headers["Authorization"], `Bearer ${FAKE_TOKEN}`);
  });
});
