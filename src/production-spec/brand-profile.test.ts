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
  zohoConfigFrom,
  loadZohoConfig,
} from "./brand-profile.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const BANNED_PROFILE = join(HERE, "fixtures", "brand-profile.banned.yaml");
const CHANNELS_PROFILE = join(HERE, "fixtures", "brand-profile.channels.yaml");
const ZOHO_PROFILE = join(HERE, "fixtures", "brand-profile.zoho.yaml");
const STRAW_MOTION_PROFILE = join("data", "brands", "straw-motion", "brand-profile.yaml");
const MUNDOTIP_PROFILE = join("data", "brands", "mundotip", "brand-profile.yaml");

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

  // issue #243 round 2 (QA round 1's Defect 1): `alternate_urls` — the Operator's configurable recovery
  // route for a Channel that legitimately answers to more than one real URL/id.
  describe("alternate_urls (issue #243 round 2)", () => {
    it("reads a configured alternate_urls list onto its Channel entry, trimmed", () => {
      const channels = channelsFrom({
        channel: [
          {
            platform: "facebook",
            url: "https://www.facebook.com/profile.php?id=61591885769033",
            primary: true,
            alternate_urls: ["  https://www.facebook.com/122096865609396192  "],
          },
        ],
      });
      assert.deepEqual(channels, [
        {
          platform: "facebook",
          url: "https://www.facebook.com/profile.php?id=61591885769033",
          primary: true,
          alternateUrls: ["https://www.facebook.com/122096865609396192"],
        },
      ]);
    });

    it("omits alternateUrls entirely (never []) when a Channel configures none — existing callers see no new key", () => {
      const channels = channelsFrom({ channel: [{ platform: "facebook", url: "https://x.test", primary: true }] });
      assert.deepEqual(channels, [{ platform: "facebook", url: "https://x.test", primary: true }]);
      assert.ok(!("alternateUrls" in channels[0]!));
    });

    it("drops non-string/blank alternate_urls entries defensively, still omitting the key if nothing survives", () => {
      const withJunkOnly = channelsFrom({
        channel: [{ platform: "facebook", url: "https://x.test", alternate_urls: [7, "", "   ", null] }],
      });
      assert.ok(!("alternateUrls" in withJunkOnly[0]!));

      const withMixed = channelsFrom({
        channel: [{ platform: "facebook", url: "https://x.test", alternate_urls: ["https://a.test", 7, "https://b.test"] }],
      });
      assert.deepEqual(withMixed[0]!.alternateUrls, ["https://a.test", "https://b.test"]);
    });

    it("a non-array alternate_urls (e.g. a bare string) yields no alternateUrls key, never a crash", () => {
      const channels = channelsFrom({ channel: [{ platform: "facebook", url: "https://x.test", alternate_urls: "not-an-array" }] });
      assert.ok(!("alternateUrls" in channels[0]!));
    });
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

// ---------------------------------------------------------------------------
// zohoConfigFrom / loadZohoConfig — Zoho Social Brand config for Schedule Batch (issue #143)
// ---------------------------------------------------------------------------

describe("zohoConfigFrom (defensive) — issue #143: per-Brand Zoho Social Brand config", () => {
  it("a Brand with no zoho key gets a clear not-configured result, naming the Brand", () => {
    const result = zohoConfigFrom({ niche: "whatever" }, "mundotip");
    assert.equal(result.configured, false);
    if (!result.configured) {
      assert.equal(result.brand, "mundotip");
      assert.equal(result.reason, "not_configured");
      assert.deepEqual(result.errors, []);
      assert.match(result.message, /mundotip/);
      assert.match(result.message, /not configured/i);
    }
  });

  it("returns not-configured (never throws) when raw itself isn't an object", () => {
    const result = zohoConfigFrom(null, "mundotip");
    assert.equal(result.configured, false);
    if (!result.configured) assert.equal(result.reason, "not_configured");
  });

  it("reads a well-formed two-Zoho-Brand config", () => {
    const result = zohoConfigFrom(
      {
        zoho: {
          brands: [
            {
              name: "Main",
              timezone: "Europe/Berlin",
              channels: [
                { platform: "facebook", label: "Facebook" },
                { platform: "instagram", label: "Instagram" },
                { platform: "tiktok", label: "TikTok" },
              ],
            },
            {
              name: "Personal",
              timezone: "Europe/Berlin",
              channels: [
                { platform: "linkedin", label: "LinkedInProfile" },
                { platform: "x", label: "X" },
              ],
            },
          ],
        },
      },
      "straw-motion",
    );

    assert.equal(result.configured, true);
    if (result.configured) {
      assert.equal(result.brand, "straw-motion");
      assert.deepEqual(result.zohoBrands, [
        {
          name: "Main",
          timezone: "Europe/Berlin",
          channels: [
            { platform: "facebook", label: "Facebook" },
            { platform: "instagram", label: "Instagram" },
            { platform: "tiktok", label: "TikTok" },
          ],
        },
        {
          name: "Personal",
          timezone: "Europe/Berlin",
          channels: [
            { platform: "linkedin", label: "LinkedInProfile" },
            { platform: "x", label: "X" },
          ],
        },
      ]);
    }
  });

  it("defaults a Zoho Social Brand's missing name to '' — not an error", () => {
    const result = zohoConfigFrom(
      {
        zoho: {
          brands: [
            {
              timezone: "Europe/Berlin",
              channels: [{ platform: "facebook", label: "Facebook" }],
            },
          ],
        },
      },
      "straw-motion",
    );
    assert.equal(result.configured, true);
    if (result.configured) {
      assert.equal(result.zohoBrands[0]?.name, "");
    }
  });

  it("trims platform, label, name, and timezone", () => {
    const result = zohoConfigFrom(
      {
        zoho: {
          brands: [
            {
              name: "  Main  ",
              timezone: "  Europe/Berlin  ",
              channels: [{ platform: "  facebook  ", label: "  Facebook  " }],
            },
          ],
        },
      },
      "straw-motion",
    );
    assert.equal(result.configured, true);
    if (result.configured) {
      assert.deepEqual(result.zohoBrands, [
        {
          name: "Main",
          timezone: "Europe/Berlin",
          channels: [{ platform: "facebook", label: "Facebook" }],
        },
      ]);
    }
  });

  it("a non-object zoho value is malformed, naming the Brand", () => {
    const result = zohoConfigFrom({ zoho: "nope" }, "straw-motion");
    assert.equal(result.configured, false);
    if (!result.configured) {
      assert.equal(result.reason, "malformed");
      assert.match(result.message, /straw-motion/);
      assert.ok(result.errors.length > 0);
    }
  });

  it("missing/empty zoho.brands is malformed", () => {
    const missing = zohoConfigFrom({ zoho: {} }, "straw-motion");
    const empty = zohoConfigFrom({ zoho: { brands: [] } }, "straw-motion");
    for (const result of [missing, empty]) {
      assert.equal(result.configured, false);
      if (!result.configured) assert.equal(result.reason, "malformed");
    }
  });

  it("a missing/blank timezone is malformed and named by index", () => {
    const result = zohoConfigFrom(
      {
        zoho: {
          brands: [
            { name: "Main", channels: [{ platform: "facebook", label: "Facebook" }] },
          ],
        },
      },
      "straw-motion",
    );
    assert.equal(result.configured, false);
    if (!result.configured) {
      assert.equal(result.reason, "malformed");
      assert.ok(result.errors.some((e) => e.includes("zoho.brands[0].timezone")));
    }
  });

  it("an unrecognized IANA timezone string is malformed", () => {
    const result = zohoConfigFrom(
      {
        zoho: {
          brands: [
            {
              name: "Main",
              timezone: "Not/AZone",
              channels: [{ platform: "facebook", label: "Facebook" }],
            },
          ],
        },
      },
      "straw-motion",
    );
    assert.equal(result.configured, false);
    if (!result.configured) {
      assert.equal(result.reason, "malformed");
      assert.ok(result.errors.some((e) => e.includes("Not/AZone")));
    }
  });

  it("missing/empty channels is malformed", () => {
    const missing = zohoConfigFrom(
      { zoho: { brands: [{ name: "Main", timezone: "Europe/Berlin" }] } },
      "straw-motion",
    );
    const empty = zohoConfigFrom(
      { zoho: { brands: [{ name: "Main", timezone: "Europe/Berlin", channels: [] }] } },
      "straw-motion",
    );
    for (const result of [missing, empty]) {
      assert.equal(result.configured, false);
      if (!result.configured) assert.equal(result.reason, "malformed");
    }
  });

  it("a channel entry missing platform or label is malformed", () => {
    const noPlatform = zohoConfigFrom(
      {
        zoho: {
          brands: [
            { name: "Main", timezone: "Europe/Berlin", channels: [{ label: "Facebook" }] },
          ],
        },
      },
      "straw-motion",
    );
    const noLabel = zohoConfigFrom(
      {
        zoho: {
          brands: [
            { name: "Main", timezone: "Europe/Berlin", channels: [{ platform: "facebook" }] },
          ],
        },
      },
      "straw-motion",
    );
    for (const result of [noPlatform, noLabel]) {
      assert.equal(result.configured, false);
      if (!result.configured) assert.equal(result.reason, "malformed");
    }
  });

  it("a platform assigned to more than one Zoho Social Brand is malformed, naming the platform", () => {
    const result = zohoConfigFrom(
      {
        zoho: {
          brands: [
            {
              name: "Main",
              timezone: "Europe/Berlin",
              channels: [{ platform: "facebook", label: "Facebook" }],
            },
            {
              name: "Duplicate",
              timezone: "Europe/Berlin",
              channels: [{ platform: "facebook", label: "Facebook Duplicate" }],
            },
          ],
        },
      },
      "straw-motion",
    );
    assert.equal(result.configured, false);
    if (!result.configured) {
      assert.equal(result.reason, "malformed");
      assert.ok(result.errors.some((e) => e.includes("facebook")));
    }
  });

  it("never a guess: multiple independent problems are ALL reported, not just the first", () => {
    const result = zohoConfigFrom(
      {
        zoho: {
          brands: [
            { name: "Main", channels: [] }, // missing timezone AND empty channels
          ],
        },
      },
      "straw-motion",
    );
    assert.equal(result.configured, false);
    if (!result.configured) {
      assert.equal(result.reason, "malformed");
      assert.ok(result.errors.length >= 2);
    }
  });

  it("never throws for any malformed shape", () => {
    for (const raw of [null, undefined, {}, { zoho: null }, { zoho: 7 }, { zoho: { brands: "nope" } }]) {
      assert.doesNotThrow(() => zohoConfigFrom(raw, "straw-motion"));
    }
  });
});

describe("loadZohoConfig — reads Zoho Social Brand config from a Brand Profile file", () => {
  it("reads a well-formed fixture", async () => {
    const result = await loadZohoConfig(ZOHO_PROFILE, "test-brand");
    assert.equal(result.configured, true);
    if (result.configured) {
      assert.equal(result.zohoBrands.length, 2);
      assert.equal(result.zohoBrands[0]?.timezone, "Europe/Amsterdam");
    }
  });

  it("a missing Brand Profile file loads as not-configured, never crashes", async () => {
    const result = await loadZohoConfig(join(HERE, "fixtures", "nope.yaml"), "ghost-brand");
    assert.equal(result.configured, false);
    if (!result.configured) {
      assert.equal(result.reason, "not_configured");
      assert.match(result.message, /ghost-brand/);
    }
  });

  it("straw-motion's REAL committed brand-profile.yaml carries the real Zoho grouping/labels/clock", async () => {
    const result = await loadZohoConfig(STRAW_MOTION_PROFILE, "straw-motion");
    assert.equal(result.configured, true);
    if (!result.configured) return;

    assert.equal(result.zohoBrands.length, 2);
    const [main, personal] = result.zohoBrands;
    assert.ok(main);
    assert.ok(personal);

    assert.deepEqual(
      main.channels.map((c) => c.platform),
      ["facebook", "instagram", "tiktok"],
    );
    assert.deepEqual(
      personal.channels.map((c) => c.platform),
      ["linkedin", "x"],
    );

    const linkedinLabel = personal.channels.find((c) => c.platform === "linkedin")?.label;
    assert.equal(linkedinLabel, "LinkedInProfile"); // NEVER "LinkedIn" — that's a different Channel

    // Both Zoho Brands share the Operator's clock (CEST today).
    assert.equal(main.timezone, personal.timezone);
    assert.ok(main.timezone.length > 0);
  });

  it("mundotip's REAL committed brand-profile.yaml is not configured for Schedule Batch (out of scope)", async () => {
    const result = await loadZohoConfig(MUNDOTIP_PROFILE, "mundotip");
    assert.equal(result.configured, false);
    if (!result.configured) {
      assert.equal(result.reason, "not_configured");
      assert.match(result.message, /mundotip/);
    }
  });
});
