/**
 * Tests for the pure reference-citation scanner (`src/claude-skills/reference-citation-scan.ts`,
 * issue #252).
 *
 * Pure, in-memory fixtures only — no disk I/O in this file at all (the disk-walking half lives in
 * `reference-citation-guard.docs-test.ts`, which is deliberately the ONLY place this guard touches
 * the filesystem — the same split `src/fs-boundary/scan.test.ts` / `node-fs-guard.test.ts` already
 * establishes).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  extractAllReferenceCitations,
  extractReferenceCitations,
  findDanglingReferenceCitations,
  resolveCitationPath,
  type SourceFile,
} from "./reference-citation-scan.ts";

describe("resolveCitationPath", () => {
  it("resolves a SKILL.md-depth citation (two '../' too many for a directly-adjacent references/ folder)", () => {
    // .claude/skills/veo-3-1/SKILL.md citing ../../references/photography.md
    assert.equal(
      resolveCitationPath(".claude/skills/veo-3-1", "../../references/photography.md"),
      ".claude/references/photography.md",
    );
  });

  it("resolves a references/*.md-depth citation, one directory deeper", () => {
    // .claude/skills/veo-3-1/references/README.md citing ../../../references/photography.md
    assert.equal(
      resolveCitationPath(".claude/skills/veo-3-1/references", "../../../references/photography.md"),
      ".claude/references/photography.md",
    );
  });

  it("resolves a stale, over-deep citation to a path outside .claude/references/ (the issue #252 bug shape)", () => {
    // The pre-fix bug: a SKILL.md-depth file using the deeper file's own ../../../ prefix overshoots
    // by one directory, landing at the repo root's references/ instead of .claude/references/.
    assert.equal(
      resolveCitationPath(".claude/skills/veo-3-1", "../../../references/photography.md"),
      "references/photography.md",
    );
  });
});

describe("extractReferenceCitations", () => {
  it("finds every citation in a SKILL.md-shaped file, resolved against its own directory", () => {
    const file: SourceFile = {
      path: ".claude/skills/veo-3-1/SKILL.md",
      content:
        "The shared discipline lives in `../../references/prompt-discipline.md`, " +
        "`../../references/cinematography.md`, and `../../references/production-design.md`.",
    };
    const citations = extractReferenceCitations(file);
    assert.equal(citations.length, 3);
    assert.deepEqual(
      citations.map((c) => c.resolvedPath),
      [
        ".claude/references/prompt-discipline.md",
        ".claude/references/cinematography.md",
        ".claude/references/production-design.md",
      ],
    );
    assert.ok(citations.every((c) => c.citingFile === file.path));
  });

  it("matches a bare-directory citation with no filename (issue #252 Round 2: re-decided in scope, see reference-citation-scan.ts's own module doc)", () => {
    const file: SourceFile = {
      path: ".claude/skills/veo-3-1/metadata.yaml",
      content: "shared_references:\n  path: ../../references/\n",
    };
    const citations = extractReferenceCitations(file);
    assert.equal(citations.length, 1);
    assert.equal(citations[0]!.rawPath, "../../references/");
    assert.equal(citations[0]!.resolvedPath, ".claude/references");
  });

  it("matches a bare-directory citation with an intervening path segment before 'references/' (the issue #252 Round 1 Defect 1 shape: a stale `../../../_shared/references/` pointer)", () => {
    const file: SourceFile = {
      path: ".claude/skills/grok-imagine/metadata.yaml",
      content: "shared_references:\n  path: ../../../_shared/references/\n",
    };
    const citations = extractReferenceCitations(file);
    assert.equal(citations.length, 1);
    assert.equal(citations[0]!.rawPath, "../../../_shared/references/");
    // Resolves outside .claude/ entirely, to a repo-root _shared/references — this is the point:
    // the citation must be SEEN and RESOLVED so findDanglingReferenceCitations can judge it, not
    // silently skipped for having an unexpected segment in the middle of the path.
    assert.equal(citations[0]!.resolvedPath, "_shared/references");
  });

  it("matches a NAMED citation with an intervening path segment before 'references/', same as the bare-directory case", () => {
    const file: SourceFile = {
      path: ".claude/skills/veo-3-1/SKILL.md",
      content: "See `../../../vendor/references/cinematography.md` for the shared craft notes.",
    };
    const citations = extractReferenceCitations(file);
    assert.equal(citations.length, 1);
    assert.equal(citations[0]!.resolvedPath, "vendor/references/cinematography.md");
  });

  it("does not match a relative path with no 'references/' segment at all", () => {
    const file: SourceFile = {
      path: ".claude/skills/veo-3-1/SKILL.md",
      content: "See `scripts/build-prompt.py` and `../../translation-notes.md` (no references/ segment).",
    };
    assert.deepEqual(extractReferenceCitations(file), []);
  });

  it("matches only the bare-directory prefix when the filename after it does not match the " +
     "lowercase-hyphenated .md shape (e.g. an uppercase README.md) — the real shape every " +
     "references/README.md file itself uses to point back at the shared folder", () => {
    const file: SourceFile = {
      path: ".claude/skills/veo-3-1/SKILL.md",
      content: "See `../../../references/README.md` (filename not captured, directory pointer is).",
    };
    const citations = extractReferenceCitations(file);
    assert.equal(citations.length, 1);
    assert.equal(citations[0]!.rawPath, "../../../references/");
    assert.equal(citations[0]!.resolvedPath, "references");
  });

  it("returns [] for a file with no citation at all", () => {
    const file: SourceFile = { path: ".claude/skills/happy-horse/scripts/build-prompt.py", content: "x = 1" };
    assert.deepEqual(extractReferenceCitations(file), []);
  });
});

describe("extractAllReferenceCitations", () => {
  it("concatenates citations across multiple files, in file order", () => {
    const files: SourceFile[] = [
      { path: ".claude/skills/a/SKILL.md", content: "`../../references/lighting.md`" },
      { path: ".claude/skills/b/SKILL.md", content: "`../../references/photography.md`" },
    ];
    const citations = extractAllReferenceCitations(files);
    assert.deepEqual(
      citations.map((c) => c.resolvedPath),
      [".claude/references/lighting.md", ".claude/references/photography.md"],
    );
  });
});

describe("findDanglingReferenceCitations", () => {
  const EXISTING = new Set([
    ".claude/references", // the shared folder itself, for bare-directory citations
    ".claude/references/prompt-discipline.md",
    ".claude/references/cinematography.md",
    ".claude/references/lighting.md",
    ".claude/references/photography.md",
    ".claude/references/production-design.md",
  ]);
  const pathExists = (p: string) => EXISTING.has(p);

  it("returns [] when every citation resolves to an existing path", () => {
    const citations = extractAllReferenceCitations([
      { path: ".claude/skills/veo-3-1/SKILL.md", content: "`../../references/lighting.md`" },
    ]);
    assert.deepEqual(findDanglingReferenceCitations(citations, pathExists), []);
  });

  it("catches exactly the issue #252 bug shape: a SKILL.md citation using one '../' too many", () => {
    const citations = extractAllReferenceCitations([
      {
        path: ".claude/skills/veo-3-1/SKILL.md",
        content: "`../../../references/production-design.md`", // pre-fix depth
      },
    ]);
    const dangling = findDanglingReferenceCitations(citations, pathExists);
    assert.equal(dangling.length, 1);
    assert.equal(dangling[0]!.resolvedPath, "references/production-design.md");
  });

  it("is proven non-vacuous: a hand-introduced broken citation is caught, and removing it restores green", () => {
    const good: SourceFile = {
      path: ".claude/skills/veo-3-1/SKILL.md",
      content: "`../../references/photography.md`",
    };
    const broken: SourceFile = {
      path: ".claude/skills/veo-3-1/SKILL.md",
      content: "`../../references/photography.md` and `../../references/nonexistent-craft.md`",
    };
    assert.deepEqual(
      findDanglingReferenceCitations(extractAllReferenceCitations([good]), pathExists),
      [],
      "the clean fixture must be green before the broken one is asserted red",
    );
    const dangling = findDanglingReferenceCitations(extractAllReferenceCitations([broken]), pathExists);
    assert.equal(dangling.length, 1, "the hand-introduced dangling citation must be caught");
    assert.equal(dangling[0]!.resolvedPath, ".claude/references/nonexistent-craft.md");
    assert.deepEqual(
      findDanglingReferenceCitations(extractAllReferenceCitations([good]), pathExists),
      [],
      "removing the broken citation must restore green, proving the guard is not stuck red",
    );
  });

  it("returns [] when a bare-directory citation resolves to the existing shared folder", () => {
    const citations = extractAllReferenceCitations([
      { path: ".claude/skills/veo-3-1/metadata.yaml", content: "path: ../../references/" },
    ]);
    assert.deepEqual(findDanglingReferenceCitations(citations, pathExists), []);
  });

  it("pins the issue #252 Round 1 Defect 1 shape: a bare-directory citation with an intervening " +
     "'_shared/' segment (`../../../_shared/references/`) is caught as dangling, not silently " +
     "skipped for having an extra segment in the middle of the path", () => {
    const citations = extractAllReferenceCitations([
      {
        path: ".claude/skills/grok-imagine/metadata.yaml",
        content: "shared_references:\n  mode: relative-link\n  path: ../../../_shared/references/\n",
      },
    ]);
    const dangling = findDanglingReferenceCitations(citations, pathExists);
    assert.equal(dangling.length, 1, "the stale _shared/references/ pointer must be flagged dangling");
    assert.equal(dangling[0]!.resolvedPath, "_shared/references");

    // The fix (matching the other nine metadata.yaml files) resolves it clean.
    const fixed = extractAllReferenceCitations([
      {
        path: ".claude/skills/grok-imagine/metadata.yaml",
        content: "shared_references:\n  mode: relative-link\n  path: ../../references/\n",
      },
    ]);
    assert.deepEqual(
      findDanglingReferenceCitations(fixed, pathExists),
      [],
      "pointing at ../../references/ (matching the other nine metadata.yaml files) must resolve clean",
    );
  });

  it("sorts findings by citing file then raw path, for a stable failure message", () => {
    const citations = extractAllReferenceCitations([
      { path: ".claude/skills/b/SKILL.md", content: "`../../references/missing-two.md`" },
      { path: ".claude/skills/a/SKILL.md", content: "`../../references/missing-b.md` `../../references/missing-a.md`" },
    ]);
    const dangling = findDanglingReferenceCitations(citations, pathExists);
    assert.deepEqual(
      dangling.map((c) => `${c.citingFile}:${c.rawPath}`),
      [
        ".claude/skills/a/SKILL.md:../../references/missing-a.md",
        ".claude/skills/a/SKILL.md:../../references/missing-b.md",
        ".claude/skills/b/SKILL.md:../../references/missing-two.md",
      ],
    );
  });
});
