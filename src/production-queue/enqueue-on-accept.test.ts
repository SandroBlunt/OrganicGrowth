import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyQueue, enqueue } from "./queue.ts";
import { loadQueue } from "./store.ts";
import { planEnqueue, enqueueOnAccept } from "./enqueue-on-accept.ts";
import type { LedgerIdea } from "../ledger/ledger.ts";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { createBrand, getBrandBySlug } from "../brand/store.ts";
import { createFormat } from "../format/store.ts";
import { listJobsForComposite } from "./job-store.ts";
import { getIdea, listIdeasForRun } from "../idea/store.ts";
import { createIdea as createIdeaRow } from "../command-surface/index.ts";
import { createRun as createRunRow } from "../run/store.ts";
import { UNCLASSIFIED_HOOK_TYPE } from "../vocabulary/hook-type.ts";
import { UNCLASSIFIED_THEME } from "../vocabulary/theme.ts";

const NOW = "2026-06-05T13:00:00.000Z";
const BRAND = "mundotip";
const BRAND_B = "otherbrand";
const RECIPE = "character-explainer-with-cast";
const RECIPE_2 = "carousel"; // not a wired Recipe — used to exercise the unwired-recipe defensive path
const UNWIRED = "unwired-slug";

const IDEAS: LedgerIdea[] = [
  { id: "idea-accepted", status: "accepted" },
  { id: "idea-rejected", status: "rejected" },
  { id: "idea-suggested", status: "suggested" },
];

describe("planEnqueue (pure policy: accepted-only + no-duplicate + wired-only + brand/recipe stamp)", () => {
  it("enqueues an accepted Idea's chosen Recipe as one queued job", () => {
    const r = planEnqueue(IDEAS, emptyQueue(), "idea-accepted", NOW, BRAND, [RECIPE]);
    assert.equal(r.enqueued, true);
    assert.equal(r.state.jobs.length, 1);
    assert.equal(r.state.jobs[0]!.idea_id, "idea-accepted");
    assert.equal(r.state.jobs[0]!.recipe, RECIPE);
    assert.equal(r.state.jobs[0]!.gate, "cast");
    assert.equal(r.state.jobs[0]!.status, "queued");
    assert.deepEqual(r.outcomes, [{ recipe: RECIPE, enqueued: true }]);
  });

  it("stamps the correct brand on the enqueued job (AC2)", () => {
    const r = planEnqueue(IDEAS, emptyQueue(), "idea-accepted", NOW, BRAND_B, [RECIPE]);
    assert.equal(r.enqueued, true);
    assert.equal(r.state.jobs[0]!.brand, BRAND_B);
  });

  it("enqueues ONE JOB PER (brand, idea, recipe) for a MULTI-Recipe chosen set — the second Recipe is NOT dropped as a duplicate (issue #56 AC1)", () => {
    const r = planEnqueue(IDEAS, emptyQueue(), "idea-accepted", NOW, BRAND, [RECIPE, RECIPE]);
    // NOTE: a real Recipe registry has exactly one wired entry today, so we cannot enqueue two
    // DIFFERENT wired Recipes end to end here — the queue-level no-dedupe-across-recipes guarantee is
    // proven directly against `queue.ts`'s `enqueue` (queue.test.ts). This test proves the SAME Recipe
    // requested twice in one call is idempotent (no duplicate job), which is the flip side of the same
    // guard: `planEnqueue` must not create two jobs for one (brand, idea, recipe) triple.
    assert.equal(r.state.jobs.length, 1);
    assert.deepEqual(r.outcomes, [
      { recipe: RECIPE, enqueued: true },
      { recipe: RECIPE, enqueued: false, reason: "already-queued" },
    ]);
  });

  it("an existing job for a DIFFERENT Recipe of the same Idea does not block enqueuing this Recipe (issue #56 AC1)", () => {
    // Seed the queue with an existing job for a DIFFERENT (unrelated) Recipe of the same Idea, using
    // the pure `enqueue()` directly (it never validates wiring) so this test is registry-independent.
    const existingOtherRecipe = enqueue(emptyQueue(), "idea-accepted", "2026-06-05T09:00:00.000Z", BRAND, RECIPE_2, "cast");
    const r = planEnqueue(IDEAS, existingOtherRecipe, "idea-accepted", NOW, BRAND, [RECIPE]);
    assert.equal(r.enqueued, true, "the wired Recipe's job must not be masked by the other Recipe's existing job");
    assert.equal(r.state.jobs.length, 2);
    const recipes = r.state.jobs.map((j) => j.recipe).sort();
    assert.deepEqual(recipes, [RECIPE, RECIPE_2].sort());
  });

  it("refuses an unwired Recipe slug defensively — never fabricates a gate for an unknown Recipe", () => {
    const r = planEnqueue(IDEAS, emptyQueue(), "idea-accepted", NOW, BRAND, [UNWIRED]);
    assert.equal(r.enqueued, false);
    assert.equal(r.state.jobs.length, 0);
    assert.deepEqual(r.outcomes, [{ recipe: UNWIRED, enqueued: false, reason: "unwired-recipe" }]);
  });

  it("enqueues the wired Recipe even when an unwired one is requested alongside it", () => {
    const r = planEnqueue(IDEAS, emptyQueue(), "idea-accepted", NOW, BRAND, [RECIPE, UNWIRED]);
    assert.equal(r.enqueued, true);
    assert.equal(r.state.jobs.length, 1);
    assert.equal(r.state.jobs[0]!.recipe, RECIPE);
    assert.deepEqual(r.outcomes, [
      { recipe: RECIPE, enqueued: true },
      { recipe: UNWIRED, enqueued: false, reason: "unwired-recipe" },
    ]);
  });

  it("refuses a rejected Idea — no job is produced for any requested Recipe", () => {
    const r = planEnqueue(IDEAS, emptyQueue(), "idea-rejected", NOW, BRAND, [RECIPE]);
    assert.equal(r.enqueued, false);
    assert.equal(r.outcomes[0]!.reason, "not-accepted");
    assert.equal(r.state.jobs.length, 0);
  });

  it("refuses a still-suggested Idea", () => {
    const r = planEnqueue(IDEAS, emptyQueue(), "idea-suggested", NOW, BRAND, [RECIPE]);
    assert.equal(r.enqueued, false);
    assert.equal(r.outcomes[0]!.reason, "not-accepted");
    assert.equal(r.state.jobs.length, 0);
  });

  it("refuses an unknown Idea", () => {
    const r = planEnqueue(IDEAS, emptyQueue(), "idea-ghost", NOW, BRAND, [RECIPE]);
    assert.equal(r.enqueued, false);
    assert.equal(r.outcomes[0]!.reason, "unknown-idea");
  });

  it("does not duplicate when the accepted Idea's Recipe already has a job", () => {
    const existing = enqueue(emptyQueue(), "idea-accepted", "2026-06-05T10:00:00.000Z", BRAND, RECIPE, "cast");
    const r = planEnqueue(IDEAS, existing, "idea-accepted", NOW, BRAND, [RECIPE]);
    assert.equal(r.enqueued, false);
    assert.equal(r.outcomes[0]!.reason, "already-queued");
    assert.equal(r.state.jobs.length, 1);
  });

  it("a second Brand's identical Idea id is NOT 'already-queued' — both enqueue (C6)", () => {
    // One Brand already holds idea-accepted; another Brand accepting the same id must still enqueue.
    const existing = enqueue(emptyQueue(), "idea-accepted", "2026-06-05T10:00:00.000Z", BRAND, RECIPE, "cast");
    const r = planEnqueue(IDEAS, existing, "idea-accepted", NOW, BRAND_B, [RECIPE]);
    assert.equal(r.enqueued, true, "the second Brand's job must not be masked by the first");
    assert.equal(r.state.jobs.length, 2);
    assert.equal(r.state.jobs[1]!.brand, BRAND_B);
  });

  it("re-enqueues an accepted Idea's Recipe whose only prior job FAILED (C4)", () => {
    const withFailed = {
      jobs: [
        { idea_id: "idea-accepted", brand: BRAND, recipe: RECIPE, gate: "cast" as const, status: "failed" as const, enqueued_at: "2026-06-05T09:00:00.000Z" },
      ],
    };
    const r = planEnqueue(IDEAS, withFailed, "idea-accepted", NOW, BRAND, [RECIPE]);
    assert.equal(r.enqueued, true, "a failed job must not permanently block re-enqueue");
    assert.equal(r.state.jobs.filter((j) => j.status === "queued").length, 1);
  });

  it("an empty chosen-Recipe list enqueues nothing (the Operator declined every offered Recipe)", () => {
    const r = planEnqueue(IDEAS, emptyQueue(), "idea-accepted", NOW, BRAND, []);
    assert.equal(r.enqueued, false);
    assert.deepEqual(r.outcomes, []);
    assert.equal(r.state.jobs.length, 0);
  });
});

async function withTempFiles<T>(
  fn: (ledgerPath: string, queuePath: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "og-accept-"));
  const ledgerPath = join(dir, "ledger.json");
  const queuePath = join(dir, "queue.json");
  await writeFile(ledgerPath, JSON.stringify({ ideas: IDEAS }), "utf8");
  try {
    return await fn(ledgerPath, queuePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("enqueueOnAccept (orchestration shell, real files)", () => {
  it("persists exactly one job with the brand + recipe when an accepted Idea's Recipe is enqueued (AC2)", async () => {
    await withTempFiles(async (ledgerPath, queuePath) => {
      const r = await enqueueOnAccept("idea-accepted", BRAND, [RECIPE], {
        ledgerPath,
        queuePath,
        now: () => NOW,
      });
      assert.equal(r.enqueued, true);
      const onDisk = await loadQueue(queuePath);
      assert.equal(onDisk.jobs.length, 1);
      assert.equal(onDisk.jobs[0]!.idea_id, "idea-accepted");
      assert.equal(onDisk.jobs[0]!.brand, BRAND);
      assert.equal(onDisk.jobs[0]!.recipe, RECIPE);
      assert.equal(onDisk.jobs[0]!.enqueued_at, NOW);
    });
  });

  it("is idempotent on re-accept: a second call with the same Recipe adds no job", async () => {
    await withTempFiles(async (ledgerPath, queuePath) => {
      await enqueueOnAccept("idea-accepted", BRAND, [RECIPE], { ledgerPath, queuePath, now: () => NOW });
      const second = await enqueueOnAccept("idea-accepted", BRAND, [RECIPE], {
        ledgerPath,
        queuePath,
        now: () => "2026-06-05T14:00:00.000Z",
      });
      assert.equal(second.enqueued, false);
      assert.equal(second.outcomes[0]!.reason, "already-queued");
      const onDisk = await loadQueue(queuePath);
      assert.equal(onDisk.jobs.length, 1);
    });
  });

  it("never writes a queue file for a rejected Idea", async () => {
    await withTempFiles(async (ledgerPath, queuePath) => {
      const r = await enqueueOnAccept("idea-rejected", BRAND, [RECIPE], { ledgerPath, queuePath, now: () => NOW });
      assert.equal(r.enqueued, false);
      // queue file was never created because nothing was enqueued
      const onDisk = await loadQueue(queuePath);
      assert.deepEqual(onDisk, emptyQueue());
    });
  });

  it("never writes a queue file when the chosen-Recipe list is empty", async () => {
    await withTempFiles(async (ledgerPath, queuePath) => {
      const r = await enqueueOnAccept("idea-accepted", BRAND, [], { ledgerPath, queuePath, now: () => NOW });
      assert.equal(r.enqueued, false);
      const onDisk = await loadQueue(queuePath);
      assert.deepEqual(onDisk, emptyQueue());
    });
  });
});

// ---------------------------------------------------------------------------
// enqueueOnAccept — OPTIONAL SQL sync (issue #254)
// ---------------------------------------------------------------------------

const SQL_FORMAT = "unhypped-news";
const SQL_RUN = "2026-W33";

/** A fuller ledger fixture — the SQL sync needs `run`/`format`/`title`/`brief_path`, which the plain
 *  `withTempFiles` fixture above deliberately omits (it only exercises the file-queue policy). Writes a
 *  real Brief file alongside the ledger so `syncAcceptToSql`'s Brief lookup succeeds. */
async function withSqlFixture<T>(fn: (ledgerPath: string, queuePath: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "og-accept-sql-"));
  const ledgerPath = join(dir, "ledger.json");
  const queuePath = join(dir, "queue.json");
  const briefPath = join(dir, "idea-01.md");
  await writeFile(briefPath, "# A headline\n\n## Source(s)\n- https://example.com/source\n", "utf8");
  const idea = {
    id: "idea-accepted",
    status: "accepted",
    run: SQL_RUN,
    format: SQL_FORMAT,
    title: "A headline",
    brief_path: briefPath,
  };
  await writeFile(ledgerPath, JSON.stringify({ ideas: [idea] }), "utf8");
  try {
    return await fn(ledgerPath, queuePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("enqueueOnAccept — OPTIONAL SQL sync (issue #254)", () => {
  it("omitting options.db leaves behavior byte-for-byte unchanged (no SQL touched)", async () => {
    await withTempFiles(async (ledgerPath, queuePath) => {
      const r = await enqueueOnAccept("idea-accepted", BRAND, [RECIPE], { ledgerPath, queuePath, now: () => NOW });
      assert.equal(r.enqueued, true);
      assert.equal(r.sql, undefined, "no db was given, so no sql field is present");
    });
  });

  it("with options.db, the file queue is written EXACTLY as before AND the SQL job table gains the same job", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const brandId = createBrand(db, { slug: BRAND, name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      createFormat(db, { brandId, slug: SQL_FORMAT, name: "Unhypped News", voice: "plain", cadence: "weekly" });

      await withSqlFixture(async (ledgerPath, queuePath) => {
        const r = await enqueueOnAccept("idea-accepted", BRAND, [RECIPE], { ledgerPath, queuePath, db, now: () => NOW });

        assert.equal(r.enqueued, true);
        const onDisk = await loadQueue(queuePath);
        assert.equal(onDisk.jobs.length, 1, "the file queue is written exactly as before this ticket");
        assert.equal(onDisk.jobs[0]!.recipe, RECIPE);

        assert.ok(r.sql, "the SQL sync outcome is reported");
        assert.equal(r.sql!.jobs.length, 1);
        assert.equal(r.sql!.jobs[0]!.synced, true);
        assert.equal(r.sql!.jobs[0]!.reason, "created");

        const jobs = listJobsForComposite(db, getBrandBySlug(db, BRAND)!.id, r.sql!.ideaId, RECIPE);
        assert.equal(jobs.length, 1, "the SQL job table gained exactly the expected row");
        assert.equal(jobs[0]!.status, "queued");
      });
    });
  });

  it("a re-accept (already-queued in the file) touches SQL for nothing — no sql field at all", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const brandId = createBrand(db, { slug: BRAND, name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      createFormat(db, { brandId, slug: SQL_FORMAT, name: "Unhypped News", voice: "plain", cadence: "weekly" });

      await withSqlFixture(async (ledgerPath, queuePath) => {
        await enqueueOnAccept("idea-accepted", BRAND, [RECIPE], { ledgerPath, queuePath, db, now: () => NOW });
        const second = await enqueueOnAccept("idea-accepted", BRAND, [RECIPE], {
          ledgerPath,
          queuePath,
          db,
          now: () => "2026-08-18T12:00:00.000Z",
        });
        assert.equal(second.enqueued, false);
        assert.equal(second.sql, undefined, "nothing newly enqueued in the file queue, so SQL is never touched again");
      });
    });
  });

  it("a SQL failure is LOUD: it throws, but only AFTER the file queue was already saved (never silent, never blocks the file write)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      // Deliberately no createBrand/createFormat — the SQL sync WILL fail.

      await withSqlFixture(async (ledgerPath, queuePath) => {
        await assert.rejects(
          () => enqueueOnAccept("idea-accepted", BRAND, [RECIPE], { ledgerPath, queuePath, db, now: () => NOW }),
          /no Brand row for slug "mundotip"/,
        );

        // The file queue was written BEFORE the SQL attempt — a SQL problem never blocks the attended,
        // file-based pipeline this ticket promises not to change.
        const onDisk = await loadQueue(queuePath);
        assert.equal(onDisk.jobs.length, 1, "the file queue still gained its job despite the SQL failure");
        assert.equal(onDisk.jobs[0]!.recipe, RECIPE);
      });
    });
  });

  it("QA round-1 Defect 1, reproduced at the REAL entry point: two DIFFERENT accepted Ideas sharing an IDENTICAL title each get their own SQL Idea/Job — never silently merged", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const brandId = createBrand(db, { slug: BRAND, name: "Mundotip", timezone: "UTC", mediaRoot: "data/brands/mundotip" });
      createFormat(db, { brandId, slug: SQL_FORMAT, name: "Unhypped News", voice: "plain", cadence: "weekly" });

      const dir = await mkdtemp(join(tmpdir(), "og-accept-sql-collision-"));
      const ledgerPath = join(dir, "ledger.json");
      const queuePath = join(dir, "queue.json");
      const brief1Path = join(dir, "idea-01.md");
      const brief2Path = join(dir, "idea-02.md");
      try {
        await writeFile(brief1Path, "# Same Headline Twice\n\n## Source(s)\n- https://example.com/story-one\n", "utf8");
        await writeFile(brief2Path, "# Same Headline Twice\n\n## Source(s)\n- https://example.com/story-two\n", "utf8");
        const ideas = [
          { id: "idea-01", status: "accepted", run: SQL_RUN, format: SQL_FORMAT, title: "Same Headline Twice", brief_path: brief1Path },
          { id: "idea-02", status: "accepted", run: SQL_RUN, format: SQL_FORMAT, title: "Same Headline Twice", brief_path: brief2Path },
        ];
        await writeFile(ledgerPath, JSON.stringify({ ideas }), "utf8");

        const first = await enqueueOnAccept("idea-01", BRAND, [RECIPE], { ledgerPath, queuePath, db, now: () => NOW });
        const second = await enqueueOnAccept("idea-02", BRAND, [RECIPE], { ledgerPath, queuePath, db, now: () => "2026-08-18T12:00:00.000Z" });

        assert.ok(first.sql, "idea-01's SQL sync ran");
        assert.ok(second.sql, "idea-02's SQL sync ALSO ran — never silently skipped");
        assert.notEqual(second.sql!.ideaId, first.sql!.ideaId, "two DIFFERENT ledger Ideas must never resolve to the same SQL row");
        assert.equal(second.sql!.ideaCreated, true, "idea-02 gets its OWN new SQL Idea row");
        assert.equal(second.sql!.jobs[0]!.synced, true, "idea-02's job is genuinely created, never silently dropped");
        assert.equal(second.sql!.jobs[0]!.reason, "created");

        const onDiskQueue = await loadQueue(queuePath);
        assert.equal(onDiskQueue.jobs.length, 2, "the file queue also gained TWO distinct jobs");

        const brandRowId = getBrandBySlug(db, BRAND)!.id;
        assert.equal(listJobsForComposite(db, brandRowId, first.sql!.ideaId, RECIPE).length, 1);
        assert.equal(listJobsForComposite(db, brandRowId, second.sql!.ideaId, RECIPE).length, 1);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  it("Round 3, Defect A, reproduced at the REAL entry point: a pre-migration-5 imported row (no legacy_ref) is ADOPTED on re-sync, never duplicated — exactly the shape of all 61 Ideas in the real database", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const brandId = createBrand(db, { slug: BRAND, name: "Mundotip", timezone: "UTC", mediaRoot: "data/brands/mundotip" });
      const formatId = createFormat(db, { brandId, slug: SQL_FORMAT, name: "Unhypped News", voice: "plain", cadence: "weekly" });
      const runId = createRunRow(db, { brandId, formatId, runKey: SQL_RUN, cadence: "weekly", startedAt: NOW }, () => NOW);

      // Seed a Brand-new pre-migration-5 style Idea row: created BEFORE legacy_ref existed, exactly the
      // shape of every one of the real, committed data/organicgrowth.db's 61 imported Ideas.
      const preMigrationIdeaId = createIdeaRow(
        db,
        {
          runId,
          brandId,
          formatId,
          title: "A headline",
          brief: "Whatever the original import carried.",
          hookType: UNCLASSIFIED_HOOK_TYPE,
          theme: UNCLASSIFIED_THEME,
          // Deliberately no legacyRef.
        },
        () => NOW,
      );

      await withSqlFixture(async (ledgerPath, queuePath) => {
        const r = await enqueueOnAccept("idea-accepted", BRAND, [RECIPE], { ledgerPath, queuePath, db, now: () => NOW });

        assert.ok(r.sql, "the SQL sync ran");
        assert.equal(r.sql!.ideaId, preMigrationIdeaId, "the pre-migration-5 row is REUSED, not duplicated");
        assert.equal(r.sql!.ideaCreated, false);
        assert.equal(listIdeasForRun(db, runId).length, 1, "still exactly ONE Idea row for this one real Idea");
        assert.equal(getIdea(db, preMigrationIdeaId)!.legacyRef, "idea-accepted", "the row is now reconciled");
      });
    });
  });
});
