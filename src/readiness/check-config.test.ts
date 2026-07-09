/**
 * Tests for the brand-config sanity checker — `checkConfig(brandProfile, seeds): Finding[]`.
 *
 * AC6: ALL tests are pure — they pass literal in-memory objects. No disk I/O, no YAML parsing,
 * no Magnific Space, no Apify, no network. checkConfig accepts already-parsed objects.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkConfig, normalizeSeeds } from "./check-config.ts";
import type { BrandProfile, Seeds, SeedEntry } from "./check-config.ts";
import type { Finding } from "./types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findingsWhere(findings: Finding[], pred: Partial<Finding>): Finding[] {
  return findings.filter((f) =>
    Object.entries(pred).every(([k, v]) => (f as unknown as Record<string, unknown>)[k] === v),
  );
}

/** A fully healthy brand profile — no findings expected. */
const HEALTHY_PROFILE: BrandProfile = {
  channel: {
    name: "TestBrand",
    platform: "facebook",
    url: "https://www.facebook.com/testbrand",
  },
  niche: "Life hacks and household tips",
  language: "es",
  region: "LATAM",
  voice: "Punchy and curiosity-driven. Short sentences.",
  formats: ["reel"],
  required_cta: "",
  required_hashtags: [],
  banned_words: ["scam", "fake"],
  brand_safety: ["No medical claims."],
};

/** A fully healthy seeds object — no findings expected. */
const HEALTHY_SEEDS: Seeds = {
  seed_pages: [
    "https://www.facebook.com/lifehackIG",
    "https://www.facebook.com/tipspage",
  ],
  keywords: ["trucos caseros"],
  language: "es",
  region: "LATAM",
  lookback_days: 7,
  format_focus: "reel",
  ideas_per_run: 10,
  overperformance_only: true,
  apify: {
    facebook: {
      trends_actor: "apify/facebook-posts-scraper",
      post_actor: "apify/facebook-post-scraper",
    },
  },
};

// ---------------------------------------------------------------------------
// AC4 + AC5: checkConfig findings
// ---------------------------------------------------------------------------

describe("checkConfig — healthy config produces no findings (AC4)", () => {
  it("fully healthy config → empty finding list", () => {
    const result = checkConfig(HEALTHY_PROFILE, HEALTHY_SEEDS);
    assert.deepEqual(result, [], "healthy config must produce no findings");
  });
});

describe("checkConfig — TODO placeholder (AC4a)", () => {
  it("TODO in niche → advisory on research (code: config_todo)", () => {
    const profile: BrandProfile = { ...HEALTHY_PROFILE, niche: "TODO: fill in niche" };
    const findings = checkConfig(profile, HEALTHY_SEEDS);
    const match = findingsWhere(findings, { severity: "advisory", phase: "research", code: "config_todo" });
    assert.ok(match.length >= 1, "expected a config_todo advisory for TODO in niche");
  });

  it("TODO in voice → advisory on research (code: config_todo)", () => {
    const profile: BrandProfile = { ...HEALTHY_PROFILE, voice: "TODO: describe voice" };
    const findings = checkConfig(profile, HEALTHY_SEEDS);
    const match = findingsWhere(findings, { severity: "advisory", phase: "research", code: "config_todo" });
    assert.ok(match.length >= 1, "expected a config_todo advisory for TODO in voice");
  });

  it("TODO finding has severity advisory, never block", () => {
    const profile: BrandProfile = { ...HEALTHY_PROFILE, niche: "TODO: fill in" };
    const findings = checkConfig(profile, HEALTHY_SEEDS);
    const block = findingsWhere(findings, { code: "config_todo", severity: "block" });
    assert.equal(block.length, 0, "config_todo must never be a block");
  });
});

describe("checkConfig — niche unset (AC4b)", () => {
  it("empty niche → advisory on research (code: niche_unset)", () => {
    const profile: BrandProfile = { ...HEALTHY_PROFILE, niche: "" };
    const findings = checkConfig(profile, HEALTHY_SEEDS);
    const match = findingsWhere(findings, { severity: "advisory", phase: "research", code: "niche_unset" });
    assert.equal(match.length, 1, "expected one niche_unset advisory");
  });

  it("null/missing niche → advisory on research (code: niche_unset)", () => {
    const profile = { ...HEALTHY_PROFILE } as BrandProfile;
    delete profile.niche;
    const findings = checkConfig(profile, HEALTHY_SEEDS);
    const match = findingsWhere(findings, { severity: "advisory", phase: "research", code: "niche_unset" });
    assert.equal(match.length, 1, "expected niche_unset when niche field is absent");
  });

  it("niche_unset is advisory, never block", () => {
    const profile: BrandProfile = { ...HEALTHY_PROFILE, niche: "" };
    const findings = checkConfig(profile, HEALTHY_SEEDS);
    const block = findingsWhere(findings, { code: "niche_unset", severity: "block" });
    assert.equal(block.length, 0, "niche_unset must never be a block");
  });
});

describe("checkConfig — voice unset (AC4c)", () => {
  it("empty voice → advisory on research (code: voice_unset)", () => {
    const profile: BrandProfile = { ...HEALTHY_PROFILE, voice: "" };
    const findings = checkConfig(profile, HEALTHY_SEEDS);
    const match = findingsWhere(findings, { severity: "advisory", phase: "research", code: "voice_unset" });
    assert.equal(match.length, 1, "expected one voice_unset advisory");
  });

  it("null/missing voice → advisory on research (code: voice_unset)", () => {
    const profile = { ...HEALTHY_PROFILE } as BrandProfile;
    delete profile.voice;
    const findings = checkConfig(profile, HEALTHY_SEEDS);
    const match = findingsWhere(findings, { severity: "advisory", phase: "research", code: "voice_unset" });
    assert.equal(match.length, 1, "expected voice_unset when voice field is absent");
  });

  it("voice_unset is advisory, never block", () => {
    const profile: BrandProfile = { ...HEALTHY_PROFILE, voice: "" };
    const findings = checkConfig(profile, HEALTHY_SEEDS);
    const block = findingsWhere(findings, { code: "voice_unset", severity: "block" });
    assert.equal(block.length, 0, "voice_unset must never be a block");
  });
});

describe("checkConfig — fewer than 1 seed page (AC4d)", () => {
  it("empty seed_pages → block on research (code: no_valid_seed)", () => {
    const seeds: Seeds = { ...HEALTHY_SEEDS, seed_pages: [] };
    const findings = checkConfig(HEALTHY_PROFILE, seeds);
    const match = findingsWhere(findings, { severity: "block", phase: "research", code: "no_valid_seed" });
    assert.equal(match.length, 1, "expected one no_valid_seed block");
  });

  it("missing seed_pages → block on research (code: no_valid_seed)", () => {
    const seeds = { ...HEALTHY_SEEDS } as Seeds;
    delete seeds.seed_pages;
    const findings = checkConfig(HEALTHY_PROFILE, seeds);
    const match = findingsWhere(findings, { severity: "block", phase: "research", code: "no_valid_seed" });
    assert.equal(match.length, 1, "expected no_valid_seed when seed_pages is absent");
  });

  it("no_valid_seed blocks only research, not production or publish", () => {
    const seeds: Seeds = { ...HEALTHY_SEEDS, seed_pages: [] };
    const findings = checkConfig(HEALTHY_PROFILE, seeds);
    const nonResearchBlocks = findings.filter(
      (f) => f.severity === "block" && f.phase !== "research",
    );
    assert.equal(nonResearchBlocks.length, 0, "no_valid_seed must only block research");
  });
});

describe("checkConfig — off-niche seed flag (AC4e)", () => {
  it("off-niche seed marker → advisory on research (code: off_niche_seed)", () => {
    // Seeds with a page URL annotated as off-niche via a special prefix/marker the caller uses
    const seeds: Seeds = {
      ...HEALTHY_SEEDS,
      seed_pages: [
        "https://www.facebook.com/lifehackIG",
        "OFF_NICHE:https://www.facebook.com/unrelatedcookingpage",
      ],
    };
    const findings = checkConfig(HEALTHY_PROFILE, seeds);
    const match = findingsWhere(findings, { severity: "advisory", phase: "research", code: "off_niche_seed" });
    assert.ok(match.length >= 1, "expected an off_niche_seed advisory");
  });

  it("off_niche_seed is advisory, never block", () => {
    const seeds: Seeds = {
      ...HEALTHY_SEEDS,
      seed_pages: ["OFF_NICHE:https://www.facebook.com/unrelated"],
    };
    const findings = checkConfig(HEALTHY_PROFILE, seeds);
    const block = findingsWhere(findings, { code: "off_niche_seed", severity: "block" });
    assert.equal(block.length, 0, "off_niche_seed must never be a block");
  });

  it("no off-niche seed marker → no off_niche_seed finding", () => {
    const findings = checkConfig(HEALTHY_PROFILE, HEALTHY_SEEDS);
    const match = findingsWhere(findings, { code: "off_niche_seed" });
    assert.equal(match.length, 0, "no off_niche_seed finding for clean seeds");
  });

  it("structured { url, off_niche: true } entry → advisory on research (C44)", () => {
    const seeds: Seeds = {
      ...HEALTHY_SEEDS,
      seed_pages: [
        "https://www.facebook.com/lifehackIG",
        { url: "https://www.facebook.com/tudodereceitasES", off_niche: true },
      ],
    };
    const findings = checkConfig(HEALTHY_PROFILE, seeds);
    const match = findingsWhere(findings, { severity: "advisory", phase: "research", code: "off_niche_seed" });
    assert.equal(match.length, 1, "structured off_niche:true entry must raise the off_niche_seed advisory");
    // The structured off-niche entry still counts as a valid seed (no no_valid_seed block).
    const noSeed = findingsWhere(findings, { code: "no_valid_seed" });
    assert.equal(noSeed.length, 0, "a structured seed entry must still count as a valid seed");
  });

  it("structured { url } entry without off_niche → no off_niche_seed finding (C44)", () => {
    const seeds: Seeds = {
      ...HEALTHY_SEEDS,
      seed_pages: [{ url: "https://www.facebook.com/onNichePeer" }],
    };
    const findings = checkConfig(HEALTHY_PROFILE, seeds);
    assert.equal(findingsWhere(findings, { code: "off_niche_seed" }).length, 0);
    assert.equal(findingsWhere(findings, { code: "no_valid_seed" }).length, 0);
  });
});

describe("checkConfig — defensive seed parsing (C26)", () => {
  it("does not throw and drops non-string / url-less seed entries", () => {
    const seeds = {
      ...HEALTHY_SEEDS,
      // A null and a numeric entry would crash a naive p.startsWith(); they must be dropped.
      seed_pages: [null, 42, {}, "https://www.facebook.com/realPeer"] as unknown as SeedEntry[],
    };
    const findings = checkConfig(HEALTHY_PROFILE, seeds);
    // The one real URL survives → no no_valid_seed block.
    assert.equal(findingsWhere(findings, { code: "no_valid_seed" }).length, 0);
  });

  it("all entries invalid → no_valid_seed block (nothing usable survives)", () => {
    const seeds = {
      ...HEALTHY_SEEDS,
      seed_pages: [null, 42, {}] as unknown as SeedEntry[],
    };
    const findings = checkConfig(HEALTHY_PROFILE, seeds);
    assert.equal(
      findingsWhere(findings, { severity: "block", phase: "research", code: "no_valid_seed" }).length,
      1,
      "when no usable seed survives, no_valid_seed must block research",
    );
  });
});

describe("normalizeSeeds — reads both seed forms defensively (C44/C26)", () => {
  it("returns [] for a non-array value (never throws)", () => {
    assert.deepEqual(normalizeSeeds(undefined), []);
    assert.deepEqual(normalizeSeeds(null), []);
    assert.deepEqual(normalizeSeeds("not-an-array"), []);
  });

  it("reads a plain URL string as on-niche", () => {
    assert.deepEqual(normalizeSeeds(["https://x.test/a"]), [{ url: "https://x.test/a", offNiche: false }]);
  });

  it("reads the legacy OFF_NICHE: prefix, stripping it", () => {
    assert.deepEqual(normalizeSeeds(["OFF_NICHE:https://x.test/b"]), [{ url: "https://x.test/b", offNiche: true }]);
  });

  it("reads the structured { url, off_niche } object form", () => {
    assert.deepEqual(
      normalizeSeeds([{ url: "https://x.test/c", off_niche: true }, { url: "https://x.test/d" }]),
      [{ url: "https://x.test/c", offNiche: true }, { url: "https://x.test/d", offNiche: false }],
    );
  });

  it("drops null, numeric, empty-string, and url-less entries", () => {
    assert.deepEqual(
      normalizeSeeds([null, 42, "", "  ", {}, { off_niche: true }, "https://x.test/e"]),
      [{ url: "https://x.test/e", offNiche: false }],
    );
  });
});

describe("checkConfig — missing Channel URL (AC4f)", () => {
  it("empty channel.url → block on publish (code: channel_url_missing)", () => {
    const profile: BrandProfile = {
      ...HEALTHY_PROFILE,
      channel: { ...HEALTHY_PROFILE.channel, url: "" },
    };
    const findings = checkConfig(profile, HEALTHY_SEEDS);
    const match = findingsWhere(findings, { severity: "block", phase: "publish", code: "channel_url_missing" });
    assert.equal(match.length, 1, "expected one channel_url_missing block");
  });

  it("missing channel.url field → block on publish (code: channel_url_missing)", () => {
    const profile: BrandProfile = {
      ...HEALTHY_PROFILE,
      channel: { name: "TestBrand", platform: "facebook" } as BrandProfile["channel"],
    };
    const findings = checkConfig(profile, HEALTHY_SEEDS);
    const match = findingsWhere(findings, { severity: "block", phase: "publish", code: "channel_url_missing" });
    assert.equal(match.length, 1, "expected channel_url_missing when url field absent");
  });

  it("missing channel block → blocks only publish, not research or production", () => {
    const profile: BrandProfile = {
      ...HEALTHY_PROFILE,
      channel: { ...HEALTHY_PROFILE.channel, url: "" },
    };
    const findings = checkConfig(profile, HEALTHY_SEEDS);
    const nonPublishBlocks = findings.filter(
      (f) => f.severity === "block" && f.phase !== "publish",
    );
    assert.equal(nonPublishBlocks.length, 0, "channel_url_missing must only block publish");
  });
});

describe("checkConfig — empty banned_words (AC4g)", () => {
  it("empty banned_words array → advisory on research (code: empty_banned_words)", () => {
    const profile: BrandProfile = { ...HEALTHY_PROFILE, banned_words: [] };
    const findings = checkConfig(profile, HEALTHY_SEEDS);
    const match = findingsWhere(findings, { severity: "advisory", phase: "research", code: "empty_banned_words" });
    assert.equal(match.length, 1, "expected one empty_banned_words advisory");
  });

  it("missing banned_words → advisory on research (code: empty_banned_words)", () => {
    const profile = { ...HEALTHY_PROFILE } as BrandProfile;
    delete profile.banned_words;
    const findings = checkConfig(profile, HEALTHY_SEEDS);
    const match = findingsWhere(findings, { severity: "advisory", phase: "research", code: "empty_banned_words" });
    assert.equal(match.length, 1, "expected empty_banned_words when field absent");
  });

  it("empty_banned_words is advisory, never block", () => {
    const profile: BrandProfile = { ...HEALTHY_PROFILE, banned_words: [] };
    const findings = checkConfig(profile, HEALTHY_SEEDS);
    const block = findingsWhere(findings, { code: "empty_banned_words", severity: "block" });
    assert.equal(block.length, 0, "empty_banned_words must never be a block");
  });
});

// ---------------------------------------------------------------------------
// AC5: Deterministic ordering for checkConfig
// ---------------------------------------------------------------------------

describe("checkConfig — deterministic ordering (AC5)", () => {
  it("same inputs always produce the same finding list", () => {
    const badProfile: BrandProfile = {
      ...HEALTHY_PROFILE,
      niche: "",
      voice: "",
      channel: { ...HEALTHY_PROFILE.channel, url: "" },
      banned_words: [],
    };
    const badSeeds: Seeds = { ...HEALTHY_SEEDS, seed_pages: [] };
    const first = checkConfig(badProfile, badSeeds);
    const second = checkConfig(badProfile, badSeeds);
    assert.deepEqual(first, second, "checkConfig must be deterministic");
  });

  it("findings are ordered: research < production < publish (by phase)", () => {
    const badProfile: BrandProfile = {
      ...HEALTHY_PROFILE,
      channel: { ...HEALTHY_PROFILE.channel, url: "" }, // publish block
      niche: "",  // research advisory
    };
    const findings = checkConfig(badProfile, HEALTHY_SEEDS);
    const phaseOrder = new Map([["research", 0], ["production", 1], ["publish", 2]]);
    for (let i = 1; i < findings.length; i++) {
      const prev = phaseOrder.get(findings[i - 1]!.phase) ?? 0;
      const curr = phaseOrder.get(findings[i]!.phase) ?? 0;
      assert.ok(
        prev <= curr,
        `finding[${i - 1}].phase=${findings[i - 1]!.phase} must come before finding[${i}].phase=${findings[i]!.phase}`,
      );
    }
  });

  it("within the same phase, block findings come before advisory findings", () => {
    // research block (no_valid_seed) + research advisories (niche_unset, voice_unset, empty_banned_words)
    const badProfile: BrandProfile = {
      ...HEALTHY_PROFILE,
      niche: "",
      voice: "",
      banned_words: [],
    };
    const badSeeds: Seeds = { ...HEALTHY_SEEDS, seed_pages: [] };
    const findings = checkConfig(badProfile, badSeeds);
    const researchFindings = findings.filter((f) => f.phase === "research");
    let seenAdvisory = false;
    for (const f of researchFindings) {
      if (f.severity === "advisory") seenAdvisory = true;
      if (f.severity === "block") {
        assert.ok(!seenAdvisory, `block finding code=${f.code} appeared after an advisory in research phase`);
      }
    }
  });

  it("within same phase+severity, findings are ordered alphabetically by code", () => {
    // Trigger multiple research advisories: niche_unset, voice_unset, empty_banned_words
    const profile: BrandProfile = {
      ...HEALTHY_PROFILE,
      niche: "",
      voice: "",
      banned_words: [],
    };
    const findings = checkConfig(profile, HEALTHY_SEEDS);
    const researchAdvisories = findings.filter(
      (f) => f.phase === "research" && f.severity === "advisory",
    );
    for (let i = 1; i < researchAdvisories.length; i++) {
      const prev = researchAdvisories[i - 1]!.code;
      const curr = researchAdvisories[i]!.code;
      assert.ok(
        prev <= curr,
        `research advisories must be alphabetically ordered: ${prev} should come before ${curr}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// AC6: Pure — no live calls
// ---------------------------------------------------------------------------

describe("checkConfig — no live calls (AC6)", () => {
  it("checkConfig is synchronous and returns a plain array", () => {
    const result = checkConfig(HEALTHY_PROFILE, HEALTHY_SEEDS);
    assert.ok(Array.isArray(result), "checkConfig must return a plain array");
    assert.ok(!(result instanceof Promise), "checkConfig must return synchronously");
  });

  it("checkConfig needs no mocks — plain objects are sufficient", () => {
    // If checkConfig performed any I/O, this would timeout or throw.
    const result = checkConfig(HEALTHY_PROFILE, HEALTHY_SEEDS);
    assert.deepEqual(result, [], "pure function, no mocks needed");
  });
});

// ---------------------------------------------------------------------------
// Severity×Phase coverage matrix for checkConfig (AC6)
// ---------------------------------------------------------------------------

describe("checkConfig — severity×phase coverage matrix (AC6)", () => {
  it("block × research reachable: no_valid_seed", () => {
    const seeds: Seeds = { ...HEALTHY_SEEDS, seed_pages: [] };
    const findings = checkConfig(HEALTHY_PROFILE, seeds);
    assert.ok(
      findings.some((f) => f.severity === "block" && f.phase === "research"),
      "block × research must be reachable via empty seed_pages",
    );
  });

  it("advisory × research reachable: niche_unset", () => {
    const profile: BrandProfile = { ...HEALTHY_PROFILE, niche: "" };
    const findings = checkConfig(profile, HEALTHY_SEEDS);
    assert.ok(
      findings.some((f) => f.severity === "advisory" && f.phase === "research"),
      "advisory × research must be reachable via empty niche",
    );
  });

  it("advisory × research reachable: voice_unset", () => {
    const profile: BrandProfile = { ...HEALTHY_PROFILE, voice: "" };
    const findings = checkConfig(profile, HEALTHY_SEEDS);
    assert.ok(
      findings.some((f) => f.severity === "advisory" && f.phase === "research"),
      "advisory × research must be reachable via empty voice",
    );
  });

  it("advisory × research reachable: empty_banned_words", () => {
    const profile: BrandProfile = { ...HEALTHY_PROFILE, banned_words: [] };
    const findings = checkConfig(profile, HEALTHY_SEEDS);
    assert.ok(
      findings.some((f) => f.severity === "advisory" && f.phase === "research"),
      "advisory × research must be reachable via empty banned_words",
    );
  });

  it("advisory × research reachable: config_todo", () => {
    const profile: BrandProfile = { ...HEALTHY_PROFILE, niche: "TODO: set niche" };
    const findings = checkConfig(profile, HEALTHY_SEEDS);
    assert.ok(
      findings.some((f) => f.severity === "advisory" && f.phase === "research"),
      "advisory × research must be reachable via TODO niche",
    );
  });

  it("block × publish reachable: channel_url_missing", () => {
    const profile: BrandProfile = {
      ...HEALTHY_PROFILE,
      channel: { ...HEALTHY_PROFILE.channel, url: "" },
    };
    const findings = checkConfig(profile, HEALTHY_SEEDS);
    assert.ok(
      findings.some((f) => f.severity === "block" && f.phase === "publish"),
      "block × publish must be reachable via empty channel.url",
    );
  });
});
