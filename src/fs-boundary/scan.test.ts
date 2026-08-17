/**
 * Tests for the pure node:fs import scanner (`src/fs-boundary/scan.ts`, issue #205 AC7).
 *
 * Pure, in-memory fixtures only — no disk I/O in this file at all (the disk-walking half lives in
 * `node-fs-guard.test.ts`, which is deliberately the ONLY place this guard touches the filesystem).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { findNodeFsImports, importsNodeFs, isTestPath } from "./scan.ts";

describe("isTestPath", () => {
  it("is true for a *.test.ts path", () => {
    assert.equal(isTestPath("src/idea/store.test.ts"), true);
  });

  it("is true for a *.docs-test.ts path", () => {
    assert.equal(isTestPath("src/db/adr.docs-test.ts"), true);
  });

  it("is true for a path with 'test' inside a directory name", () => {
    assert.equal(isTestPath("src/some/test-support/helper.ts"), true);
  });

  it("is false for a fixture path with no 'test' substring anywhere", () => {
    assert.equal(isTestPath("src/production-queue/fixtures/claim-worker.ts"), false);
  });

  it("is false for an ordinary production path", () => {
    assert.equal(isTestPath("src/asset/download.ts"), false);
  });
});

describe("importsNodeFs", () => {
  it("matches a static import from node:fs/promises, double quotes", () => {
    assert.equal(importsNodeFs('import { mkdir } from "node:fs/promises";'), true);
  });

  it("matches a static import from node:fs, single quotes", () => {
    assert.equal(importsNodeFs("import { readFileSync } from 'node:fs';"), true);
  });

  it("matches a require(\"node:fs\") call", () => {
    assert.equal(importsNodeFs('const fs = require("node:fs");'), true);
  });

  it("does NOT match a bare prose mention of node:fs in a comment, with no import", () => {
    const content = `/** This module deliberately never imports node:fs. */\nexport const x = 1;`;
    assert.equal(importsNodeFs(content), false);
  });

  it("does NOT match an unrelated import", () => {
    assert.equal(importsNodeFs('import { join } from "node:path";'), false);
  });
});

describe("findNodeFsImports", () => {
  it("returns only non-test files that import node:fs, sorted", () => {
    const files = [
      { path: "src/b/module.ts", content: 'import { mkdir } from "node:fs/promises";' },
      { path: "src/a/module.ts", content: 'import { readFileSync } from "node:fs";' },
      { path: "src/c/no-fs.ts", content: "export const x = 1;" },
      { path: "src/d/module.test.ts", content: 'import { mkdir } from "node:fs/promises";' },
    ];
    assert.deepEqual(findNodeFsImports(files), ["src/a/module.ts", "src/b/module.ts"]);
  });

  it("returns [] when nothing imports node:fs", () => {
    const files = [{ path: "src/a/module.ts", content: "export const x = 1;" }];
    assert.deepEqual(findNodeFsImports(files), []);
  });

  it("is pure — the same input always yields the same, freshly-computed output", () => {
    const files = [{ path: "src/a/module.ts", content: 'import "node:fs";' }];
    assert.deepEqual(findNodeFsImports(files), findNodeFsImports(files));
  });
});
