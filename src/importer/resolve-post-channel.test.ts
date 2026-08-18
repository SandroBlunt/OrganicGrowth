/**
 * Tests for `resolvePostChannel`/`extractChannelIdentifier` (`src/importer/resolve-post-channel.ts`) —
 * issue #243.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolvePostChannel, extractChannelIdentifier, type ChannelIdentity } from "./resolve-post-channel.ts";

describe("resolvePostChannel — a single configured Channel for the platform is unambiguous", () => {
  it("resolves directly, with no identifier check, when only one Channel exists for the platform", () => {
    const channels: ChannelIdentity[] = [{ platform: "facebook", url: "https://www.facebook.com/profile.php?id=61591885769033" }];
    const result = resolvePostChannel("https://www.facebook.com/permalink.php?story_fbid=abc&id=61591885769033", channels);
    assert.deepEqual(result, { ok: true, platform: "facebook", channelIndex: 0 });
  });

  it("resolves the real idea-2026-W32-10 Post even though its identifier does NOT match the Channel's own url — the real Facebook dual-id quirk", () => {
    const channels: ChannelIdentity[] = [{ platform: "facebook", url: "https://www.facebook.com/profile.php?id=61591885769033" }];
    // A DIFFERENT numeric Facebook Page id than the Channel's own configured url — real, verified data
    // (see this module's own doc comment). Still resolves: a single candidate needs no identifier match.
    const result = resolvePostChannel("https://www.facebook.com/122096865609396192/posts/122114019723396192", channels);
    assert.deepEqual(result, { ok: true, platform: "facebook", channelIndex: 0 });
  });

  it("resolves directly even when the Brand's one Channel for the platform has a blank url", () => {
    const channels: ChannelIdentity[] = [{ platform: "instagram", url: "" }];
    const result = resolvePostChannel("https://www.instagram.com/p/abc123/", channels);
    assert.deepEqual(result, { ok: true, platform: "instagram", channelIndex: 0 });
  });

  it("refuses when the platform matches zero configured Channels", () => {
    const channels: ChannelIdentity[] = [{ platform: "facebook", url: "" }];
    const result = resolvePostChannel("https://www.instagram.com/p/abc123/", channels);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reason, /instagram/);
    assert.match(result.reason, /no configured Channel/);
  });

  it("refuses when the URL does not resolve to any known platform at all", () => {
    const result = resolvePostChannel("https://example.com/post/1", [{ platform: "facebook", url: "" }]);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reason, /example\.com/);
  });
});

describe("resolvePostChannel — TWO Channels on the SAME platform: the ambiguous case this ticket exists for", () => {
  const twoFacebookChannels: ChannelIdentity[] = [
    { platform: "facebook", url: "https://www.facebook.com/profile.php?id=61591885769033" },
    { platform: "facebook", url: "https://www.facebook.com/profile.php?id=99999999999999" },
  ];

  it("resolves to the SPECIFIC Channel whose url identifier matches the post_url's own", () => {
    const result = resolvePostChannel("https://www.facebook.com/permalink.php?story_fbid=abc&id=99999999999999", twoFacebookChannels);
    assert.deepEqual(result, { ok: true, platform: "facebook", channelIndex: 1 });
  });

  it("resolves to the OTHER Channel when the identifier matches that one instead", () => {
    const result = resolvePostChannel("https://www.facebook.com/permalink.php?story_fbid=abc&id=61591885769033", twoFacebookChannels);
    assert.deepEqual(result, { ok: true, platform: "facebook", channelIndex: 0 });
  });

  it("refuses — never picks one — when the post_url's identifier matches NEITHER configured Channel", () => {
    const result = resolvePostChannel("https://www.facebook.com/permalink.php?story_fbid=abc&id=1234567890", twoFacebookChannels);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reason, /matches none/);
    assert.match(result.reason, /2 configured "facebook" Channels/);
  });

  it("refuses — never picks one — when the post_url carries no extractable identifier at all", () => {
    // /feed/update/urn:li:activity:... has no vanity slug; a facebook.com analogue: a bare share link
    // whose path segment is a known non-identifier shape.
    const result = resolvePostChannel("https://www.facebook.com/watch/?v=123", twoFacebookChannels);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reason, /carries no extractable facebook identifier/);
  });

  it("refuses when BOTH configured Channels carry a blank url — nothing to match against", () => {
    const blankChannels: ChannelIdentity[] = [
      { platform: "facebook", url: "" },
      { platform: "facebook", url: "" },
    ];
    const result = resolvePostChannel("https://www.facebook.com/permalink.php?story_fbid=abc&id=61591885769033", blankChannels);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reason, /matches none/);
  });

  it("resolves to the one Channel with a real url even when a SECOND, unconfigured (blank-url) Channel exists on the same platform", () => {
    const mixed: ChannelIdentity[] = [
      { platform: "facebook", url: "https://www.facebook.com/profile.php?id=61591885769033" },
      { platform: "facebook", url: "" }, // a second Page added but not yet configured with its url
    ];
    const result = resolvePostChannel("https://www.facebook.com/permalink.php?story_fbid=abc&id=61591885769033", mixed);
    assert.deepEqual(result, { ok: true, platform: "facebook", channelIndex: 0 });
  });

  it("refuses when the identifier matches more than one configured Channel (a genuinely duplicate configuration)", () => {
    const duplicateUrls: ChannelIdentity[] = [
      { platform: "facebook", url: "https://www.facebook.com/profile.php?id=61591885769033" },
      { platform: "facebook", url: "https://www.facebook.com/permalink.php?id=61591885769033" },
    ];
    const result = resolvePostChannel("https://www.facebook.com/permalink.php?story_fbid=abc&id=61591885769033", duplicateUrls);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reason, /ambiguous/);
  });
});

describe("extractChannelIdentifier — per-platform identifier rules", () => {
  it("facebook: the id= query param wins even when a path segment is also present", () => {
    assert.equal(extractChannelIdentifier("facebook", "https://www.facebook.com/profile.php?id=123"), "123");
    assert.equal(extractChannelIdentifier("facebook", "https://www.facebook.com/permalink.php?story_fbid=x&id=456"), "456");
  });

  it("facebook: a bare numeric path segment (the alternate permalink shape) is the identifier", () => {
    assert.equal(extractChannelIdentifier("facebook", "https://www.facebook.com/122096865609396192/posts/122114019723396192"), "122096865609396192");
  });

  it("facebook: a vanity Page name path is the identifier", () => {
    assert.equal(extractChannelIdentifier("facebook", "https://www.facebook.com/StrawMotion"), "strawmotion");
  });

  it("facebook: a content-shape path (watch/reel/share) carries no identifier", () => {
    assert.equal(extractChannelIdentifier("facebook", "https://www.facebook.com/watch/?v=123"), null);
    assert.equal(extractChannelIdentifier("facebook", "https://www.facebook.com/reel/123"), null);
  });

  it("youtube: an @handle path segment is the identifier", () => {
    assert.equal(extractChannelIdentifier("youtube", "https://www.youtube.com/@strawmotion"), "strawmotion");
  });

  it("youtube: a channel/ or user/ lookup path's second segment is the identifier", () => {
    assert.equal(extractChannelIdentifier("youtube", "https://www.youtube.com/channel/UC12345"), "uc12345");
    assert.equal(extractChannelIdentifier("youtube", "https://www.youtube.com/user/acme"), "acme");
  });

  it("youtube: a bare watch/shorts link carries no channel-owning identifier", () => {
    assert.equal(extractChannelIdentifier("youtube", "https://www.youtube.com/watch?v=abc123"), null);
    assert.equal(extractChannelIdentifier("youtube", "https://www.youtube.com/shorts/abc123"), null);
  });

  it("x: the handle path segment is the identifier, but reserved non-handle segments are not", () => {
    assert.equal(extractChannelIdentifier("x", "https://x.com/acme/status/123"), "acme");
    assert.equal(extractChannelIdentifier("x", "https://x.com/i/status/123"), null);
  });

  it("tiktok: an @handle path segment is the identifier; anything else is not", () => {
    assert.equal(extractChannelIdentifier("tiktok", "https://www.tiktok.com/@acme/video/123"), "acme");
    assert.equal(extractChannelIdentifier("tiktok", "https://www.tiktok.com/foo/video/123"), null);
  });

  it("instagram: a real handle path is the identifier; canonical /p//reel//tv/ links are not", () => {
    assert.equal(extractChannelIdentifier("instagram", "https://www.instagram.com/strawmotion/"), "strawmotion");
    assert.equal(extractChannelIdentifier("instagram", "https://www.instagram.com/p/abc123/"), null);
    assert.equal(extractChannelIdentifier("instagram", "https://www.instagram.com/reel/abc123/"), null);
  });

  it("linkedin: a /posts/<company>_<slug>-activity-N/ path's company slug is the identifier", () => {
    assert.equal(extractChannelIdentifier("linkedin", "https://www.linkedin.com/posts/straw-motion_ai-news-activity-712345-abcd"), "straw-motion");
  });

  it("linkedin: a /company/<slug>/ or /in/<slug>/ path is the identifier; a bare activity-urn feed link is not", () => {
    assert.equal(extractChannelIdentifier("linkedin", "https://www.linkedin.com/company/straw-motion/"), "straw-motion");
    assert.equal(extractChannelIdentifier("linkedin", "https://www.linkedin.com/feed/update/urn:li:activity:123/"), null);
  });

  it("returns null for a blank url or one that does not parse as an absolute URL", () => {
    assert.equal(extractChannelIdentifier("facebook", ""), null);
    assert.equal(extractChannelIdentifier("facebook", "   "), null);
    assert.equal(extractChannelIdentifier("facebook", "not a url"), null);
  });
});
