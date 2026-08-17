/**
 * End-to-end install verification (issue #212's "installing one catalogue entry into a genuinely clean
 * checkout is verified end to end" acceptance criterion) — the permanent, automated form of the
 * one-off, by-hand transcript captured in this change's `handoff.md`.
 *
 * Installs the `veo-3-1` catalogue entry into a FRESHLY CREATED `mkdtemp` directory — genuinely empty
 * before the install, containing nothing else, never a subfolder of this repository (a subfolder of
 * this repository would hide exactly the bug this check exists to catch, per the issue's own comment) —
 * then re-runs the SAME pure citation scanner `#252` built (`extractAllReferenceCitations` /
 * `findDanglingReferenceCitations`, `reference-citation-scan.ts`) against the INSTALLED copy's own
 * files, asserting zero dangling citations there too. If the shared-reference dependency were not
 * actually satisfied by the install (the exact bug this ticket's own brief worried about — "copying one
 * Skill folder into a clean checkout reproduces exactly the bug #252 existed to fix"), this test would
 * fail here, on the INSTALLED tree, not merely on the source tree #252's own guard already covers.
 *
 * The temporary directory is removed after the test, whether it passes or fails.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { installCatalogueEntry } from "./install-catalogue-entry.ts";
import { extractAllReferenceCitations, findDanglingReferenceCitations, type SourceFile } from "./reference-citation-scan.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");

/** Recursively collects every `.md`/`.yaml` file under `dir`, as paths relative to `root`. */
async function collectCitingFiles(dir: string, root: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectCitingFiles(full, root)));
    } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".yaml"))) {
      found.push(relative(root, full).split("\\").join("/"));
    }
  }
  return found;
}

describe("install-catalogue-entry end-to-end (issue #212)", () => {
  it("installing veo-3-1 into a fresh, empty temp directory reproduces a citation-clean tree", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "og-catalogue-install-"));
    try {
      // The temp directory is genuinely empty before the install — sanity-checked, not assumed.
      assert.deepEqual(await readdir(tmpRoot), []);

      const result = await installCatalogueEntry({ repoRoot: REPO_ROOT, skillName: "veo-3-1", destDir: tmpRoot });

      assert.equal(result.plan.installable, true);
      assert.ok(result.entryFiles.length > 0, "expected at least one file copied for the entry itself");
      assert.ok(result.sharedReferenceFiles.length > 0, "expected at least one shared-reference file copied");

      const skillDir = join(tmpRoot, ".claude", "skills", "veo-3-1");
      const referencesDir = join(tmpRoot, ".claude", "references");
      assert.ok(existsSync(join(skillDir, "SKILL.md")));
      assert.ok(existsSync(join(skillDir, "metadata.yaml")));
      assert.ok(existsSync(join(referencesDir, "prompt-discipline.md")));
      assert.ok(existsSync(join(referencesDir, "cinematography.md")));

      // Re-run the #252 pure citation scanner against the INSTALLED copy's own files, exactly as it
      // runs against the real source tree in reference-citation-guard.docs-test.ts.
      const citingPaths = await collectCitingFiles(skillDir, tmpRoot);
      const files: SourceFile[] = await Promise.all(
        citingPaths.map(async (path) => ({ path, content: await readFile(join(tmpRoot, path), "utf8") })),
      );
      const citations = extractAllReferenceCitations(files);
      assert.ok(citations.length > 0, "expected the installed SKILL.md/metadata.yaml to still carry shared-reference citations");

      const dangling = findDanglingReferenceCitations(citations, (resolvedPath) => existsSync(join(tmpRoot, resolvedPath)));
      assert.deepEqual(
        dangling,
        [],
        `Dangling reference citation(s) found in the INSTALLED copy: ${JSON.stringify(dangling, null, 2)}. ` +
          `Installing veo-3-1 alone (without its shared-reference dependency) would reproduce issue #252's ` +
          `own bug for the licensee — this proves the copy-alongside install keeps every citation resolving.`,
      );
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
});
