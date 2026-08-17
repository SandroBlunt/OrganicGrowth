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

  it("does not match a bare directory citation with no filename (out of this check's scope)", () => {
    const file: SourceFile = {
      path: ".claude/skills/veo-3-1/metadata.yaml",
      content: "shared_references:\n  path: ../../references/\n",
    };
    assert.deepEqual(extractReferenceCitations(file), []);
  });

  it("does not match an unrelated relative path", () => {
    const file: SourceFile = {
      path: ".claude/skills/veo-3-1/SKILL.md",
      content: "See `scripts/build-prompt.py` and `../../../references/README.md` (no .md name match).",
    };
    // "README.md" is uppercase, and the pattern is deliberately lowercase-hyphen only (issue #252's
    // own reproduction pattern) — this citation shape never occurs in the real catalogue.
    assert.deepEqual(extractReferenceCitations(file), []);
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
