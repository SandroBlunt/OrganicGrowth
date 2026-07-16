/**
 * Prompt/doc-conformance tests for the Instagram + YouTube Apify wiring (issue #48).
 *
 * `trend-scout` and `performance-tracker` are prompt-driven agents (`.claude/agents/*.md`) — there is
 * no compiled TS runtime for their live scraping behavior to unit-test directly. These assertions pin
 * the SOURCE TEXT of those prompts (and the seeds/brand-profile templates) so the multi-platform
 * requirements this slice adds are provable by `npm test`, not just by hand-reading the docs. Mirrors
 * the existing `src/format/format-docs.test.ts` convention (issue #53).
 *
 * A REGULAR `.test.ts`, not `*.docs-test.ts`: the underlying behavior these prompts describe (platform
 * detected per source/post URL, the verified Instagram/YouTube actors, defensive field mapping,
 * shares-unavailable handling) is a core acceptance criterion of this slice, not incidental doc
 * conformance.
 *
 * No Magnific Space involved — plain markdown/YAML file reads.
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

// ---------------------------------------------------------------------------
// trend-scout.md
// ---------------------------------------------------------------------------

describe("trend-scout detects a source's platform per-URL and uses the matching Apify actor (issue #48)", () => {
  it("states peer sources can span Facebook, Instagram, and YouTube", async () => {
    const doc = await readDoc(".claude", "agents", "trend-scout.md");
    assert.match(doc, /Facebook,\s*Instagram,\s*or YouTube/i);
  });

  it("documents detecting each source's platform from its own URL, never assuming the Format's/Channel's", async () => {
    const doc = await readDoc(".claude", "agents", "trend-scout.md");
    assert.match(doc, /detect(?:s|ed|ing)? .*platform from the URL/i);
    assert.match(doc, /[Nn]ever assume the Format's or (?:the )?Channel's own platform/);
  });

  it("names the verified Instagram and YouTube actor slugs", async () => {
    const doc = await readDoc(".claude", "agents", "trend-scout.md");
    assert.match(doc, /apify\/instagram-scraper/);
    assert.match(doc, /streamers\/youtube-scraper/);
  });

  it("documents the defensive field mapping and that shares is always 0 for Instagram and YouTube", async () => {
    const doc = await readDoc(".claude", "agents", "trend-scout.md");
    assert.match(doc, /videoPlayCount/);
    assert.match(doc, /viewCount/);
    assert.match(doc, /Instagram does not publicly\s+expose a share count/);
    assert.match(doc, /YouTube does not publicly\s+expose a share count/);
  });

  it("references the canonical normalize-metrics module", async () => {
    const doc = await readDoc(".claude", "agents", "trend-scout.md");
    assert.match(doc, /src\/apify\/normalize-metrics\.ts/);
  });

  it("still requires skipping (never fabricating) a page on a not-yet-wired platform", async () => {
    const doc = await readDoc(".claude", "agents", "trend-scout.md");
    assert.match(doc, /not-yet-scrapable/i);
  });
});

// ---------------------------------------------------------------------------
// performance-tracker.md
// ---------------------------------------------------------------------------

describe("performance-tracker detects a post's platform per-URL and uses the matching Apify actor (issue #48)", () => {
  it("states it scrapes posts on Facebook, Instagram, or YouTube", async () => {
    const doc = await readDoc(".claude", "agents", "performance-tracker.md");
    assert.match(doc, /Facebook,\s*Instagram,\s*or YouTube/i);
  });

  it("documents detecting the platform from post_url, never from the Brand's Channel platform", async () => {
    const doc = await readDoc(".claude", "agents", "performance-tracker.md");
    assert.match(doc, /detect(?:s|ed|ing)? the post's platform from `post_url`/i);
    assert.match(doc, /never\*\*\s*assumed from\s*\n?\s*the Brand's Channel platform|never.*assumed from.*Brand's Channel platform/is);
  });

  it("names the verified Instagram and YouTube actor slugs", async () => {
    const doc = await readDoc(".claude", "agents", "performance-tracker.md");
    assert.match(doc, /apify\/instagram-post-scraper/);
    assert.match(doc, /streamers\/youtube-scraper/);
  });

  it("documents the Instagram post-scraper's oddly-named 'username' input field", async () => {
    const doc = await readDoc(".claude", "agents", "performance-tracker.md");
    assert.match(doc, /"username":\[/);
  });

  it("documents shares is always 0 for Instagram and YouTube posts", async () => {
    const doc = await readDoc(".claude", "agents", "performance-tracker.md");
    assert.match(doc, /Instagram does not publicly\s+expose a share count/);
    assert.match(doc, /YouTube does not publicly\s+expose a share count/);
  });

  it("references the canonical normalize-metrics module", async () => {
    const doc = await readDoc(".claude", "agents", "performance-tracker.md");
    assert.match(doc, /src\/apify\/normalize-metrics\.ts/);
  });

  it("still requires skipping (never fabricating) a post on a not-yet-wired platform", async () => {
    const doc = await readDoc(".claude", "agents", "performance-tracker.md");
    assert.match(doc, /not-yet-trackable/i);
  });
});

// ---------------------------------------------------------------------------
// templates/brand-skeleton/seeds.yaml — documents the new actor slugs like Facebook's (AC6)
// ---------------------------------------------------------------------------

describe("templates/brand-skeleton/seeds.yaml documents Instagram + YouTube actors like Facebook's (issue #48 AC6)", () => {
  it("has an uncommented apify.instagram block with the verified actor pair", async () => {
    const doc = await readDoc("templates", "brand-skeleton", "seeds.yaml");
    assert.match(doc, /^\s*instagram:\s*$/m, "apify.instagram must be an active (uncommented) key");
    assert.match(doc, /apify\/instagram-scraper/);
    assert.match(doc, /apify\/instagram-post-scraper/);
  });

  it("has an uncommented apify.youtube block with the verified actor pair", async () => {
    const doc = await readDoc("templates", "brand-skeleton", "seeds.yaml");
    assert.match(doc, /^\s*youtube:\s*$/m, "apify.youtube must be an active (uncommented) key");
    assert.match(doc, /streamers\/youtube-scraper/);
  });

  it("still leaves linkedin as a commented-out roadmap placeholder (not fabricated)", async () => {
    const doc = await readDoc("templates", "brand-skeleton", "seeds.yaml");
    assert.match(doc, /#\s*linkedin:/);
  });
});

// ---------------------------------------------------------------------------
// templates/brand-skeleton/brand-profile.yaml — youtube is an accepted platform value (AC2)
// ---------------------------------------------------------------------------

describe("templates/brand-skeleton/brand-profile.yaml documents youtube as an accepted platform value (issue #48 AC2)", () => {
  it("lists youtube alongside facebook | instagram | linkedin", async () => {
    const doc = await readDoc("templates", "brand-skeleton", "brand-profile.yaml");
    assert.match(doc, /facebook \| instagram \| linkedin \| youtube/);
  });
});
