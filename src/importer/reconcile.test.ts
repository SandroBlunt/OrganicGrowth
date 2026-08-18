/**
 * Tests for `buildReconciliation`/`formatReconciliationMarkdown` (`src/importer/reconcile.ts`) — issue
 * #204 AC9/AC12, extended by issue #240 AC4 (Posts in/out, plus the coverage prose).
 *
 * "Counts in" come from the PLAN (what the source data says should be written — planning already
 * refused rather than silently dropping anything, so this is a faithful count of the source). "Counts
 * out" come from a REAL query against the database AFTER `executeImport` ran — an independent check,
 * not an echo of the plan's own numbers, so an executor bug that silently failed to write something
 * would show up as a mismatch here.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { executeImport } from "./execute.ts";
import { buildReconciliation, formatReconciliationMarkdown } from "./reconcile.ts";
import type { ImportPlan } from "./plan.ts";

function twoBrandPlan(): ImportPlan {
  return {
    brands: [
      {
        slug: "acme",
        name: "Acme",
        timezone: "UTC",
        mediaRoot: "data/brands/acme",
        bannedWords: [],
        requiredHashtags: [],
        channels: [{ platform: "facebook", url: "https://www.facebook.com/acme", isPrimary: true }],
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
                trends: [],
                ideas: [
                  {
                    legacyId: "idea-01",
                    title: "A",
                    brief: "# A\n",
                    status: "accepted",
                    sourceUrls: [],
                    recipeSelections: [{ recipe: "news-carousel", chosen: true }],
                    assets: [
                      {
                        recipe: "news-carousel",
                        status: "posted",
                        media: [],
                        deadMedia: [],
                        postUrl: "https://www.facebook.com/permalink/1",
                        postedAt: "2026-01-02T00:00:00Z",
                        postPlatform: "facebook",
                        postChannelIndex: 0,
                      },
                    ],
                  },
                  {
                    legacyId: "idea-02",
                    title: "B",
                    brief: "# B\n",
                    status: "suggested",
                    sourceUrls: [],
                    recipeSelections: [],
                    assets: [],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        slug: "beta",
        name: "Beta",
        timezone: "UTC",
        mediaRoot: "data/brands/beta",
        bannedWords: [],
        requiredHashtags: [],
        channels: [],
        formats: [
          {
            slug: "life-hacks",
            name: "Life Hacks",
            voice: "plain",
            cadence: "weekly",
            ideasPerRun: 10,
            sourceMode: "peer",
            defaultRecipes: [],
            runs: [
              {
                runKey: "2026-W01",
                cadence: "weekly",
                startedAt: "2026-01-01T00:00:00Z",
                trends: [],
                ideas: [
                  {
                    legacyId: "idea-2026-W01-01",
                    title: "C",
                    brief: "# C\n",
                    status: "suggested",
                    sourceUrls: [],
                    recipeSelections: [],
                    assets: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    jobs: [{ brand: "acme", ideaLegacyId: "idea-01", recipe: "news-carousel", gate: null, status: "queued", enqueuedAt: "2026-01-01T00:00:00Z" }],
    deadMediaPaths: [{ brand: "acme", ideaLegacyId: "idea-01", recipe: "news-carousel", ordinal: 1, storageKey: "data/x/1.png" }],
    duplicateJobKeys: [{ brand: "acme", ideaLegacyId: "idea-01", recipe: "news-carousel", jobs: [{ gate: null, status: "queued", enqueuedAt: "2026-01-01T00:00:00Z" }, { gate: null, status: "queued", enqueuedAt: "2026-01-02T00:00:00Z" }] }],
  };
}

describe("buildReconciliation — counts in (the Plan) vs counts out (a real query against the database)", () => {
  it("reports matching counts in/out for both Brands after a clean execute, plus the two report-only categories", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const plan = twoBrandPlan();
      await executeImport(db, plan);
      const report = buildReconciliation(db, plan, () => "2026-01-01T00:00:00Z");

      assert.equal(report.brands.length, 2);
      const acme = report.brands.find((b) => b.brand === "acme")!;
      assert.equal(acme.ideasIn, 2);
      assert.equal(acme.ideasOut, 2);
      assert.equal(acme.assetsIn, 1);
      assert.equal(acme.assetsOut, 1);
      assert.equal(acme.jobsIn, 1);
      assert.equal(acme.jobsOut, 1);
      assert.equal(acme.postsIn, 1);
      assert.equal(acme.postsOut, 1);

      const beta = report.brands.find((b) => b.brand === "beta")!;
      assert.equal(beta.ideasIn, 1);
      assert.equal(beta.ideasOut, 1);
      assert.equal(beta.assetsIn, 0);
      assert.equal(beta.assetsOut, 0);
      assert.equal(beta.jobsIn, 0);
      assert.equal(beta.jobsOut, 0);
      assert.equal(beta.postsIn, 0);
      assert.equal(beta.postsOut, 0);

      assert.equal(report.totals.ideasIn, 3);
      assert.equal(report.totals.ideasOut, 3);
      assert.equal(report.totals.assetsIn, 1);
      assert.equal(report.totals.assetsOut, 1);
      assert.equal(report.totals.jobsIn, 1);
      assert.equal(report.totals.jobsOut, 1);
      assert.equal(report.totals.postsIn, 1);
      assert.equal(report.totals.postsOut, 1);

      assert.equal(report.deadMediaPaths.length, 1);
      assert.equal(report.duplicateJobKeys.length, 1);
    });
  });

  it("a mismatch (nothing executed) is visible, not hidden", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const plan = twoBrandPlan();
      // Deliberately never call executeImport — counts out should be zero, counts in should not.
      const report = buildReconciliation(db, plan, () => "2026-01-01T00:00:00Z");
      assert.equal(report.totals.ideasIn, 3);
      assert.equal(report.totals.ideasOut, 0);
      assert.equal(report.totals.postsIn, 1);
      assert.equal(report.totals.postsOut, 0);
    });
  });
});

describe("formatReconciliationMarkdown — a human-readable rendering", () => {
  it("names every Brand, the totals, both report-only categories, the Posts column, and what it does/does not cover", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const plan = twoBrandPlan();
      await executeImport(db, plan);
      const report = buildReconciliation(db, plan, () => "2026-01-01T00:00:00Z");
      const markdown = formatReconciliationMarkdown(report);
      assert.match(markdown, /acme/);
      assert.match(markdown, /beta/);
      assert.match(markdown, /Dead media paths/i);
      assert.match(markdown, /Duplicate job identity keys/i);
      assert.match(markdown, /data\/x\/1\.png/);
      assert.match(markdown, /Posts in/);
      assert.match(markdown, /What this reconciliation covers/i);
      assert.match(markdown, /NOT independently counted/);
      assert.match(markdown, /channel_baseline/);
    });
  });
});
