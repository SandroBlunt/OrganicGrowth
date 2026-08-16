import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Documentation-conformance suite for `/track-performance` (issue #84). Proves the slash-command doc
 * and the `performance-tracker` agent doc both describe the REAL per-Asset grain — not the pre-ADR-0011
 * per-Idea shape the prose predated — and are honest about what is/isn't code-backed today.
 *
 * Kept OUT of the unit suite (the `npm test` glob is "src/**\/*.test.ts", which does NOT match
 * "*.docs-test.ts"). Run with `npm run test:docs`. Editing a doc must never break `npm test`.
 */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const TRACK_PERFORMANCE_CMD = join(REPO_ROOT, ".claude", "commands", "track-performance.md");
const PERFORMANCE_TRACKER_AGENT = join(REPO_ROOT, ".claude", "agents", "performance-tracker.md");

describe("track-performance.md — describes the code-backed per-Asset grain (issue #84)", () => {
  it("exists and documents <brand> as required", async () => {
    const doc = await readFile(TRACK_PERFORMANCE_CMD, "utf8");
    assert.match(doc, /<brand>/);
  });

  it("names the real orchestration shell and pure deep modules, not just prose", async () => {
    const doc = await readFile(TRACK_PERFORMANCE_CMD, "utf8");
    assert.match(doc, /src\/commands\/track-performance\.ts/);
    assert.match(doc, /trackPerformanceCommand/);
    assert.match(doc, /src\/performance\/selection\.ts/);
    assert.match(doc, /src\/performance\/score\.ts/);
    assert.match(doc, /src\/performance\/maturity\.ts/);
  });

  it("documents one selection PER (Idea, Recipe) Asset, never per Idea", async () => {
    const doc = await readFile(TRACK_PERFORMANCE_CMD, "utf8");
    assert.match(doc, /one selection PER \(Idea, Recipe\)/);
  });

  it("documents the per-Asset write via AssetStore.writeAsset, leaving sibling Recipes' Assets untouched", async () => {
    const doc = await readFile(TRACK_PERFORMANCE_CMD, "utf8");
    assert.match(doc, /AssetStore\.writeAsset/);
    assert.match(doc, /untouched/i);
  });

  it("is honest that the hermetic test suite fakes Apify and the live scrape is deferred", async () => {
    const doc = await readFile(TRACK_PERFORMANCE_CMD, "utf8");
    assert.match(doc, /FAKE `PerformanceScrapePort`/);
    assert.match(doc, /never live Apify/i);
    assert.match(doc, /deferred/i);
  });

  it("never fabricates: documents that an unresolvable Asset is skipped and reported, not guessed", async () => {
    const doc = await readFile(TRACK_PERFORMANCE_CMD, "utf8");
    assert.match(doc, /Never fabricates/i);
    assert.match(doc, /SKIPPED/);
  });
});

describe("performance-tracker.md — attributes results to the (Idea, Recipe) Asset, not a flat Idea (issue #84)", () => {
  it("exists and declares model sonnet in the front-matter", async () => {
    const doc = await readFile(PERFORMANCE_TRACKER_AGENT, "utf8");
    assert.match(doc, /^model:\s*sonnet\s*$/m);
    assert.match(doc, /^name:\s*performance-tracker\s*$/m);
  });

  it("attributes a result to the (Idea, Recipe) Asset — the retired flat per-Idea attribution is gone", async () => {
    const doc = await readFile(PERFORMANCE_TRACKER_AGENT, "utf8");
    assert.match(doc, /\(Idea, Recipe\) Asset/);
    assert.doesNotMatch(
      doc,
      /attribute the result to the \*\*Idea\*\* that seeded them(?!.*\(Idea, Recipe\))/s,
      "must not claim attribution lands on a flat Idea rather than its (Idea, Recipe) Asset",
    );
  });

  it("states an Idea with two posted Assets scores independently, never collapsed", async () => {
    const doc = await readFile(PERFORMANCE_TRACKER_AGENT, "utf8");
    assert.match(doc, /SEVERAL posted Assets/);
    assert.match(doc, /never[\s\n]+collapsing/i);
  });

  it("references the code-backed canonical modules from issue #84", async () => {
    const doc = await readFile(PERFORMANCE_TRACKER_AGENT, "utf8");
    assert.match(doc, /src\/commands\/track-performance\.ts/);
    assert.match(doc, /src\/performance\/selection\.ts/);
  });

  it("documents Facebook's own share count as never forced to 0 (unlike Instagram/YouTube)", async () => {
    const doc = await readFile(PERFORMANCE_TRACKER_AGENT, "utf8");
    assert.match(doc, /Facebook DOES publicly expose a share count/);
  });

  it("documents the per-Asset write is keyed (Idea, Recipe) and leaves sibling Recipes untouched", async () => {
    const doc = await readFile(PERFORMANCE_TRACKER_AGENT, "utf8");
    assert.match(doc, /AssetStore\.writeAsset/);
    assert.match(doc, /sibling Asset for a DIFFERENT Recipe/);
  });

  it("still never claims to publish — it only measures (generate-never-publish stays intact)", async () => {
    const doc = await readFile(PERFORMANCE_TRACKER_AGENT, "utf8");
    assert.doesNotMatch(doc, /\bpublish(es|ing)?\b/i);
  });
});
