/**
 * Tests for `relativizeLegacyPath` (`src/importer/storage-key-from-legacy-path.ts`) — issue #204.
 *
 * Real data (verified against `data/brands/straw-motion/ledger.json`): every `asset_paths` entry is
 * EITHER already root-relative (e.g. `"data/brands/straw-motion/ideas/2026-W29/idea-01...png"`) OR
 * absolute under one single, consistent prefix (`/Users/CaxtonTaylor/Developer/OrganicGrowth/...`) — "191
 * absolute paths... mixed with relative ones, two conventions inside the same records" (epic #195). No
 * absolute path may survive into the database (`src/db/storage-key.ts`'s `assertRootRelativeStorageKey`
 * already enforces this at the store boundary) — this module is what makes a legacy absolute path
 * CONVERTIBLE in the first place, before that boundary ever sees it.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { relativizeLegacyPath } from "./storage-key-from-legacy-path.ts";

const REPO_ROOT = "/Users/CaxtonTaylor/Developer/OrganicGrowth";

describe("relativizeLegacyPath — converts a legacy path to a root-relative storage key", () => {
  it("passes an already-relative path through unchanged", () => {
    const result = relativizeLegacyPath("data/brands/straw-motion/ideas/2026-W29/idea-01.png", REPO_ROOT);
    assert.deepEqual(result, { ok: true, key: "data/brands/straw-motion/ideas/2026-W29/idea-01.png" });
  });

  it("strips the repo-root prefix from an absolute path under it", () => {
    const result = relativizeLegacyPath(
      `${REPO_ROOT}/data/brands/straw-motion/ideas/2026-W29/idea-01.png`,
      REPO_ROOT,
    );
    assert.deepEqual(result, { ok: true, key: "data/brands/straw-motion/ideas/2026-W29/idea-01.png" });
  });

  it("refuses an absolute path under a DIFFERENT root it cannot safely relativize", () => {
    const result = relativizeLegacyPath("/Users/someone-else/OrganicGrowth/data/x.png", REPO_ROOT);
    assert.equal(result.ok, false);
  });

  it("refuses a bare '/' or root-only path", () => {
    const result = relativizeLegacyPath("/", REPO_ROOT);
    assert.equal(result.ok, false);
  });

  it("refuses an empty string", () => {
    const result = relativizeLegacyPath("", REPO_ROOT);
    assert.equal(result.ok, false);
  });

  it("refuses a path containing a .. segment even after stripping the repo root", () => {
    const result = relativizeLegacyPath(`${REPO_ROOT}/data/../../etc/passwd`, REPO_ROOT);
    assert.equal(result.ok, false);
  });

  it("handles a repoRoot with a trailing slash the same as one without", () => {
    const result = relativizeLegacyPath(`${REPO_ROOT}/data/x.png`, `${REPO_ROOT}/`);
    assert.deepEqual(result, { ok: true, key: "data/x.png" });
  });
});
