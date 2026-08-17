/**
 * Tests for the Library's read model (issue #210).
 *
 * Two kinds, deliberately both present:
 *
 *   1. Fixture-seeded tests (`test-support.ts`) that prove the specific behaviors this ticket's brief
 *      calls out by name — tied Performance Scores, a Post never scored at all, an Asset's Production
 *      Spec/media/copy/posts/metrics shown together, a queue row's produced/parked/failed bucket.
 *   2. ONE real-corpus integration test that runs the ACTUAL one-shot importer (`src/importer`) plus the
 *      ACTUAL Hook Type / Theme backfill (`src/commands/backfill-hook-theme.ts`) against this repo's own
 *      committed `data/brands/**` — no network, no live Space, no Apify — and asserts the read model
 *      reports EXACTLY the counts `docs/import-reconciliation-2026-08-17.md` already documents (2
 *      Brands, 61 Ideas, 54 Assets, 66 Jobs, 7 Posts). This is the "prove it, don't assert it" proof the
 *      build brief asks for — a hand-maintained fixture could drift from what the real data actually
 *      looks like without anyone noticing; this test cannot.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { createChannel } from "../channel/store.ts";
import { planImport } from "../importer/plan.ts";
import { executeImport } from "../importer/execute.ts";
import { backfillHookTheme } from "../commands/backfill-hook-theme.ts";
import { listAllIdeas } from "../idea/store.ts";
import { listAllAssets } from "../asset/store.ts";
import { listAllJobs } from "../production-queue/job-store.ts";
import { listAllPosts } from "../post/store.ts";
import { resolveBrand } from "../brand/resolver.ts";
import { loadFullIdeas } from "../ledger/ledger.ts";

import { buildLibraryIndex, getAssetDetail, buildQueueRows, buildFitPerformanceData, countAllPosts } from "./read-model.ts";
import { seedWorld, seedLibraryIdea, seedLibraryAsset, seedLibraryPost, seedLibraryCopyVariant, seedLibraryJob } from "./test-support.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const LEGACY_ABSOLUTE_PREFIX = "/Users/CaxtonTaylor/Developer/OrganicGrowth";

// ---------------------------------------------------------------------------
// buildLibraryIndex
// ---------------------------------------------------------------------------

describe("buildLibraryIndex — one row per Asset, joined out to its Idea/Format/Brand/Recipe", () => {
  it("returns [] for an empty database", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.deepEqual(buildLibraryIndex(db), []);
    });
  });

  it("joins an Asset to its Idea's hook_type/theme/fit_score, its Recipe's name, its Format, and its Brand", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const world = seedWorld(db);
      const ideaId = seedLibraryIdea(world, { title: "AI pricing shakeup", hookType: "surprising_number", theme: "pricing_or_cost", fitScore: 0.72 });
      await seedLibraryAsset(world, ideaId, "news-carousel", { status: "produced", mediaCount: 7 });

      const rows = buildLibraryIndex(db);
      assert.equal(rows.length, 1);
      const row = rows[0]!;
      assert.equal(row.ideaTitle, "AI pricing shakeup");
      assert.equal(row.hookType, "surprising_number");
      assert.equal(row.theme, "pricing_or_cost");
      assert.equal(row.fitScore, 0.72);
      assert.equal(row.recipeSlug, "news-carousel");
      assert.equal(row.recipeName, "News Carousel");
      assert.equal(row.formatSlug, world.formatSlug);
      assert.equal(row.brandSlug, world.brandSlug);
      assert.equal(row.mediaCount, 7);
      assert.equal(row.hasSpec, false);
      assert.equal(row.bestPerformanceScore, undefined, "no Post logged yet — never fabricated as 0");
    });
  });

  it("one Idea run through TWO Recipes yields TWO rows, one per Asset", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const world = seedWorld(db);
      const ideaId = seedLibraryIdea(world);
      await seedLibraryAsset(world, ideaId, "news-carousel");
      await seedLibraryAsset(world, ideaId, "character-explainer-with-cast");

      const rows = buildLibraryIndex(db);
      assert.equal(rows.length, 2);
      assert.deepEqual(rows.map((r) => r.recipeSlug).sort(), ["character-explainer-with-cast", "news-carousel"]);
    });
  });

  it("a scored Post sets bestPerformanceScore; an UNSCORED Post leaves it undefined — the two real states this ticket's brief calls out", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const world = seedWorld(db);

      const scoredIdea = seedLibraryIdea(world, { title: "Scored" });
      const scoredAsset = await seedLibraryAsset(world, scoredIdea, "news-carousel");
      seedLibraryPost(world, scoredAsset, { score: 0.5 });

      const unscoredIdea = seedLibraryIdea(world, { title: "Unscored" });
      const unscoredAsset = await seedLibraryAsset(world, unscoredIdea, "news-carousel");
      seedLibraryPost(world, unscoredAsset); // logged, but never tracked — no score option given

      const noPostIdea = seedLibraryIdea(world, { title: "No post at all" });
      await seedLibraryAsset(world, noPostIdea, "news-carousel");

      const rows = buildLibraryIndex(db);
      const byTitle = new Map(rows.map((r) => [r.ideaTitle, r]));
      assert.equal(byTitle.get("Scored")!.bestPerformanceScore, 0.5);
      assert.equal(byTitle.get("Unscored")!.bestPerformanceScore, undefined);
      assert.equal(byTitle.get("No post at all")!.bestPerformanceScore, undefined);
    });
  });

  it("takes the BEST (highest) score across more than one scored Post (one per Channel) on the same Asset", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const world = seedWorld(db);
      const ideaId = seedLibraryIdea(world);
      const assetId = await seedLibraryAsset(world, ideaId, "news-carousel");
      seedLibraryPost(world, assetId, { score: 0.3, postUrl: "https://facebook.com/p/1" });
      // A SECOND, genuinely different Channel's Post on the SAME Asset (CONTEXT.md "Post": "at most one
      // Post per Channel it is actually published to") — scored higher.
      const linkedinChannelId = createChannel(db, { brandId: world.brandId, platform: "linkedin" });
      const linkedinWorld = { ...world, channelId: linkedinChannelId };
      seedLibraryPost(linkedinWorld, assetId, { score: 0.9, postUrl: "https://linkedin.com/p/2" });

      const rows = buildLibraryIndex(db);
      assert.equal(rows[0]!.posts.length, 2, "both Posts must be carried through, not collapsed into one");
      assert.equal(rows[0]!.bestPerformanceScore, 0.9);
    });
  });

  it("MULTIPLE Posts tied at the exact same score (0.5) — the real-world shape once every straw-motion Post is tracked", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const world = seedWorld(db);
      const titles = ["One", "Two", "Three"];
      for (const title of titles) {
        const ideaId = seedLibraryIdea(world, { title });
        const assetId = await seedLibraryAsset(world, ideaId, "news-carousel");
        seedLibraryPost(world, assetId, { score: 0.5 });
      }
      const rows = buildLibraryIndex(db);
      assert.deepEqual(rows.map((r) => r.bestPerformanceScore), [0.5, 0.5, 0.5]);
    });
  });
});

// ---------------------------------------------------------------------------
// getAssetDetail
// ---------------------------------------------------------------------------

describe("getAssetDetail — spec, media, Copy variants, Post URLs, and metric history TOGETHER (AC4)", () => {
  it("returns null for an unknown Asset id", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.equal(getAssetDetail(db, "does-not-exist"), null);
    });
  });

  it("returns every field AC4 asks for, on ONE view — spec, media, copy, posts, and metric/score history", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const world = seedWorld(db);
      const ideaId = seedLibraryIdea(world, { title: "Full detail idea", hookType: "irony", theme: "safety_or_risk", fitScore: 0.61 });
      const spec = { slides: [{ role: "hook", text: "..." }] };
      const assetId = await seedLibraryAsset(world, ideaId, "news-carousel", { status: "posted", spec, mediaCount: 3 });
      seedLibraryCopyVariant(world, assetId, "A test caption.");
      seedLibraryPost(world, assetId, { score: 0.5, postUrl: "https://facebook.com/p/detail" });

      const detail = getAssetDetail(db, assetId)!;
      assert.notEqual(detail, null);
      assert.equal(detail.idea.title, "Full detail idea");
      assert.equal(detail.idea.hookType, "irony");
      assert.equal(detail.idea.fitScore, 0.61);
      assert.deepEqual(detail.spec, spec);
      assert.equal(detail.media.length, 3);
      assert.equal(detail.copyVariants.length, 1);
      assert.equal(detail.copyVariants[0]!.caption, "A test caption.");
      assert.equal(detail.posts.length, 1);
      assert.equal(detail.posts[0]!.postUrl, "https://facebook.com/p/detail");
      assert.equal(detail.posts[0]!.scoreHistory.length, 1);
      assert.equal(detail.posts[0]!.scoreHistory[0]!.score, 0.5);
      assert.equal(detail.posts[0]!.metricHistory.length, 1);
    });
  });

  it("an Asset with no spec saved yet reports spec: null, never an empty object standing in for it", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const world = seedWorld(db);
      const ideaId = seedLibraryIdea(world);
      const assetId = await seedLibraryAsset(world, ideaId, "news-carousel", { status: "queued" });
      const detail = getAssetDetail(db, assetId)!;
      assert.equal(detail.spec, null);
      assert.deepEqual(detail.media, []);
      assert.deepEqual(detail.copyVariants, []);
      assert.deepEqual(detail.posts, []);
    });
  });
});

// ---------------------------------------------------------------------------
// buildQueueRows
// ---------------------------------------------------------------------------

describe("buildQueueRows — Run & queue state without reading JSON (AC6)", () => {
  it("classifies produced, parked, and failed Jobs correctly, joined out to readable Idea/Recipe/Brand names", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const world = seedWorld(db);

      const producedIdea = seedLibraryIdea(world, { title: "Produced one" });
      const producedAsset = await seedLibraryAsset(world, producedIdea, "news-carousel", { status: "produced" });
      seedLibraryJob(world, producedAsset, "done");

      const parkedIdea = seedLibraryIdea(world, { title: "Parked one" });
      const parkedAsset = await seedLibraryAsset(world, parkedIdea, "character-explainer-with-cast", { status: "in_production", pendingGate: "cast" });
      seedLibraryJob(world, parkedAsset, "awaiting_pick", { gate: "cast" });

      const failedIdea = seedLibraryIdea(world, { title: "Failed one" });
      const failedAsset = await seedLibraryAsset(world, failedIdea, "news-carousel", { status: "queued" });
      seedLibraryJob(world, failedAsset, "failed");

      const rows = buildQueueRows(db);
      const byTitle = new Map(rows.map((r) => [r.ideaTitle, r]));
      assert.equal(byTitle.get("Produced one")!.bucket, "produced");
      assert.equal(byTitle.get("Parked one")!.bucket, "parked");
      assert.equal(byTitle.get("Parked one")!.gate, "cast");
      assert.equal(byTitle.get("Failed one")!.bucket, "failed");
      assert.equal(byTitle.get("Produced one")!.brandSlug, world.brandSlug);
      assert.equal(byTitle.get("Produced one")!.recipeName, "News Carousel");
    });
  });
});

// ---------------------------------------------------------------------------
// buildFitPerformanceData
// ---------------------------------------------------------------------------

describe("buildFitPerformanceData — Fit Score vs Performance Score, never silently dropping the unscored (AC5)", () => {
  it("includes every fit-scored Idea, WITH or without a Performance Score — none silently dropped", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const world = seedWorld(db);

      const scoredIdea = seedLibraryIdea(world, { title: "Scored idea", fitScore: 0.8 });
      const scoredAsset = await seedLibraryAsset(world, scoredIdea, "news-carousel");
      seedLibraryPost(world, scoredAsset, { score: 0.5 });

      const unscoredIdea = seedLibraryIdea(world, { title: "Unscored idea", fitScore: 0.4 });
      await seedLibraryAsset(world, unscoredIdea, "news-carousel");

      const noFitIdea = seedLibraryIdea(world, { title: "No fit score at all" });
      // Deliberately no fitScore given — must be EXCLUDED (the chart's x-axis has nothing to plot it at).
      await seedLibraryAsset(world, noFitIdea, "news-carousel");

      const data = buildFitPerformanceData(db);
      assert.equal(data.points.length, 2, "the no-fit-score Idea is excluded; both fit-scored Ideas are present");
      const byTitle = new Map(data.points.map((p) => [p.ideaTitle, p]));
      assert.equal(byTitle.get("Scored idea")!.performanceScore, 0.5);
      assert.equal(byTitle.get("Unscored idea")!.performanceScore, undefined);
      assert.ok(!byTitle.has("No fit score at all"));
    });
  });
});

// ---------------------------------------------------------------------------
// countAllPosts
// ---------------------------------------------------------------------------

describe("countAllPosts", () => {
  it("counts every Post across every Asset", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const world = seedWorld(db);
      const ideaId = seedLibraryIdea(world);
      const assetId = await seedLibraryAsset(world, ideaId, "news-carousel");
      seedLibraryPost(world, assetId);
      assert.equal(countAllPosts(db), 1);
    });
  });
});

// ---------------------------------------------------------------------------
// The real-corpus proof (issue #210's own "prove it, don't assert it" requirement)
// ---------------------------------------------------------------------------

describe("against the REAL imported corpus — docs/import-reconciliation-2026-08-17.md's own counts", () => {
  it("2 Brands, 61 Ideas, 54 Assets, 66 Jobs, 7 Posts — read back through the SAME read model the Library serves", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const now = () => "2026-08-17T00:00:00.000Z";

      const planResult = await planImport({
        brandSlugs: ["mundotip", "straw-motion"],
        legacyAbsolutePrefix: LEGACY_ABSOLUTE_PREFIX,
        checkoutRoot: REPO_ROOT,
        now,
      });
      assert.ok(planResult.ok, `planImport refused: ${planResult.ok ? "" : planResult.problems.join("; ")}`);
      if (!planResult.ok) return;

      await executeImport(db, planResult.plan, now);
      await backfillHookTheme(db, { now });

      // Prove against the store layer directly first — the exact counts the reconciliation doc states.
      assert.equal(listAllIdeas(db).length, 61);
      assert.equal(listAllAssets(db).length, 54);
      assert.equal(listAllJobs(db).length, 66);
      assert.equal(listAllPosts(db).length, 7);

      // Now prove the SAME counts survive the read model's own join — the thing the Library screen
      // actually renders from. A join that silently drops a row (the exact failure mode issue #204's own
      // reconciliation report was built to catch) would show up here as a mismatch against the counts
      // just proven above.
      const libraryRows = buildLibraryIndex(db);
      assert.equal(libraryRows.length, 54, "buildLibraryIndex must carry every one of the 54 real Assets through the join");

      const queueRows = buildQueueRows(db);
      assert.equal(queueRows.length, 66, "buildQueueRows must carry every one of the 66 real Jobs through the join");

      assert.equal(countAllPosts(db), 7);

      // Every Idea is classified (issue #206's own AC, now proven end to end through THIS read model) —
      // no row is missing a hook_type/theme (the column is NOT NULL, but this proves the read model
      // surfaces it, not just the schema).
      assert.ok(libraryRows.every((r) => typeof r.hookType === "string" && r.hookType.length > 0));
      assert.ok(libraryRows.every((r) => typeof r.theme === "string" && r.theme.length > 0));

      // Every Post in the real corpus is currently UNSCORED (straw-motion's Page is brand-new — verified
      // directly against ledger.json: every posted Asset's performance_score is `undefined`). The read
      // model must say so honestly, never fabricate a number.
      assert.equal(libraryRows.filter((r) => r.bestPerformanceScore !== undefined).length, 0);

      // A COUNT surviving the join proves nothing about CONTENT surviving it (issue #204's own lesson —
      // its reconciliation balanced 61/61, 54/54, 66/66 while silently dropping all 7 real Post URLs,
      // exactly because URLs were never among the things counted; #240 exists solely to fix that). Read
      // the real 7 `post_url`s straight from straw-motion's own ledger.json — the source of truth, via
      // the SAME typed `loadFullIdeas` loader the importer itself reads through, never hand-parsed JSON —
      // and assert every one of them is still attached, verbatim, on the correct Asset, after the SQL
      // import AND after the read model's own join.
      const strawMotionLedgerIdeas = await loadFullIdeas(resolveBrand("straw-motion", join(REPO_ROOT, "data/brands")).ledger);
      const realPostUrls = new Set<string>();
      for (const idea of strawMotionLedgerIdeas) {
        for (const a of idea.assets) {
          if (a.post_url) realPostUrls.add(a.post_url);
        }
      }
      assert.equal(realPostUrls.size, 7, "sanity check on the ground truth itself: straw-motion's ledger carries exactly 7 real post_urls");

      // 1) Through `buildLibraryIndex` — what the Library screen (AC2) actually renders.
      const libraryPostUrls = new Set(libraryRows.flatMap((r) => r.posts.map((p) => p.postUrl)));
      assert.equal(libraryPostUrls.size, 7, "buildLibraryIndex must carry all 7 real Post URLs, not just 7 Post rows");
      for (const url of realPostUrls) {
        assert.ok(libraryPostUrls.has(url), `buildLibraryIndex dropped or mangled the real Post URL: ${url}`);
      }

      // 2) Through `getAssetDetail` — what the Asset page (AC4) actually renders, for every real posted
      // Asset (never just one sampled row — issue #204's own blind spot hid across every one of these 7).
      const postedRows = libraryRows.filter((r) => r.posts.length > 0);
      assert.equal(postedRows.length, 7, "exactly 7 real Assets carry a Post");
      const detailPostUrls = new Set<string>();
      for (const row of postedRows) {
        const detail = getAssetDetail(db, row.assetId)!;
        assert.ok(detail !== null, `getAssetDetail returned null for a posted Asset (${row.assetId})`);
        for (const post of detail.posts) {
          assert.ok(post.postUrl.startsWith("https://"), `getAssetDetail returned a non-URL postUrl: ${JSON.stringify(post.postUrl)}`);
          detailPostUrls.add(post.postUrl);
        }
      }
      assert.deepEqual(detailPostUrls, realPostUrls, "getAssetDetail's Post URLs must be EXACTLY the real 7 from ledger.json, not a subset/superset");

      // The SAME "count vs content" question, applied to the Production Spec join (AC4/AC7's own
      // "Specs side by side"): `hasSpec` is a BOOLEAN on the Library row — issue #212's own QA verdict
      // found this exact epic already burned by "verified a field was a boolean rather than true"
      // elsewhere. Prove a real Asset's `spec_json` is not just present (`hasSpec === true`) but carries
      // its actual real content through `getAssetDetail`'s join.
      // Every wired Recipe's Production Spec has a DIFFERENT shape (News Carousel's own top-level key is
      // "slides"; Character Explainer with Cast's is "character_concepts"/"clips"/"thumbnails"; News
      // Short Script's is "beats") — so this checks real, non-trivial content survived generically
      // (at least one own key, whose value is a non-empty array/string/object), not one hardcoded key
      // that would only hold for a single Recipe.
      const specRows = libraryRows.filter((r) => r.hasSpec);
      assert.ok(specRows.length > 0, "at least one real Asset must carry a saved Production Spec");
      for (const specRow of specRows) {
        const specDetail = getAssetDetail(db, specRow.assetId)!;
        assert.notEqual(specDetail.spec, null, `hasSpec=true for ${specRow.assetId} (${specRow.recipeSlug}) but getAssetDetail returned spec: null`);
        const spec = specDetail.spec as Record<string, unknown>;
        const hasRealContent = Object.entries(spec).some(([, value]) => {
          if (Array.isArray(value)) return value.length > 0;
          if (typeof value === "string") return value.length > 0;
          if (value !== null && typeof value === "object") return Object.keys(value).length > 0;
          return value !== undefined && value !== null;
        });
        assert.ok(
          hasRealContent,
          `hasSpec=true for ${specRow.assetId} (${specRow.recipeSlug}) but getAssetDetail's spec carries no real content: ${JSON.stringify(spec)}`,
        );
      }
    });
  });
});
