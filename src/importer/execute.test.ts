/**
 * Tests for `executeImport` (`src/importer/execute.ts`) — issue #204.
 *
 * Two kinds of coverage: a hand-built `ImportPlan` exercising the write semantics directly against a
 * real, throwaway SQLite file (`withTempDb`, never `:memory:` — this ticket's own Testing Decisions),
 * and one END-TO-END test chaining `planImport` -> `executeImport` against a small mini-repo, proving
 * the two phases actually compose.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DatabaseSync } from "node:sqlite";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { getBrandBySlug } from "../brand/store.ts";
import { getFormatBySlug } from "../format/store.ts";
import { listIdeasForRun } from "../idea/store.ts";
import { listAssetMedia } from "../asset/store.ts";
import { getAssetByRecipe } from "../command-surface/assets.ts";
import { listJobsForComposite } from "../production-queue/job-store.ts";

import { executeImport } from "./execute.ts";
import { planImport, type ImportPlan } from "./plan.ts";

const LEGACY_PREFIX = "/Users/CaxtonTaylor/Developer/OrganicGrowth";

function onePlan(overrides: Partial<ImportPlan> = {}): ImportPlan {
  return {
    brands: [
      {
        slug: "acme",
        name: "Acme",
        timezone: "UTC",
        mediaRoot: "data/brands/acme",
        bannedWords: [],
        requiredHashtags: [],
        channels: [],
        formats: [
          {
            slug: "news",
            name: "News",
            voice: "plain",
            cadence: "weekly",
            ideasPerRun: 10,
            sourceMode: "curated",
            defaultRecipes: [],
            runs: [
              {
                runKey: "2026-W01",
                cadence: "weekly",
                startedAt: "2026-01-01T00:00:00Z",
                trends: [{ legacyId: "trend-01", label: "Something happened", momentum: 0.9, sourceUrls: ["https://example.com/a"] }],
                ideas: [
                  {
                    legacyId: "idea-01",
                    title: "A real story",
                    brief: "# A real story\n",
                    status: "accepted",
                    trendLegacyId: "trend-01",
                    fitScore: 0.8,
                    sourceUrls: ["https://example.com/a"],
                    recipeSelections: [{ recipe: "news-carousel", chosen: true }],
                    createdAt: "2026-01-01T12:00:00Z",
                    assets: [
                      {
                        recipe: "news-carousel",
                        status: "produced",
                        producedAt: "2026-01-02T00:00:00Z",
                        spec: { slides: 7 },
                        media: [{ ordinal: 0, kind: "image", storageKey: "data/brands/acme/ideas/news/2026-W01/idea-01.assets/0-hook.png", mime: "image/png", bytes: 42, checksum: "deadbeef" }],
                        deadMedia: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    jobs: [{ brand: "acme", ideaLegacyId: "idea-01", recipe: "news-carousel", gate: null, status: "done", enqueuedAt: "2026-01-02T00:00:00Z" }],
    deadMediaPaths: [],
    duplicateJobKeys: [],
    ...overrides,
  };
}

describe("executeImport — writes an ImportPlan through the command surface, in dependency order", () => {
  it("creates every entity and returns matching counts", async () => {
    await withTempDb(async (db: DatabaseSync) => {
      runMigrations(db);
      const counts = await executeImport(db, onePlan());
      assert.deepEqual(counts, { brands: 1, channels: 0, formats: 1, runs: 1, trends: 1, ideas: 1, assets: 1, assetMedia: 1, posts: 0, jobs: 1 });

      const brand = getBrandBySlug(db, "acme")!;
      assert.equal(brand.name, "Acme");

      const format = getFormatBySlug(db, brand.id, "news")!;
      assert.equal(format.name, "News");

      const runRow = db.prepare(`SELECT * FROM run WHERE format_id = ?`).get(format.id) as unknown as { id: string; run_key: string };
      assert.equal(runRow.run_key, "2026-W01");

      const ideas = listIdeasForRun(db, runRow.id);
      assert.equal(ideas.length, 1);
      const idea = ideas[0]!;
      assert.equal(idea.status, "accepted");
      assert.equal(idea.hookType, "unclassified");
      assert.equal(idea.theme, "unclassified");
      assert.equal(idea.createdAt, "2026-01-01T12:00:00Z");
      assert.deepEqual(idea.sourceUrls, ["https://example.com/a"]);

      const trendRow = db.prepare(`SELECT * FROM trend WHERE run_id = ?`).get(runRow.id) as unknown as { label: string };
      assert.equal(trendRow.label, "Something happened");
      assert.equal(idea.trendId, (db.prepare(`SELECT id FROM trend WHERE run_id = ?`).get(runRow.id) as unknown as { id: string }).id);

      const asset = (await getAssetByRecipe(db, idea.id, "news-carousel"))!;
      assert.equal(asset.status, "produced");
      assert.deepEqual(asset.spec, { slides: 7 });

      const media = listAssetMedia(db, asset.id);
      assert.equal(media.length, 1);
      assert.equal(media[0]!.storageKey, "data/brands/acme/ideas/news/2026-W01/idea-01.assets/0-hook.png");

      const jobs = listJobsForComposite(db, brand.id, idea.id, "news-carousel");
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0]!.status, "done");
      assert.equal(jobs[0]!.enqueuedAt, "2026-01-02T00:00:00Z");
    });
  });

  it("creates a rejected Idea with its rejection reason, and no Assets", async () => {
    await withTempDb(async (db: DatabaseSync) => {
      runMigrations(db);
      const plan = onePlan();
      const run = plan.brands[0]!.formats[0]!.runs[0]!;
      const mutatedRun = {
        ...run,
        trends: [],
        ideas: [
          {
            legacyId: "idea-02",
            title: "Rejected story",
            brief: "# Rejected\n",
            status: "rejected" as const,
            rejectionReason: "Too close to last week's Idea",
            sourceUrls: [],
            recipeSelections: [],
            assets: [],
          },
        ],
      };
      const mutatedPlan: ImportPlan = { ...plan, brands: [{ ...plan.brands[0]!, formats: [{ ...plan.brands[0]!.formats[0]!, runs: [mutatedRun] }] }], jobs: [] };
      const counts = await executeImport(db, mutatedPlan);
      assert.equal(counts.ideas, 1);
      assert.equal(counts.assets, 0);

      const format = getFormatBySlug(db, getBrandBySlug(db, "acme")!.id, "news")!;
      const runRow = db.prepare(`SELECT id FROM run WHERE format_id = ?`).get(format.id) as unknown as { id: string };
      const idea = listIdeasForRun(db, runRow.id)[0]!;
      assert.equal(idea.status, "rejected");
      assert.equal(idea.rejectionReason, "Too close to last week's Idea");
    });
  });

  it("creates a job at 'queued' with no claim/release calls needed", async () => {
    await withTempDb(async (db: DatabaseSync) => {
      runMigrations(db);
      const plan = onePlan({ jobs: [{ brand: "acme", ideaLegacyId: "idea-01", recipe: "news-carousel", gate: "cast", status: "queued", enqueuedAt: "2026-01-02T00:00:00Z" }] });
      await executeImport(db, plan);
      const brand = getBrandBySlug(db, "acme")!;
      const format = getFormatBySlug(db, brand.id, "news")!;
      const runRow = db.prepare(`SELECT id FROM run WHERE format_id = ?`).get(format.id) as unknown as { id: string };
      const idea = listIdeasForRun(db, runRow.id)[0]!;
      const jobs = listJobsForComposite(db, brand.id, idea.id, "news-carousel");
      assert.equal(jobs[0]!.status, "queued");
      assert.equal(jobs[0]!.gate, "cast");
    });
  });

  it("resolves an Asset's postPlatform against the created Channel and writes one post row (issue #240)", async () => {
    await withTempDb(async (db: DatabaseSync) => {
      runMigrations(db);
      const plan = onePlan();
      const brand = plan.brands[0]!;
      const run = brand.formats[0]!.runs[0]!;
      const idea = run.ideas[0]!;
      const mutatedPlan: ImportPlan = {
        ...plan,
        brands: [
          {
            ...brand,
            channels: [{ platform: "facebook", url: "https://www.facebook.com/acme", isPrimary: true }],
            formats: [
              {
                ...brand.formats[0]!,
                runs: [
                  {
                    ...run,
                    ideas: [
                      {
                        ...idea,
                        assets: [
                          {
                            ...idea.assets[0]!,
                            status: "posted",
                            postUrl: "https://www.facebook.com/permalink/999",
                            postedAt: "2026-01-03T00:00:00Z",
                            postPlatform: "facebook",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      const counts = await executeImport(db, mutatedPlan);
      assert.equal(counts.channels, 1);
      assert.equal(counts.posts, 1);

      const brandRow = getBrandBySlug(db, "acme")!;
      const formatRow = getFormatBySlug(db, brandRow.id, "news")!;
      const runRow = db.prepare(`SELECT id FROM run WHERE format_id = ?`).get(formatRow.id) as unknown as { id: string };
      const ideaRow = listIdeasForRun(db, runRow.id)[0]!;
      const asset = (await getAssetByRecipe(db, ideaRow.id, "news-carousel"))!;

      const post = db.prepare(`SELECT * FROM post WHERE asset_id = ?`).get(asset.id) as unknown as { post_url: string; posted_at: string; channel_id: string } | undefined;
      assert.ok(post, "expected exactly one post row for the Asset");
      assert.equal(post!.post_url, "https://www.facebook.com/permalink/999");
      assert.equal(post!.posted_at, "2026-01-03T00:00:00Z");

      const channelRow = db.prepare(`SELECT * FROM channel WHERE brand_id = ? AND platform = 'facebook'`).get(brandRow.id) as unknown as { id: string };
      assert.equal(post!.channel_id, channelRow.id);
    });
  });

  it("an Asset with no postUrl writes no post row — the count stays meaningful (issue #240 AC3)", async () => {
    await withTempDb(async (db: DatabaseSync) => {
      runMigrations(db);
      const counts = await executeImport(db, onePlan());
      assert.equal(counts.posts, 0);
      const postCount = (db.prepare(`SELECT COUNT(*) AS c FROM post`).get() as unknown as { c: number }).c;
      assert.equal(postCount, 0);
    });
  });

  it("throws an internal error (never silently drops) when a planned postPlatform has no created Channel", async () => {
    await withTempDb(async (db: DatabaseSync) => {
      runMigrations(db);
      const plan = onePlan();
      const brand = plan.brands[0]!;
      const run = brand.formats[0]!.runs[0]!;
      const idea = run.ideas[0]!;
      // No matching "facebook" Channel is planned on this Brand — planImport should never let this
      // shape through; this proves the executor's own defensive guard, not a normal path.
      const mutatedPlan: ImportPlan = {
        ...plan,
        brands: [
          {
            ...brand,
            channels: [],
            formats: [
              {
                ...brand.formats[0]!,
                runs: [
                  {
                    ...run,
                    ideas: [
                      {
                        ...idea,
                        assets: [
                          { ...idea.assets[0]!, postUrl: "https://www.facebook.com/permalink/999", postedAt: "2026-01-03T00:00:00Z", postPlatform: "facebook" },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      await assert.rejects(executeImport(db, mutatedPlan), /Internal error/);
    });
  });

  it("creates two job rows for a duplicate identity key (never merged/resolved)", async () => {
    await withTempDb(async (db: DatabaseSync) => {
      runMigrations(db);
      const plan = onePlan({
        jobs: [
          { brand: "acme", ideaLegacyId: "idea-01", recipe: "news-carousel", gate: null, status: "done", enqueuedAt: "2026-01-02T00:00:00Z" },
          { brand: "acme", ideaLegacyId: "idea-01", recipe: "news-carousel", gate: null, status: "done", enqueuedAt: "2026-01-03T00:00:00Z" },
        ],
      });
      const counts = await executeImport(db, plan);
      assert.equal(counts.jobs, 2);
      const brand = getBrandBySlug(db, "acme")!;
      const format = getFormatBySlug(db, brand.id, "news")!;
      const runRow = db.prepare(`SELECT id FROM run WHERE format_id = ?`).get(format.id) as unknown as { id: string };
      const idea = listIdeasForRun(db, runRow.id)[0]!;
      const jobs = listJobsForComposite(db, brand.id, idea.id, "news-carousel");
      assert.equal(jobs.length, 2);
    });
  });
});

// ---------------------------------------------------------------------------
// End-to-end: planImport -> executeImport, against a real temp checkout + db
// ---------------------------------------------------------------------------

interface MiniRepoFile {
  readonly path: string;
  readonly content: string;
}

async function withMiniRepo(files: readonly MiniRepoFile[], fn: (checkoutRoot: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "og-importer-execute-"));
  try {
    for (const file of files) {
      await mkdir(join(root, file.path, ".."), { recursive: true });
      await writeFile(join(root, file.path), file.content, "utf8");
    }
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

describe("executeImport — end to end with planImport, against a real checkout copy and a real db", () => {
  it("plans, then executes, and the database matches", async () => {
    const files: MiniRepoFile[] = [
      {
        path: "data/brands/acme/brand-profile.yaml",
        content: "niche: test\nchannel:\n  - platform: facebook\n    url: https://www.facebook.com/acme\n    primary: true\n",
      },
      { path: "data/brands/acme/formats/news.yaml", content: 'name: "News"\nvoice: "plain"\ncadence: weekly\n' },
      {
        path: "data/brands/acme/ledger.json",
        content: json({
          ideas: [
            {
              id: "idea-01",
              run: "2026-W01",
              title: "A real story",
              format: "news",
              status: "accepted",
              recipes: ["news-carousel"],
              created_at: "2026-01-01T00:00:00Z",
              assets: [
                {
                  recipe: "news-carousel",
                  status: "posted",
                  post_url: "https://www.facebook.com/permalink/1",
                  posted_at: "2026-01-05T00:00:00Z",
                },
              ],
            },
          ],
        }),
      },
      { path: "data/brands/acme/ideas/news/2026-W01/idea-01.md", content: "# A real story\n" },
      { path: "data/queue.json", content: json({ jobs: [{ idea_id: "idea-01", brand: "acme", recipe: "news-carousel", gate: null, status: "queued", enqueued_at: "2026-01-01T00:00:00Z" }] }) },
    ];
    await withMiniRepo(files, async (checkoutRoot) => {
      const planResult = await planImport({ brandSlugs: ["acme"], legacyAbsolutePrefix: LEGACY_PREFIX, checkoutRoot });
      assert.equal(planResult.ok, true, planResult.ok ? "" : JSON.stringify((planResult as { problems: readonly string[] }).problems));
      if (!planResult.ok) return;

      await withTempDb(async (db: DatabaseSync) => {
        runMigrations(db);
        const counts = await executeImport(db, planResult.plan);
        assert.equal(counts.brands, 1);
        assert.equal(counts.channels, 1);
        assert.equal(counts.ideas, 1);
        assert.equal(counts.assets, 1);
        assert.equal(counts.jobs, 1);
        assert.equal(counts.posts, 1);

        const brand = getBrandBySlug(db, "acme")!;
        assert.equal(brand.slug, "acme");

        const postRow = db.prepare(`SELECT post_url FROM post`).get() as unknown as { post_url: string };
        assert.equal(postRow.post_url, "https://www.facebook.com/permalink/1");
      });
    });
  });
});
