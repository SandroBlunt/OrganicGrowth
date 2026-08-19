/**
 * Tests for `resolveMediaFile` (issue #210) — proves the storage_key + media_root resolution against a
 * REAL file on disk (a temp directory, never a mock filesystem), and proves a missing file 404s
 * gracefully rather than throwing.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { addAssetMedia, loadIdeaAssets, writeAsset, type DbAssetRecord } from "../asset/store.ts";
import { updateBrand } from "../brand/store.ts";
import { seedWorld, seedLibraryIdea } from "./test-support.ts";
import { resolveMediaFile, resolveMediaAbsolutePath } from "./media.ts";

describe("resolveMediaAbsolutePath", () => {
  it("joins a relative media_root against the current working directory", () => {
    const result = resolveMediaAbsolutePath("data/brands/straw-motion", "ideas/2026-W33/idea-01.jpg");
    assert.equal(result, join(process.cwd(), "data/brands/straw-motion", "ideas/2026-W33/idea-01.jpg"));
  });

  it("joins an ABSOLUTE media_root directly, never double-prefixing with cwd", () => {
    const result = resolveMediaAbsolutePath("/Users/example/OrganicGrowth", "ideas/2026-W33/idea-01.jpg");
    assert.equal(result, join("/Users/example/OrganicGrowth", "ideas/2026-W33/idea-01.jpg"));
  });
});

describe("resolveMediaFile — reads a real file off disk via storage_key + Brand media_root", () => {
  it("returns the file's bytes and recorded mime for a file that genuinely exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-library-media-"));
    try {
      await withTempDb(async (db) => {
        runMigrations(db);
        const world = seedWorld(db);
        updateBrand(db, world.brandId, { mediaRoot: root });
        const ideaId = seedLibraryIdea(world);
        await writeAsset(ideaId, "news-carousel", { status: "produced" }, { db });
        const assetId = (await loadIdeaAssets(ideaId, { db }) as readonly DbAssetRecord[])[0]!.id;

        await mkdir(join(root, "sub"), { recursive: true });
        await writeFile(join(root, "sub", "pic.jpg"), Buffer.from("fake-jpeg-bytes"));

        const mediaId = addAssetMedia(db, assetId, {
          ordinal: 0,
          kind: "image",
          storageKey: "sub/pic.jpg",
          mime: "image/jpeg",
          bytes: 15,
          checksum: "irrelevant",
        });

        const resolved = await resolveMediaFile(db, mediaId);
        assert.notEqual(resolved, null);
        assert.equal(resolved!.mime, "image/jpeg");
        assert.equal(resolved!.bytes.toString("utf8"), "fake-jpeg-bytes");
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns null (never throws) when the recorded file is not present on THIS machine", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-library-media-"));
    try {
      await withTempDb(async (db) => {
        runMigrations(db);
        const world = seedWorld(db);
        updateBrand(db, world.brandId, { mediaRoot: root });
        const ideaId = seedLibraryIdea(world);
        await writeAsset(ideaId, "news-carousel", { status: "produced" }, { db });
        const assetId = (await loadIdeaAssets(ideaId, { db }) as readonly DbAssetRecord[])[0]!.id;

        const mediaId = addAssetMedia(db, assetId, {
          ordinal: 0,
          kind: "image",
          storageKey: "never-downloaded.jpg",
          mime: "image/jpeg",
          bytes: 1,
          checksum: "x",
        });

        assert.equal(await resolveMediaFile(db, mediaId), null);
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns null for an unknown media id", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.equal(await resolveMediaFile(db, "does-not-exist"), null);
    });
  });

  it("falls back to a checkout-root-relative resolution for a legacy-imported storage_key the media_root join misses", async () => {
    // Mirrors the real one-shot importer's shape: a legacy storage_key already carries the
    // `<media_root>/…` prefix baked in (relativized against the checkout root, not media_root), so
    // joining media_root + storage_key doubles that prefix and misses the real file.
    const legacyRoot = await mkdtemp(join(process.cwd(), "og-library-media-legacy-"));
    const unrelatedMediaRoot = await mkdtemp(join(tmpdir(), "og-library-media-unrelated-"));
    try {
      await withTempDb(async (db) => {
        runMigrations(db);
        const world = seedWorld(db);
        updateBrand(db, world.brandId, { mediaRoot: unrelatedMediaRoot });
        const ideaId = seedLibraryIdea(world);
        await writeAsset(ideaId, "news-carousel", { status: "produced" }, { db });
        const assetId = (await loadIdeaAssets(ideaId, { db }) as readonly DbAssetRecord[])[0]!.id;

        await writeFile(join(legacyRoot, "legacy.jpg"), Buffer.from("legacy-jpeg-bytes"));
        const legacyStorageKey = join(legacyRoot, "legacy.jpg").slice(process.cwd().length + 1);

        const mediaId = addAssetMedia(db, assetId, {
          ordinal: 0,
          kind: "image",
          storageKey: legacyStorageKey,
          mime: "image/jpeg",
          bytes: 17,
          checksum: "irrelevant",
        });

        const resolved = await resolveMediaFile(db, mediaId);
        assert.notEqual(resolved, null);
        assert.equal(resolved!.bytes.toString("utf8"), "legacy-jpeg-bytes");
      });
    } finally {
      await rm(legacyRoot, { recursive: true, force: true });
      await rm(unrelatedMediaRoot, { recursive: true, force: true });
    }
  });
});
