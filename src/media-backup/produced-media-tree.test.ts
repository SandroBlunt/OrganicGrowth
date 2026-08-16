import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { collectProducedMediaFiles } from "./produced-media-tree.ts";

async function touch(path: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, "x");
}

describe("collectProducedMediaFiles — walks a Brand's ideasRoot for .output/.assets bundle files (issue #197)", () => {
  it("collects files under a flat legacy run's .output bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-media-tree-"));
    try {
      const ideasRoot = join(root, "ideas");
      await touch(join(ideasRoot, "2026-W29", "idea-01.news-carousel.output", "0-hook.png"));
      await touch(join(ideasRoot, "2026-W29", "idea-01.news-carousel.output", "caption.txt"));
      const files = await collectProducedMediaFiles(ideasRoot);
      assert.deepEqual(
        files.map((f) => f.replace(ideasRoot, "")).sort(),
        [
          "/2026-W29/idea-01.news-carousel.output/0-hook.png",
          "/2026-W29/idea-01.news-carousel.output/caption.txt",
        ],
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("also collects legacy .assets-named bundles", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-media-tree-"));
    try {
      const ideasRoot = join(root, "ideas");
      await touch(join(ideasRoot, "2026-W29", "idea-01.news-carousel.assets", "0-hook.png"));
      const files = await collectProducedMediaFiles(ideasRoot);
      assert.equal(files.length, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("collects files nested under a daily cadence Format's deeper run path (ADR-0023)", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-media-tree-"));
    try {
      const ideasRoot = join(root, "ideas");
      await touch(
        join(
          ideasRoot,
          "unhypped-daily",
          "2026-W33",
          "friday-14-august",
          "idea-01.news-short-script.output",
          "script.txt",
        ),
      );
      const files = await collectProducedMediaFiles(ideasRoot);
      assert.equal(files.length, 1);
      assert.ok(files[0]?.endsWith("script.txt"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does NOT collect files outside any .output/.assets bundle (e.g. a Brief markdown file)", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-media-tree-"));
    try {
      const ideasRoot = join(root, "ideas");
      await touch(join(ideasRoot, "2026-W29", "idea-01.md"));
      await touch(join(ideasRoot, "2026-W29", "idea-01.news-carousel.spec.json"));
      const files = await collectProducedMediaFiles(ideasRoot);
      assert.deepEqual(files, []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("skips hidden entries like .DS_Store", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-media-tree-"));
    try {
      const ideasRoot = join(root, "ideas");
      await touch(join(ideasRoot, "2026-W29", "idea-01.news-carousel.output", "0-hook.png"));
      await touch(join(ideasRoot, ".DS_Store"));
      const files = await collectProducedMediaFiles(ideasRoot);
      assert.equal(files.length, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns [] for a missing ideasRoot rather than throwing", async () => {
    const files = await collectProducedMediaFiles("/definitely/does/not/exist/ideas");
    assert.deepEqual(files, []);
  });

  it("returns a sorted, deterministic list", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-media-tree-"));
    try {
      const ideasRoot = join(root, "ideas");
      await touch(join(ideasRoot, "r", "idea-02.news-carousel.output", "b.png"));
      await touch(join(ideasRoot, "r", "idea-01.news-carousel.output", "a.png"));
      const files = await collectProducedMediaFiles(ideasRoot);
      assert.deepEqual(files, [...files].sort());
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
