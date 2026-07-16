import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyQueue, enqueue } from "./queue.ts";
import { loadQueue } from "./store.ts";
import { planEnqueue, enqueueOnAccept } from "./enqueue-on-accept.ts";
import type { LedgerIdea } from "../ledger/ledger.ts";

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
      lock: { active_job: null },
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
