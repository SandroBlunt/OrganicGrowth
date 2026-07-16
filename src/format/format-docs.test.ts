/**
 * Format-scoped research: prompt-conformance tests (issue #53 AC3/AC4).
 *
 * `/run-trends`, `trend-scout`, and `idea-strategist` are prompt-driven agents (`.claude/**\/*.md`) —
 * there is no compiled TS runtime for their research behavior to unit-test directly. These
 * assertions pin the SOURCE TEXT of those prompts so the Format-scoping requirements this slice adds
 * are provable by `npm test`, not just by hand-reading the docs. Deliberately kept as a REGULAR
 * `.test.ts` (not `*.docs-test.ts`): the underlying behavior these prompts describe (Format is
 * required, sources/mode/voice come from the Format file, every Idea is tagged with its Format) is a
 * core acceptance criterion of this slice, not incidental documentation conformance.
 *
 * No Magnific Space involved — these are plain markdown-file reads.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");

async function readDoc(...parts: string[]): Promise<string> {
  return readFile(join(REPO_ROOT, ...parts), "utf8");
}

describe("/run-trends requires an explicit Format argument (issue #53 AC3)", () => {
  it("documents <brand> <format> as the required usage, not an optional/defaulted format", async () => {
    const doc = await readDoc(".claude", "commands", "run-trends.md");
    assert.match(doc, /`\/run-trends <brand> <format>/, "usage line must require <format>");
    assert.match(doc, /BOTH required/i, "must state both Brand and Format are required, no silent default");
  });

  it("namespaces the Run's output path by Format", async () => {
    const doc = await readDoc(".claude", "commands", "run-trends.md");
    assert.match(
      doc,
      /ideas\/<format>\/<run>/,
      "the documented Ideas root must be namespaced by <format>, not just <run>",
    );
  });

  it("reads sources/mode/ideas_per_run from the Format file, not seeds.yaml", async () => {
    const doc = await readDoc(".claude", "commands", "run-trends.md");
    assert.match(doc, /formats\/<format>\.yaml/, "must reference the Format file path");
    assert.match(doc, /ideas_per_run.*read from the Format file/is);
  });
});

describe("trend-scout reads its peer-vs-curated mode + sources from the Format file (issue #53 AC4)", () => {
  it("names the Format file as the source of truth for sources.mode", async () => {
    const doc = await readDoc(".claude", "agents", "trend-scout.md");
    assert.match(doc, /formats\/<format>\.yaml/);
    assert.match(doc, /sources\.mode/);
    assert.match(doc, /NOT from the Brand/i, "must state sources/mode are read from the Format, not the Brand");
  });

  it("writes its Trends to the Format-namespaced Ideas directory", async () => {
    const doc = await readDoc(".claude", "agents", "trend-scout.md");
    assert.match(doc, /ideas\/<format>\/<run>\/trends\.json/);
    assert.match(doc, /ideas\/<format>\/<run>\/trends\.md/);
  });

  it("requires both Brand and Format at invocation", async () => {
    const doc = await readDoc(".claude", "agents", "trend-scout.md");
    assert.match(doc, /Brand AND Format are always explicit/i);
  });
});

describe("idea-strategist tags every Idea with its Format and reads voice from it (issue #53 AC4)", () => {
  it("reads voice/ideas_per_run from the Format file, not brand-profile.yaml", async () => {
    const doc = await readDoc(".claude", "agents", "idea-strategist.md");
    assert.match(doc, /formats\/<format>\.yaml/);
    assert.match(doc, /Voice comes from the Format, not the Brand/i);
  });

  it("tags every brief and ledger record with the Format", async () => {
    const doc = await readDoc(".claude", "agents", "idea-strategist.md");
    assert.match(doc, /Tag every Idea with its Format/i);
    assert.match(doc, /format:\s*<format>/, "brief front-matter must carry format: <format>");
    assert.match(doc, /never\s+omit it/i);
  });

  it("writes briefs to the Format-namespaced Ideas directory", async () => {
    const doc = await readDoc(".claude", "agents", "idea-strategist.md");
    assert.match(doc, /ideas\/<format>\/<run>\/idea-NN\.md/);
  });

  it("retires the media-sense of 'Format' from the brief body (issue #53 AC2)", async () => {
    const doc = await readDoc(".claude", "agents", "idea-strategist.md");
    assert.match(doc, /Suggested Recipe/);
    assert.match(doc, /never.*"Format:"|"Format:".*never/is, "must forbid the media-sense 'Format:' brief heading");
  });

  it("always writes brief_path verbatim on every ledger record (QA Round 1 D1 fix)", async () => {
    const doc = await readDoc(".claude", "agents", "idea-strategist.md");
    assert.match(doc, /Always write `brief_path`/i);
    assert.match(doc, /brief_path.*VERBATIM/is, "brief_path must be the exact path just written, not reconstructed");
  });
});

describe("/review-ideas resolves a suggested Idea's Brief via resolveBriefPathCandidates, trusting brief_path (QA Round 1 D1)", () => {
  it("delegates to the shared resolver instead of hand-building the path from format/run", async () => {
    const doc = await readDoc(".claude", "commands", "review-ideas.md");
    assert.match(doc, /resolveBriefPathCandidates/);
    assert.match(doc, /src\/format\/brief-path\.ts/);
    assert.match(doc, /do \*\*not\*\* hand-build the path/i);
  });

  it("trusts a recorded brief_path exclusively before falling back to any reconstructed candidate", async () => {
    const doc = await readDoc(".claude", "commands", "review-ideas.md");
    assert.match(doc, /trusted\s+\*\*exclusively\*\*/i);
    assert.match(doc, /try that path first/i);
  });

  it("documents the Format-namespaced-then-legacy fallback order for records with no brief_path", async () => {
    const doc = await readDoc(".claude", "commands", "review-ideas.md");
    assert.match(doc, /brands\/<slug>\/ideas\/<Idea\.format>\/<run>\/idea-NN\.md/);
    assert.match(doc, /legacy Brand-level path/i);
  });
});
