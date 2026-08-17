/**
 * Tests for `planAssetMedia` (`src/importer/plan-asset-media.ts`) — issue #204.
 *
 * File existence/checksum are injected (`AssetMediaFileOps`) so this module's own decision logic —
 * relativize, check existence, classify, checksum-or-mark-dead — is tested fast and deterministically,
 * without needing real media bytes on disk. `src/importer/plan.test.ts` exercises the REAL default file
 * operations against real fixture files.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { planAssetMedia, type AssetMediaFileOps } from "./plan-asset-media.ts";

const REPO_ROOT = "/Users/CaxtonTaylor/Developer/OrganicGrowth";

function fakeFileOps(existingKeys: readonly string[]): AssetMediaFileOps {
  return {
    exists: async (absPath: string) => existingKeys.some((k) => absPath.endsWith(k)),
    digest: async () => ({ sha256: "deadbeef", sizeBytes: 1234 }),
  };
}

describe("planAssetMedia — relativize, check existence, classify, checksum-or-mark-dead", () => {
  it("plans every present, recognized file as a media row, in ordinal order", async () => {
    const paths = [
      "data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.assets/0-hook.png",
      "data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.assets/1-then.jpg",
    ];
    const result = await planAssetMedia(paths, REPO_ROOT, REPO_ROOT, fakeFileOps(paths));
    assert.equal(result.problems.length, 0);
    assert.equal(result.dead.length, 0);
    assert.equal(result.media.length, 2);
    assert.deepEqual(
      result.media.map((m) => [m.ordinal, m.kind, m.mime, m.storageKey]),
      [
        [0, "image", "image/png", paths[0]],
        [1, "image", "image/jpeg", paths[1]],
      ],
    );
    assert.equal(result.media[0]!.bytes, 1234);
    assert.equal(result.media[0]!.checksum, "deadbeef");
  });

  it("converts an absolute legacy path to a root-relative storage key", async () => {
    const abs = `${REPO_ROOT}/data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.assets/0-hook.png`;
    const result = await planAssetMedia([abs], REPO_ROOT, REPO_ROOT, fakeFileOps(["data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.assets/0-hook.png"]));
    assert.equal(result.media.length, 1);
    assert.equal(result.media[0]!.storageKey, "data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.assets/0-hook.png");
    assert.ok(!result.media[0]!.storageKey.startsWith("/"));
  });

  it("marks a missing file as dead — no media row, no problem", async () => {
    const paths = ["data/brands/straw-motion/ideas/unhypped-daily/2026-W33/friday-14-august/idea-01.news-short-script.output/script.txt"];
    const result = await planAssetMedia(paths, REPO_ROOT, REPO_ROOT, fakeFileOps([])); // nothing exists
    assert.equal(result.media.length, 0);
    assert.equal(result.problems.length, 0);
    assert.deepEqual(result.dead, [{ ordinal: 0, storageKey: paths[0] }]);
  });

  it("reports a problem for a path it cannot relativize (foreign absolute root)", async () => {
    const result = await planAssetMedia(["/Users/someone-else/data/x.png"], REPO_ROOT, REPO_ROOT, fakeFileOps([]));
    assert.equal(result.media.length, 0);
    assert.equal(result.dead.length, 0);
    assert.equal(result.problems.length, 1);
  });

  it("reports a problem for a present file with an unrecognized extension", async () => {
    const paths = ["data/brands/straw-motion/ideas/2026-W29/idea-01.weird-extension.xyz"];
    const result = await planAssetMedia(paths, REPO_ROOT, REPO_ROOT, fakeFileOps(paths));
    assert.equal(result.media.length, 0);
    assert.equal(result.problems.length, 1);
    assert.match(result.problems[0]!, /xyz|extension/i);
  });

  it("returns everything empty for zero asset_paths", async () => {
    const result = await planAssetMedia([], REPO_ROOT, REPO_ROOT, fakeFileOps([]));
    assert.deepEqual(result, { media: [], dead: [], problems: [] });
  });
});
