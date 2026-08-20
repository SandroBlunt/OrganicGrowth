/**
 * Tests for `planImport` (`src/importer/plan.ts`) — issue #204.
 *
 * Two kinds of coverage:
 *  1. A hand-built "mini repo" (a temp directory matching `data/brands/<slug>/...` + `data/queue.json`,
 *     mkdtemp'd fresh per test — mirrors this codebase's own established fixture convention,
 *     `src/ledger/ledger.test.ts`'s `withLedger`) exercising the full pipeline end-to-end plus every
 *     refusal path this ticket names, fast and deterministic.
 *  2. A structural smoke test against the REAL `data/brands/mundotip` and `data/brands/straw-motion`
 *     (read-only — never written to), proving the planner actually succeeds against the genuine data
 *     this ticket exists to import, mirroring `src/ledger/migrate-assets.test.ts`'s own
 *     "round-trip against the REAL ledgers" pattern. Media-existence-dependent counts (dead paths) are
 *     NOT asserted there — this worktree, like CI, does not carry the 813 MB of untracked produced
 *     media, so which paths report "dead" is environment-dependent; the counts that come from tracked
 *     JSON (`ledger.json`/`queue.json` themselves) are asserted instead.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { planImport } from "./plan.ts";

const LEGACY_PREFIX = "/Users/CaxtonTaylor/Developer/OrganicGrowth";

// ---------------------------------------------------------------------------
// Mini-repo builder
// ---------------------------------------------------------------------------

interface MiniRepoFile {
  readonly path: string; // relative to the repo root, e.g. "data/brands/acme/ledger.json"
  readonly content: string;
}

async function withMiniRepo(files: readonly MiniRepoFile[], fn: (checkoutRoot: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "og-importer-plan-"));
  try {
    for (const file of files) {
      const full = join(root, file.path);
      await mkdir(join(full, ".."), { recursive: true });
      await writeFile(full, file.content, "utf8");
    }
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

const MINIMAL_BRAND_PROFILE = "niche: test\nlanguage: en\n";
const MINIMAL_FORMAT = "name: \"News\"\nvoice: \"plain\"\ncadence: weekly\n";

// ---------------------------------------------------------------------------
// Happy path: one Brand, one Format, one Run, one Trend, one accepted Idea with
// one Asset (real media file + spec.json), plus a dead media path and a
// duplicate job pair — both report-only, neither blocks success.
// ---------------------------------------------------------------------------

describe("planImport — happy path: full round trip plus both report-only categories", () => {
  it("succeeds, and surfaces dead media paths + duplicate job keys without blocking", async () => {
    const files: MiniRepoFile[] = [
      { path: "data/brands/acme/brand-profile.yaml", content: MINIMAL_BRAND_PROFILE },
      { path: "data/brands/acme/formats/news.yaml", content: MINIMAL_FORMAT },
      {
        path: "data/brands/acme/ledger.json",
        content: json({
          ideas: [
            {
              id: "idea-01",
              run: "2026-W01",
              title: "A real story",
              format: "news",
              trend_id: "trend-01",
              trend_label: "Something happened",
              fit_score: 0.8,
              status: "accepted",
              recipes: ["news-carousel"],
              declined_recipes: [],
              created_at: "2026-01-01T00:00:00Z",
              assets: [
                {
                  recipe: "news-carousel",
                  status: "produced",
                  spec_path: "data/brands/acme/ideas/news/2026-W01/idea-01.news-carousel.spec.json",
                  produced_at: "2026-01-02T00:00:00Z",
                  asset_paths: [
                    "data/brands/acme/ideas/news/2026-W01/idea-01.news-carousel.assets/0-hook.png",
                    // A dead reference — never written to disk (report-only, never blocks).
                    "data/brands/acme/ideas/news/2026-W01/idea-01.news-carousel.assets/1-missing.png",
                  ],
                },
              ],
            },
          ],
        }),
      },
      {
        path: "data/brands/acme/ideas/news/2026-W01/idea-01.md",
        content: "# A real story\n\n## Source(s)\n- https://example.com/a\n",
      },
      {
        path: "data/brands/acme/ideas/news/2026-W01/idea-01.news-carousel.spec.json",
        content: json({ slides: 7 }),
      },
      { path: "data/brands/acme/ideas/news/2026-W01/idea-01.news-carousel.assets/0-hook.png", content: "fake-png-bytes" },
      {
        path: "data/queue.json",
        content: json({
          jobs: [
            { idea_id: "idea-01", brand: "acme", recipe: "news-carousel", gate: null, status: "done", enqueued_at: "2026-01-02T00:00:00Z" },
            // A genuine duplicate identity key — report-only, never blocks (AC5).
            { idea_id: "idea-01", brand: "acme", recipe: "news-carousel", gate: null, status: "done", enqueued_at: "2026-01-03T00:00:00Z" },
          ],
        }),
      },
    ];

    await withMiniRepo(files, async (checkoutRoot) => {
      const result = await planImport({ brandSlugs: ["acme"], legacyAbsolutePrefix: LEGACY_PREFIX, checkoutRoot });
      assert.equal(result.ok, true, result.ok ? "" : JSON.stringify((result as { problems: readonly string[] }).problems));
      if (!result.ok) return;

      const { plan } = result;
      assert.equal(plan.brands.length, 1);
      const brand = plan.brands[0]!;
      assert.equal(brand.slug, "acme");
      assert.equal(brand.formats.length, 1);
      const format = brand.formats[0]!;
      assert.equal(format.slug, "news");
      assert.equal(format.runs.length, 1);
      const run = format.runs[0]!;
      assert.equal(run.runKey, "2026-W01");
      assert.equal(run.trends.length, 1);
      assert.equal(run.trends[0]!.legacyId, "trend-01");
      assert.equal(run.trends[0]!.label, "Something happened");
      assert.equal(run.ideas.length, 1);
      const idea = run.ideas[0]!;
      assert.equal(idea.status, "accepted");
      assert.deepEqual(idea.sourceUrls, ["https://example.com/a"]);
      assert.deepEqual(idea.recipeSelections, [{ recipe: "news-carousel", chosen: true }]);
      assert.equal(idea.assets.length, 1);
      const asset = idea.assets[0]!;
      assert.equal(asset.media.length, 1);
      assert.equal(asset.media[0]!.storageKey, "data/brands/acme/ideas/news/2026-W01/idea-01.news-carousel.assets/0-hook.png");
      assert.ok(!asset.media[0]!.storageKey.startsWith("/"));
      assert.deepEqual(asset.spec, { slides: 7 });

      // Report-only categories, never blocking.
      assert.equal(plan.deadMediaPaths.length, 1);
      assert.equal(plan.deadMediaPaths[0]!.storageKey, "data/brands/acme/ideas/news/2026-W01/idea-01.news-carousel.assets/1-missing.png");
      assert.equal(plan.duplicateJobKeys.length, 1);
      assert.equal(plan.duplicateJobKeys[0]!.jobs.length, 2);
      assert.equal(plan.jobs.length, 2);
    });
  });
});

// ---------------------------------------------------------------------------
// Channel + Post resolution (issue #240)
// ---------------------------------------------------------------------------

describe("planImport — a Brand's Channel list is planned, and an Asset's post_url resolves against it", () => {
  it("plans the Brand's Channel list and resolves a facebook post_url against it", async () => {
    const files: MiniRepoFile[] = [
      {
        path: "data/brands/acme/brand-profile.yaml",
        content: "niche: test\nchannel:\n  - platform: facebook\n    url: https://www.facebook.com/acme\n    primary: true\n  - platform: instagram\n    url: \"\"\n",
      },
      { path: "data/brands/acme/formats/news.yaml", content: MINIMAL_FORMAT },
      {
        path: "data/brands/acme/ledger.json",
        content: json({
          ideas: [
            {
              id: "idea-01",
              run: "2026-W01",
              format: "news",
              status: "accepted",
              recipes: ["news-carousel"],
              assets: [
                {
                  recipe: "news-carousel",
                  status: "posted",
                  post_url: "https://www.facebook.com/permalink/1",
                  posted_at: "2026-01-02T00:00:00Z",
                },
              ],
            },
          ],
        }),
      },
      { path: "data/brands/acme/ideas/news/2026-W01/idea-01.md", content: "# hi\n" },
      { path: "data/queue.json", content: json({ jobs: [] }) },
    ];
    await withMiniRepo(files, async (checkoutRoot) => {
      const result = await planImport({ brandSlugs: ["acme"], legacyAbsolutePrefix: LEGACY_PREFIX, checkoutRoot });
      assert.equal(result.ok, true, result.ok ? "" : JSON.stringify((result as { problems: readonly string[] }).problems));
      if (!result.ok) return;
      const brand = result.plan.brands[0]!;
      assert.deepEqual(
        [...brand.channels].sort((a, b) => a.platform.localeCompare(b.platform)),
        [
          { platform: "facebook", url: "https://www.facebook.com/acme", isPrimary: true },
          { platform: "instagram", url: "", isPrimary: false },
        ],
      );
      const asset = brand.formats[0]!.runs[0]!.ideas[0]!.assets[0]!;
      assert.equal(asset.postUrl, "https://www.facebook.com/permalink/1");
      assert.equal(asset.postedAt, "2026-01-02T00:00:00Z");
      assert.equal(asset.postPlatform, "facebook");
    });
  });

  it("a Brand with no configured channel list still plans successfully (channels: [])", async () => {
    const files: MiniRepoFile[] = [
      { path: "data/brands/acme/brand-profile.yaml", content: MINIMAL_BRAND_PROFILE },
      { path: "data/brands/acme/formats/news.yaml", content: MINIMAL_FORMAT },
      { path: "data/brands/acme/ledger.json", content: json({ ideas: [] }) },
      { path: "data/queue.json", content: json({ jobs: [] }) },
    ];
    await withMiniRepo(files, async (checkoutRoot) => {
      const result = await planImport({ brandSlugs: ["acme"], legacyAbsolutePrefix: LEGACY_PREFIX, checkoutRoot });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.deepEqual(result.plan.brands[0]!.channels, []);
    });
  });

  it("refuses a Channel entry whose platform is outside KNOWN_PLATFORMS", async () => {
    const files: MiniRepoFile[] = [
      { path: "data/brands/acme/brand-profile.yaml", content: "niche: test\nchannel:\n  - platform: myspace\n    url: \"\"\n" },
      { path: "data/brands/acme/formats/news.yaml", content: MINIMAL_FORMAT },
      { path: "data/brands/acme/ledger.json", content: json({ ideas: [] }) },
      { path: "data/queue.json", content: json({ jobs: [] }) },
    ];
    await withMiniRepo(files, async (checkoutRoot) => {
      const result = await planImport({ brandSlugs: ["acme"], legacyAbsolutePrefix: LEGACY_PREFIX, checkoutRoot });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.ok(result.problems.some((p) => p.includes("myspace")));
    });
  });

  it("refuses a post_url resolving to a platform this Brand has no configured Channel for", async () => {
    const files: MiniRepoFile[] = [
      { path: "data/brands/acme/brand-profile.yaml", content: "niche: test\nchannel:\n  - platform: facebook\n    url: \"\"\n    primary: true\n" },
      { path: "data/brands/acme/formats/news.yaml", content: MINIMAL_FORMAT },
      {
        path: "data/brands/acme/ledger.json",
        content: json({
          ideas: [
            {
              id: "idea-01",
              run: "2026-W01",
              format: "news",
              status: "accepted",
              recipes: ["news-carousel"],
              assets: [
                { recipe: "news-carousel", status: "posted", post_url: "https://www.instagram.com/p/abc123/", posted_at: "2026-01-02T00:00:00Z" },
              ],
            },
          ],
        }),
      },
      { path: "data/brands/acme/ideas/news/2026-W01/idea-01.md", content: "# hi\n" },
      { path: "data/queue.json", content: json({ jobs: [] }) },
    ];
    await withMiniRepo(files, async (checkoutRoot) => {
      const result = await planImport({ brandSlugs: ["acme"], legacyAbsolutePrefix: LEGACY_PREFIX, checkoutRoot });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.ok(result.problems.some((p) => p.includes("instagram") && p.includes("no configured Channel")));
    });
  });
});

// ---------------------------------------------------------------------------
// TWO Channels on the SAME platform — issue #243's own case
// ---------------------------------------------------------------------------

describe("planImport — a Brand with TWO Channels on the same platform resolves each Post specifically, or refuses", () => {
  function twoFacebookChannelFiles(postUrl: string): MiniRepoFile[] {
    return [
      {
        path: "data/brands/acme/brand-profile.yaml",
        content:
          "niche: test\n" +
          "channel:\n" +
          "  - platform: facebook\n" +
          "    url: https://www.facebook.com/profile.php?id=61591885769033\n" +
          "    primary: true\n" +
          "  - platform: facebook\n" +
          '    url: "https://www.facebook.com/profile.php?id=99999999999999"\n',
      },
      { path: "data/brands/acme/formats/news.yaml", content: MINIMAL_FORMAT },
      {
        path: "data/brands/acme/ledger.json",
        content: json({
          ideas: [
            {
              id: "idea-01",
              run: "2026-W01",
              format: "news",
              status: "accepted",
              recipes: ["news-carousel"],
              assets: [{ recipe: "news-carousel", status: "posted", post_url: postUrl, posted_at: "2026-01-02T00:00:00Z" }],
            },
          ],
        }),
      },
      { path: "data/brands/acme/ideas/news/2026-W01/idea-01.md", content: "# hi\n" },
      { path: "data/queue.json", content: json({ jobs: [] }) },
    ];
  }

  it("resolves to the SECOND Channel when the post_url's identifier matches only that one — never the first by default", async () => {
    const files = twoFacebookChannelFiles("https://www.facebook.com/permalink.php?story_fbid=abc&id=99999999999999");
    await withMiniRepo(files, async (checkoutRoot) => {
      const result = await planImport({ brandSlugs: ["acme"], legacyAbsolutePrefix: LEGACY_PREFIX, checkoutRoot });
      assert.equal(result.ok, true, result.ok ? "" : JSON.stringify((result as { problems: readonly string[] }).problems));
      if (!result.ok) return;
      const brand = result.plan.brands[0]!;
      assert.equal(brand.channels.length, 2);
      const asset = brand.formats[0]!.runs[0]!.ideas[0]!.assets[0]!;
      assert.equal(asset.postChannelIndex, 1);
    });
  });

  it("resolves to the FIRST Channel when the post_url's identifier matches that one instead", async () => {
    const files = twoFacebookChannelFiles("https://www.facebook.com/permalink.php?story_fbid=abc&id=61591885769033");
    await withMiniRepo(files, async (checkoutRoot) => {
      const result = await planImport({ brandSlugs: ["acme"], legacyAbsolutePrefix: LEGACY_PREFIX, checkoutRoot });
      assert.equal(result.ok, true, result.ok ? "" : JSON.stringify((result as { problems: readonly string[] }).problems));
      if (!result.ok) return;
      const asset = result.plan.brands[0]!.formats[0]!.runs[0]!.ideas[0]!.assets[0]!;
      assert.equal(asset.postChannelIndex, 0);
    });
  });

  it("reports (never blocks the plan) — never silently collapses to whichever Channel was created last — when the post_url's identifier matches NEITHER configured Channel (issue #243 round 2, QA round 1's Defect 1)", async () => {
    const files = twoFacebookChannelFiles("https://www.facebook.com/permalink.php?story_fbid=abc&id=11111111111111");
    await withMiniRepo(files, async (checkoutRoot) => {
      const result = await planImport({ brandSlugs: ["acme"], legacyAbsolutePrefix: LEGACY_PREFIX, checkoutRoot });
      // NOT a refusal: the plan still succeeds — one unresolvable Post must never abort the whole import.
      assert.equal(result.ok, true, result.ok ? "" : JSON.stringify((result as { problems: readonly string[] }).problems));
      if (!result.ok) return;
      const asset = result.plan.brands[0]!.formats[0]!.runs[0]!.ideas[0]!.assets[0]!;
      assert.equal(asset.postUrl, undefined);
      assert.equal(asset.postChannelIndex, undefined);
      assert.equal(result.plan.unresolvedPosts.length, 1);
      const unresolved = result.plan.unresolvedPosts[0]!;
      assert.equal(unresolved.brand, "acme");
      assert.equal(unresolved.ideaLegacyId, "idea-01");
      assert.match(unresolved.reason, /matches none/);
    });
  });

  it("reports (never blocks the plan) — never defaults to hostname-only resolution — when the post_url carries no extractable identifier at all", async () => {
    const files = twoFacebookChannelFiles("https://www.facebook.com/watch/?v=123");
    await withMiniRepo(files, async (checkoutRoot) => {
      const result = await planImport({ brandSlugs: ["acme"], legacyAbsolutePrefix: LEGACY_PREFIX, checkoutRoot });
      assert.equal(result.ok, true, result.ok ? "" : JSON.stringify((result as { problems: readonly string[] }).problems));
      if (!result.ok) return;
      assert.equal(result.plan.unresolvedPosts.length, 1);
      assert.match(result.plan.unresolvedPosts[0]!.reason, /cannot disambiguate/);
    });
  });

  it("an unresolved Post on one Idea does not block a SECOND, otherwise-resolvable Idea in the same Brand", async () => {
    const files: MiniRepoFile[] = [
      {
        path: "data/brands/acme/brand-profile.yaml",
        content:
          "niche: test\n" +
          "channel:\n" +
          "  - platform: facebook\n" +
          "    url: https://www.facebook.com/profile.php?id=61591885769033\n" +
          "    primary: true\n" +
          "  - platform: facebook\n" +
          '    url: "https://www.facebook.com/profile.php?id=99999999999999"\n',
      },
      { path: "data/brands/acme/formats/news.yaml", content: MINIMAL_FORMAT },
      {
        path: "data/brands/acme/ledger.json",
        content: json({
          ideas: [
            {
              id: "idea-01",
              run: "2026-W01",
              format: "news",
              status: "accepted",
              recipes: ["news-carousel"],
              // Matches NEITHER configured Channel — unresolvable.
              assets: [{ recipe: "news-carousel", status: "posted", post_url: "https://www.facebook.com/permalink.php?story_fbid=abc&id=11111111111111", posted_at: "2026-01-02T00:00:00Z" }],
            },
            {
              id: "idea-02",
              run: "2026-W01",
              format: "news",
              status: "accepted",
              recipes: ["news-carousel"],
              // Matches the FIRST configured Channel — resolves cleanly.
              assets: [{ recipe: "news-carousel", status: "posted", post_url: "https://www.facebook.com/permalink.php?story_fbid=xyz&id=61591885769033", posted_at: "2026-01-03T00:00:00Z" }],
            },
          ],
        }),
      },
      { path: "data/brands/acme/ideas/news/2026-W01/idea-01.md", content: "# hi\n" },
      { path: "data/brands/acme/ideas/news/2026-W01/idea-02.md", content: "# hi again\n" },
      { path: "data/queue.json", content: json({ jobs: [] }) },
    ];
    await withMiniRepo(files, async (checkoutRoot) => {
      const result = await planImport({ brandSlugs: ["acme"], legacyAbsolutePrefix: LEGACY_PREFIX, checkoutRoot });
      assert.equal(result.ok, true, result.ok ? "" : JSON.stringify((result as { problems: readonly string[] }).problems));
      if (!result.ok) return;
      const ideas = result.plan.brands[0]!.formats[0]!.runs[0]!.ideas;
      assert.equal(ideas.length, 2, "BOTH Ideas still import — the unresolved Post never dropped its own Idea");
      const idea01 = ideas.find((i) => i.legacyId === "idea-01")!;
      const idea02 = ideas.find((i) => i.legacyId === "idea-02")!;
      assert.equal(idea01.assets[0]!.postUrl, undefined);
      assert.equal(idea02.assets[0]!.postChannelIndex, 0, "the resolvable Post still resolves normally");
      assert.equal(result.plan.unresolvedPosts.length, 1);
      assert.equal(result.plan.unresolvedPosts[0]!.ideaLegacyId, "idea-01");
    });
  });

  it("resolves via a Channel's alternate_urls — the Operator's configurable recovery route, without editing ledger data (issue #243 round 2, QA round 1's Defect 1)", async () => {
    const files: MiniRepoFile[] = [
      {
        path: "data/brands/acme/brand-profile.yaml",
        content:
          "niche: test\n" +
          "channel:\n" +
          "  - platform: facebook\n" +
          "    url: https://www.facebook.com/profile.php?id=61591885769033\n" +
          "    primary: true\n" +
          "    alternate_urls:\n" +
          "      - https://www.facebook.com/122096865609396192\n" +
          "  - platform: facebook\n" +
          '    url: "https://www.facebook.com/profile.php?id=88888888888888"\n',
      },
      { path: "data/brands/acme/formats/news.yaml", content: MINIMAL_FORMAT },
      {
        path: "data/brands/acme/ledger.json",
        content: json({
          ideas: [
            {
              id: "idea-10",
              run: "2026-W01",
              format: "news",
              status: "accepted",
              recipes: ["news-carousel"],
              // The real idea-2026-W32-10 shape — a different Facebook id than the first Channel's own
              // configured url, resolvable ONLY because its alternate_urls names it.
              assets: [
                {
                  recipe: "news-carousel",
                  status: "posted",
                  post_url: "https://www.facebook.com/122096865609396192/posts/122114019723396192",
                  posted_at: "2026-01-02T00:00:00Z",
                },
              ],
            },
          ],
        }),
      },
      { path: "data/brands/acme/ideas/news/2026-W01/idea-10.md", content: "# hi\n" },
      { path: "data/queue.json", content: json({ jobs: [] }) },
    ];
    await withMiniRepo(files, async (checkoutRoot) => {
      const result = await planImport({ brandSlugs: ["acme"], legacyAbsolutePrefix: LEGACY_PREFIX, checkoutRoot });
      assert.equal(result.ok, true, result.ok ? "" : JSON.stringify((result as { problems: readonly string[] }).problems));
      if (!result.ok) return;
      assert.equal(result.plan.unresolvedPosts.length, 0);
      const asset = result.plan.brands[0]!.formats[0]!.runs[0]!.ideas[0]!.assets[0]!;
      assert.equal(asset.postChannelIndex, 0);
      assert.equal(asset.postUrl, "https://www.facebook.com/122096865609396192/posts/122114019723396192");
    });
  });
});

// ---------------------------------------------------------------------------
// Refusal paths
// ---------------------------------------------------------------------------

describe("planImport — refuses (never partially writes) on every named problem category", () => {
  it("refuses when an Idea has no format and its Brand has more than one Format (ambiguous)", async () => {
    const files: MiniRepoFile[] = [
      { path: "data/brands/acme/brand-profile.yaml", content: MINIMAL_BRAND_PROFILE },
      { path: "data/brands/acme/formats/news.yaml", content: MINIMAL_FORMAT },
      { path: "data/brands/acme/formats/sports.yaml", content: MINIMAL_FORMAT },
      {
        path: "data/brands/acme/ledger.json",
        content: json({ ideas: [{ id: "idea-01", run: "2026-W01", status: "suggested" }] }),
      },
      { path: "data/queue.json", content: json({ jobs: [] }) },
    ];
    await withMiniRepo(files, async (checkoutRoot) => {
      const result = await planImport({ brandSlugs: ["acme"], legacyAbsolutePrefix: LEGACY_PREFIX, checkoutRoot });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.ok(result.problems.some((p) => p.includes("idea-01") && p.includes("ambiguously")));
    });
  });

  it("refuses when an Idea references a Trend that cannot be resolved to a label", async () => {
    const files: MiniRepoFile[] = [
      { path: "data/brands/acme/brand-profile.yaml", content: MINIMAL_BRAND_PROFILE },
      { path: "data/brands/acme/formats/news.yaml", content: MINIMAL_FORMAT },
      {
        path: "data/brands/acme/ledger.json",
        content: json({
          ideas: [{ id: "idea-01", run: "2026-W01", format: "news", trend_id: "trend-99", status: "suggested" }],
        }),
      },
      { path: "data/brands/acme/ideas/news/2026-W01/idea-01.md", content: "# hi\n" },
      { path: "data/brands/acme/ideas/news/2026-W01/trends.json", content: json([{ id: "trend-01", label: "different" }]) },
      { path: "data/queue.json", content: json({ jobs: [] }) },
    ];
    await withMiniRepo(files, async (checkoutRoot) => {
      const result = await planImport({ brandSlugs: ["acme"], legacyAbsolutePrefix: LEGACY_PREFIX, checkoutRoot });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.ok(result.problems.some((p) => p.includes("trend-99")));
    });
  });

  it("refuses on a foreign absolute asset_paths entry it cannot safely relativize", async () => {
    const files: MiniRepoFile[] = [
      { path: "data/brands/acme/brand-profile.yaml", content: MINIMAL_BRAND_PROFILE },
      { path: "data/brands/acme/formats/news.yaml", content: MINIMAL_FORMAT },
      {
        path: "data/brands/acme/ledger.json",
        content: json({
          ideas: [
            {
              id: "idea-01",
              run: "2026-W01",
              format: "news",
              status: "accepted",
              recipes: ["news-carousel"],
              assets: [{ recipe: "news-carousel", status: "produced", asset_paths: ["/Users/someone-else/data/x.png"] }],
            },
          ],
        }),
      },
      { path: "data/brands/acme/ideas/news/2026-W01/idea-01.md", content: "# hi\n" },
      { path: "data/queue.json", content: json({ jobs: [] }) },
    ];
    await withMiniRepo(files, async (checkoutRoot) => {
      const result = await planImport({ brandSlugs: ["acme"], legacyAbsolutePrefix: LEGACY_PREFIX, checkoutRoot });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.ok(result.problems.some((p) => p.includes("someone-else")));
    });
  });

  it("refuses when the ledger silently dropped a record loadFullIdeas could not parse (issue #204 QA round 1's Defect 2)", async () => {
    const files: MiniRepoFile[] = [
      { path: "data/brands/acme/brand-profile.yaml", content: MINIMAL_BRAND_PROFILE },
      { path: "data/brands/acme/formats/news.yaml", content: MINIMAL_FORMAT },
      {
        path: "data/brands/acme/ledger.json",
        // The first record has no "id" at all — loadFullIdeas silently skips it (mirrors loadIdeas'
        // own convention); planImport must now cross-check the raw count and refuse instead.
        content: json({ ideas: [{ run: "2026-W01", status: "suggested" }, { id: "idea-01", run: "2026-W01", format: "news", status: "suggested" }] }),
      },
      { path: "data/brands/acme/ideas/news/2026-W01/idea-01.md", content: "# hi\n" },
      { path: "data/queue.json", content: json({ jobs: [] }) },
    ];
    await withMiniRepo(files, async (checkoutRoot) => {
      const result = await planImport({ brandSlugs: ["acme"], legacyAbsolutePrefix: LEGACY_PREFIX, checkoutRoot });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.ok(result.problems.some((p) => p.includes("acme") && p.includes("silently dropped")));
    });
  });

  it("refuses when data/queue.json drops a malformed job (never a silent drop)", async () => {
    const files: MiniRepoFile[] = [
      { path: "data/brands/acme/brand-profile.yaml", content: MINIMAL_BRAND_PROFILE },
      { path: "data/brands/acme/formats/news.yaml", content: MINIMAL_FORMAT },
      { path: "data/brands/acme/ledger.json", content: json({ ideas: [] }) },
      {
        path: "data/queue.json",
        content: json({
          jobs: [{ idea_id: "idea-01", brand: "acme", recipe: "news-carousel", gate: null, status: "not-a-real-status", enqueued_at: "2026-01-01T00:00:00Z" }],
        }),
      },
    ];
    await withMiniRepo(files, async (checkoutRoot) => {
      const result = await planImport({ brandSlugs: ["acme"], legacyAbsolutePrefix: LEGACY_PREFIX, checkoutRoot });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.ok(result.problems.some((p) => p.includes("data/queue.json")));
    });
  });

  it("refuses when a queue.json job does not resolve to any planned Asset", async () => {
    const files: MiniRepoFile[] = [
      { path: "data/brands/acme/brand-profile.yaml", content: MINIMAL_BRAND_PROFILE },
      { path: "data/brands/acme/formats/news.yaml", content: MINIMAL_FORMAT },
      { path: "data/brands/acme/ledger.json", content: json({ ideas: [] }) },
      {
        path: "data/queue.json",
        content: json({
          jobs: [{ idea_id: "idea-does-not-exist", brand: "acme", recipe: "news-carousel", gate: null, status: "done", enqueued_at: "2026-01-01T00:00:00Z" }],
        }),
      },
    ];
    await withMiniRepo(files, async (checkoutRoot) => {
      const result = await planImport({ brandSlugs: ["acme"], legacyAbsolutePrefix: LEGACY_PREFIX, checkoutRoot });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.ok(result.problems.some((p) => p.includes("idea-does-not-exist")));
    });
  });

  it("refuses when an Idea's Brief cannot be found on disk", async () => {
    const files: MiniRepoFile[] = [
      { path: "data/brands/acme/brand-profile.yaml", content: MINIMAL_BRAND_PROFILE },
      { path: "data/brands/acme/formats/news.yaml", content: MINIMAL_FORMAT },
      { path: "data/brands/acme/ledger.json", content: json({ ideas: [{ id: "idea-01", run: "2026-W01", format: "news", status: "suggested" }] }) },
      { path: "data/queue.json", content: json({ jobs: [] }) },
    ];
    await withMiniRepo(files, async (checkoutRoot) => {
      const result = await planImport({ brandSlugs: ["acme"], legacyAbsolutePrefix: LEGACY_PREFIX, checkoutRoot });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.ok(result.problems.some((p) => p.includes("no Brief found")));
    });
  });
});

// ---------------------------------------------------------------------------
// MundoTip's pre-Format shape, end-to-end through the sole-Format fallback
// ---------------------------------------------------------------------------

describe("planImport — MundoTip's pre-Format Idea shape resolves via the Brand's sole Format", () => {
  it("plans successfully with no format field on the Idea at all", async () => {
    const files: MiniRepoFile[] = [
      { path: "data/brands/mundotip/brand-profile.yaml", content: MINIMAL_BRAND_PROFILE },
      { path: "data/brands/mundotip/formats/life-hacks.yaml", content: MINIMAL_FORMAT },
      {
        path: "data/brands/mundotip/ledger.json",
        content: json({
          ideas: [{ id: "idea-2026-W22-01", run: "2026-W22", title: "El truco", status: "accepted", trend: "T01", fit_score: 0.66, assets: [] }],
        }),
      },
      { path: "data/brands/mundotip/ideas/2026-W22/idea-01.md", content: "# El truco\n" },
      { path: "data/brands/mundotip/ideas/2026-W22/trends.json", content: json([{ id: "T01", label: "Rutina matutina" }]) },
      { path: "data/queue.json", content: json({ jobs: [] }) },
    ];
    await withMiniRepo(files, async (checkoutRoot) => {
      const result = await planImport({ brandSlugs: ["mundotip"], legacyAbsolutePrefix: LEGACY_PREFIX, checkoutRoot });
      assert.equal(result.ok, true, result.ok ? "" : JSON.stringify((result as { problems: readonly string[] }).problems));
      if (!result.ok) return;
      const run = result.plan.brands[0]!.formats[0]!.runs[0]!;
      assert.equal(run.ideas[0]!.trendLegacyId, "T01");
      assert.equal(run.trends[0]!.label, "Rutina matutina");
    });
  });
});

// ---------------------------------------------------------------------------
// Real-data structural smoke test (read-only against the real checkout)
// ---------------------------------------------------------------------------

describe("planImport — structural smoke test against the REAL mundotip and straw-motion data", () => {
  it("succeeds and matches the tracked-JSON counts (Ideas, Assets, jobs, duplicate job keys)", async () => {
    const checkoutRoot = process.cwd();
    const result = await planImport({ brandSlugs: ["mundotip", "straw-motion"], legacyAbsolutePrefix: LEGACY_PREFIX, checkoutRoot });
    assert.equal(result.ok, true, result.ok ? "" : JSON.stringify((result as { problems: readonly string[] }).problems, null, 2));
    if (!result.ok) return;

    const { plan } = result;
    let totalIdeas = 0;
    let totalAssets = 0;
    let totalPosts = 0;
    for (const brand of plan.brands) {
      for (const format of brand.formats) {
        for (const run of format.runs) {
          totalIdeas += run.ideas.length;
          for (const idea of run.ideas) {
            totalAssets += idea.assets.length;
            for (const asset of idea.assets) {
              if (asset.postUrl !== undefined) totalPosts++;
            }
          }
        }
      }
    }
    // These counts track the REAL, live corpus (data/brands/**), not a frozen fixture — every real Run
    // that suggests new Ideas moves this number. This is a KNOWN, expected fragility (not a design
    // mistake to "fix" by freezing the corpus): re-run `npm run import-data -- --rebuild` then
    // `npm run backfill-hook-theme`, read the reconciliation report's own printed counts, and bump these
    // numbers to match. Last bumped 2026-08-19 after the "Unhypped Daily" 2026-W34 batch (+12 Ideas).
    assert.equal(totalIdeas, 73, "63 straw-motion + 10 mundotip Ideas");
    assert.equal(totalAssets, 54, "54 Assets across both Brands");
    assert.equal(plan.jobs.length, 66, "66 queue jobs");
    assert.equal(plan.duplicateJobKeys.length, 12, "the 12 duplicate job identity keys, reported not resolved");
    assert.equal(totalPosts, 7, "the real 7 Straw Motion W32 news-carousel Posts (issue #240)");
    assert.equal(plan.unresolvedPosts.length, 0, "both real Brands have at most one configured Channel per platform today — nothing is genuinely ambiguous yet (issue #243 round 2)");

    // Every real Post resolves to Facebook — the Brand's own configured Channel, never hardcoded.
    const strawMotion = plan.brands.find((b) => b.slug === "straw-motion")!;
    assert.ok(strawMotion.channels.some((c) => c.platform === "facebook"), "Straw Motion's Channel list must include facebook");
    for (const format of strawMotion.formats) {
      for (const run of format.runs) {
        for (const idea of run.ideas) {
          for (const asset of idea.assets) {
            if (asset.postUrl !== undefined) assert.equal(asset.postPlatform, "facebook");
          }
        }
      }
    }

    // No absolute path anywhere in a storage key.
    for (const brand of plan.brands) {
      for (const format of brand.formats) {
        for (const run of format.runs) {
          for (const idea of run.ideas) {
            for (const asset of idea.assets) {
              for (const media of asset.media) {
                assert.ok(!media.storageKey.startsWith("/"), `storage key must not be absolute: ${media.storageKey}`);
              }
            }
          }
        }
      }
    }
  });
});
