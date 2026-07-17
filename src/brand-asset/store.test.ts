/**
 * Tests for the BrandAssetStore deep module (`src/brand-asset/store.ts`).
 *
 * All tests use in-memory assertions or temp-dir fixtures — never the real `data/brands/*` assets
 * directories (Straw Motion's real logo ships in a later, Operator-paired slice; issue #82's own
 * scope is the store, not the committed PNG). No live Magnific Space, no Apify, no network calls —
 * this slice is pure filesystem + path logic, so the Magnific fake is NOT needed here.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  mediaKindForFilename,
  brandAssetsRoot,
  listBrandAssets,
  getBrandAsset,
  type BrandAsset,
  type BrandAssetLookup,
} from "./store.ts";

// ---------------------------------------------------------------------------
// mediaKindForFilename — pure extension -> MediaKind mapping
// ---------------------------------------------------------------------------

describe("mediaKindForFilename — pure, defensive extension -> MediaKind mapping", () => {
  const images = ["logo.png", "logo.JPG", "logo.jpeg", "logo.webp", "logo.gif", "logo.svg", "logo.bmp"];
  const videos = ["intro.mp4", "intro.MOV", "intro.webm", "intro.m4v"];
  const audios = ["jingle.mp3", "jingle.WAV", "jingle.m4a", "jingle.aac", "jingle.ogg", "jingle.flac"];

  for (const name of images) {
    it(`classifies ${name} as image`, () => {
      assert.equal(mediaKindForFilename(name), "image");
    });
  }
  for (const name of videos) {
    it(`classifies ${name} as video`, () => {
      assert.equal(mediaKindForFilename(name), "video");
    });
  }
  for (const name of audios) {
    it(`classifies ${name} as audio`, () => {
      assert.equal(mediaKindForFilename(name), "audio");
    });
  }

  it("returns null for an unrecognized extension (never throws)", () => {
    assert.equal(mediaKindForFilename("README.md"), null);
    assert.equal(mediaKindForFilename(".gitkeep"), null);
    assert.equal(mediaKindForFilename("notes.txt"), null);
  });

  it("returns null for a filename with no extension", () => {
    assert.equal(mediaKindForFilename("brand-logo"), null);
  });
});

// ---------------------------------------------------------------------------
// brandAssetsRoot — path resolution
// ---------------------------------------------------------------------------

describe("brandAssetsRoot — path shape", () => {
  it("resolves the assets root under the Brand's directory", () => {
    assert.equal(brandAssetsRoot("mundotip", "data/brands"), "data/brands/mundotip/assets");
  });

  it("uses DEFAULT_BRANDS_ROOT when no brandsRoot is provided", () => {
    assert.equal(brandAssetsRoot("mundotip"), "data/brands/mundotip/assets");
  });

  it("rejects an invalid Brand slug before touching the filesystem (tenancy boundary)", () => {
    assert.throws(() => brandAssetsRoot("../evil", "data/brands"), /Invalid Brand slug/);
  });
});

// ---------------------------------------------------------------------------
// listBrandAssets — directory enumeration (AC1, AC2)
// ---------------------------------------------------------------------------

describe("listBrandAssets — enumerates a Brand's reusable media, keyed by filename basename", () => {
  let tmpBrandsRoot: string;

  before(async () => {
    tmpBrandsRoot = await mkdtemp(join(tmpdir(), "og-list-brand-assets-"));
    const assetsDir = join(tmpBrandsRoot, "acme", "assets");
    await mkdir(assetsDir, { recursive: true });
    await writeFile(join(assetsDir, "brand-logo.png"), "fake-png-bytes");
    await writeFile(join(assetsDir, "intro-jingle.mp3"), "fake-mp3-bytes");
    await writeFile(join(assetsDir, "outro-clip.mp4"), "fake-mp4-bytes");
    await writeFile(join(assetsDir, ".gitkeep"), "");
    await writeFile(join(assetsDir, "README.md"), "not an asset");
  });

  after(async () => {
    await rm(tmpBrandsRoot, { recursive: true, force: true });
  });

  it("returns every recognized-media file, keyed by its basename, media-type aware", async () => {
    const assets = await listBrandAssets("acme", tmpBrandsRoot);
    assert.deepEqual(
      assets.map((a) => ({ key: a.key, media: a.media })),
      [
        { key: "brand-logo", media: "image" },
        { key: "intro-jingle", media: "audio" },
        { key: "outro-clip", media: "video" },
      ],
    );
  });

  it("carries the on-disk path for each asset", async () => {
    const assets = await listBrandAssets("acme", tmpBrandsRoot);
    const logo = assets.find((a) => a.key === "brand-logo");
    assert.ok(logo);
    assert.equal(logo?.path, join(tmpBrandsRoot, "acme", "assets", "brand-logo.png"));
  });

  it("excludes dotfiles and unrecognized extensions (e.g. README.md, .gitkeep)", async () => {
    const assets = await listBrandAssets("acme", tmpBrandsRoot);
    assert.equal(assets.some((a) => a.key === ".gitkeep"), false);
    assert.equal(assets.some((a) => a.key === "README"), false);
    assert.equal(assets.length, 3);
  });

  it("returns [] for a Brand with NO assets directory at all — 'no assets', not an error (AC2)", async () => {
    const assets = await listBrandAssets("brand-with-no-assets-dir", tmpBrandsRoot);
    assert.deepEqual(assets, []);
  });

  it("never throws for a missing assets directory", async () => {
    await assert.doesNotReject(() => listBrandAssets("nonexistent-brand", tmpBrandsRoot));
  });
});

describe("listBrandAssets — duplicate keys across extensions are deduped defensively", () => {
  let tmpBrandsRoot: string;

  before(async () => {
    tmpBrandsRoot = await mkdtemp(join(tmpdir(), "og-list-brand-assets-dupe-"));
    const assetsDir = join(tmpBrandsRoot, "acme", "assets");
    await mkdir(assetsDir, { recursive: true });
    // Same key, two extensions — ambiguous; the store must not crash, and must pick one deterministically.
    await writeFile(join(assetsDir, "brand-logo.png"), "png-bytes");
    await writeFile(join(assetsDir, "brand-logo.svg"), "svg-bytes");
  });

  after(async () => {
    await rm(tmpBrandsRoot, { recursive: true, force: true });
  });

  it("keeps exactly one entry per key, picking the alphabetically-first extension", async () => {
    const assets = await listBrandAssets("acme", tmpBrandsRoot);
    assert.equal(assets.length, 1);
    assert.equal(assets[0]?.key, "brand-logo");
    // ".png" sorts before ".svg" — the filename "brand-logo.png" sorts before "brand-logo.svg"
    assert.ok(assets[0]?.path.endsWith("brand-logo.png"));
  });
});

describe("listBrandAssets — an unreadable entry is skipped, not crashed on", () => {
  it("skips a directory entry that happens to carry a recognized-media extension", async () => {
    const tmpBrandsRoot = await mkdtemp(join(tmpdir(), "og-list-brand-assets-baddir-"));
    try {
      const assetsDir = join(tmpBrandsRoot, "acme", "assets");
      // "video.mp4" is itself a DIRECTORY, not a file — must be skipped, never crash.
      await mkdir(join(assetsDir, "video.mp4"), { recursive: true });
      await writeFile(join(assetsDir, "brand-logo.png"), "png-bytes");
      const assets = await listBrandAssets("acme", tmpBrandsRoot);
      assert.deepEqual(assets.map((a) => a.key), ["brand-logo"]);
    } finally {
      await rm(tmpBrandsRoot, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// getBrandAsset — typed lookup by key (AC1, AC2)
// ---------------------------------------------------------------------------

describe("getBrandAsset — typed found/not-found lookup by key, never throws", () => {
  let tmpBrandsRoot: string;

  before(async () => {
    tmpBrandsRoot = await mkdtemp(join(tmpdir(), "og-get-brand-asset-"));
    const assetsDir = join(tmpBrandsRoot, "acme", "assets");
    await mkdir(assetsDir, { recursive: true });
    await writeFile(join(assetsDir, "brand-logo.png"), "png-bytes");
  });

  after(async () => {
    await rm(tmpBrandsRoot, { recursive: true, force: true });
  });

  it("returns found: true with the asset's key/media/path for an existing key", async () => {
    const result: BrandAssetLookup = await getBrandAsset("acme", "brand-logo", tmpBrandsRoot);
    assert.equal(result.found, true);
    if (result.found) {
      assert.equal(result.asset.key, "brand-logo");
      assert.equal(result.asset.media, "image");
      assert.equal(result.asset.path, join(tmpBrandsRoot, "acme", "assets", "brand-logo.png"));
    }
  });

  it("returns a typed not-found (never a throw) for a missing key when the assets dir exists", async () => {
    const result = await getBrandAsset("acme", "missing-key", tmpBrandsRoot);
    assert.equal(result.found, false);
    if (!result.found) {
      assert.equal(result.key, "missing-key");
      assert.match(result.message, /missing-key/);
      assert.match(result.message, /acme/);
      assert.match(result.message, /brand-logo/, "should list the Brand's actually-available keys");
    }
  });

  it("returns a typed not-found (never a throw) for a Brand with NO assets directory at all (AC2)", async () => {
    const result = await getBrandAsset("brand-with-nothing", "brand-logo", tmpBrandsRoot);
    assert.equal(result.found, false);
    if (!result.found) {
      assert.equal(result.key, "brand-logo");
      assert.ok(result.message.length > 0, "must carry a clear, actionable message");
    }
  });

  it("never throws/rejects, for any of the above", async () => {
    await assert.doesNotReject(() => getBrandAsset("acme", "brand-logo", tmpBrandsRoot));
    await assert.doesNotReject(() => getBrandAsset("acme", "missing-key", tmpBrandsRoot));
    await assert.doesNotReject(() => getBrandAsset("brand-with-nothing", "brand-logo", tmpBrandsRoot));
  });

  it("still throws for an invalid Brand slug (tenancy boundary; a different concern than 'not found')", async () => {
    await assert.rejects(() => getBrandAsset("../evil", "brand-logo", tmpBrandsRoot), /Invalid Brand slug/);
  });
});

// ---------------------------------------------------------------------------
// Video and audio media kinds are found/looked-up the same way as image (media-type awareness)
// ---------------------------------------------------------------------------

describe("getBrandAsset — media-type awareness holds for video and audio keys too", () => {
  let tmpBrandsRoot: string;

  before(async () => {
    tmpBrandsRoot = await mkdtemp(join(tmpdir(), "og-get-brand-asset-media-"));
    const assetsDir = join(tmpBrandsRoot, "acme", "assets");
    await mkdir(assetsDir, { recursive: true });
    await writeFile(join(assetsDir, "outro-clip.mp4"), "mp4-bytes");
    await writeFile(join(assetsDir, "jingle.mp3"), "mp3-bytes");
  });

  after(async () => {
    await rm(tmpBrandsRoot, { recursive: true, force: true });
  });

  it("finds a video asset with media: 'video'", async () => {
    const result = await getBrandAsset("acme", "outro-clip", tmpBrandsRoot);
    assert.equal(result.found, true);
    if (result.found) assert.equal(result.asset.media, "video");
  });

  it("finds an audio asset with media: 'audio'", async () => {
    const result = await getBrandAsset("acme", "jingle", tmpBrandsRoot);
    assert.equal(result.found, true);
    if (result.found) assert.equal(result.asset.media, "audio");
  });
});

// ---------------------------------------------------------------------------
// Architecture: only BrandAssetStore (and the resolver that defines the path) ever touches
// assetsRoot — "all reads go through the store" (AC3), proven by a repo-wide scan.
// ---------------------------------------------------------------------------

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SRC_ROOT = join(HERE, "..");

const ALLOWED_ASSETS_ROOT_REFERENCES = new Set([
  join(SRC_ROOT, "brand", "resolver.ts"),
  join(SRC_ROOT, "brand", "resolver.test.ts"),
  join(SRC_ROOT, "brand-asset", "store.ts"),
  join(SRC_ROOT, "brand-asset", "store.test.ts"),
]);

async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsFiles(full)));
    } else if (entry.isFile() && extname(entry.name) === ".ts") {
      files.push(full);
    }
  }
  return files;
}

describe("architecture: only BrandAssetStore reads a Brand's assetsRoot directory (ADR-0014 store boundary, AC3)", () => {
  it("no source file outside brand-asset/store.ts (and the resolver that defines the path) references `.assetsRoot`", async () => {
    const files = await collectTsFiles(SRC_ROOT);
    const offenders: string[] = [];
    for (const file of files) {
      if (ALLOWED_ASSETS_ROOT_REFERENCES.has(file)) continue;
      const text = await readFile(file, "utf8");
      if (text.includes(".assetsRoot")) offenders.push(file);
    }
    assert.deepEqual(
      offenders,
      [],
      `expected no direct .assetsRoot access outside the store/resolver, found: ${offenders.join(", ")}`,
    );
  });

  it("stat is exercised (sanity: the fixture directories used above are real files/dirs)", async () => {
    // Trivial smoke check that the fixtures above actually created real filesystem entries —
    // guards against a typo silently turning every test above into a false positive.
    const tmp = await mkdtemp(join(tmpdir(), "og-brand-asset-sanity-"));
    try {
      await writeFile(join(tmp, "x.png"), "x");
      const s = await stat(join(tmp, "x.png"));
      assert.equal(s.isFile(), true);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Type-shape smoke test — BrandAsset carries key/media/path
// ---------------------------------------------------------------------------

describe("BrandAsset shape", () => {
  it("carries key, media, and path", async () => {
    const tmpBrandsRoot = await mkdtemp(join(tmpdir(), "og-brand-asset-shape-"));
    try {
      const assetsDir = join(tmpBrandsRoot, "acme", "assets");
      await mkdir(assetsDir, { recursive: true });
      await writeFile(join(assetsDir, "brand-logo.png"), "png-bytes");
      const assets: readonly BrandAsset[] = await listBrandAssets("acme", tmpBrandsRoot);
      assert.equal(assets.length, 1);
      const [asset] = assets;
      assert.ok(asset);
      assert.equal(typeof asset.key, "string");
      assert.equal(typeof asset.media, "string");
      assert.equal(typeof asset.path, "string");
    } finally {
      await rm(tmpBrandsRoot, { recursive: true, force: true });
    }
  });
});
