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
