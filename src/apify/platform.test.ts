/**
 * Tests for `detectPlatformFromUrl` and `resolveApifyActor` — pure, no I/O, no Apify, no Magnific.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectPlatformFromUrl, resolveApifyActor } from "./platform.ts";

// ---------------------------------------------------------------------------
// detectPlatformFromUrl
// ---------------------------------------------------------------------------

describe("detectPlatformFromUrl — derives the platform from the URL, never from a default", () => {
  it("detects facebook.com", () => {
    assert.equal(detectPlatformFromUrl("https://www.facebook.com/SomePage"), "facebook");
  });

  it("detects fb.watch", () => {
    assert.equal(detectPlatformFromUrl("https://fb.watch/abc123/"), "facebook");
  });

  it("detects instagram.com", () => {
    assert.equal(detectPlatformFromUrl("https://www.instagram.com/theaifield/"), "instagram");
  });

  it("detects a single Instagram post URL", () => {
    assert.equal(detectPlatformFromUrl("https://www.instagram.com/p/Da0YoASz8cj/"), "instagram");
  });

  it("detects youtube.com", () => {
    assert.equal(detectPlatformFromUrl("https://www.youtube.com/@curiousrefuge/videos"), "youtube");
  });

  it("detects a youtu.be short link", () => {
    assert.equal(detectPlatformFromUrl("https://youtu.be/llFR17DcfMo"), "youtube");
  });

  it("detects linkedin.com", () => {
    assert.equal(detectPlatformFromUrl("https://www.linkedin.com/company/acme/"), "linkedin");
  });

  it("returns null for an unrecognised domain (never guesses)", () => {
    assert.equal(detectPlatformFromUrl("https://www.tiktok.com/@someone"), null);
  });

  it("returns null for an unparseable URL (never throws)", () => {
    assert.equal(detectPlatformFromUrl("not a url"), null);
  });

  it("returns null for an empty string", () => {
    assert.equal(detectPlatformFromUrl(""), null);
  });

  it("is case-insensitive on the hostname", () => {
    assert.equal(detectPlatformFromUrl("https://WWW.INSTAGRAM.COM/theaifield/"), "instagram");
  });
});

// ---------------------------------------------------------------------------
// resolveApifyActor
// ---------------------------------------------------------------------------

const SEEDS_APIFY = {
  facebook: {
    trends_actor: "apify/facebook-posts-scraper",
    post_actor: "apify/facebook-post-scraper",
  },
  instagram: {
    trends_actor: "apify/instagram-scraper",
    post_actor: "apify/instagram-post-scraper",
  },
  youtube: {
    trends_actor: "streamers/youtube-scraper",
    post_actor: "streamers/youtube-scraper",
  },
  linkedin: {
    trends_actor: "...",
    post_actor: "...",
  },
};

describe("resolveApifyActor — reads apify.<platform>.<purpose> defensively, never fabricates", () => {
  it("resolves the Facebook trends actor", () => {
    assert.equal(resolveApifyActor(SEEDS_APIFY, "facebook", "trends_actor"), "apify/facebook-posts-scraper");
  });

  it("resolves the Facebook post actor", () => {
    assert.equal(resolveApifyActor(SEEDS_APIFY, "facebook", "post_actor"), "apify/facebook-post-scraper");
  });

  it("resolves the Instagram trends actor", () => {
    assert.equal(resolveApifyActor(SEEDS_APIFY, "instagram", "trends_actor"), "apify/instagram-scraper");
  });

  it("resolves the Instagram post actor", () => {
    assert.equal(resolveApifyActor(SEEDS_APIFY, "instagram", "post_actor"), "apify/instagram-post-scraper");
  });

  it("resolves the YouTube trends actor", () => {
    assert.equal(resolveApifyActor(SEEDS_APIFY, "youtube", "trends_actor"), "streamers/youtube-scraper");
  });

  it("resolves the YouTube post actor", () => {
    assert.equal(resolveApifyActor(SEEDS_APIFY, "youtube", "post_actor"), "streamers/youtube-scraper");
  });

  it("returns null for the LinkedIn placeholder — never returns the literal '...' string", () => {
    assert.equal(resolveApifyActor(SEEDS_APIFY, "linkedin", "trends_actor"), null);
    assert.equal(resolveApifyActor(SEEDS_APIFY, "linkedin", "post_actor"), null);
  });

  it("returns null when the platform block is entirely absent", () => {
    assert.equal(resolveApifyActor({ facebook: SEEDS_APIFY.facebook }, "youtube", "trends_actor"), null);
  });

  it("returns null when apifyConfig itself is not an object (garbled seeds.yaml)", () => {
    assert.equal(resolveApifyActor(null, "facebook", "trends_actor"), null);
    assert.equal(resolveApifyActor(undefined, "facebook", "trends_actor"), null);
    assert.equal(resolveApifyActor("nope", "facebook", "trends_actor"), null);
  });

  it("returns null when the purpose key is missing or not a string", () => {
    assert.equal(resolveApifyActor({ facebook: {} }, "facebook", "trends_actor"), null);
    assert.equal(resolveApifyActor({ facebook: { trends_actor: 42 } }, "facebook", "trends_actor"), null);
  });

  it("trims whitespace from a resolved actor slug", () => {
    const config = { facebook: { trends_actor: "  apify/facebook-posts-scraper  " } };
    assert.equal(resolveApifyActor(config, "facebook", "trends_actor"), "apify/facebook-posts-scraper");
  });

  it("returns null for an empty-string actor slug", () => {
    assert.equal(resolveApifyActor({ facebook: { trends_actor: "" } }, "facebook", "trends_actor"), null);
  });
});
