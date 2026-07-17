import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { trackPerformanceCommand, main as trackPerformanceMain } from "./track-performance.ts";
import type { PerformanceScrapePort } from "./track-performance-port.ts";
import { loadIdeaAssets } from "../asset/store.ts";
import { loadBaseline, loadReport } from "../ledger/ledger.ts";

const RECIPE = "character-explainer-with-cast";
const RECIPE_2 = "carousel";
const FB_URL = "https://facebook.com/permalink/1";
const FB_URL_2 = "https://facebook.com/permalink/2";
const IG_URL = "https://instagram.com/p/abc";
const NOW = "2026-06-20T00:00:00.000Z";

const SEEDS_YAML_FACEBOOK_ONLY = [
  "apify:",
  "  facebook:",
  "    trends_actor: apify/facebook-posts-scraper",
  "    post_actor: apify/facebook-post-scraper",
  "  instagram:",
  '    post_actor: "..."', // not-yet-wired placeholder
  "",
].join("\n");

/** A fake Apify port: maps post URL → a raw dataset item, `null` (no data), or an Error to throw. */
function fakePort(responses: Record<string, unknown>): PerformanceScrapePort {
  return {
    async scrapePost(url: string) {
      if (!(url in responses)) return null;
      const value = responses[url];
      if (value instanceof Error) throw value;
      return value ?? null;
    },
  };
}

const FB_ITEM = { likes: 40, comments: 10, shares: 5, viewsCount: 900, url: FB_URL, time: NOW };

async function withFixtures(
  seed: unknown,
  seedsYaml: string,
  fn: (ledgerPath: string, seedsPath: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-track-performance-"));
  const ledgerPath = join(dir, "ledger.json");
  const seedsPath = join(dir, "seeds.yaml");
  try {
    await writeFile(ledgerPath, JSON.stringify(seed, null, 2) + "\n", "utf8");
    await writeFile(seedsPath, seedsYaml, "utf8");
    await fn(ledgerPath, seedsPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// === Basic scrape → score → per-Asset write ============================================================

describe("trackPerformanceCommand — scrapes, scores, and writes at the Asset grain", () => {
  it("a Post younger than 7 days becomes tracking, with metrics + score + tracked_at written", async () => {
    const seed = {
      ideas: [
        {
          id: "idea-A",
          status: "accepted",
          assets: [{ recipe: RECIPE, status: "posted", post_url: FB_URL, posted_at: "2026-06-18T00:00:00.000Z" }],
        },
      ],
    };
    await withFixtures(seed, SEEDS_YAML_FACEBOOK_ONLY, async (ledgerPath, seedsPath) => {
      const out = await trackPerformanceCommand("mundotip", undefined, {
        ledgerPath,
        seedsPath,
        now: () => NOW,
        apify: fakePort({ [FB_URL]: FB_ITEM }),
      });
      assert.match(out, /mundotip/);
      assert.match(out, /tracking/);

      const assets = await loadIdeaAssets("idea-A", ledgerPath);
      const asset = assets!.find((a) => a.recipe === RECIPE)!;
      assert.equal(asset.status, "tracking");
      assert.equal(asset.tracked_at, NOW);
      assert.deepEqual(asset.metrics, { shares: 5, comments: 10, reactions: 40, views: 900 });
      assert.ok(typeof asset.performance_score === "number");
    });
  });

  it("a Post 7+ days old becomes scored", async () => {
    const seed = {
      ideas: [
        {
          id: "idea-A",
          status: "accepted",
          assets: [{ recipe: RECIPE, status: "posted", post_url: FB_URL, posted_at: "2026-06-01T00:00:00.000Z" }],
        },
      ],
    };
    await withFixtures(seed, SEEDS_YAML_FACEBOOK_ONLY, async (ledgerPath, seedsPath) => {
      await trackPerformanceCommand("mundotip", undefined, {
        ledgerPath,
        seedsPath,
        now: () => NOW,
        apify: fakePort({ [FB_URL]: FB_ITEM }),
      });
      const assets = await loadIdeaAssets("idea-A", ledgerPath);
      assert.equal(assets!.find((a) => a.recipe === RECIPE)!.status, "scored");
    });
  });

  it("computes the score relative to the Channel baseline (never a raw/absolute metric)", async () => {
    const seed = {
      ideas: [
        {
          id: "idea-A",
          status: "accepted",
          assets: [{ recipe: RECIPE, status: "posted", post_url: FB_URL, posted_at: "2026-06-18T00:00:00.000Z" }],
        },
      ],
      baseline: { shares: 5, comments: 10, reactions: 40, views: 900, updated_at: "2026-06-01T00:00:00.000Z" },
    };
    await withFixtures(seed, SEEDS_YAML_FACEBOOK_ONLY, async (ledgerPath, seedsPath) => {
      await trackPerformanceCommand("mundotip", undefined, {
        ledgerPath,
        seedsPath,
        now: () => NOW,
        apify: fakePort({ [FB_URL]: FB_ITEM }), // exactly at baseline
      });
      const assets = await loadIdeaAssets("idea-A", ledgerPath);
      // Exactly at baseline on every metric → the neutral 0.5 score.
      assert.equal(assets!.find((a) => a.recipe === RECIPE)!.performance_score, 0.5);
    });
  });
});

// === Two Assets on one Idea → two INDEPENDENT scores (AC: issue #84) ===================================

describe("trackPerformanceCommand — an Idea with two posted Assets gets two INDEPENDENT scores", () => {
  it("scores each Recipe's Asset from its OWN post_url, never collapsing or inferring across Recipes", async () => {
    const seed = {
      ideas: [
        {
          id: "idea-A",
          status: "accepted",
          fit_score: 0.7,
          assets: [
            { recipe: RECIPE, status: "posted", post_url: FB_URL, posted_at: "2026-06-18T00:00:00.000Z" },
            { recipe: RECIPE_2, status: "posted", post_url: FB_URL_2, posted_at: "2026-06-18T00:00:00.000Z" },
          ],
        },
      ],
      // A real established baseline, so the two Assets' different engagement actually diverges into
      // two different scores (against a NULL baseline every metric is neutral 0.5 regardless).
      baseline: { shares: 5, comments: 10, reactions: 40, views: 900, updated_at: "2026-06-01T00:00:00.000Z" },
    };
    const item2 = { likes: 400, comments: 100, shares: 50, viewsCount: 9000, url: FB_URL_2, time: NOW };
    await withFixtures(seed, SEEDS_YAML_FACEBOOK_ONLY, async (ledgerPath, seedsPath) => {
      await trackPerformanceCommand("mundotip", undefined, {
        ledgerPath,
        seedsPath,
        now: () => NOW,
        apify: fakePort({ [FB_URL]: FB_ITEM, [FB_URL_2]: item2 }),
      });

      const assets = await loadIdeaAssets("idea-A", ledgerPath);
      const a1 = assets!.find((a) => a.recipe === RECIPE)!;
      const a2 = assets!.find((a) => a.recipe === RECIPE_2)!;
      assert.notEqual(a1.performance_score, a2.performance_score);
      assert.ok(a2.performance_score! > a1.performance_score!, "the higher-engagement Post must score higher");

      // /report's explicit 1:N (Fit Score vs BEST measured Performance Score) reflects both.
      const report = await loadReport(ledgerPath);
      const idea = report.ideas[0]!;
      assert.equal(idea.assets.length, 2);
      assert.equal(idea.best_performance_score, Math.max(a1.performance_score!, a2.performance_score!));
    });
  });

  it("writing one Recipe's Asset never touches the sibling Recipe's Asset fields", async () => {
    const seed = {
      ideas: [
        {
          id: "idea-A",
          status: "accepted",
          assets: [
            { recipe: RECIPE, status: "posted", post_url: FB_URL, posted_at: "2026-06-18T00:00:00.000Z" },
            { recipe: RECIPE_2, status: "produced" }, // not yet posted — must stay untouched
          ],
        },
      ],
    };
    await withFixtures(seed, SEEDS_YAML_FACEBOOK_ONLY, async (ledgerPath, seedsPath) => {
      await trackPerformanceCommand("mundotip", undefined, {
        ledgerPath,
        seedsPath,
        now: () => NOW,
        apify: fakePort({ [FB_URL]: FB_ITEM }),
      });
      const assets = await loadIdeaAssets("idea-A", ledgerPath);
      const other = assets!.find((a) => a.recipe === RECIPE_2)!;
      assert.equal(other.status, "produced");
      assert.equal(other.performance_score, undefined);
      assert.equal(other.metrics, undefined);
    });
  });
});

// === Skip paths — never fabricate ========================================================================

describe("trackPerformanceCommand — never fabricates; skips honestly and writes nothing for that Asset", () => {
  it("skips an Asset whose post_url platform cannot be detected — writes nothing", async () => {
    const seed = {
      ideas: [
        { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "posted", post_url: "not-a-url", posted_at: "2026-06-18T00:00:00.000Z" }] },
      ],
    };
    await withFixtures(seed, SEEDS_YAML_FACEBOOK_ONLY, async (ledgerPath, seedsPath) => {
      const out = await trackPerformanceCommand("mundotip", undefined, { ledgerPath, seedsPath, now: () => NOW, apify: fakePort({}) });
      assert.match(out, /SKIPPED/);
      const assets = await loadIdeaAssets("idea-A", ledgerPath);
      assert.equal(assets![0]!.status, "posted");
      assert.equal(assets![0]!.performance_score, undefined);
    });
  });

  it("skips a platform with no post_actor configured yet (still the '...' placeholder)", async () => {
    const seed = {
      ideas: [
        { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "posted", post_url: IG_URL, posted_at: "2026-06-18T00:00:00.000Z" }] },
      ],
    };
    await withFixtures(seed, SEEDS_YAML_FACEBOOK_ONLY, async (ledgerPath, seedsPath) => {
      const out = await trackPerformanceCommand("mundotip", undefined, { ledgerPath, seedsPath, now: () => NOW, apify: fakePort({}) });
      assert.match(out, /not trackable/i);
      const assets = await loadIdeaAssets("idea-A", ledgerPath);
      assert.equal(assets![0]!.status, "posted");
    });
  });

  it("skips (never fabricates a score) when the actor returns no data", async () => {
    const seed = {
      ideas: [
        { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "posted", post_url: FB_URL, posted_at: "2026-06-18T00:00:00.000Z" }] },
      ],
    };
    await withFixtures(seed, SEEDS_YAML_FACEBOOK_ONLY, async (ledgerPath, seedsPath) => {
      const out = await trackPerformanceCommand("mundotip", undefined, { ledgerPath, seedsPath, now: () => NOW, apify: fakePort({ [FB_URL]: null }) });
      assert.match(out, /SKIPPED/);
      assert.match(out, /no data/i);
      const assets = await loadIdeaAssets("idea-A", ledgerPath);
      assert.equal(assets![0]!.performance_score, undefined);
    });
  });

  it("skips (never crashes) when the scrape port throws", async () => {
    const seed = {
      ideas: [
        { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "posted", post_url: FB_URL, posted_at: "2026-06-18T00:00:00.000Z" }] },
      ],
    };
    await withFixtures(seed, SEEDS_YAML_FACEBOOK_ONLY, async (ledgerPath, seedsPath) => {
      const out = await trackPerformanceCommand("mundotip", undefined, {
        ledgerPath,
        seedsPath,
        now: () => NOW,
        apify: fakePort({ [FB_URL]: new Error("network down") }),
      });
      assert.match(out, /SKIPPED/);
      assert.match(out, /scrape failed/i);
      const assets = await loadIdeaAssets("idea-A", ledgerPath);
      assert.equal(assets![0]!.performance_score, undefined);
    });
  });

  it("skips an Asset with no recorded posted_at rather than guessing its maturity", async () => {
    const seed = {
      ideas: [{ id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "posted", post_url: FB_URL }] }],
    };
    await withFixtures(seed, SEEDS_YAML_FACEBOOK_ONLY, async (ledgerPath, seedsPath) => {
      const out = await trackPerformanceCommand("mundotip", undefined, { ledgerPath, seedsPath, now: () => NOW, apify: fakePort({ [FB_URL]: FB_ITEM }) });
      assert.match(out, /SKIPPED/);
      const assets = await loadIdeaAssets("idea-A", ledgerPath);
      assert.equal(assets![0]!.performance_score, undefined);
    });
  });

  it("reports clearly and writes nothing when there are no trackable Assets at all", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "produced" }] }] };
    await withFixtures(seed, SEEDS_YAML_FACEBOOK_ONLY, async (ledgerPath, seedsPath) => {
      const before = await readFile(ledgerPath, "utf8");
      const out = await trackPerformanceCommand("mundotip", undefined, { ledgerPath, seedsPath, now: () => NOW, apify: fakePort({}) });
      assert.match(out, /No trackable Assets/);
      const after = await readFile(ledgerPath, "utf8");
      assert.equal(after, before, "a no-op run must never write the ledger");
    });
  });
});

// === Baseline recompute ===================================================================================

describe("trackPerformanceCommand — recomputes the ONE Channel baseline", () => {
  it("seeds the baseline from this batch's medians when none exists yet (first run)", async () => {
    const seed = {
      ideas: [
        { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "posted", post_url: FB_URL, posted_at: "2026-06-18T00:00:00.000Z" }] },
      ],
    };
    await withFixtures(seed, SEEDS_YAML_FACEBOOK_ONLY, async (ledgerPath, seedsPath) => {
      assert.deepEqual((await loadBaseline(ledgerPath)).updated_at, null);
      await trackPerformanceCommand("mundotip", undefined, { ledgerPath, seedsPath, now: () => NOW, apify: fakePort({ [FB_URL]: FB_ITEM }) });
      const baseline = await loadBaseline(ledgerPath);
      assert.equal(baseline.updated_at, NOW);
      assert.deepEqual(baseline, { shares: 5, comments: 10, reactions: 40, views: 900, updated_at: NOW });
    });
  });

  it("prefers SCORED Assets' metrics once some exist, over still-tracking ones", async () => {
    const seed = {
      ideas: [
        {
          id: "idea-A",
          status: "accepted",
          assets: [
            // Already scored & settled — feeds the baseline.
            { recipe: RECIPE, status: "scored", post_url: FB_URL, posted_at: "2026-05-01T00:00:00.000Z", metrics: { shares: 100, comments: 100, reactions: 100, views: 100 }, performance_score: 0.5, tracked_at: "2026-05-10T00:00:00.000Z" },
            // Freshly posted — will be tracking after this run, must NOT feed the baseline while a scored Asset exists.
            { recipe: RECIPE_2, status: "posted", post_url: FB_URL_2, posted_at: "2026-06-18T00:00:00.000Z" },
          ],
        },
      ],
    };
    const item2 = { likes: 1, comments: 1, shares: 1, viewsCount: 1, url: FB_URL_2, time: NOW };
    await withFixtures(seed, SEEDS_YAML_FACEBOOK_ONLY, async (ledgerPath, seedsPath) => {
      await trackPerformanceCommand("mundotip", undefined, { ledgerPath, seedsPath, now: () => NOW, apify: fakePort({ [FB_URL_2]: item2 }) });
      const baseline = await loadBaseline(ledgerPath);
      assert.deepEqual(baseline, { shares: 100, comments: 100, reactions: 100, views: 100, updated_at: NOW });
    });
  });

  it("does not write a baseline when nothing has ever been measured", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "posted", post_url: IG_URL, posted_at: "2026-06-18T00:00:00.000Z" }] }] };
    await withFixtures(seed, SEEDS_YAML_FACEBOOK_ONLY, async (ledgerPath, seedsPath) => {
      await trackPerformanceCommand("mundotip", undefined, { ledgerPath, seedsPath, now: () => NOW, apify: fakePort({}) });
      const baseline = await loadBaseline(ledgerPath);
      assert.equal(baseline.updated_at, null);
    });
  });
});

// === History trail =========================================================================================

describe("trackPerformanceCommand — keeps a small history trail of prior reads", () => {
  it("a second pull pushes the FIRST reading into history rather than discarding it", async () => {
    const seed = {
      ideas: [
        { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "posted", post_url: FB_URL, posted_at: "2026-06-18T00:00:00.000Z" }] },
      ],
    };
    await withFixtures(seed, SEEDS_YAML_FACEBOOK_ONLY, async (ledgerPath, seedsPath) => {
      await trackPerformanceCommand("mundotip", undefined, { ledgerPath, seedsPath, now: () => "2026-06-19T00:00:00.000Z", apify: fakePort({ [FB_URL]: FB_ITEM }) });
      const firstPull = (await loadIdeaAssets("idea-A", ledgerPath))!.find((a) => a.recipe === RECIPE)!;
      assert.equal(firstPull.history, undefined, "no prior reading yet — history stays absent");

      const secondItem = { likes: 80, comments: 20, shares: 10, viewsCount: 1800, url: FB_URL, time: NOW };
      await trackPerformanceCommand("mundotip", undefined, { ledgerPath, seedsPath, now: () => NOW, apify: fakePort({ [FB_URL]: secondItem }) });
      const secondPull = (await loadIdeaAssets("idea-A", ledgerPath))!.find((a) => a.recipe === RECIPE)!;
      assert.equal(secondPull.history!.length, 1);
      assert.equal(secondPull.history![0]!.tracked_at, "2026-06-19T00:00:00.000Z");
      assert.deepEqual(secondPull.history![0]!.metrics, firstPull.metrics);
      // The CURRENT reading reflects the SECOND pull, not the first.
      assert.deepEqual(secondPull.metrics, { shares: 10, comments: 20, reactions: 80, views: 1800 });
    });
  });
});

// === Forced re-pull via idea-id ============================================================================

describe("trackPerformanceCommand — an explicit idea-id forces a re-pull, even of a scored Asset", () => {
  it("re-selects and re-writes an already-scored Asset when its Idea is named explicitly", async () => {
    const seed = {
      ideas: [
        { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "scored", post_url: FB_URL, posted_at: "2026-05-01T00:00:00.000Z", metrics: { shares: 1, comments: 1, reactions: 1, views: 1 }, performance_score: 0.5, tracked_at: "2026-05-10T00:00:00.000Z" }] },
      ],
    };
    await withFixtures(seed, SEEDS_YAML_FACEBOOK_ONLY, async (ledgerPath, seedsPath) => {
      const withoutForce = await trackPerformanceCommand("mundotip", undefined, { ledgerPath, seedsPath, now: () => NOW, apify: fakePort({ [FB_URL]: FB_ITEM }) });
      assert.match(withoutForce, /No trackable Assets/);

      await trackPerformanceCommand("mundotip", "idea-A", { ledgerPath, seedsPath, now: () => NOW, apify: fakePort({ [FB_URL]: FB_ITEM }) });
      const asset = (await loadIdeaAssets("idea-A", ledgerPath))!.find((a) => a.recipe === RECIPE)!;
      assert.deepEqual(asset.metrics, { shares: 5, comments: 10, reactions: 40, views: 900 });
      assert.equal(asset.history!.length, 1, "the prior scored reading is kept in history");
    });
  });
});

// === Brand-routing (resolveBrand) ==========================================================================

describe("trackPerformanceCommand — brand-routing: resolves the correct Brand's ledger/seeds via the resolver", () => {
  it("routes to the Brand's own ledger.json/seeds.yaml when only brandsRoot is given", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "og-track-performance-resolver-"));
    const brandDir = join(tmpRoot, "mundotip");
    await mkdir(brandDir, { recursive: true });
    const ledgerPath = join(brandDir, "ledger.json");
    const seedsPath = join(brandDir, "seeds.yaml");
    const seed = {
      ideas: [{ id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "posted", post_url: FB_URL, posted_at: "2026-06-18T00:00:00.000Z" }] }],
    };
    await writeFile(ledgerPath, JSON.stringify(seed, null, 2) + "\n", "utf8");
    await writeFile(seedsPath, SEEDS_YAML_FACEBOOK_ONLY, "utf8");
    try {
      await trackPerformanceCommand("mundotip", undefined, { brandsRoot: tmpRoot, now: () => NOW, apify: fakePort({ [FB_URL]: FB_ITEM }) });
      const assets = await loadIdeaAssets("idea-A", ledgerPath);
      assert.ok(typeof assets![0]!.performance_score === "number");
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("the output restates the Brand (issue #20 — never a silent default)", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "posted", post_url: FB_URL, posted_at: "2026-06-18T00:00:00.000Z" }] }] };
    await withFixtures(seed, SEEDS_YAML_FACEBOOK_ONLY, async (ledgerPath, seedsPath) => {
      const out = await trackPerformanceCommand("mundotip", undefined, { ledgerPath, seedsPath, now: () => NOW, apify: fakePort({ [FB_URL]: FB_ITEM }) });
      assert.match(out, /mundotip/);
    });
  });
});

// === CLI main() — usage-error path when brand is absent ====================================================

describe("track-performance CLI main() — exits with usage error when <brand> is absent", () => {
  it("writes a usage message to stderr and sets a non-zero exit code when no args are given", async () => {
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    const stderrChunks: string[] = [];
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as NodeJS.WriteStream).write = (chunk: string | Uint8Array): boolean => {
      stderrChunks.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    };

    try {
      process.argv = ["node", "track-performance.ts"];
      process.exitCode = 0;

      await trackPerformanceMain();

      const stderr = stderrChunks.join("");
      assert.match(stderr, /usage/i);
      assert.match(stderr, /<brand>/);
      assert.notEqual(process.exitCode, 0);
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      (process.stderr as NodeJS.WriteStream).write = originalStderrWrite as typeof process.stderr.write;
    }
  });
});
