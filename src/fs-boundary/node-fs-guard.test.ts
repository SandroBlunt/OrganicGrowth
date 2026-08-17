/**
 * The node:fs boundary guard (issue #205 AC7) — the ONE place this whole check touches a real disk.
 *
 * Walks every `.ts` file under `src/`, hands the (path, content) pairs to the PURE
 * `findNodeFsImports` (`scan.ts`), and asserts the result is EXACTLY `NODE_FS_ALLOW_LIST`
 * (`allow-list.ts`) — both directions:
 *
 *   - every file found importing `node:fs` outside a test file MUST already be on the allow-list (a
 *     brand-new, un-audited import fails the build the moment it lands — the whole point of AC7), and
 *   - every allow-listed path MUST still actually import `node:fs` (a stale entry — e.g. one left
 *     behind after a later refactor removes its `node:fs` usage — fails too, so the list can never
 *     silently drift into over-claiming what still needs the carve-out).
 *
 * This file itself is exempt by construction: `isTestPath` matches any path containing `"test"`, and
 * this file's own name does — it needs `node:fs/promises` for the walk, exactly like every other test
 * in this codebase (`withTempDb`'s `mkdtemp`, etc.).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { findNodeFsImports, type SourceFile } from "./scan.ts";
import { NODE_FS_ALLOW_LIST } from "./allow-list.ts";

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

describe("node:fs boundary guard (issue #205 AC7)", () => {
  it("finds exactly the allow-listed set — no new, un-audited violation and no stale entry", async () => {
    const files = await loadSourceFiles();
    const found = findNodeFsImports(files);
    const allowed = [...NODE_FS_ALLOW_LIST].sort();

    const newViolations = found.filter((path) => !allowed.includes(path));
    const staleEntries = allowed.filter((path) => !found.includes(path));

    assert.deepEqual(
      newViolations,
      [],
      `New, un-audited node:fs import(s) outside the allow-list: ${JSON.stringify(newViolations)}. ` +
        `Every non-test module importing node:fs must be audited (issue #205) and either moved behind ` +
        `a store/port, or added to src/fs-boundary/allow-list.ts with a stated reason.`,
    );
    assert.deepEqual(
      staleEntries,
      [],
      `Stale allow-list entr(y/ies) that no longer import node:fs: ${JSON.stringify(staleEntries)}. ` +
        `Remove them from src/fs-boundary/allow-list.ts so the list never over-claims.`,
    );
  });
});
