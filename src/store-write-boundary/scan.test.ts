/**
 * Tests for the pure store-write import scanner (`src/store-write-boundary/scan.ts`, issue #233).
 *
 * Pure, in-memory fixtures only — no disk I/O in this file at all (the disk-walking half lives in
 * `store-write-guard.test.ts`, which is deliberately the ONLY place this guard touches the filesystem),
 * mirroring `src/fs-boundary/scan.test.ts`'s own split exactly.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isTestPath,
  isCommandSurfacePath,
  findStoreWriteImports,
  STORE_WRITE_FUNCTIONS,
  type SourceFile,
} from "./scan.ts";

describe("isTestPath", () => {
  it("is true for a *.test.ts path", () => {
    assert.equal(isTestPath("src/idea/store.test.ts"), true);
  });

  it("is true for a fixture path with 'test' inside a directory name", () => {
    assert.equal(isTestPath("src/some/test-support/helper.ts"), true);
  });

  it("is false for a fixture path with no 'test' substring anywhere", () => {
    assert.equal(isTestPath("src/production-queue/fixtures/claim-worker.ts"), false);
  });

  it("is false for an ordinary production path", () => {
    assert.equal(isTestPath("src/idea/store.ts"), false);
  });
});

describe("isCommandSurfacePath", () => {
  it("is true for a module directly under src/command-surface/", () => {
    assert.equal(isCommandSurfacePath("src/command-surface/ideas.ts"), true);
  });

  it("is false for a module outside src/command-surface/", () => {
    assert.equal(isCommandSurfacePath("src/idea/store.ts"), false);
  });

  it("is false for a path that merely contains the substring elsewhere", () => {
    assert.equal(isCommandSurfacePath("src/some/other-command-surface-like/thing.ts"), false);
  });
});

describe("STORE_WRITE_FUNCTIONS", () => {
  it("names only write functions for the idea store, never its reads", () => {
    const ideaWrites = STORE_WRITE_FUNCTIONS["src/idea/store.ts"];
    assert.deepEqual(
      [...ideaWrites!].sort(),
      ["acceptIdea", "createIdea", "rejectIdea", "selectIdeaRecipes"].sort(),
    );
    assert.equal(ideaWrites!.includes("getIdea"), false);
    assert.equal(ideaWrites!.includes("listIdeasForRun"), false);
  });
});

describe("findStoreWriteImports", () => {
  it("matches a real named-import site of a store write function, resolved to its store module", () => {
    const files: readonly SourceFile[] = [
      {
        path: "src/db/fixtures/seed-chain.ts",
        content: 'import { createBrand } from "../../brand/store.ts";\n',
      },
    ];
    assert.deepEqual(findStoreWriteImports(files), [
      { path: "src/db/fixtures/seed-chain.ts", store: "src/brand/store.ts", functions: ["createBrand"] },
    ]);
  });

  it("matches the exact shape a violating module takes — proving the guard has something real to fail on", () => {
    // Mirrors the throwaway module live-added and removed against the real disk-walking
    // store-write-guard.test.ts during this ticket's own build (task 3.1): a module outside
    // src/command-surface/, not on the allow-list, importing a store write function directly. Kept here
    // permanently as an in-memory fixture so the proof survives without leaving a landmine file in src/.
    const files: readonly SourceFile[] = [
      {
        path: "src/qa-demo/bypass-write.ts",
        content: 'import { createTrend } from "../trend/store.ts";\n',
      },
    ];
    assert.deepEqual(findStoreWriteImports(files), [
      { path: "src/qa-demo/bypass-write.ts", store: "src/trend/store.ts", functions: ["createTrend"] },
    ]);
  });

  it("does NOT match a bare doc-comment mention of a write function's name, with no real import", () => {
    const files: readonly SourceFile[] = [
      {
        path: "src/some/module.ts",
        content: "/** Eventually calls createBrand, but not from this file. */\nexport const x = 1;",
      },
    ];
    assert.deepEqual(findStoreWriteImports(files), []);
  });

  it("does NOT match a bare-name collision — the same function name exported by an unrelated module", () => {
    const files: readonly SourceFile[] = [
      {
        // brand/resolver.ts's OWN file-scanning `listBrands` is not brand/store.ts's SQL-backed one —
        // and listBrands is a READ anyway, but this proves the specifier (not the bare name) decides.
        path: "src/commands/run-pipeline.ts",
        content: 'import { listBrands } from "../brand/resolver.ts";\n',
      },
    ];
    assert.deepEqual(findStoreWriteImports(files), []);
  });

  it("does NOT match an unrelated import from an unrelated module", () => {
    const files: readonly SourceFile[] = [
      { path: "src/some/module.ts", content: 'import { join } from "node:path";\n' },
    ];
    assert.deepEqual(findStoreWriteImports(files), []);
  });

  it("excludes a file under src/command-surface/, even though it genuinely imports a store write function", () => {
    const files: readonly SourceFile[] = [
      {
        path: "src/command-surface/ideas.ts",
        content: 'import { createIdea } from "../idea/store.ts";\n',
      },
    ];
    assert.deepEqual(findStoreWriteImports(files), []);
  });

  it("excludes a *.test.ts file, even though it genuinely imports a store write function", () => {
    const files: readonly SourceFile[] = [
      {
        path: "src/idea/store.test.ts",
        content: 'import { createIdea } from "./store.ts";\n',
      },
    ];
    assert.deepEqual(findStoreWriteImports(files), []);
  });

  it("resolves a deeper relative specifier correctly (two directories up)", () => {
    const files: readonly SourceFile[] = [
      {
        path: "src/production-queue/fixtures/claim-worker.ts",
        content: 'import { claimJob } from "../job-store.ts";\n',
      },
    ];
    assert.deepEqual(findStoreWriteImports(files), [
      {
        path: "src/production-queue/fixtures/claim-worker.ts",
        store: "src/production-queue/job-store.ts",
        functions: ["claimJob"],
      },
    ]);
  });

  it("combines multiple write-function names imported from the SAME store in one import statement", () => {
    const files: readonly SourceFile[] = [
      {
        path: "src/some/module.ts",
        content: 'import { createChannel, setPrimaryChannel } from "../channel/store.ts";\n',
      },
    ];
    assert.deepEqual(findStoreWriteImports(files), [
      {
        path: "src/some/module.ts",
        store: "src/channel/store.ts",
        functions: ["createChannel", "setPrimaryChannel"],
      },
    ]);
  });

  it("ignores a read-function import from a store that also has write functions", () => {
    const files: readonly SourceFile[] = [
      {
        path: "src/some/module.ts",
        content: 'import { getIdea } from "../idea/store.ts";\n',
      },
    ];
    assert.deepEqual(findStoreWriteImports(files), []);
  });

  it("is pure — the same input always yields the same, freshly-computed output", () => {
    const files: readonly SourceFile[] = [
      { path: "src/some/module.ts", content: 'import { createTrend } from "../trend/store.ts";\n' },
    ];
    assert.deepEqual(findStoreWriteImports(files), findStoreWriteImports(files));
  });

  it("returns results sorted by path", () => {
    const files: readonly SourceFile[] = [
      { path: "src/z-module.ts", content: 'import { createTrend } from "./trend/store.ts";\n' },
      { path: "src/a-module.ts", content: 'import { createTrend } from "./trend/store.ts";\n' },
    ];
    const found = findStoreWriteImports(files);
    assert.deepEqual(
      found.map((f) => f.path),
      ["src/a-module.ts", "src/z-module.ts"],
    );
  });
});
