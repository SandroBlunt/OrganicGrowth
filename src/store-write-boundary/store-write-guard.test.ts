/**
 * The store-write boundary guard (issue #233, following up on #205's own AC2: "the command surface is
 * the only thing that writes"). Mirrors `src/fs-boundary/node-fs-guard.test.ts`'s shape exactly.
 *
 * Walks every `.ts` file under `src/`, hands the (path, content) pairs to the PURE
 * `findStoreWriteImports` (`scan.ts`), and asserts the result is EXACTLY `STORE_WRITE_BOUNDARY_ALLOW_LIST`
 * (`allow-list.ts`) — both directions, at the finest resolution available (one importing-file / store /
 * write-function-name triple at a time, not merely "this file is on the list somewhere"):
 *
 *   - every (file, store, function) triple found importing a store write function directly, outside
 *     `src/command-surface/` and test paths, MUST already be allow-listed (a brand-new, un-audited
 *     bypass fails the build the moment it lands — the whole point of this guard), and
 *   - every allow-listed triple MUST still actually be imported that way (a stale entry — e.g. one left
 *     behind after a later refactor removes its direct store-write import — fails too, so the list can
 *     never silently drift into over-claiming what still needs the carve-out).
 *
 * This file itself is exempt by construction: `isTestPath` matches any path containing `"test"`, and
 * this file's own name does — it needs `node:fs/promises` for the walk, exactly like
 * `node-fs-guard.test.ts`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { findStoreWriteImports, type SourceFile, type StoreWriteImport } from "./scan.ts";
import { STORE_WRITE_BOUNDARY_ALLOW_LIST } from "./allow-list.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const SRC_ROOT = join(REPO_ROOT, "src");

/** Recursively collects every `.ts` file under `dir`, as repo-relative, forward-slash paths. */
async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectTsFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      found.push(relative(REPO_ROOT, full).split("\\").join("/"));
    }
  }
  return found;
}

async function loadSourceFiles(): Promise<readonly SourceFile[]> {
  const paths = await collectTsFiles(SRC_ROOT);
  return Promise.all(
    paths.map(async (path) => ({ path, content: await readFile(join(REPO_ROOT, path), "utf8") })),
  );
}

/** Flattens `{ path, store, functions }` entries to one `"path::store::function"` key per function, so
 *  comparison catches a partial mismatch (an entry claiming a function that isn't actually imported, or
 *  vice versa) — not just "this (path, store) pair appears somewhere." */
function flatten(entries: readonly StoreWriteImport[]): readonly string[] {
  return entries.flatMap((entry) => entry.functions.map((fn) => `${entry.path}::${entry.store}::${fn}`)).sort();
}

describe("store-write boundary guard (issue #233)", () => {
  it("finds exactly the allow-listed set — no new, un-audited direct store-write import and no stale entry", async () => {
    const files = await loadSourceFiles();
    const found = flatten(findStoreWriteImports(files));
    const allowed = flatten(STORE_WRITE_BOUNDARY_ALLOW_LIST);

    const newViolations = found.filter((key) => !allowed.includes(key));
    const staleEntries = allowed.filter((key) => !found.includes(key));

    assert.deepEqual(
      newViolations,
      [],
      `New, un-audited direct store-write import(s): ${JSON.stringify(newViolations)}. ` +
        `Every module outside src/command-surface/ that imports a SQL-backed store's write function ` +
        `directly must either move onto src/command-surface/, or be added to ` +
        `src/store-write-boundary/allow-list.ts with a stated reason (issue #233).`,
    );
    assert.deepEqual(
      staleEntries,
      [],
      `Stale store-write allow-list entr(y/ies) that no longer import that function: ${JSON.stringify(staleEntries)}. ` +
        `Remove them from src/store-write-boundary/allow-list.ts so the list never over-claims.`,
    );
  });
});
