/**
 * Tests for the Brand resolver deep module (`src/brand/resolver.ts`).
 *
 * All tests use in-memory assertions or temp-dir fixtures. No live Magnific Space, no Apify,
 * no network calls — this slice is pure filesystem + path logic. The Magnific fake is not needed.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  slugify,
  resolveBrand,
  brandExists,
  listBrands,
  isValidBrandSlug,
  assertValidBrandSlug,
  BRAND_SLUG_PATTERN,
  DEFAULT_BRANDS_ROOT,
  DEFAULT_QUEUE_PATH,
  type BrandPaths,
} from "./resolver.ts";

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

describe("slugify — yields a filesystem-safe lowercase slug", () => {
  it("lowercases a simple name", () => {
    assert.equal(slugify("MundoTip"), "mundotip");
  });

  it("replaces spaces with hyphens", () => {
    assert.equal(slugify("Mundo Tip"), "mundo-tip");
  });

  it("collapses consecutive hyphens into one", () => {
    assert.equal(slugify("Mundo  Tip"), "mundo-tip");
  });

  it("strips leading and trailing hyphens", () => {
    assert.equal(slugify("!MundoTip!"), "mundotip");
  });

  it("replaces special characters with hyphens and collapses", () => {
    assert.equal(slugify("MundoTip Pro!"), "mundotip-pro");
  });

  it("handles all-non-alphanumeric input gracefully (returns empty string)", () => {
    assert.equal(slugify("!!!"), "");
  });

  it("truncates to 64 characters", () => {
    const long = "a".repeat(100);
    assert.equal(slugify(long).length, 64);
  });

  it("preserves hyphens that were already there", () => {
    assert.equal(slugify("mundo-tip"), "mundo-tip");
  });

  it("handles numbers in the name", () => {
    assert.equal(slugify("Brand123"), "brand123");
  });
});

// ---------------------------------------------------------------------------
// resolveBrand — slug→paths mapping
// ---------------------------------------------------------------------------

describe("resolveBrand — slug→paths mapping", () => {
  it("returns per-Brand paths nested under the brands root + slug", () => {
    const paths: BrandPaths = resolveBrand("mundotip", "data/brands");
    assert.equal(paths.ledger, "data/brands/mundotip/ledger.json");
    assert.equal(paths.brandProfile, "data/brands/mundotip/brand-profile.yaml");
    assert.equal(paths.seeds, "data/brands/mundotip/seeds.yaml");
    assert.equal(paths.ideasRoot, "data/brands/mundotip/ideas");
    assert.equal(paths.yourData, "data/brands/mundotip/your-data");
    assert.equal(paths.formatsRoot, "data/brands/mundotip/formats");
    assert.equal(paths.assetsRoot, "data/brands/mundotip/assets");
    assert.equal(paths.baselinePromptsRoot, "data/brands/mundotip/baseline-prompts");
  });

  it("uses DEFAULT_BRANDS_ROOT when no brandsRoot is provided", () => {
    const paths: BrandPaths = resolveBrand("mundotip");
    assert.equal(paths.ledger, `${DEFAULT_BRANDS_ROOT}/mundotip/ledger.json`);
    assert.equal(paths.brandProfile, `${DEFAULT_BRANDS_ROOT}/mundotip/brand-profile.yaml`);
    assert.equal(paths.seeds, `${DEFAULT_BRANDS_ROOT}/mundotip/seeds.yaml`);
    assert.equal(paths.ideasRoot, `${DEFAULT_BRANDS_ROOT}/mundotip/ideas`);
    assert.equal(paths.yourData, `${DEFAULT_BRANDS_ROOT}/mundotip/your-data`);
    assert.equal(paths.formatsRoot, `${DEFAULT_BRANDS_ROOT}/mundotip/formats`);
    assert.equal(paths.assetsRoot, `${DEFAULT_BRANDS_ROOT}/mundotip/assets`);
    assert.equal(paths.baselinePromptsRoot, `${DEFAULT_BRANDS_ROOT}/mundotip/baseline-prompts`);
  });

  it("the queuePath is always the global constant — never contains the slug", () => {
    const paths: BrandPaths = resolveBrand("mundotip", "data/brands");
    assert.equal(paths.queuePath, "data/queue.json");
    assert.equal(paths.queuePath.includes("mundotip"), false);
  });

  it("different slugs yield different per-Brand paths but the SAME queuePath", () => {
    const mundotip = resolveBrand("mundotip", "data/brands");
    const acme = resolveBrand("acme", "data/brands");
    // Per-brand paths differ
    assert.notEqual(mundotip.ledger, acme.ledger);
    assert.notEqual(mundotip.brandProfile, acme.brandProfile);
    // Global queue stays the same
    assert.equal(mundotip.queuePath, acme.queuePath);
    assert.equal(mundotip.queuePath, "data/queue.json");
  });

  it("acme slug resolves to acme subdirectory", () => {
    const paths: BrandPaths = resolveBrand("acme", "data/brands");
    assert.equal(paths.ledger, "data/brands/acme/ledger.json");
    assert.equal(paths.ideasRoot, "data/brands/acme/ideas");
    assert.equal(paths.yourData, "data/brands/acme/your-data");
  });

  it("a custom brandsRoot is respected in all paths", () => {
    const paths: BrandPaths = resolveBrand("mundotip", "/custom/root");
    assert.equal(paths.ledger, "/custom/root/mundotip/ledger.json");
    assert.equal(paths.brandProfile, "/custom/root/mundotip/brand-profile.yaml");
    assert.equal(paths.seeds, "/custom/root/mundotip/seeds.yaml");
    assert.equal(paths.ideasRoot, "/custom/root/mundotip/ideas");
    assert.equal(paths.yourData, "/custom/root/mundotip/your-data");
    assert.equal(paths.formatsRoot, "/custom/root/mundotip/formats");
    assert.equal(paths.assetsRoot, "/custom/root/mundotip/assets");
    assert.equal(paths.baselinePromptsRoot, "/custom/root/mundotip/baseline-prompts");
    // queue path stays the same regardless
    assert.equal(paths.queuePath, "data/queue.json");
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_QUEUE_PATH constant
// ---------------------------------------------------------------------------

describe("DEFAULT_QUEUE_PATH — global queue is a constant", () => {
  it("equals data/queue.json exactly", () => {
    assert.equal(DEFAULT_QUEUE_PATH, "data/queue.json");
  });

  it("is the same value used in production-queue/store.ts (not a new derivation)", async () => {
    // Import the store's constant to verify they are in sync
    const { DEFAULT_QUEUE_PATH: storeQueuePath } = await import("../production-queue/store.ts");
    assert.equal(DEFAULT_QUEUE_PATH, storeQueuePath);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_BRANDS_ROOT constant
// ---------------------------------------------------------------------------

describe("DEFAULT_BRANDS_ROOT — the canonical brands root", () => {
  it("equals data/brands", () => {
    assert.equal(DEFAULT_BRANDS_ROOT, "data/brands");
  });
});

// ---------------------------------------------------------------------------
// brandExists — filesystem check
// ---------------------------------------------------------------------------

describe("brandExists — Brand directory existence check", () => {
  let tmpBrandsRoot: string;

  before(async () => {
    tmpBrandsRoot = await mkdtemp(join(tmpdir(), "og-brand-exists-"));
    // Create one valid Brand directory
    await mkdir(join(tmpBrandsRoot, "mundotip"), { recursive: true });
  });

  after(async () => {
    await rm(tmpBrandsRoot, { recursive: true, force: true });
  });

  it("returns true for a Brand directory that exists", async () => {
    assert.equal(await brandExists("mundotip", tmpBrandsRoot), true);
  });

  it("returns false for a slug with no directory", async () => {
    assert.equal(await brandExists("unknown-brand", tmpBrandsRoot), false);
  });

  it("returns false for a non-existent brands root", async () => {
    assert.equal(await brandExists("mundotip", "/nonexistent/brands/root"), false);
  });

  it("returns false for a file with the same name as the slug (not a directory)", async () => {
    const filePath = join(tmpBrandsRoot, "file-not-dir");
    await writeFile(filePath, "not a directory");
    assert.equal(await brandExists("file-not-dir", tmpBrandsRoot), false);
  });

  it("rethrows a non-ENOENT stat error instead of reporting 'does not exist'", async () => {
    // Point the brands root AT a file: stat(<file>/<slug>) fails with ENOTDIR, not ENOENT.
    // A truly-absent path returns false; a real I/O error must surface, not masquerade as absent.
    const filePath = join(tmpBrandsRoot, "a-plain-file");
    await writeFile(filePath, "i am a file, not a directory");
    await assert.rejects(
      () => brandExists("anything", filePath),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as NodeJS.ErrnoException).code, "ENOTDIR");
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// listBrands — directory enumeration
// ---------------------------------------------------------------------------

describe("listBrands — enumerate Brands by directory listing", () => {
  let tmpBrandsRoot: string;

  before(async () => {
    tmpBrandsRoot = await mkdtemp(join(tmpdir(), "og-list-brands-"));
    // Two Brand directories
    await mkdir(join(tmpBrandsRoot, "mundotip"), { recursive: true });
    await mkdir(join(tmpBrandsRoot, "acme"), { recursive: true });
    // A dotfile — must be excluded
    await writeFile(join(tmpBrandsRoot, ".gitkeep"), "");
    // A file (not a directory) — must be excluded
    await writeFile(join(tmpBrandsRoot, "readme.txt"), "not a brand");
  });

  after(async () => {
    await rm(tmpBrandsRoot, { recursive: true, force: true });
  });

  it("returns exactly the Brand directory slugs, sorted", async () => {
    const brands = await listBrands(tmpBrandsRoot);
    assert.deepEqual(brands, ["acme", "mundotip"]);
  });

  it("excludes dotfiles", async () => {
    const brands = await listBrands(tmpBrandsRoot);
    assert.equal(brands.includes(".gitkeep"), false);
  });

  it("excludes non-directory entries", async () => {
    const brands = await listBrands(tmpBrandsRoot);
    assert.equal(brands.includes("readme.txt"), false);
  });
});

describe("listBrands — single-brand directory (mirrors production repo state after migration)", () => {
  let tmpBrandsRoot: string;

  before(async () => {
    tmpBrandsRoot = await mkdtemp(join(tmpdir(), "og-list-brands-solo-"));
    await mkdir(join(tmpBrandsRoot, "mundotip"), { recursive: true });
  });

  after(async () => {
    await rm(tmpBrandsRoot, { recursive: true, force: true });
  });

  it("returns exactly ['mundotip'] when only mundotip is present", async () => {
    const brands = await listBrands(tmpBrandsRoot);
    assert.deepEqual(brands, ["mundotip"]);
  });
});

describe("listBrands — defensive handling of edge cases", () => {
  it("returns [] for a non-existent brands root (no throw)", async () => {
    const brands = await listBrands("/nonexistent/brands/path/9999");
    assert.deepEqual(brands, []);
  });

  it("returns [] for an empty brands root directory", async () => {
    const emptyRoot = await mkdtemp(join(tmpdir(), "og-list-empty-"));
    try {
      const brands = await listBrands(emptyRoot);
      assert.deepEqual(brands, []);
    } finally {
      await rm(emptyRoot, { recursive: true, force: true });
    }
  });

  it("skips a file-named-like-a-slug without crashing", async () => {
    const mixedRoot = await mkdtemp(join(tmpdir(), "og-list-mixed-"));
    try {
      await mkdir(join(mixedRoot, "real-brand"), { recursive: true });
      await writeFile(join(mixedRoot, "fake-brand"), "a file, not a dir");
      const brands = await listBrands(mixedRoot);
      assert.deepEqual(brands, ["real-brand"]);
    } finally {
      await rm(mixedRoot, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Slug validation — the tenancy boundary
// ---------------------------------------------------------------------------

describe("BRAND_SLUG_PATTERN / isValidBrandSlug — accepts only safe slugs", () => {
  const valid = ["mundotip", "acme-corp", "brand123", "a", "a".repeat(64)];
  const invalid = ["", "../..", "..", "a/b", "a\\b", "MundoTip", "mundo tip", "a".repeat(65), ".", "foo.bar", "café"];

  for (const s of valid) {
    it(`accepts ${JSON.stringify(s)}`, () => {
      assert.equal(isValidBrandSlug(s), true);
      assert.equal(BRAND_SLUG_PATTERN.test(s), true);
    });
  }
  for (const s of invalid) {
    it(`rejects ${JSON.stringify(s)}`, () => {
      assert.equal(isValidBrandSlug(s), false);
    });
  }
});

describe("assertValidBrandSlug — throws a clear, slug-naming error on invalid input", () => {
  it("does not throw for a valid slug", () => {
    assert.doesNotThrow(() => assertValidBrandSlug("mundotip"));
  });

  it("throws for a path-traversal slug and names it", () => {
    assert.throws(
      () => assertValidBrandSlug("../.."),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("../.."), "error must name the offending slug");
        return true;
      },
    );
  });
});

describe("resolveBrand — validates the slug before building paths (tenancy boundary)", () => {
  it("still maps a valid slug to its paths", () => {
    const paths = resolveBrand("mundotip", "data/brands");
    assert.equal(paths.ledger, "data/brands/mundotip/ledger.json");
    assert.equal(paths.queuePath, "data/queue.json");
  });

  it("throws for an empty slug (no more silent empty path segment)", () => {
    assert.throws(() => resolveBrand("", "data/brands"), /Invalid Brand slug/);
  });

  it("throws for a path-traversal slug instead of resolving outside the brands root", () => {
    assert.throws(() => resolveBrand("../..", "data/brands"), /Invalid Brand slug/);
  });

  it("throws for a slug containing a path separator", () => {
    assert.throws(() => resolveBrand("evil/child", "data/brands"), /Invalid Brand slug/);
  });

  it("throws for an uppercase slug (not what slugify produces)", () => {
    assert.throws(() => resolveBrand("MundoTip", "data/brands"), /Invalid Brand slug/);
  });
});
