/**
 * Tests for the FormatStore deep module (`src/format/store.ts`).
 *
 * Most tests use in-memory assertions or temp-dir fixtures; one describe block (below) loads the
 * REAL migrated `data/brands/{mundotip,straw-motion}/formats/*.yaml` files to prove issue #53 AC2
 * (both Brands are actually migrated, not just documented). No live Magnific Space, no Apify, no
 * network — this slice never touches the Magnific Space (Format files are plain YAML, resolved and
 * parsed entirely on disk). The Magnific fake is NOT needed here.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

import {
  FORMAT_SLUG_PATTERN,
  isValidFormatSlug,
  assertValidFormatSlug,
  deriveSourceMode,
  parseFormatFile,
  formatFilePath,
  formatIdeasRoot,
  listFormatSlugs,
  loadFormat,
  type FormatFile,
} from "./store.ts";

// ---------------------------------------------------------------------------
// Format-slug validation
// ---------------------------------------------------------------------------

describe("FORMAT_SLUG_PATTERN / isValidFormatSlug — accepts only safe slugs", () => {
  const valid = ["life-hacks", "unhypped-news", "a", "brand123", "a".repeat(64)];
  const invalid = ["", "../..", "..", "a/b", "a\\b", "Life-Hacks", "life hacks", "a".repeat(65), "café"];

  for (const s of valid) {
    it(`accepts ${JSON.stringify(s)}`, () => {
      assert.equal(isValidFormatSlug(s), true);
      assert.equal(FORMAT_SLUG_PATTERN.test(s), true);
    });
  }
  for (const s of invalid) {
    it(`rejects ${JSON.stringify(s)}`, () => {
      assert.equal(isValidFormatSlug(s), false);
    });
  }
});

describe("assertValidFormatSlug — throws a clear, slug-naming error on invalid input", () => {
  it("does not throw for a valid slug", () => {
    assert.doesNotThrow(() => assertValidFormatSlug("unhypped-news"));
  });

  it("throws for a path-traversal slug and names it", () => {
    assert.throws(
      () => assertValidFormatSlug("../.."),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("../.."), "error must name the offending slug");
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// deriveSourceMode
// ---------------------------------------------------------------------------

describe("deriveSourceMode — peer-vs-curated tie-break (mirrors trend-scout.md)", () => {
  it("honors an explicit mode: peer", () => {
    assert.equal(deriveSourceMode({ mode: "peer", curated_sources: ["https://x.example/"] }), "peer");
  });

  it("honors an explicit mode: curated", () => {
    assert.equal(deriveSourceMode({ mode: "curated" }), "curated");
  });

  it("infers curated when curated_sources is non-empty and mode is absent", () => {
    assert.equal(deriveSourceMode({ curated_sources: ["https://ai-weekly.ai/"] }), "curated");
  });

  it("infers peer when neither mode nor curated_sources is set", () => {
    assert.equal(deriveSourceMode({ seed_pages: ["https://www.facebook.com/peer1"] }), "peer");
  });

  it("prefers curated when both curated_sources and seed_pages are set without an explicit mode", () => {
    assert.equal(
      deriveSourceMode({
        seed_pages: ["https://www.facebook.com/peer1"],
        curated_sources: ["https://ai-weekly.ai/"],
      }),
      "curated",
    );
  });

  it("defaults to peer for garbled/non-object input", () => {
    assert.equal(deriveSourceMode(null), "peer");
    assert.equal(deriveSourceMode("nonsense"), "peer");
    assert.equal(deriveSourceMode(undefined), "peer");
  });

  it("ignores an invalid mode value and falls back to inference", () => {
    assert.equal(deriveSourceMode({ mode: "both", curated_sources: ["https://x.example/"] }), "curated");
  });
});

// ---------------------------------------------------------------------------
// parseFormatFile — pure, defensive
// ---------------------------------------------------------------------------

describe("parseFormatFile — a fully-populated Format file parses to the typed shape", () => {
  const raw = {
    name: "Unhypped News",
    niche: "AI/tech news explained in-depth, in plain terms",
    voice: "Easy, no-BS, plain language.",
    media_focus: "reel",
    sources: {
      mode: "curated",
      curated_sources: ["https://ai-weekly.ai/", "https://newsletter.evolvingai.io/"],
      keywords: [],
      lookback_days: 7,
      overperformance_only: true,
    },
    ideas_per_run: 10,
    default_recipes: ["character-explainer-with-cast"],
  };

  it("parses every field verbatim", () => {
    const format: FormatFile = parseFormatFile(raw, "unhypped-news");
    assert.equal(format.slug, "unhypped-news");
    assert.equal(format.name, "Unhypped News");
    assert.equal(format.niche, raw.niche);
    assert.equal(format.voice, raw.voice);
    assert.equal(format.mediaFocus, "reel");
    assert.equal(format.sources.mode, "curated");
    assert.deepEqual(format.sources.curatedSources, raw.sources.curated_sources);
    assert.equal(format.sources.lookbackDays, 7);
    assert.equal(format.sources.overperformanceOnly, true);
    assert.equal(format.ideasPerRun, 10);
    assert.deepEqual(format.defaultRecipes, ["character-explainer-with-cast"]);
  });
});

describe("parseFormatFile — off-niche seed pages are normalized via the shared readiness helper", () => {
  const raw = {
    name: "Life Hacks",
    sources: {
      mode: "peer",
      seed_pages: [
        "https://www.facebook.com/lifehackIG",
        { url: "https://www.facebook.com/tudodereceitasES", off_niche: true },
      ],
    },
  };

  it("normalizes structured off_niche entries", () => {
    const format = parseFormatFile(raw, "life-hacks");
    assert.equal(format.sources.seedPages.length, 2);
    assert.equal(format.sources.seedPages[0]?.offNiche, false);
    assert.equal(format.sources.seedPages[1]?.offNiche, true);
    assert.equal(format.sources.seedPages[1]?.url, "https://www.facebook.com/tudodereceitasES");
  });
});

describe("parseFormatFile — defensive defaults on missing/garbled input", () => {
  it("never throws on completely garbled input", () => {
    assert.doesNotThrow(() => parseFormatFile(null, "x"));
    assert.doesNotThrow(() => parseFormatFile("not an object", "x"));
    assert.doesNotThrow(() => parseFormatFile(42, "x"));
    assert.doesNotThrow(() => parseFormatFile(undefined, "x"));
  });

  it("defaults every field sensibly for an empty object", () => {
    const format = parseFormatFile({}, "empty-format");
    assert.equal(format.slug, "empty-format");
    assert.equal(format.name, "");
    assert.equal(format.niche, "");
    assert.equal(format.voice, "");
    assert.equal(format.mediaFocus, "reel");
    assert.equal(format.sources.mode, "peer");
    assert.deepEqual(format.sources.seedPages, []);
    assert.deepEqual(format.sources.curatedSources, []);
    assert.deepEqual(format.sources.keywords, []);
    assert.equal(format.sources.lookbackDays, 7);
    assert.equal(format.sources.overperformanceOnly, true);
    assert.equal(format.ideasPerRun, 10);
    assert.deepEqual(format.defaultRecipes, []);
  });

  it("drops non-string entries from array fields instead of crashing", () => {
    const format = parseFormatFile(
      { default_recipes: ["ok", 42, null, "  ", "also-ok"] },
      "garbled",
    );
    assert.deepEqual(format.defaultRecipes, ["ok", "also-ok"]);
  });

  it("ignores a non-positive ideas_per_run and falls back to the default", () => {
    const format = parseFormatFile({ ideas_per_run: -3 }, "x");
    assert.equal(format.ideasPerRun, 10);
  });
});

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

describe("formatFilePath / formatIdeasRoot — path shape", () => {
  it("resolves the Format file path under the Brand's formats/ directory", () => {
    assert.equal(
      formatFilePath("mundotip", "life-hacks", "data/brands"),
      "data/brands/mundotip/formats/life-hacks.yaml",
    );
  });

  it("resolves the Format-namespaced Ideas root", () => {
    assert.equal(
      formatIdeasRoot("straw-motion", "unhypped-news", "data/brands"),
      "data/brands/straw-motion/ideas/unhypped-news",
    );
  });

  it("rejects a path-traversal Format slug before touching the filesystem", () => {
    assert.throws(() => formatFilePath("mundotip", "../evil", "data/brands"), /Invalid Format slug/);
    assert.throws(() => formatIdeasRoot("mundotip", "../evil", "data/brands"), /Invalid Format slug/);
  });

  it("rejects an invalid Brand slug too (delegates to resolveBrand)", () => {
    assert.throws(() => formatFilePath("../evil", "life-hacks", "data/brands"), /Invalid Brand slug/);
  });
});

// ---------------------------------------------------------------------------
// listFormatSlugs — directory enumeration
// ---------------------------------------------------------------------------

describe("listFormatSlugs — enumerates a Brand's Format files", () => {
  let tmpBrandsRoot: string;

  before(async () => {
    tmpBrandsRoot = await mkdtemp(join(tmpdir(), "og-list-formats-"));
    const formatsDir = join(tmpBrandsRoot, "acme", "formats");
    await mkdir(formatsDir, { recursive: true });
    await writeFile(join(formatsDir, "life-hacks.yaml"), "name: Life Hacks\n");
    await writeFile(join(formatsDir, "unhypped-news.yaml"), "name: Unhypped News\n");
    await writeFile(join(formatsDir, ".gitkeep"), "");
    await writeFile(join(formatsDir, "README.md"), "not a format");
  });

  after(async () => {
    await rm(tmpBrandsRoot, { recursive: true, force: true });
  });

  it("returns exactly the .yaml basenames, sorted", async () => {
    const slugs = await listFormatSlugs("acme", tmpBrandsRoot);
    assert.deepEqual(slugs, ["life-hacks", "unhypped-news"]);
  });

  it("excludes dotfiles and non-yaml entries", async () => {
    const slugs = await listFormatSlugs("acme", tmpBrandsRoot);
    assert.equal(slugs.includes(".gitkeep"), false);
    assert.equal(slugs.some((s) => s.includes("README")), false);
  });

  it("returns [] for a Brand with no formats/ directory yet (no throw)", async () => {
    const slugs = await listFormatSlugs("brand-new", tmpBrandsRoot);
    assert.deepEqual(slugs, []);
  });
});

// ---------------------------------------------------------------------------
// loadFormat — I/O shell
// ---------------------------------------------------------------------------

describe("loadFormat — reads + parses a real Format file from disk", () => {
  let tmpBrandsRoot: string;

  before(async () => {
    tmpBrandsRoot = await mkdtemp(join(tmpdir(), "og-load-format-"));
    const formatsDir = join(tmpBrandsRoot, "mundotip", "formats");
    await mkdir(formatsDir, { recursive: true });
    await writeFile(
      join(formatsDir, "life-hacks.yaml"),
      [
        "name: Life Hacks",
        "niche: Life hacks, household tips & tricks",
        "voice: Punchy and curiosity-driven.",
        "media_focus: reel",
        "sources:",
        "  mode: peer",
        "  seed_pages:",
        "    - https://www.facebook.com/lifehackIG",
        "  lookback_days: 7",
        "  overperformance_only: true",
        "ideas_per_run: 10",
        "default_recipes:",
        "  - character-explainer-with-cast",
        "",
      ].join("\n"),
    );
    await writeFile(join(formatsDir, "broken.yaml"), "name: [unterminated\n  - broken: yaml: : :");
  });

  after(async () => {
    await rm(tmpBrandsRoot, { recursive: true, force: true });
  });

  it("loads and parses a real Format file", async () => {
    const format = await loadFormat("mundotip", "life-hacks", tmpBrandsRoot);
    assert.equal(format.name, "Life Hacks");
    assert.equal(format.sources.mode, "peer");
    assert.equal(format.sources.seedPages.length, 1);
    assert.equal(format.ideasPerRun, 10);
    assert.deepEqual(format.defaultRecipes, ["character-explainer-with-cast"]);
  });

  it("throws a clear, actionable error for an unknown Format, listing available Formats", async () => {
    await assert.rejects(
      () => loadFormat("mundotip", "does-not-exist", tmpBrandsRoot),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Unknown Format "does-not-exist"/);
        assert.match(err.message, /mundotip/);
        assert.match(err.message, /life-hacks/, "must list the Brand's actually-available Formats");
        return true;
      },
    );
  });

  it("throws naming the Brand when it has no Formats at all", async () => {
    await assert.rejects(
      () => loadFormat("brand-with-none", "anything", tmpBrandsRoot),
      /has no Format files yet/,
    );
  });

  it("throws a clear parse error (naming the path) for malformed YAML — never crashes with a bare error", async () => {
    await assert.rejects(
      () => loadFormat("mundotip", "broken", tmpBrandsRoot),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Cannot parse Format YAML/);
        assert.match(err.message, /broken\.yaml/);
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// The REAL migrated Brands (issue #53 AC2) — reads the actual repo data, default brandsRoot
// ---------------------------------------------------------------------------

describe("mundotip and straw-motion are migrated to their own Format files (issue #53 AC2)", () => {
  it("mundotip's real formats/life-hacks.yaml loads through the FormatStore in peer mode", async () => {
    const format = await loadFormat("mundotip", "life-hacks");
    assert.equal(format.name, "Life Hacks");
    assert.equal(format.sources.mode, "peer");
    assert.ok(format.sources.seedPages.length > 0, "must carry MundoTip's real peer seed pages");
    assert.ok(format.voice.length > 0, "must carry a real voice, not a placeholder");
    assert.deepEqual(format.defaultRecipes, ["character-explainer-with-cast"]);
  });

  it("straw-motion's real formats/unhypped-news.yaml loads through the FormatStore in curated mode", async () => {
    const format = await loadFormat("straw-motion", "unhypped-news");
    assert.equal(format.name, "Unhypped News");
    assert.equal(format.sources.mode, "curated");
    assert.ok(format.sources.curatedSources.length > 0, "must carry Straw Motion's real curated sources");
    assert.ok(format.voice.length > 0, "must carry a real voice, not a placeholder");
  });

  it("listFormatSlugs finds both real Brands' migrated Format", async () => {
    assert.deepEqual(await listFormatSlugs("mundotip"), ["life-hacks"]);
    assert.deepEqual(await listFormatSlugs("straw-motion"), ["unhypped-news"]);
  });

  it("neither real Brand's brand-profile.yaml carries a formats field any more (media-sense retired)", async () => {
    for (const slug of ["mundotip", "straw-motion"]) {
      const text = await readFile(join("data", "brands", slug, "brand-profile.yaml"), "utf8");
      const parsed = parseYaml(text) as Record<string, unknown>;
      assert.equal("formats" in parsed, false, `${slug}/brand-profile.yaml must not have a formats key`);
    }
  });
});
