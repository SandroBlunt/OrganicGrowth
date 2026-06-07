/**
 * Tests for the pure builder functions in `src/brand/scaffolder.ts`.
 *
 * All tests are pure (no I/O). No live Magnific Space, no Apify, no filesystem access.
 * These test the slug validation, brand-profile builder, seeds builder, and empty-ledger builder.
 *
 * The Magnific fake is NOT needed here — this slice touches no Magnific Space at all.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stringify as yamlStringify, parse as yamlParse } from "yaml";
import {
  validateSlug,
  buildBrandProfile,
  buildSeeds,
  buildEmptyLedger,
  deriveSlug,
  type BrandInterviewAnswers,
} from "./scaffolder.ts";

// ---------------------------------------------------------------------------
// deriveSlug
// ---------------------------------------------------------------------------

describe("deriveSlug — delegates to slugify", () => {
  it("lowercases and removes special characters", () => {
    assert.equal(deriveSlug("MundoTip"), "mundotip");
  });

  it("replaces spaces with hyphens", () => {
    assert.equal(deriveSlug("Acme Corp"), "acme-corp");
  });

  it("produces an empty string for all-non-alphanumeric input", () => {
    assert.equal(deriveSlug("???"), "");
  });

  it("truncates to 64 characters for very long names", () => {
    const slug = deriveSlug("a".repeat(100));
    assert.equal(slug.length, 64);
  });
});

// ---------------------------------------------------------------------------
// validateSlug
// ---------------------------------------------------------------------------

describe("validateSlug — rejects an empty slug with a clear message", () => {
  it("returns ok:true for a normal slug", () => {
    const result = validateSlug("mundotip");
    assert.equal(result.ok, true);
  });

  it("returns ok:true for a hyphenated slug", () => {
    const result = validateSlug("acme-corp");
    assert.equal(result.ok, true);
  });

  it("returns ok:true for a slug with numbers", () => {
    const result = validateSlug("brand123");
    assert.equal(result.ok, true);
  });

  it("returns ok:false with a reason for an empty slug", () => {
    const result = validateSlug("");
    assert.equal(result.ok, false);
    // TypeScript narrowing: result.ok is false here
    if (!result.ok) {
      assert.ok(result.reason.length > 0, "reason must be non-empty");
      assert.equal(typeof result.reason, "string");
    }
  });

  it("the reason message for an empty slug is human-readable (not a code)", () => {
    const result = validateSlug("");
    if (!result.ok) {
      // Must contain at least one space (a sentence, not a code like 'INVALID_SLUG')
      assert.ok(result.reason.includes(" "), `reason must be a sentence, got: "${result.reason}"`);
    } else {
      assert.fail("expected ok:false for empty slug");
    }
  });

  it("returns ok:true for a 64-character slug (truncated from long name)", () => {
    const slug = "a".repeat(64);
    const result = validateSlug(slug);
    assert.equal(result.ok, true);
  });

  it("all-non-alphanumeric brand name → empty slug → rejected", () => {
    const slug = deriveSlug("!!!");
    assert.equal(slug, "");
    const result = validateSlug(slug);
    assert.equal(result.ok, false);
  });
});

// ---------------------------------------------------------------------------
// buildBrandProfile
// ---------------------------------------------------------------------------

const MINIMAL_ANSWERS: BrandInterviewAnswers = {
  name: "Acme Corp",
  niche: "Home improvement tips",
  voice: "Friendly and practical. Short sentences.",
  language: "en",
  region: "US",
  platform: "facebook",
  seedPages: ["https://www.facebook.com/peer1"],
};

describe("buildBrandProfile — maps interview answers to brand-profile shape", () => {
  it("sets channel.name from answers.name", () => {
    const profile = buildBrandProfile(MINIMAL_ANSWERS);
    assert.equal(profile.channel.name, "Acme Corp");
  });

  it("sets channel.platform from answers.platform", () => {
    const profile = buildBrandProfile(MINIMAL_ANSWERS);
    assert.equal(profile.channel.platform, "facebook");
  });

  it("sets channel.url to empty string when channelUrl is not supplied", () => {
    const profile = buildBrandProfile(MINIMAL_ANSWERS);
    assert.equal(profile.channel.url, "");
  });

  it("sets niche from answers.niche", () => {
    const profile = buildBrandProfile(MINIMAL_ANSWERS);
    assert.equal(profile.niche, "Home improvement tips");
  });

  it("sets voice from answers.voice", () => {
    const profile = buildBrandProfile(MINIMAL_ANSWERS);
    assert.equal(profile.voice, "Friendly and practical. Short sentences.");
  });

  it("sets language from answers.language", () => {
    const profile = buildBrandProfile(MINIMAL_ANSWERS);
    assert.equal(profile.language, "en");
  });

  it("sets region from answers.region", () => {
    const profile = buildBrandProfile(MINIMAL_ANSWERS);
    assert.equal(profile.region, "US");
  });

  it("sets formats to ['reel'] by default", () => {
    const profile = buildBrandProfile(MINIMAL_ANSWERS);
    assert.deepEqual(profile.formats, ["reel"]);
  });

  it("sets banned_words to [] when bannedWords is not supplied", () => {
    const profile = buildBrandProfile(MINIMAL_ANSWERS);
    assert.deepEqual(profile.banned_words, []);
  });

  it("sets required_cta to empty string when requiredCta is not supplied", () => {
    const profile = buildBrandProfile(MINIMAL_ANSWERS);
    assert.equal(profile.required_cta, "");
  });

  it("sets required_hashtags to [] when requiredHashtags is not supplied", () => {
    const profile = buildBrandProfile(MINIMAL_ANSWERS);
    assert.deepEqual(profile.required_hashtags, []);
  });

  it("sets brand_safety to the standard default rules", () => {
    const profile = buildBrandProfile(MINIMAL_ANSWERS);
    assert.ok(Array.isArray(profile.brand_safety));
    assert.ok(profile.brand_safety.length > 0, "default brand_safety rules must be non-empty");
  });
});

describe("buildBrandProfile — deferred fields when supplied", () => {
  const fullAnswers: BrandInterviewAnswers = {
    ...MINIMAL_ANSWERS,
    channelUrl: "https://www.facebook.com/acmecorp",
    bannedWords: ["miracle", "guaranteed"],
    requiredCta: "Try it now",
    requiredHashtags: ["#HomeImprovement"],
  };

  it("sets channel.url from answers.channelUrl when supplied", () => {
    const profile = buildBrandProfile(fullAnswers);
    assert.equal(profile.channel.url, "https://www.facebook.com/acmecorp");
  });

  it("sets banned_words from answers.bannedWords when supplied", () => {
    const profile = buildBrandProfile(fullAnswers);
    assert.deepEqual(profile.banned_words, ["miracle", "guaranteed"]);
  });

  it("sets required_cta from answers.requiredCta when supplied", () => {
    const profile = buildBrandProfile(fullAnswers);
    assert.equal(profile.required_cta, "Try it now");
  });

  it("sets required_hashtags from answers.requiredHashtags when supplied", () => {
    const profile = buildBrandProfile(fullAnswers);
    assert.deepEqual(profile.required_hashtags, ["#HomeImprovement"]);
  });
});

describe("buildBrandProfile — never invents brand facts", () => {
  it("channel.url is empty string (not a placeholder URL) when not supplied", () => {
    const profile = buildBrandProfile(MINIMAL_ANSWERS);
    // Must not be a fabricated URL like 'https://todo.example.com' or 'TODO'
    assert.doesNotMatch(profile.channel.url, /TODO|example\.com|http/i);
  });

  it("niche is exactly the Operator's answer (no elaboration)", () => {
    const profile = buildBrandProfile(MINIMAL_ANSWERS);
    assert.equal(profile.niche, MINIMAL_ANSWERS.niche);
  });

  it("voice is exactly the Operator's answer (no elaboration)", () => {
    const profile = buildBrandProfile(MINIMAL_ANSWERS);
    assert.equal(profile.voice, MINIMAL_ANSWERS.voice);
  });
});

describe("buildBrandProfile — round-trip through YAML", () => {
  it("serializes to YAML and parses back with the same string fields", () => {
    const profile = buildBrandProfile(MINIMAL_ANSWERS);
    const yaml = yamlStringify(profile);
    const parsed = yamlParse(yaml) as typeof profile;
    assert.equal(parsed.channel.name, profile.channel.name);
    assert.equal(parsed.channel.platform, profile.channel.platform);
    assert.equal(parsed.channel.url, profile.channel.url);
    assert.equal(parsed.niche, profile.niche);
    assert.equal(parsed.voice, profile.voice);
    assert.equal(parsed.language, profile.language);
    assert.equal(parsed.region, profile.region);
    assert.equal(parsed.required_cta, profile.required_cta);
  });

  it("serializes to YAML and parses back with the same array fields", () => {
    const profile = buildBrandProfile(MINIMAL_ANSWERS);
    const yaml = yamlStringify(profile);
    const parsed = yamlParse(yaml) as typeof profile;
    assert.deepEqual(parsed.banned_words, profile.banned_words);
    assert.deepEqual(parsed.required_hashtags, profile.required_hashtags);
    assert.deepEqual(parsed.formats, profile.formats);
  });
});

// ---------------------------------------------------------------------------
// buildSeeds
// ---------------------------------------------------------------------------

describe("buildSeeds — maps interview answers to seeds shape", () => {
  it("sets seed_pages from answers.seedPages", () => {
    const seeds = buildSeeds(MINIMAL_ANSWERS);
    assert.deepEqual(seeds.seed_pages, ["https://www.facebook.com/peer1"]);
  });

  it("sets language from answers.language", () => {
    const seeds = buildSeeds(MINIMAL_ANSWERS);
    assert.equal(seeds.language, "en");
  });

  it("sets region from answers.region", () => {
    const seeds = buildSeeds(MINIMAL_ANSWERS);
    assert.equal(seeds.region, "US");
  });

  it("sets keywords to [] by default", () => {
    const seeds = buildSeeds(MINIMAL_ANSWERS);
    assert.deepEqual(seeds.keywords, []);
  });

  it("includes sensible defaults for operational fields", () => {
    const seeds = buildSeeds(MINIMAL_ANSWERS);
    assert.equal(typeof seeds.lookback_days, "number");
    assert.ok(seeds.lookback_days > 0);
    assert.equal(seeds.format_focus, "reel");
    assert.equal(typeof seeds.ideas_per_run, "number");
    assert.ok(seeds.ideas_per_run > 0);
    assert.equal(seeds.overperformance_only, true);
  });

  it("includes facebook apify actor block for platform:facebook", () => {
    const seeds = buildSeeds(MINIMAL_ANSWERS);
    assert.ok(seeds.apify !== undefined);
    const fb = (seeds.apify as Record<string, unknown>)["facebook"] as Record<string, unknown> | undefined;
    assert.ok(fb !== undefined, "apify.facebook must be present");
    assert.equal(typeof fb["trends_actor"], "string");
    assert.ok((fb["trends_actor"] as string).length > 0);
    assert.equal(typeof fb["post_actor"], "string");
    assert.ok((fb["post_actor"] as string).length > 0);
  });
});

describe("buildSeeds — multiple seed pages", () => {
  it("preserves multiple seed pages in order", () => {
    const answers: BrandInterviewAnswers = {
      ...MINIMAL_ANSWERS,
      seedPages: [
        "https://www.facebook.com/peer1",
        "https://www.facebook.com/peer2",
        "https://www.facebook.com/peer3",
      ],
    };
    const seeds = buildSeeds(answers);
    assert.deepEqual(seeds.seed_pages, answers.seedPages);
  });
});

describe("buildSeeds — round-trip through YAML", () => {
  it("serializes to YAML and parses back with the same seed_pages", () => {
    const seeds = buildSeeds(MINIMAL_ANSWERS);
    const yaml = yamlStringify(seeds);
    const parsed = yamlParse(yaml) as typeof seeds;
    assert.deepEqual(parsed.seed_pages, seeds.seed_pages);
  });

  it("serializes to YAML and parses back with the same language and region", () => {
    const seeds = buildSeeds(MINIMAL_ANSWERS);
    const yaml = yamlStringify(seeds);
    const parsed = yamlParse(yaml) as typeof seeds;
    assert.equal(parsed.language, seeds.language);
    assert.equal(parsed.region, seeds.region);
  });

  it("serializes to YAML and parses back with the apify block intact", () => {
    const seeds = buildSeeds(MINIMAL_ANSWERS);
    const yaml = yamlStringify(seeds);
    const parsed = yamlParse(yaml) as typeof seeds;
    const parsedApify = (parsed.apify as Record<string, unknown> | undefined);
    const origApify = (seeds.apify as Record<string, unknown> | undefined);
    assert.ok(parsedApify !== undefined);
    assert.ok(origApify !== undefined);
    const fb = (parsedApify["facebook"] as Record<string, unknown> | undefined);
    const origFb = (origApify["facebook"] as Record<string, unknown> | undefined);
    assert.ok(fb !== undefined);
    assert.ok(origFb !== undefined);
    assert.equal(fb["trends_actor"], origFb["trends_actor"]);
    assert.equal(fb["post_actor"], origFb["post_actor"]);
  });
});

// ---------------------------------------------------------------------------
// buildEmptyLedger
// ---------------------------------------------------------------------------

describe("buildEmptyLedger — returns the canonical empty ledger shape", () => {
  it("has an empty ideas array", () => {
    const ledger = buildEmptyLedger();
    assert.deepEqual(ledger.ideas, []);
  });

  it("has a baseline object with updated_at: null", () => {
    const ledger = buildEmptyLedger();
    assert.equal(ledger.baseline.updated_at, null);
  });

  it("has a baseline object with shares: null", () => {
    const ledger = buildEmptyLedger();
    assert.equal(ledger.baseline.shares, null);
  });

  it("has a baseline object with comments: null", () => {
    const ledger = buildEmptyLedger();
    assert.equal(ledger.baseline.comments, null);
  });

  it("has a baseline object with reactions: null", () => {
    const ledger = buildEmptyLedger();
    assert.equal(ledger.baseline.reactions, null);
  });

  it("has a baseline object with views: null", () => {
    const ledger = buildEmptyLedger();
    assert.equal(ledger.baseline.views, null);
  });

  it("serializes to valid JSON and parses back with the same shape", () => {
    const ledger = buildEmptyLedger();
    const json = JSON.stringify(ledger);
    const parsed = JSON.parse(json) as typeof ledger;
    assert.deepEqual(parsed.ideas, []);
    assert.equal(parsed.baseline.updated_at, null);
    assert.equal(parsed.baseline.shares, null);
    assert.equal(parsed.baseline.comments, null);
    assert.equal(parsed.baseline.reactions, null);
    assert.equal(parsed.baseline.views, null);
  });

  it("is deterministic — two calls return equal values", () => {
    const a = buildEmptyLedger();
    const b = buildEmptyLedger();
    assert.deepEqual(a, b);
  });
});
