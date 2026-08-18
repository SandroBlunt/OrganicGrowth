import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfiguredActorSlug } from "./actor-config.ts";

/** Create a temp `seeds.yaml` with the given raw text content, run `fn` against its path, then clean up. */
async function withSeedsFile(content: string | undefined, fn: (seedsPath: string) => Promise<void>): Promise<void> {
  const tmpRoot = await mkdtemp(join(tmpdir(), "og-actor-config-"));
  const seedsPath = join(tmpRoot, "seeds.yaml");
  try {
    if (content !== undefined) await writeFile(seedsPath, content, "utf8");
    await fn(seedsPath);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

describe("loadConfiguredActorSlug — reads one apify.<platform>.<purpose> slug straight from seeds.yaml (issue #253)", () => {
  it("resolves a configured actor slug", async () => {
    const yaml = [
      "apify:",
      "  facebook:",
      "    trends_actor: apify/facebook-posts-scraper",
      "    post_actor: apify/facebook-posts-scraper",
    ].join("\n");
    await withSeedsFile(yaml, async (seedsPath) => {
      const slug = await loadConfiguredActorSlug(seedsPath, "facebook", "post_actor");
      assert.equal(slug, "apify/facebook-posts-scraper");
    });
  });

  it("returns null for a missing seeds.yaml — never throws", async () => {
    await withSeedsFile(undefined, async (seedsPath) => {
      const slug = await loadConfiguredActorSlug(seedsPath, "facebook", "post_actor");
      assert.equal(slug, null);
    });
  });

  it("returns null for unparseable YAML — never throws", async () => {
    await withSeedsFile("apify: [this is not: valid: yaml", async (seedsPath) => {
      const slug = await loadConfiguredActorSlug(seedsPath, "facebook", "post_actor");
      assert.equal(slug, null);
    });
  });

  it("returns null when the platform has no configured block", async () => {
    await withSeedsFile("apify:\n  instagram:\n    post_actor: apify/instagram-post-scraper\n", async (seedsPath) => {
      const slug = await loadConfiguredActorSlug(seedsPath, "facebook", "post_actor");
      assert.equal(slug, null);
    });
  });

  it("returns null for the '...' not-yet-wired placeholder — never fabricates", async () => {
    await withSeedsFile("apify:\n  linkedin:\n    post_actor: \"...\"\n", async (seedsPath) => {
      const slug = await loadConfiguredActorSlug(seedsPath, "linkedin", "post_actor");
      assert.equal(slug, null);
    });
  });

  it("returns null when the seeds.yaml has no apify block at all", async () => {
    await withSeedsFile("seed_pages:\n  - https://example.com\n", async (seedsPath) => {
      const slug = await loadConfiguredActorSlug(seedsPath, "facebook", "post_actor");
      assert.equal(slug, null);
    });
  });
});
