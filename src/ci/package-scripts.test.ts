import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parsePackageJsonScripts, runsTypecheckFirst, coversTestGlob } from "./package-scripts.ts";

/**
 * Issue #199, QA Round-1 Defect D1 — the "npm test merges both suites" Requirement had four testable
 * Scenarios and ZERO persisted automated test: nothing read `package.json` and asserted the `test`
 * script's shape, so a future silent revert (someone quietly dropping the `*.docs-test.ts` glob back
 * out) would stay green forever, exactly the class of drift #199 itself was filed to stop. This suite
 * closes that gap, reading and JSON-parsing the REAL `package.json` (never a copied string constant),
 * pinning the MEANINGFUL properties (typecheck-first ordering; both globs covered) rather than the
 * exact script string, so a harmless reformatting pass doesn't turn this into a nuisance test someone
 * deletes.
 */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PACKAGE_JSON_PATH = join(REPO_ROOT, "package.json");

const UNIT_GLOB = "src/**/*.test.ts";
const DOCS_GLOB = "src/**/*.docs-test.ts";

describe("parsePackageJsonScripts — reads the real scripts map, never throws on a malformed document", () => {
  it("reads the scripts map from valid JSON", () => {
    const parsed = parsePackageJsonScripts('{"scripts": {"test": "tsc && node --test"}}');
    assert.deepEqual(parsed, { scripts: { test: "tsc && node --test" } });
  });

  it("returns {} when scripts is absent", () => {
    assert.deepEqual(parsePackageJsonScripts('{"name": "x"}'), {});
  });

  it("returns {} when scripts is not an object (malformed)", () => {
    assert.deepEqual(parsePackageJsonScripts('{"scripts": "not-an-object"}'), {});
  });
});

describe("runsTypecheckFirst — pins the ordering, robust to harmless reformatting", () => {
  it("returns true when tsc -p tsconfig.json --noEmit is the first && command", () => {
    assert.equal(
      runsTypecheckFirst(
        'tsc -p tsconfig.json --noEmit && node --import tsx --test "src/**/*.test.ts"',
      ),
      true,
    );
  });

  it("is robust to extra whitespace around &&", () => {
    assert.equal(
      runsTypecheckFirst(
        'tsc -p tsconfig.json --noEmit   &&   node --import tsx --test "src/**/*.test.ts"',
      ),
      true,
    );
  });

  it("returns false when the typecheck step is missing", () => {
    assert.equal(runsTypecheckFirst('node --import tsx --test "src/**/*.test.ts"'), false);
  });

  it("returns false when the typecheck step runs SECOND, not first", () => {
    assert.equal(
      runsTypecheckFirst(
        'node --import tsx --test "src/**/*.test.ts" && tsc -p tsconfig.json --noEmit',
      ),
      false,
    );
  });
});

describe("coversTestGlob — pins glob coverage, quote-style-robust, never a false positive on a different glob", () => {
  it("finds a double-quoted glob argument", () => {
    assert.equal(coversTestGlob('node --test "src/**/*.test.ts"', UNIT_GLOB), true);
  });

  it("finds a single-quoted glob argument", () => {
    assert.equal(coversTestGlob("node --test 'src/**/*.test.ts'", UNIT_GLOB), true);
  });

  it("returns false when the glob is absent", () => {
    assert.equal(coversTestGlob('node --test "src/**/*.docs-test.ts"', UNIT_GLOB), false);
  });

  it("does not false-positive the docs glob when checking for the unit glob, or vice versa", () => {
    const script = `node --test "${UNIT_GLOB}" "${DOCS_GLOB}"`;
    assert.equal(coversTestGlob(script, UNIT_GLOB), true);
    assert.equal(coversTestGlob(script, DOCS_GLOB), true);
    assert.equal(coversTestGlob('node --test "src/**/*.docs-test.ts"', UNIT_GLOB), false);
  });
});

describe("This repository's real package.json test script is guarded (issue #199 D1)", () => {
  it("runs the typecheck step first", async () => {
    const raw = await readFile(PACKAGE_JSON_PATH, "utf8");
    const { scripts } = parsePackageJsonScripts(raw);
    assert.ok(scripts?.test, "expected package.json to declare a test script");
    assert.equal(runsTypecheckFirst(scripts.test), true);
  });

  it("covers both the unit-test glob and the doc-conformance glob", async () => {
    const raw = await readFile(PACKAGE_JSON_PATH, "utf8");
    const { scripts } = parsePackageJsonScripts(raw);
    assert.ok(scripts?.test);
    assert.equal(coversTestGlob(scripts.test, UNIT_GLOB), true);
    assert.equal(coversTestGlob(scripts.test, DOCS_GLOB), true);
  });

  it("test:docs still covers only the doc-conformance glob, standalone", async () => {
    const raw = await readFile(PACKAGE_JSON_PATH, "utf8");
    const { scripts } = parsePackageJsonScripts(raw);
    assert.ok(scripts?.["test:docs"], "expected package.json to declare a test:docs script");
    assert.equal(coversTestGlob(scripts["test:docs"], DOCS_GLOB), true);
    assert.equal(coversTestGlob(scripts["test:docs"], UNIT_GLOB), false);
  });
});
