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
 *
 * **Round 2 (issue #252 Round 1's Defect 1): widened, then re-proven non-vacuous again.** The regex
 * originally only matched a NAMED citation directly after the `../` climb
 * (`(../)+references/<name>.md`). Two real files — `.claude/skills/grok-imagine/metadata.yaml` and
 * `.claude/skills/grok-imagine-1-5/metadata.yaml` — carried a stale, genuinely dangling citation
 * (`../../../_shared/references/`, a bare-directory pointer at a repo-root `_shared/` that has never
 * existed) that the original regex could not see, because `_shared/` sat between the `../` climb and
 * `references/`, and because it had no filename at all. Before the fix, the widened guard was run
 * against the real, still-stale tree and observed RED, naming both files by their real repo-relative
 * paths; the two files were then fixed to `../../references/` (matching the other nine `metadata.yaml`
 * files), and the guard was re-run and observed GREEN. See this change's `handoff.md`
 * "Build Report — Round 2" for the exact commands and transcripts of both runs.
 *
 * **Issue #212: extended (not duplicated) with a second check — manifest completeness.** A second
 * `describe` block below walks every `.claude/skills/<entry>/` directory that has a `metadata.yaml` (the
 * existing structural signal that already distinguishes the 11 model-prompting Skills from the 5
 * workflow Skills — no hard-coded name list to go stale), reads that entry's `SKILL.md` and
 * `metadata.yaml`, hands them to the PURE `findIncompleteManifests` (`manifest-completeness-scan.ts`),
 * and asserts zero incomplete-manifest defects. The expected `licence`/`owner` values are derived from
 * the repository's own real `LICENSE` file (via the pure `parseLicenceFile`), so the cross-check can
 * never quietly drift from what the repository actually says. Per the issue's own instruction — "the
 * dangling-reference half already shipped in #252 — extend that guard, do not build a second one" — this
 * lives in the SAME file, not a new one. See `docs/catalogue-manifest-format.md` for the full field list
 * and `handoff.md` for the field-by-field, one-at-a-time red/green non-vacuousness transcripts.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { extractAllReferenceCitations, findDanglingReferenceCitations, type SourceFile } from "./reference-citation-scan.ts";
import {
  findIncompleteManifests,
  parseLicenceFile,
  type CatalogueEntrySource,
  type ManifestCheckOptions,
} from "./manifest-completeness-scan.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const SKILLS_ROOT = join(REPO_ROOT, ".claude", "skills");

/** The `purpose` (SKILL.md description) length floor — see `docs/catalogue-manifest-format.md`'s
 *  "Threshold justification" section: the real corpus's shortest description is 359 characters
 *  (`chatgpt-image-2`), so 100 is under a third of that real minimum, comfortably clear of every real
 *  entry, while still catching a genuine placeholder ("Generates prompts." is 19 characters). */
const MINIMUM_PURPOSE_LENGTH = 100;

/** The corpus-size floor for the manifest-completeness walk — today's exact count of model-prompting
 *  Skills (each has a `metadata.yaml`; the 5 workflow Skills do not). A floor, not an equality, so a
 *  legitimate future 12th entry does not break this guard, while a walk that silently finds fewer than
 *  today's real count (a directory-discovery bug, a botched merge) still fails loudly. */
const MINIMUM_CATALOGUE_ENTRY_COUNT = 11;

/** Every immediate subdirectory of `.claude/skills/` that has its own `metadata.yaml` — the entries this
 *  ticket calls "catalogue entries" (the 11 model-prompting Skills), distinct from the 5 workflow Skills
 *  that carry no `metadata.yaml` and are out of scope by the issue's own text. */
async function collectCatalogueEntrySources(): Promise<readonly CatalogueEntrySource[]> {
  const entries = await readdir(SKILLS_ROOT, { withFileTypes: true });
  const sources: CatalogueEntrySource[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metadataPath = join(SKILLS_ROOT, entry.name, "metadata.yaml");
    if (!existsSync(metadataPath)) continue;
    const skillMdPath = join(SKILLS_ROOT, entry.name, "SKILL.md");
    const [metadataYamlContent, skillMdContent] = await Promise.all([
      readFile(metadataPath, "utf8"),
      readFile(skillMdPath, "utf8"),
    ]);
    sources.push({ skillName: entry.name, skillMdContent, metadataYamlContent });
  }
  return sources.sort((a, b) => a.skillName.localeCompare(b.skillName));
}

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
  it("every (../)+(<segment>/)*references/(<name>.md)? citation across .claude/skills/ resolves to a real file or folder", async () => {
    const files = await loadSourceFiles();
    const citations = extractAllReferenceCitations(files);

    // Sanity: the corpus this guard walks is non-trivial (11 model-prompting skills; ~129 named
    // citations plus ~33 bare-directory citations = ~162 total on main at the time this guard was
    // widened in issue #252 Round 2) — a guard that silently found zero citations would be trivially,
    // uselessly green, not a real check.
    assert.ok(
      citations.length >= 150,
      `expected at least 150 (../)+(<segment>/)*references/(<name>.md)? citations under ` +
        `.claude/skills/ (named + bare-directory), found ${citations.length} — the corpus this guard ` +
        `walks looks wrong, not merely all-fixed`,
    );

    const dangling = findDanglingReferenceCitations(citations, (resolvedPath) =>
      existsSync(join(REPO_ROOT, resolvedPath)),
    );

    assert.deepEqual(
      dangling,
      [],
      `Dangling reference citation(s) found: ${JSON.stringify(dangling, null, 2)}. ` +
        `Every .claude/skills/**/*.md or *.yaml citation of the shape ` +
        `(../)+(<segment>/)*references/(<name>.md)? must resolve to a real file or folder under ` +
        `.claude/references/ (issue #252; widened in Round 2 to also catch bare-directory citations ` +
        `and citations with an intervening path segment, e.g. a stale ` +
        `../../../_shared/references/ pointer).`,
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

describe("catalogue entry manifest completeness (issue #212)", () => {
  it("every catalogue entry (a .claude/skills/ subdirectory with its own metadata.yaml) carries a complete manifest", async () => {
    const licenceContent = await readFile(join(REPO_ROOT, "LICENSE"), "utf8");
    const licence = parseLicenceFile(licenceContent);
    assert.ok(licence !== undefined, "expected the repository's own LICENSE file to parse (spdxId + holder)");

    const sources = await collectCatalogueEntrySources();

    // Sanity: the corpus this guard walks is non-trivial (11 model-prompting Skills today) — a guard
    // that silently found zero (or far fewer) entries would be trivially, uselessly green.
    assert.ok(
      sources.length >= MINIMUM_CATALOGUE_ENTRY_COUNT,
      `expected at least ${MINIMUM_CATALOGUE_ENTRY_COUNT} catalogue entries (a .claude/skills/ ` +
        `subdirectory with its own metadata.yaml), found ${sources.length} — the corpus this guard ` +
        `walks looks wrong, not merely all-complete`,
    );

    const options: ManifestCheckOptions = {
      expectedOwner: licence!.holder,
      expectedLicence: licence!.spdxId,
      minimumPurposeLength: MINIMUM_PURPOSE_LENGTH,
    };
    const defects = findIncompleteManifests(sources, options);

    assert.deepEqual(
      defects,
      [],
      `Incomplete catalogue-entry manifest field(s) found: ${JSON.stringify(defects, null, 2)}. ` +
        `Every .claude/skills/<entry>/ with a metadata.yaml must carry a complete manifest per ` +
        `docs/catalogue-manifest-format.md (issue #212).`,
    );
  });
});
