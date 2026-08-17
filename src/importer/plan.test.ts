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
    for (const brand of plan.brands) {
      for (const format of brand.formats) {
        for (const run of format.runs) {
          totalIdeas += run.ideas.length;
          for (const idea of run.ideas) totalAssets += idea.assets.length;
        }
      }
    }
    assert.equal(totalIdeas, 61, "51 straw-motion + 10 mundotip Ideas");
    assert.equal(totalAssets, 54, "54 Assets across both Brands");
    assert.equal(plan.jobs.length, 66, "66 queue jobs");
    assert.equal(plan.duplicateJobKeys.length, 12, "the 12 duplicate job identity keys, reported not resolved");

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
