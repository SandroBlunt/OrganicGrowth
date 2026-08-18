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

interface TwoIdeaFixture {
  readonly dir: string;
  readonly ledgerPath: string;
}

/** Writes a temp ledger.json holding TWO genuinely distinct accepted Ideas — same Run, IDENTICAL title,
 *  DIFFERENT ids and DIFFERENT Briefs (real, different underlying stories, not a duplicate accept of one
 *  story) — the exact QA round-1 Defect 1 repro shape: "two Ideas in the same Run sharing a title". */
async function withCollisionFixture<T>(fn: (fixture: TwoIdeaFixture) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "og-sql-sync-collision-"));
  const ledgerPath = join(dir, "ledger.json");
  const brief1Path = join(dir, "idea-01.md");
  const brief2Path = join(dir, "idea-02.md");
  await writeFile(
    brief1Path,
    ["# Same Headline Twice", "", "## Hook concept", "The FIRST real story.", "", "## Source(s)", "- https://example.com/story-one"].join("\n"),
    "utf8",
  );
  await writeFile(
    brief2Path,
    ["# Same Headline Twice", "", "## Hook concept", "A SECOND, DIFFERENT real story.", "", "## Source(s)", "- https://example.com/story-two"].join(
      "\n",
    ),
    "utf8",
  );
  const ideas = [
    { id: "idea-01", status: "accepted", run: RUN_KEY, format: FORMAT_SLUG, title: "Same Headline Twice", brief_path: brief1Path },
    { id: "idea-02", status: "accepted", run: RUN_KEY, format: FORMAT_SLUG, title: "Same Headline Twice", brief_path: brief2Path },
  ];
  await writeFile(ledgerPath, JSON.stringify({ ideas }), "utf8");
  try {
    return await fn({ dir, ledgerPath });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
        assert.ok(outcome.jobs.every((j) => j.reason === "created"), "a brand-new job's reason is 'created' (issue #254 Defect 1)");

        const idea = getIdea(db, outcome.ideaId)!;
        assert.equal(idea.status, "accepted");
        assert.equal(idea.title, "A brand new headline");
        assert.equal(idea.brief.includes("A brand new headline"), true);
        assert.equal(idea.hookType, UNCLASSIFIED_HOOK_TYPE);
        assert.equal(idea.theme, UNCLASSIFIED_THEME);
        assert.equal(idea.fitScore, 0.82);
        assert.equal(idea.legacyRef, "idea-01", "the real, per-Brand-unique identity is stamped (migration 5, issue #254)");
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
        assert.equal(second.jobs[0]!.reason, "already-queued");

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
        // carrying the SAME legacyRef ("idea-01") the ledger fixture above describes — the real,
        // per-Brand-unique identity (migration 5, issue #254) `src/importer/execute.ts` stamps via its
        // own `ideaPlan.legacyId` — already `accepted`, with its Asset + job already `queued`, entirely
        // through the command surface, exactly like the real importer does.
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
            legacyRef: "idea-01",
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
        assert.equal(outcome.jobs[0]!.reason, "already-queued");
        assert.equal(listIdeasForRun(db, runId).length, 1, "still exactly one Idea row");
        assert.equal(listJobsForComposite(db, brandId, priorIdeaId, NEWS_CAROUSEL).length, 1, "still exactly one job");
      });
    });
  });
});

describe("syncAcceptToSql — QA round-1 Defect 1: identity is the ledger's own id, never title", () => {
  it("TWO DIFFERENT accepted Ideas sharing an IDENTICAL title each get their OWN Idea/Asset/Job row — never silently merged", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      seedBrandAndFormat(db);

      await withCollisionFixture(async ({ ledgerPath }) => {
        const first = await syncAcceptToSql("idea-01", [NEWS_CAROUSEL], { db, brand: BRAND_SLUG, ledgerPath, now: () => NOW });
        const second = await syncAcceptToSql("idea-02", [NEWS_CAROUSEL], {
          db,
          brand: BRAND_SLUG,
          ledgerPath,
          now: () => "2026-08-18T10:00:00.000Z",
        });

        // The bug this repairs: round-1 code resolved identity by (run_id, title), so `second` would
        // resolve to the SAME sqlIdeaId as `first`, `second.ideaCreated` would be `false`, and
        // `second.jobs[0].synced` would be `false` — indistinguishable from a legitimate re-accept.
        assert.notEqual(second.ideaId, first.ideaId, "two DIFFERENT ledger Ideas must NEVER resolve to the same SQL row");
        assert.equal(first.ideaCreated, true);
        assert.equal(second.ideaCreated, true, "the second Idea gets its OWN new row — never a silent merge into the first");
        assert.equal(first.jobs[0]!.synced, true);
        assert.equal(first.jobs[0]!.reason, "created");
        assert.equal(second.jobs[0]!.synced, true, "the second Idea's job is genuinely created, never silently dropped");
        assert.equal(second.jobs[0]!.reason, "created");

        const brandId = getBrandBySlug(db, BRAND_SLUG)!.id;
        const runId = getIdea(db, first.ideaId)!.runId;
        assert.equal(listIdeasForRun(db, runId).length, 2, "BOTH Ideas keep their own row — none is dropped");
        assert.equal(listJobsForComposite(db, brandId, first.ideaId, NEWS_CAROUSEL).length, 1);
        assert.equal(listJobsForComposite(db, brandId, second.ideaId, NEWS_CAROUSEL).length, 1);

        const firstIdea = getIdea(db, first.ideaId)!;
        const secondIdea = getIdea(db, second.ideaId)!;
        assert.equal(firstIdea.title, "Same Headline Twice");
        assert.equal(secondIdea.title, "Same Headline Twice");
        assert.equal(firstIdea.legacyRef, "idea-01");
        assert.equal(secondIdea.legacyRef, "idea-02");
        assert.match(firstIdea.brief, /FIRST real story/);
        assert.match(secondIdea.brief, /SECOND, DIFFERENT real story/);
      });
    });
  });

  it("re-syncing idea-02 again (after the collision above) reuses ONLY idea-02's own row, never idea-01's", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      seedBrandAndFormat(db);

      await withCollisionFixture(async ({ ledgerPath }) => {
        const first = await syncAcceptToSql("idea-01", [NEWS_CAROUSEL], { db, brand: BRAND_SLUG, ledgerPath, now: () => NOW });
        const second = await syncAcceptToSql("idea-02", [NEWS_CAROUSEL], { db, brand: BRAND_SLUG, ledgerPath, now: () => "2026-08-18T10:00:00.000Z" });
        const secondAgain = await syncAcceptToSql("idea-02", [NEWS_CAROUSEL], {
          db,
          brand: BRAND_SLUG,
          ledgerPath,
          now: () => "2026-08-18T11:00:00.000Z",
        });

        assert.equal(secondAgain.ideaId, second.ideaId, "re-syncing idea-02 reuses idea-02's OWN row");
        assert.notEqual(secondAgain.ideaId, first.ideaId, "never idea-01's row, even though they share a title");
        assert.equal(secondAgain.ideaCreated, false);
        assert.equal(secondAgain.jobs[0]!.synced, false, "no second job for idea-02's already-synced Recipe");
        assert.equal(secondAgain.jobs[0]!.reason, "already-queued");

        const runId = getIdea(db, first.ideaId)!.runId;
        assert.equal(listIdeasForRun(db, runId).length, 2, "still exactly two Idea rows — the re-sync created no third");
      });
    });
  });

  it("KNOWN LIMIT: an importer-carried row from BEFORE migration 5 (no legacy_ref recorded) is not found by a later re-sync — a fresh Idea row is created instead, never a silent merge", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, formatId } = seedBrandAndFormat(db);

      await withFixture(async ({ ledgerPath }) => {
        // A row exactly as it would look if it were imported by the ORIGINAL one-shot importer run
        // (issue #204, 2026-08-17) — BEFORE this migration existed, so it carries no legacyRef at all.
        const runId = createRun(db, { brandId, formatId, runKey: RUN_KEY, cadence: "weekly", startedAt: NOW }, () => NOW);
        const preMigrationIdeaId = createIdea(
          db,
          {
            runId,
            brandId,
            formatId,
            title: "A brand new headline", // matches the ledger fixture's own title
            brief: "Whatever the original 2026-08-17 import carried.",
            hookType: UNCLASSIFIED_HOOK_TYPE,
            theme: UNCLASSIFIED_THEME,
            // Deliberately NO legacyRef — this is what every row imported before migration 5 looks like.
          },
          () => NOW,
        );

        const outcome = await syncAcceptToSql("idea-01", [NEWS_CAROUSEL], { db, brand: BRAND_SLUG, ledgerPath, now: () => "2026-08-18T11:00:00.000Z" });

        // Honest, documented residual limit (see handoff.md Known Limits): identity is now legacy_ref,
        // so a pre-migration-5 row (legacy_ref IS NULL) is never found by this lookup. This creates a
        // SECOND row rather than reusing the pre-migration one — never a silent merge (this ticket's own
        // bar), but a real duplicate an Operator would need to reconcile by hand for any Idea that was
        // BOTH imported before this migration AND later re-synced through this path.
        assert.notEqual(outcome.ideaId, preMigrationIdeaId, "the pre-migration-5 row (no legacy_ref) is not matched");
        assert.equal(outcome.ideaCreated, true);
        assert.equal(listIdeasForRun(db, runId).length, 2, "two rows now exist for what a human would call ONE real Idea");
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
