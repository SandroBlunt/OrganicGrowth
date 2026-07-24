import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  requiredCtaFrom,
  requiredHashtagsFrom,
  loadCopyRules,
  watermarkHandleFrom,
  loadWatermarkHandle,
  channelsFrom,
  primaryChannelFrom,
  loadChannels,
  loadPrimaryChannel,
} from "./brand-profile.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const BANNED_PROFILE = join(HERE, "fixtures", "brand-profile.banned.yaml");
const CHANNELS_PROFILE = join(HERE, "fixtures", "brand-profile.channels.yaml");

describe("requiredCtaFrom (defensive) — ADR-0012: bring the dead required_cta rule live", () => {
  it("reads a configured required_cta verbatim", () => {
    assert.equal(requiredCtaFrom({ required_cta: "Link in bio!" }), "Link in bio!");
  });

  it("trims surrounding whitespace", () => {
    assert.equal(requiredCtaFrom({ required_cta: "  Link in bio!  " }), "Link in bio!");
  });

  it("returns null for the real profile's default shape (an empty string) — never an empty sentinel", () => {
    assert.equal(requiredCtaFrom({ required_cta: "" }), null);
    assert.equal(requiredCtaFrom({ required_cta: "   " }), null);
  });

  it("returns null when required_cta is absent, non-string, or the raw value isn't an object", () => {
    assert.equal(requiredCtaFrom({}), null);
    assert.equal(requiredCtaFrom({ required_cta: 7 }), null);
    assert.equal(requiredCtaFrom(null), null);
  });
});

describe("requiredHashtagsFrom (defensive) — ADR-0012: bring the dead required_hashtags rule live", () => {
  it("reads a configured required_hashtags list", () => {
    assert.deepEqual(requiredHashtagsFrom({ required_hashtags: ["#lifehacks", "#tips"] }), [
      "#lifehacks",
      "#tips",
    ]);
  });

  it("returns [] for the real profile's default shape (an empty list)", () => {
    assert.deepEqual(requiredHashtagsFrom({ required_hashtags: [] }), []);
  });

  it("drops non-string and blank entries defensively", () => {
    assert.deepEqual(requiredHashtagsFrom({ required_hashtags: ["#a", 7, "", "  ", "#b"] }), [
      "#a",
      "#b",
    ]);
  });

  it("returns [] when required_hashtags is absent or the raw value isn't an object", () => {
    assert.deepEqual(requiredHashtagsFrom({}), []);
    assert.deepEqual(requiredHashtagsFrom(null), []);
  });
});

describe("loadCopyRules — bundles required_cta/required_hashtags/banned_words in one read", () => {
  it("reads all three from a fixture Brand Profile", async () => {
    const rules = await loadCopyRules(BANNED_PROFILE);
    assert.deepEqual(rules, {
      requiredCta: "Link in bio!",
      requiredHashtags: ["#lifehacks"],
      bannedWords: ["cure", "miracle", "guaranteed"],
    });
  });

  it("a missing Brand Profile loads as no rules configured, never crashes", async () => {
    const rules = await loadCopyRules(join(HERE, "fixtures", "nope.yaml"));
    assert.deepEqual(rules, { requiredCta: null, requiredHashtags: [], bannedWords: [] });
  });
});

describe("watermarkHandleFrom (defensive) — QA-1 (issue #88): the @handle a Recipe's watermarkNode gets set to", () => {
  it("reads a configured production.watermark_handle, trimmed", () => {
    assert.equal(watermarkHandleFrom({ production: { watermark_handle: "  @strawmotion  " } }), "@strawmotion");
  });

  it("returns '' for the real profile's default shape (not yet configured) — never null/undefined", () => {
    assert.equal(watermarkHandleFrom({ production: { watermark_handle: "" } }), "");
    assert.equal(watermarkHandleFrom({}), "");
    assert.equal(watermarkHandleFrom({ production: {} }), "");
  });

  it("returns '' when production or watermark_handle is malformed — never throws", () => {
    assert.equal(watermarkHandleFrom({ production: "not an object" }), "");
    assert.equal(watermarkHandleFrom({ production: { watermark_handle: 7 } }), "");
    assert.equal(watermarkHandleFrom(null), "");
  });
});

describe("loadWatermarkHandle — reads production.watermark_handle from a Brand Profile file", () => {
  it("a missing Brand Profile loads as '' (not yet configured), never crashes", async () => {
    const handle = await loadWatermarkHandle(join(HERE, "fixtures", "nope.yaml"));
    assert.equal(handle, "");
  });

  it("the real fixture profile (no production block) loads as ''", async () => {
    const handle = await loadWatermarkHandle(BANNED_PROFILE);
    assert.equal(handle, "");
  });
});

// ---------------------------------------------------------------------------
// channelsFrom / primaryChannelFrom / loadChannels / loadPrimaryChannel (ADR-0019, issue #127)
// ---------------------------------------------------------------------------

describe("channelsFrom (defensive) — ADR-0019: channel is now a LIST of Channel entries", () => {
  it("reads a multi-Channel list, one entry marked primary", () => {
    const channels = channelsFrom({
      channel: [
        { platform: "facebook", url: "https://www.facebook.com/testbrand", primary: true },
        { platform: "instagram", url: "" },
        { platform: "linkedin" },
      ],
    });
    assert.deepEqual(channels, [
      { platform: "facebook", url: "https://www.facebook.com/testbrand", primary: true },
      { platform: "instagram", url: "", primary: false },
      { platform: "linkedin", url: "", primary: false },
    ]);
  });

  it("trims platform and url", () => {
    const channels = channelsFrom({
      channel: [{ platform: "  facebook  ", url: "  https://example.test  ", primary: true }],
    });
    assert.deepEqual(channels, [
      { platform: "facebook", url: "https://example.test", primary: true },
    ]);
  });

  it("returns [] for a missing channel key, or when the raw value isn't an object", () => {
    assert.deepEqual(channelsFrom({}), []);
    assert.deepEqual(channelsFrom(null), []);
    assert.deepEqual(channelsFrom(undefined), []);
  });

  it("returns [] for the pre-ADR-0019 single-object channel shape — NO back-compat shim", () => {
    // The ADR calls for migrate-in-place, not a back-compat parse of the old
    // `channel: { name, platform, url }` object — a non-array `channel` is treated as absent.
    assert.deepEqual(
      channelsFrom({ channel: { name: "TestBrand", platform: "facebook", url: "https://x.test" } }),
      [],
    );
  });

  it("drops malformed entries defensively — never crashes (data-handling rule 4)", () => {
    const channels = channelsFrom({
      channel: [
        { platform: "facebook", url: "https://www.facebook.com/testbrand", primary: true },
        null,
        42,
        "facebook",
        {},
        { platform: "" },
        { platform: "   " },
        { platform: 7, url: "https://x.test" },
        { platform: "tiktok", url: 12345 },
        { platform: "x", primary: "yes" },
      ],
    });
    assert.deepEqual(channels, [
      { platform: "facebook", url: "https://www.facebook.com/testbrand", primary: true },
      // `url: 12345` is non-string → defaults to "".
      { platform: "tiktok", url: "", primary: false },
      // `primary: "yes"` is non-boolean → defaults to false.
      { platform: "x", url: "", primary: false },
    ]);
  });

  it("returns [] when channel itself is not an array (e.g. a string, a number)", () => {
    assert.deepEqual(channelsFrom({ channel: "facebook" }), []);
    assert.deepEqual(channelsFrom({ channel: 7 }), []);
  });
});

describe("primaryChannelFrom (defensive) — ADR-0019: the ONE Channel readiness/baseline/ledger key off", () => {
  it("returns the entry marked primary: true", () => {
    const primary = primaryChannelFrom({
      channel: [
        { platform: "instagram", url: "" },
        { platform: "facebook", url: "https://www.facebook.com/testbrand", primary: true },
      ],
    });
    assert.deepEqual(primary, { platform: "facebook", url: "https://www.facebook.com/testbrand", primary: true });
  });

  it("returns null when no entry is marked primary", () => {
    assert.equal(
      primaryChannelFrom({ channel: [{ platform: "facebook", url: "https://x.test" }] }),
      null,
    );
  });

  it("returns null for an empty channel list, a missing channel key, or the old single-object shape", () => {
    assert.equal(primaryChannelFrom({ channel: [] }), null);
    assert.equal(primaryChannelFrom({}), null);
    assert.equal(
      primaryChannelFrom({ channel: { name: "TestBrand", platform: "facebook", url: "https://x.test" } }),
      null,
    );
  });

  it("picks the first entry deterministically when more than one is (mis)configured primary", () => {
    const primary = primaryChannelFrom({
      channel: [
        { platform: "facebook", url: "https://a.test", primary: true },
        { platform: "instagram", url: "https://b.test", primary: true },
      ],
    });
    assert.equal(primary?.platform, "facebook");
  });
});

describe("loadChannels / loadPrimaryChannel — read the Channel list from a Brand Profile file", () => {
  it("loadChannels reads the full list from a multi-Channel fixture", async () => {
    const channels = await loadChannels(CHANNELS_PROFILE);
    assert.deepEqual(channels, [
      { platform: "facebook", url: "https://www.facebook.com/testbrand", primary: true },
      { platform: "instagram", url: "", primary: false },
      { platform: "linkedin", url: "", primary: false },
    ]);
  });

  it("loadPrimaryChannel reads the one primary entry from a multi-Channel fixture", async () => {
    const primary = await loadPrimaryChannel(CHANNELS_PROFILE);
    assert.deepEqual(primary, { platform: "facebook", url: "https://www.facebook.com/testbrand", primary: true });
  });

  it("a missing Brand Profile loads as [] / null, never crashes", async () => {
    assert.deepEqual(await loadChannels(join(HERE, "fixtures", "nope.yaml")), []);
    assert.equal(await loadPrimaryChannel(join(HERE, "fixtures", "nope.yaml")), null);
  });

  it("the legacy-shaped fixture (old single-object channel, no back-compat shim) loads as [] / null", async () => {
    // brand-profile.banned.yaml still carries the pre-ADR-0019 `channel: { name, platform }` object
    // shape on disk — proving the migrate-in-place decision against a real repo fixture, not just an
    // inline literal.
    assert.deepEqual(await loadChannels(BANNED_PROFILE), []);
    assert.equal(await loadPrimaryChannel(BANNED_PROFILE), null);
  });
});
