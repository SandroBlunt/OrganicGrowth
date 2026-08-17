/**
 * The dangling-reference-citation guard for the `.claude/skills/` catalogue (issue #252; #212's own
 * "an automated check fails when a catalogue entry has ... a dangling reference link" acceptance
 * criterion, landed here before the manifest half of #212).
 *
 * Walks every `.claude/skills/**\/*.md` and `.claude/skills/**\/*.yaml` file, hands the (path, content)
 * pairs to the PURE `extractAllReferenceCitations` (`reference-citation-scan.ts`), and asserts every
 * resulting citation's `resolvedPath` exists on disk (via `existsSync` — the ONE place this whole guard
 * touches the filesystem for existence checks; the parsing/resolution logic itself is proven with zero
 * disk I/O in `reference-citation-scan.test.ts`).
 *
 * This file itself is exempt from the walk by construction — it lives under `src/`, not
 * `.claude/skills/`.
 *
 * **Proven non-vacuous, not merely written to look right (issue #252's own directive).** Before this
 * file was committed, a citation to a file that does not exist
 * (`` `../../references/does-not-exist-nonce.md` ``) was hand-appended to
 * `.claude/skills/veo-3-1/SKILL.md`, `npm run test:docs` was run and observed to fail on exactly this
 * suite naming that one dangling citation, the appended line was then removed, and `npm run test:docs`
 * was re-run and observed green again. See this change's `handoff.md` Build Report for the exact
 * commands and output. The five craft-reference documents this guard now finds satisfied
 * (`prompt-discipline.md`, `cinematography.md`, `lighting.md`, `photography.md`,
 * `production-design.md`) live at `.claude/references/` (issue #252's own recorded location decision).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { extractAllReferenceCitations, findDanglingReferenceCitations, type SourceFile } from "./reference-citation-scan.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const SKILLS_ROOT = join(REPO_ROOT, ".claude", "skills");

/** Recursively collects every `.md`/`.yaml` file under `dir`, as repo-relative, forward-slash paths. */
async function collectCitingFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectCitingFiles(full)));
    } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".yaml"))) {
      found.push(relative(REPO_ROOT, full).split("\\").join("/"));
    }
  }
  return found;
}

async function loadSourceFiles(): Promise<readonly SourceFile[]> {
  const paths = await collectCitingFiles(SKILLS_ROOT);
  return Promise.all(
    paths.map(async (path) => ({ path, content: await readFile(join(REPO_ROOT, path), "utf8") })),
  );
}

describe("dangling reference-citation guard (issue #252)", () => {
  it("every (../)+references/<name>.md citation across .claude/skills/ resolves to a real file", async () => {
    const files = await loadSourceFiles();
    const citations = extractAllReferenceCitations(files);

    // Sanity: the corpus this guard walks is non-trivial (11 model-prompting skills, ~129 citations
    // on main at the time this guard was written) — a guard that silently found zero citations would
    // be trivially, uselessly green, not a real check.
    assert.ok(
      citations.length >= 100,
      `expected at least 100 (../)+references/<name>.md citations under .claude/skills/, found ` +
        `${citations.length} — the corpus this guard walks looks wrong, not merely all-fixed`,
    );

    const dangling = findDanglingReferenceCitations(citations, (resolvedPath) =>
      existsSync(join(REPO_ROOT, resolvedPath)),
    );

    assert.deepEqual(
      dangling,
      [],
      `Dangling reference citation(s) found: ${JSON.stringify(dangling, null, 2)}. ` +
        `Every .claude/skills/**/*.md or *.yaml citation of the shape (../)+references/<name>.md must ` +
        `resolve to a real file under .claude/references/ (issue #252).`,
    );
  });

  it("finds every one of the five shared craft-reference documents cited at least once", async () => {
    const files = await loadSourceFiles();
    const citations = extractAllReferenceCitations(files);
    const citedNames = new Set(citations.map((c) => c.resolvedPath.split("/").pop()));
    for (const name of [
      "prompt-discipline.md",
      "cinematography.md",
      "lighting.md",
      "photography.md",
      "production-design.md",
    ]) {
      assert.ok(citedNames.has(name), `expected at least one citation of ${name}`);
    }
  });
});
