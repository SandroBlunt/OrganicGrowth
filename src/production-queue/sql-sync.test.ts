/**
 * Tests for `syncAcceptToSql` (issue #254) — proves accepting an Idea actually lands rows the
 * unattended worker's `findNextQueuedJob` can see, and that a re-accept (of a brand-new Idea, OR one the
 * one-shot importer already carried) never duplicates the Idea/Asset/Job rows. In-process against a
 * real, throwaway SQLite file (`withTempDb`), never `:memory:` — matching this repo's own SQL testing
 * convention.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DatabaseSync } from "node:sqlite";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { createBrand, getBrandBySlug } from "../brand/store.ts";
import { createFormat } from "../format/store.ts";
import { createRun } from "../run/store.ts";
import { getIdea, listIdeasForRun } from "../idea/store.ts";
import { getAssetByRecipe, createIdea, recordReviewDecision, saveAsset, enqueueJob } from "../command-surface/index.ts";
import { listJobsForComposite } from "./job-store.ts";
import { UNCLASSIFIED_HOOK_TYPE } from "../vocabulary/hook-type.ts";
import { UNCLASSIFIED_THEME } from "../vocabulary/theme.ts";

import { syncAcceptToSql } from "./sql-sync.ts";

const BRAND_SLUG = "straw-motion";
const FORMAT_SLUG = "unhypped-news";
const RUN_KEY = "2026-W33";
const NOW = "2026-08-18T09:00:00.000Z";
const NEWS_CAROUSEL = "news-carousel"; // zero gates
const CHARACTER_RECIPE = "character-explainer-with-cast"; // one gate: "cast"

interface Fixture {
  readonly dir: string;
  readonly ledgerPath: string;
  readonly briefPath: string;
}

/** Writes a temp ledger.json (one Idea, `accepted`) + its Brief markdown, mirroring what
 *  `/review-ideas` leaves on disk after Gate 1 — but entirely in a throwaway temp dir. */
async function withFixture<T>(
  fn: (fixture: Fixture) => Promise<T>,
  overrides: Record<string, unknown> = {},
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "og-sql-sync-"));
  const ledgerPath = join(dir, "ledger.json");
  const briefPath = join(dir, "idea-01.md");
  await writeFile(
    briefPath,
    [
      "# A brand new headline",
      "",
      "## Hook concept",
      "A hook.",
      "",
      "## Source(s)",
      "- https://example.com/real-source",
    ].join("\n"),
    "utf8",
  );
  const idea = {
    id: "idea-01",
    status: "accepted",
    run: RUN_KEY,
    format: FORMAT_SLUG,
    title: "A brand new headline",
    brief_path: briefPath,
    fit_score: 0.82,
    ...overrides,
  };
  await writeFile(ledgerPath, JSON.stringify({ ideas: [idea] }), "utf8");
  try {
    return await fn({ dir, ledgerPath, briefPath });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Seeds a Brand + Format row directly via the command surface / stores, mirroring what the one-shot
 *  importer (or an earlier accept) would already have committed. */
function seedBrandAndFormat(db: DatabaseSync): { readonly brandId: string; readonly formatId: string } {
  const brandId = createBrand(db, { slug: BRAND_SLUG, name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
  const formatId = createFormat(db, { brandId, slug: FORMAT_SLUG, name: "Unhypped News", voice: "plain", cadence: "weekly" });
  return { brandId, formatId };
}

describe("syncAcceptToSql — creates the Idea/Asset/Job rows a brand-new accept needs", () => {
  it("creates the Idea row, one Asset per Recipe, and one queued job per Recipe (AC1)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      seedBrandAndFormat(db);

      await withFixture(async ({ ledgerPath }) => {
        const outcome = await syncAcceptToSql("idea-01", [NEWS_CAROUSEL, CHARACTER_RECIPE], {
          db,
          brand: BRAND_SLUG,
          ledgerPath,
          now: () => NOW,
        });

        assert.equal(outcome.ideaCreated, true);
        assert.deepEqual(
          outcome.jobs.map((j) => j.recipe).sort(),
          [CHARACTER_RECIPE, NEWS_CAROUSEL].sort(),
        );
        assert.ok(outcome.jobs.every((j) => j.synced === true));

        const idea = getIdea(db, outcome.ideaId)!;
        assert.equal(idea.status, "accepted");
        assert.equal(idea.title, "A brand new headline");
        assert.equal(idea.brief.includes("A brand new headline"), true);
        assert.equal(idea.hookType, UNCLASSIFIED_HOOK_TYPE);
        assert.equal(idea.theme, UNCLASSIFIED_THEME);
        assert.equal(idea.fitScore, 0.82);
        assert.deepEqual([...idea.sourceUrls], ["https://example.com/real-source"]);

        const carouselAsset = await getAssetByRecipe(db, outcome.ideaId, NEWS_CAROUSEL);
        const characterAsset = await getAssetByRecipe(db, outcome.ideaId, CHARACTER_RECIPE);
        assert.equal(carouselAsset!.status, "queued");
        assert.equal(characterAsset!.status, "queued");

        const syncedBrandId = getBrandBySlug(db, BRAND_SLUG)!.id;
        const carouselJobs = listJobsForComposite(db, syncedBrandId, outcome.ideaId, NEWS_CAROUSEL);
        const characterJobs = listJobsForComposite(db, syncedBrandId, outcome.ideaId, CHARACTER_RECIPE);
        assert.equal(carouselJobs.length, 1);
        assert.equal(carouselJobs[0]!.gate, undefined, "a zero-gate Recipe's job carries no gate");
        assert.equal(carouselJobs[0]!.status, "queued");
        assert.equal(characterJobs.length, 1);
        assert.equal(characterJobs[0]!.gate, "cast");
        assert.equal(characterJobs[0]!.idempotencyKey, `${BRAND_SLUG}::idea-01::${CHARACTER_RECIPE}`);
      });
    });
  });

  it("is idempotent: a second call for the SAME ledger Idea reuses the Idea row and does not double-enqueue (AC2)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      seedBrandAndFormat(db);

      await withFixture(async ({ ledgerPath }) => {
        const first = await syncAcceptToSql("idea-01", [NEWS_CAROUSEL], { db, brand: BRAND_SLUG, ledgerPath, now: () => NOW });
        const second = await syncAcceptToSql("idea-01", [NEWS_CAROUSEL], { db, brand: BRAND_SLUG, ledgerPath, now: () => "2026-08-18T10:00:00.000Z" });

        assert.equal(second.ideaId, first.ideaId, "the SAME Idea row is reused, never a duplicate");
        assert.equal(second.ideaCreated, false);
        assert.equal(second.jobs[0]!.synced, false, "no second job for an already-synced Recipe");

        const brandId = getBrandBySlug(db, BRAND_SLUG)!.id;
        assert.equal(listIdeasForRun(db, getIdea(db, first.ideaId)!.runId).length, 1, "exactly one Idea row exists");
        assert.equal(listJobsForComposite(db, brandId, first.ideaId, NEWS_CAROUSEL).length, 1, "exactly one job exists");
      });
    });
  });

  it("does not duplicate a job an EARLIER importer-style write already carried for this ledger Idea (AC3)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, formatId } = seedBrandAndFormat(db);

      await withFixture(async ({ ledgerPath }) => {
        // Mimic what the one-shot importer (or an earlier real accept) already committed: an Idea row
        // with the EXACT SAME (run, title) the ledger fixture above describes, already `accepted`, with
        // its Asset + job already `queued` — entirely through the command surface, exactly like the real
        // importer (`src/importer/execute.ts`) does.
        const runId = createRun(db, { brandId, formatId, runKey: RUN_KEY, cadence: "weekly", startedAt: NOW }, () => NOW);
        const priorIdeaId = createIdea(
          db,
          {
            runId,
            brandId,
            formatId,
            title: "A brand new headline", // matches the ledger fixture's own title
            brief: "Whatever the importer originally carried.",
            hookType: UNCLASSIFIED_HOOK_TYPE,
            theme: UNCLASSIFIED_THEME,
          },
          () => NOW,
        );
        recordReviewDecision(db, priorIdeaId, { outcome: "accepted", recipes: [{ recipe: NEWS_CAROUSEL, chosen: true }] }, () => NOW);
        await saveAsset(db, priorIdeaId, NEWS_CAROUSEL, { status: "queued" });
        const priorAsset = await getAssetByRecipe(db, priorIdeaId, NEWS_CAROUSEL);
        enqueueJob(db, { assetId: priorAsset!.id, brandId, idempotencyKey: `${BRAND_SLUG}::idea-01::${NEWS_CAROUSEL}` }, () => NOW);

        // A re-accept of the SAME ledger Idea (e.g. run-pipeline.ts's stranded-idea recovery) must find
        // the importer's own row, not create a second one, and must not add a second job.
        const outcome = await syncAcceptToSql("idea-01", [NEWS_CAROUSEL], { db, brand: BRAND_SLUG, ledgerPath, now: () => "2026-08-18T11:00:00.000Z" });

        assert.equal(outcome.ideaId, priorIdeaId, "the pre-existing (importer-style) Idea row is reused");
        assert.equal(outcome.ideaCreated, false);
        assert.equal(outcome.jobs[0]!.synced, false, "the pre-existing job is not duplicated");
        assert.equal(listIdeasForRun(db, runId).length, 1, "still exactly one Idea row");
        assert.equal(listJobsForComposite(db, brandId, priorIdeaId, NEWS_CAROUSEL).length, 1, "still exactly one job");
      });
    });
  });
});

describe("syncAcceptToSql — loud failure (issue #254's own bar: never a silent no-op)", () => {
  it("throws, naming the Brand slug, when the Brand row is missing", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      // Deliberately NO createBrand call — the exact scenario the ticket asks to break on purpose.

      await withFixture(async ({ ledgerPath }) => {
        await assert.rejects(
          () => syncAcceptToSql("idea-01", [NEWS_CAROUSEL], { db, brand: BRAND_SLUG, ledgerPath, now: () => NOW }),
          (err: unknown) => {
            assert.ok(err instanceof Error);
            assert.match(err.message, /no Brand row for slug "straw-motion"/);
            return true;
          },
        );
      });
    });
  });

  it("throws, naming the Format slug, when the Format row is missing", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      createBrand(db, { slug: BRAND_SLUG, name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      // Deliberately no createFormat call.

      await withFixture(async ({ ledgerPath }) => {
        await assert.rejects(
          () => syncAcceptToSql("idea-01", [NEWS_CAROUSEL], { db, brand: BRAND_SLUG, ledgerPath, now: () => NOW }),
          (err: unknown) => {
            assert.ok(err instanceof Error);
            assert.match(err.message, /no Format row for Brand "straw-motion" \/ Format "unhypped-news"/);
            return true;
          },
        );
      });
    });
  });

  it("throws for an Idea missing from the ledger", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      seedBrandAndFormat(db);
      await withFixture(async ({ ledgerPath }) => {
        await assert.rejects(() => syncAcceptToSql("idea-ghost", [NEWS_CAROUSEL], { db, brand: BRAND_SLUG, ledgerPath, now: () => NOW }));
      });
    });
  });

  it("throws for an Idea with no recorded run", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      seedBrandAndFormat(db);
      await withFixture(
        async ({ ledgerPath }) => {
          await assert.rejects(
            () => syncAcceptToSql("idea-01", [NEWS_CAROUSEL], { db, brand: BRAND_SLUG, ledgerPath, now: () => NOW }),
            /carries no "run"/,
          );
        },
        { run: undefined },
      );
    });
  });

  it("throws for an Idea whose Brief cannot be found", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      seedBrandAndFormat(db);
      await withFixture(
        async ({ ledgerPath }) => {
          await assert.rejects(
            () => syncAcceptToSql("idea-01", [NEWS_CAROUSEL], { db, brand: BRAND_SLUG, ledgerPath, now: () => NOW }),
            /could not read Idea "idea-01"'s Brief/,
          );
        },
        { brief_path: "/no/such/file/idea-01.md" },
      );
    });
  });
});
