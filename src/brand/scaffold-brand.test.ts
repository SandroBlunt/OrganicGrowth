/**
 * Tests for the thin write shell `src/brand/scaffold-brand.ts`.
 *
 * These tests use temp directories for all filesystem I/O. No live Magnific Space, no Apify.
 * The Magnific fake is NOT needed — this slice touches no Magnific Space.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as yamlParse } from "yaml";

import { scaffoldBrand, type ScaffoldContent } from "./scaffold-brand.ts";
import { listBrands } from "./resolver.ts";
import { buildBrandProfile, buildSeeds, buildEmptyLedger, type BrandInterviewAnswers } from "./scaffolder.ts";

// ---------------------------------------------------------------------------
// Shared test answers and content builder
// ---------------------------------------------------------------------------

const TEST_ANSWERS: BrandInterviewAnswers = {
  name: "Test Brand",
  niche: "Home improvement tips",
  voice: "Friendly and practical. Short sentences.",
  language: "en",
  region: "US",
  platform: "facebook",
  seedPages: ["https://www.facebook.com/peer1"],
};

function buildTestContent(): ScaffoldContent {
  return {
    brandProfile: buildBrandProfile(TEST_ANSWERS),
    seeds: buildSeeds(TEST_ANSWERS),
    ledger: buildEmptyLedger(),
  };
}

// ---------------------------------------------------------------------------
// Template directory (the test skeleton)
// ---------------------------------------------------------------------------

// We use the real template skeleton for tests — it exists at templates/brand-skeleton/.
// Tests inject this path via `options.templatePath`.
const REAL_TEMPLATE_PATH = "templates/brand-skeleton";

// ---------------------------------------------------------------------------
// scaffoldBrand — creates the expected directory structure
// ---------------------------------------------------------------------------

describe("scaffoldBrand — creates the expected Brand directory structure", () => {
  let tmpBrandsRoot: string;

  before(async () => {
    tmpBrandsRoot = await mkdtemp(join(tmpdir(), "og-scaffold-brand-"));
  });

  after(async () => {
    await rm(tmpBrandsRoot, { recursive: true, force: true });
  });

  it("creates the Brand directory", async () => {
    const content = buildTestContent();
    await scaffoldBrand("testbrand", content, {
      brandsRoot: tmpBrandsRoot,
      templatePath: REAL_TEMPLATE_PATH,
    });
    const s = await stat(join(tmpBrandsRoot, "testbrand"));
    assert.ok(s.isDirectory(), "Brand directory must be created");
  });

  it("creates brand-profile.yaml inside the Brand directory", async () => {
    const s = await stat(join(tmpBrandsRoot, "testbrand", "brand-profile.yaml"));
    assert.ok(s.isFile(), "brand-profile.yaml must be a file");
  });

  it("creates seeds.yaml inside the Brand directory", async () => {
    const s = await stat(join(tmpBrandsRoot, "testbrand", "seeds.yaml"));
    assert.ok(s.isFile(), "seeds.yaml must be a file");
  });

  it("creates ledger.json inside the Brand directory", async () => {
    const s = await stat(join(tmpBrandsRoot, "testbrand", "ledger.json"));
    assert.ok(s.isFile(), "ledger.json must be a file");
  });

  it("creates the ideas/ subdirectory", async () => {
    const s = await stat(join(tmpBrandsRoot, "testbrand", "ideas"));
    assert.ok(s.isDirectory(), "ideas/ directory must be created");
  });

  it("creates the your-data/ subdirectory", async () => {
    const s = await stat(join(tmpBrandsRoot, "testbrand", "your-data"));
    assert.ok(s.isDirectory(), "your-data/ directory must be created");
  });

  it("creates the formats/ subdirectory (FormatStore home, ADR-0009/0013)", async () => {
    const s = await stat(join(tmpBrandsRoot, "testbrand", "formats"));
    assert.ok(s.isDirectory(), "formats/ directory must be created");
  });
});

// ---------------------------------------------------------------------------
// scaffoldBrand — brand-profile.yaml content
// ---------------------------------------------------------------------------

describe("scaffoldBrand — brand-profile.yaml contains the builder's output", () => {
  let tmpBrandsRoot: string;

  before(async () => {
    tmpBrandsRoot = await mkdtemp(join(tmpdir(), "og-scaffold-profile-"));
    const content = buildTestContent();
    await scaffoldBrand("profbrand", content, {
      brandsRoot: tmpBrandsRoot,
      templatePath: REAL_TEMPLATE_PATH,
    });
  });

  after(async () => {
    await rm(tmpBrandsRoot, { recursive: true, force: true });
  });

  it("brand-profile.yaml is valid YAML", async () => {
    const text = await readFile(join(tmpBrandsRoot, "profbrand", "brand-profile.yaml"), "utf8");
    assert.doesNotThrow(() => yamlParse(text), "brand-profile.yaml must be valid YAML");
  });

  it("brand-profile.yaml contains the Operator's niche", async () => {
    const text = await readFile(join(tmpBrandsRoot, "profbrand", "brand-profile.yaml"), "utf8");
    const parsed = yamlParse(text) as Record<string, unknown>;
    assert.equal(parsed["niche"], TEST_ANSWERS.niche);
  });

  it("brand-profile.yaml contains the Operator's voice", async () => {
    const text = await readFile(join(tmpBrandsRoot, "profbrand", "brand-profile.yaml"), "utf8");
    const parsed = yamlParse(text) as Record<string, unknown>;
    assert.equal(parsed["voice"], TEST_ANSWERS.voice);
  });

  it("brand-profile.yaml contains the Operator's language", async () => {
    const text = await readFile(join(tmpBrandsRoot, "profbrand", "brand-profile.yaml"), "utf8");
    const parsed = yamlParse(text) as Record<string, unknown>;
    assert.equal(parsed["language"], TEST_ANSWERS.language);
  });

  it("brand-profile.yaml has no TODO placeholders (Operator answers replaced templates)", async () => {
    const text = await readFile(join(tmpBrandsRoot, "profbrand", "brand-profile.yaml"), "utf8");
    assert.doesNotMatch(text, /TODO/, "brand-profile.yaml must not contain TODO placeholders after scaffolding");
  });
});

// ---------------------------------------------------------------------------
// scaffoldBrand — seeds.yaml content
// ---------------------------------------------------------------------------

describe("scaffoldBrand — seeds.yaml contains the builder's output", () => {
  let tmpBrandsRoot: string;

  before(async () => {
    tmpBrandsRoot = await mkdtemp(join(tmpdir(), "og-scaffold-seeds-"));
    const content = buildTestContent();
    await scaffoldBrand("seedsbrand", content, {
      brandsRoot: tmpBrandsRoot,
      templatePath: REAL_TEMPLATE_PATH,
    });
  });

  after(async () => {
    await rm(tmpBrandsRoot, { recursive: true, force: true });
  });

  it("seeds.yaml is valid YAML", async () => {
    const text = await readFile(join(tmpBrandsRoot, "seedsbrand", "seeds.yaml"), "utf8");
    assert.doesNotThrow(() => yamlParse(text), "seeds.yaml must be valid YAML");
  });

  it("seeds.yaml contains the Operator's seed page", async () => {
    const text = await readFile(join(tmpBrandsRoot, "seedsbrand", "seeds.yaml"), "utf8");
    const parsed = yamlParse(text) as Record<string, unknown>;
    const pages = parsed["seed_pages"] as string[] | undefined;
    assert.ok(Array.isArray(pages));
    assert.ok(pages.includes("https://www.facebook.com/peer1"));
  });

  it("seeds.yaml has no TODO placeholders (Operator answers replaced templates)", async () => {
    const text = await readFile(join(tmpBrandsRoot, "seedsbrand", "seeds.yaml"), "utf8");
    assert.doesNotMatch(text, /TODO/, "seeds.yaml must not contain TODO placeholders after scaffolding");
  });
});

// ---------------------------------------------------------------------------
// scaffoldBrand — ledger.json content
// ---------------------------------------------------------------------------

describe("scaffoldBrand — ledger.json is the canonical empty ledger", () => {
  let tmpBrandsRoot: string;

  before(async () => {
    tmpBrandsRoot = await mkdtemp(join(tmpdir(), "og-scaffold-ledger-"));
    const content = buildTestContent();
    await scaffoldBrand("ledgerbrand", content, {
      brandsRoot: tmpBrandsRoot,
      templatePath: REAL_TEMPLATE_PATH,
    });
  });

  after(async () => {
    await rm(tmpBrandsRoot, { recursive: true, force: true });
  });

  it("ledger.json is valid JSON", async () => {
    const text = await readFile(join(tmpBrandsRoot, "ledgerbrand", "ledger.json"), "utf8");
    assert.doesNotThrow(() => JSON.parse(text), "ledger.json must be valid JSON");
  });

  it("ledger.json has an empty ideas array", async () => {
    const text = await readFile(join(tmpBrandsRoot, "ledgerbrand", "ledger.json"), "utf8");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    assert.deepEqual(parsed["ideas"], []);
  });

  it("ledger.json has a baseline with null updated_at", async () => {
    const text = await readFile(join(tmpBrandsRoot, "ledgerbrand", "ledger.json"), "utf8");
    const parsed = JSON.parse(text) as { baseline?: { updated_at?: unknown } };
    assert.equal(parsed.baseline?.updated_at, null);
  });
});

// ---------------------------------------------------------------------------
// listBrands — new Brand appears after scaffolding
// ---------------------------------------------------------------------------

describe("listBrands — new Brand appears after scaffoldBrand", () => {
  let tmpBrandsRoot: string;

  before(async () => {
    tmpBrandsRoot = await mkdtemp(join(tmpdir(), "og-scaffold-list-"));
  });

  after(async () => {
    await rm(tmpBrandsRoot, { recursive: true, force: true });
  });

  it("listBrands returns [] before any Brand is scaffolded", async () => {
    const brands = await listBrands(tmpBrandsRoot);
    assert.deepEqual(brands, []);
  });

  it("listBrands includes the new Brand slug after scaffoldBrand", async () => {
    const content = buildTestContent();
    await scaffoldBrand("listtest", content, {
      brandsRoot: tmpBrandsRoot,
      templatePath: REAL_TEMPLATE_PATH,
    });
    const brands = await listBrands(tmpBrandsRoot);
    assert.ok(brands.includes("listtest"), "listBrands must include 'listtest' after scaffolding");
  });

  it("listBrands includes multiple Brands when multiple are scaffolded", async () => {
    const content = buildTestContent();
    await scaffoldBrand("brandalpha", content, {
      brandsRoot: tmpBrandsRoot,
      templatePath: REAL_TEMPLATE_PATH,
    });
    await scaffoldBrand("brandbeta", content, {
      brandsRoot: tmpBrandsRoot,
      templatePath: REAL_TEMPLATE_PATH,
    });
    const brands = await listBrands(tmpBrandsRoot);
    assert.ok(brands.includes("brandalpha"), "listBrands must include 'brandalpha'");
    assert.ok(brands.includes("brandbeta"), "listBrands must include 'brandbeta'");
  });
});

// ---------------------------------------------------------------------------
// scaffoldBrand — throws on existing Brand
// ---------------------------------------------------------------------------

describe("scaffoldBrand — throws when Brand directory already exists", () => {
  let tmpBrandsRoot: string;

  before(async () => {
    tmpBrandsRoot = await mkdtemp(join(tmpdir(), "og-scaffold-exists-"));
    // Pre-create a Brand directory
    await mkdir(join(tmpBrandsRoot, "existingbrand"), { recursive: true });
  });

  after(async () => {
    await rm(tmpBrandsRoot, { recursive: true, force: true });
  });

  it("throws an error when the Brand directory already exists", async () => {
    const content = buildTestContent();
    await assert.rejects(
      () => scaffoldBrand("existingbrand", content, {
        brandsRoot: tmpBrandsRoot,
        templatePath: REAL_TEMPLATE_PATH,
      }),
      (err: unknown) => {
        assert.ok(err instanceof Error, "must throw an Error");
        assert.ok(err.message.includes("existingbrand"), "error message must name the slug");
        return true;
      },
    );
  });

  it("does not modify the existing directory on an overwrite attempt", async () => {
    // Pre-create a sentinel file in the existing directory
    const sentinelPath = join(tmpBrandsRoot, "existingbrand", "sentinel.txt");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(sentinelPath, "original");

    const content = buildTestContent();
    try {
      await scaffoldBrand("existingbrand", content, {
        brandsRoot: tmpBrandsRoot,
        templatePath: REAL_TEMPLATE_PATH,
      });
    } catch {
      // expected
    }

    // The sentinel file must still have the original content
    const sentinel = await readFile(sentinelPath, "utf8");
    assert.equal(sentinel, "original", "existing directory must not be modified on an overwrite attempt");
  });
});

// ---------------------------------------------------------------------------
// scaffoldBrand — preserves the template's guidance comments (C43)
// ---------------------------------------------------------------------------

describe("scaffoldBrand — keeps the template's guidance comments while filling values", () => {
  let tmpBrandsRoot: string;

  before(async () => {
    tmpBrandsRoot = await mkdtemp(join(tmpdir(), "og-scaffold-comments-"));
    await scaffoldBrand("commentbrand", buildTestContent(), {
      brandsRoot: tmpBrandsRoot,
      templatePath: REAL_TEMPLATE_PATH,
    });
  });

  after(async () => {
    await rm(tmpBrandsRoot, { recursive: true, force: true });
  });

  it("brand-profile.yaml keeps a section/header guidance comment", async () => {
    const text = await readFile(join(tmpBrandsRoot, "commentbrand", "brand-profile.yaml"), "utf8");
    assert.match(text, /hard brand constraints/, "the header guidance comment must survive scaffolding");
    // ...while still carrying the Operator's real value (comment kept AND value filled).
    assert.match(text, /Home improvement tips/);
  });

  it("seeds.yaml keeps the Apify-block guidance comment", async () => {
    const text = await readFile(join(tmpBrandsRoot, "commentbrand", "seeds.yaml"), "utf8");
    assert.match(text, /Apify actors, keyed by platform/, "the Apify-block guidance comment must survive scaffolding");
  });

  it("still strips the obsolete TODO fill-me-in prompts", async () => {
    const profile = await readFile(join(tmpBrandsRoot, "commentbrand", "brand-profile.yaml"), "utf8");
    const seeds = await readFile(join(tmpBrandsRoot, "commentbrand", "seeds.yaml"), "utf8");
    assert.doesNotMatch(profile, /TODO/);
    assert.doesNotMatch(seeds, /TODO/);
  });
});

// ---------------------------------------------------------------------------
// scaffoldBrand — does not write invented actor slugs for non-Facebook platforms (C43)
// ---------------------------------------------------------------------------

describe("scaffoldBrand — non-Facebook seeds carry the unknown-actor placeholder", () => {
  let tmpBrandsRoot: string;

  const igAnswers: BrandInterviewAnswers = { ...TEST_ANSWERS, platform: "instagram" };

  before(async () => {
    tmpBrandsRoot = await mkdtemp(join(tmpdir(), "og-scaffold-ig-"));
    await scaffoldBrand(
      "igbrand",
      {
        brandProfile: buildBrandProfile(igAnswers),
        seeds: buildSeeds(igAnswers),
        ledger: buildEmptyLedger(),
      },
      { brandsRoot: tmpBrandsRoot, templatePath: REAL_TEMPLATE_PATH },
    );
  });

  after(async () => {
    await rm(tmpBrandsRoot, { recursive: true, force: true });
  });

  it("seeds.yaml has apify.instagram actors set to the '...' placeholder, not an invented slug", async () => {
    const text = await readFile(join(tmpBrandsRoot, "igbrand", "seeds.yaml"), "utf8");
    const parsed = yamlParse(text) as { apify?: { instagram?: Record<string, unknown> } };
    const ig = parsed.apify?.instagram;
    assert.ok(ig !== undefined, "apify.instagram must be present");
    assert.equal(ig["trends_actor"], "...");
    assert.equal(ig["post_actor"], "...");
    assert.doesNotMatch(text, /apify\/instagram/, "must not write a fabricated instagram actor slug");
  });
});

// ---------------------------------------------------------------------------
// scaffoldBrand — rejects an unsafe slug and surfaces real I/O errors (C37, C50)
// ---------------------------------------------------------------------------

describe("scaffoldBrand — slug + error-handling boundaries", () => {
  let tmpBrandsRoot: string;

  before(async () => {
    tmpBrandsRoot = await mkdtemp(join(tmpdir(), "og-scaffold-boundary-"));
  });

  after(async () => {
    await rm(tmpBrandsRoot, { recursive: true, force: true });
  });

  it("rejects a path-traversal slug before touching the filesystem (C37)", async () => {
    await assert.rejects(
      () => scaffoldBrand("../evil", buildTestContent(), {
        brandsRoot: tmpBrandsRoot,
        templatePath: REAL_TEMPLATE_PATH,
      }),
      /Invalid Brand slug/,
    );
  });

  it("rethrows a non-ENOENT guard error rather than treating it as 'not there' (C50)", async () => {
    // Point brandsRoot at a plain file: the guard's stat(<file>/<slug>) fails with ENOTDIR.
    const { writeFile } = await import("node:fs/promises");
    const filePath = join(tmpBrandsRoot, "not-a-dir");
    await writeFile(filePath, "i am a file");
    await assert.rejects(
      () => scaffoldBrand("newbrand", buildTestContent(), {
        brandsRoot: filePath,
        templatePath: REAL_TEMPLATE_PATH,
      }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as NodeJS.ErrnoException).code, "ENOTDIR");
        assert.doesNotMatch(err.message, /already exists/, "a real I/O error must not read as 'already exists'");
        return true;
      },
    );
  });
});
