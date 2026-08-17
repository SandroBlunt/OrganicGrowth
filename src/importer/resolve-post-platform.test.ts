/**
 * Tests for `resolvePostPlatform` (`src/importer/resolve-post-platform.ts`) — issue #240.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolvePostPlatform } from "./resolve-post-platform.ts";
import { KNOWN_PLATFORMS } from "../copy/platform-shape.ts";

describe("resolvePostPlatform — resolves a Post's logged URL to a platform from its hostname alone", () => {
  it("resolves a real Straw Motion facebook.com permalink to facebook", () => {
    assert.equal(
      resolvePostPlatform(
        "https://www.facebook.com/permalink.php?story_fbid=pfbid0VMYBWhDbQHhQfyckAVFPwutpKJEM38fNySUqpNFXU4WZbWnENWHMjfdw1wACunR6l&id=61591885769033",
      ),
      "facebook",
    );
  });

  it("resolves a bare facebook.com/<id>/posts/<id> permalink to facebook (the real idea-2026-W32-10 shape)", () => {
    assert.equal(resolvePostPlatform("https://www.facebook.com/122096865609396192/posts/122114019723396192"), "facebook");
  });

  it("resolves one representative URL for every KNOWN_PLATFORMS entry — no platform is silently unreachable", () => {
    const samples: Readonly<Record<(typeof KNOWN_PLATFORMS)[number], string>> = {
      facebook: "https://www.facebook.com/permalink/123",
      instagram: "https://www.instagram.com/p/abc123/",
      linkedin: "https://www.linkedin.com/feed/update/urn:li:activity:123/",
      x: "https://x.com/acme/status/123",
      tiktok: "https://www.tiktok.com/@acme/video/123",
      youtube: "https://www.youtube.com/watch?v=abc123",
    };
    for (const platform of KNOWN_PLATFORMS) {
      assert.equal(resolvePostPlatform(samples[platform]), platform, `expected ${platform}'s sample URL to resolve to itself`);
    }
  });

  it("resolves x.com's legacy twitter.com host to x", () => {
    assert.equal(resolvePostPlatform("https://twitter.com/acme/status/123"), "x");
  });

  it("resolves a fb.watch short link and a youtu.be short link to their real platform", () => {
    assert.equal(resolvePostPlatform("https://fb.watch/abc123/"), "facebook");
    assert.equal(resolvePostPlatform("https://youtu.be/abc123"), "youtube");
  });

  it("returns null for a host matching none of the six known platforms — never guessed", () => {
    assert.equal(resolvePostPlatform("https://example.com/some/post/1"), null);
  });

  it("returns null for a string that does not parse as an absolute URL at all", () => {
    assert.equal(resolvePostPlatform("not a url"), null);
    assert.equal(resolvePostPlatform(""), null);
  });

  it("is case-insensitive on the hostname", () => {
    assert.equal(resolvePostPlatform("https://WWW.FACEBOOK.COM/permalink/123"), "facebook");
  });
});
