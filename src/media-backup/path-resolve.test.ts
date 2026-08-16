import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { resolveRawLedgerPath, backupKeyFor } from "./path-resolve.ts";

const REPO_ROOT = "/repo";

describe("resolveRawLedgerPath", () => {
  it("resolves a relative ledger path against repoRoot", () => {
    assert.equal(
      resolveRawLedgerPath("data/brands/acme/ideas/x.png", REPO_ROOT),
      join(REPO_ROOT, "data/brands/acme/ideas/x.png"),
    );
  });

  it("returns an already-absolute path unchanged", () => {
    const abs = "/Users/someone/Developer/OrganicGrowth/data/brands/acme/ideas/x.png";
    assert.equal(resolveRawLedgerPath(abs, REPO_ROOT), abs);
  });
});

describe("backupKeyFor", () => {
  it("mirrors the repo-relative path when absPath lives inside repoRoot", () => {
    const abs = join(REPO_ROOT, "data/brands/acme/ideas/x.png");
    assert.equal(backupKeyFor(abs, REPO_ROOT, "acme"), "data/brands/acme/ideas/x.png");
  });

  it("falls back to a brand-namespaced, fingerprinted key for a path outside repoRoot", () => {
    const abs = "/Users/someone-else/Developer/OrganicGrowth/data/brands/acme/ideas/x.png";
    const key = backupKeyFor(abs, REPO_ROOT, "acme");
    assert.ok(key.startsWith(join("external", "acme") + "/"));
    assert.ok(key.endsWith("-x.png"));
  });

  it("is deterministic — the same absPath always yields the same key", () => {
    const abs = "/elsewhere/x.png";
    assert.equal(backupKeyFor(abs, REPO_ROOT, "acme"), backupKeyFor(abs, REPO_ROOT, "acme"));
  });

  it("never collides two different out-of-tree files that share a basename", () => {
    const a = backupKeyFor("/elsewhere/one/x.png", REPO_ROOT, "acme");
    const b = backupKeyFor("/elsewhere/two/x.png", REPO_ROOT, "acme");
    assert.notEqual(a, b);
  });

  it("does not treat repoRoot itself (relative === '') as inside — never writes to the destination root", () => {
    const key = backupKeyFor(REPO_ROOT, REPO_ROOT, "acme");
    assert.ok(key.startsWith(join("external", "acme") + "/"));
  });
});
