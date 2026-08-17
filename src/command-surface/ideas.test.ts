/**
 * Tests for the typed command surface's Idea operations (`createIdea`, `recordReviewDecision`, issue
 * #205 AC1/AC3).
 *
 * In-process against a real, throwaway SQLite file (`withTempDb`, never `:memory:`).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { createBrand } from "../brand/store.ts";
import { createFormat } from "../format/store.ts";
import { getIdea, listIdeaRecipes, IdeaValidationError } from "../idea/store.ts";
import { HOOK_TYPES } from "../vocabulary/hook-type.ts";
import { THEMES } from "../vocabulary/theme.ts";
import { FIXTURE_RECIPE } from "../db/fixtures/seed-chain.ts";

import { createIdea, recordReviewDecision } from "./ideas.ts";

const VALID_HOOK_TYPE = HOOK_TYPES[0]!.value;
const VALID_THEME = THEMES[0]!.value;
const OTHER_RECIPE = "news-carousel";

function seedRun(db: DatabaseSync): { readonly brandId: string; readonly formatId: string; readonly runId: string } {
  const brandId = createBrand(db, {
    slug: `straw-motion-${randomUUID()}`,
    name: "Straw Motion",
    timezone: "UTC",
    mediaRoot: "data/brands/straw-motion",
  });
  const formatId = createFormat(db, { brandId, slug: "unhypped-news", name: "Unhypped News", voice: "plain" });
  const runId = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO run (id, brand_id, format_id, run_key, cadence, started_at, created_at, updated_at)
     VALUES (?, ?, ?, '2026-W33', 'weekly', ?, ?, ?)`,
  ).run(runId, brandId, formatId, now, now, now);
  return { brandId, formatId, runId };
}

describe("createIdea — the command surface's write over IdeaStore (issue #205)", () => {
  it("creates a suggested Idea and it is readable back through getIdea", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { runId, brandId, formatId } = seedRun(db);

      const id = createIdea(db, {
        runId,
        brandId,
        formatId,
        title: "Google cuts Gemini pricing in half",
        brief: "Google dropped Gemini 3.7 Flash and cut the price in half.",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
      });

      const idea = getIdea(db, id);
      assert.ok(idea);
      assert.equal(idea.status, "suggested");
      assert.equal(idea.title, "Google cuts Gemini pricing in half");
    });
  });

  it("propagates IdeaValidationError for an out-of-vocabulary hookType — never a raw SQLite error", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { runId, brandId, formatId } = seedRun(db);

      assert.throws(
        () =>
          createIdea(db, {
            runId,
            brandId,
            formatId,
            title: "x",
            brief: "y",
            hookType: "not_a_real_hook_type" as unknown as (typeof HOOK_TYPES)[number]["value"],
            theme: VALID_THEME,
          }),
        IdeaValidationError,
      );
    });
  });
});

describe("recordReviewDecision — accepted (issue #205)", () => {
  it("accepts the Idea and records every offered Recipe's selection, chosen and declined together", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { runId, brandId, formatId } = seedRun(db);
      const ideaId = createIdea(db, {
        runId,
        brandId,
        formatId,
        title: "x",
        brief: "y",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
      });

      recordReviewDecision(db, ideaId, {
        outcome: "accepted",
        recipes: [
          { recipe: FIXTURE_RECIPE, chosen: true },
          { recipe: OTHER_RECIPE, chosen: false, declineReason: "Not enough footage this week" },
        ],
      });

      const idea = getIdea(db, ideaId);
      assert.equal(idea?.status, "accepted");

      const recipes = listIdeaRecipes(db, ideaId);
      assert.deepEqual(
        recipes.map((r) => [r.recipe, r.chosen]).sort(),
        [
          [FIXTURE_RECIPE, true],
          [OTHER_RECIPE, false],
        ].sort(),
      );
    });
  });

  it("an empty recipes array is legal — the Idea is accepted with no Recipe selection recorded yet", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { runId, brandId, formatId } = seedRun(db);
      const ideaId = createIdea(db, {
        runId,
        brandId,
        formatId,
        title: "x",
        brief: "y",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
      });

      recordReviewDecision(db, ideaId, { outcome: "accepted", recipes: [] });

      assert.equal(getIdea(db, ideaId)?.status, "accepted");
      assert.deepEqual(listIdeaRecipes(db, ideaId), []);
    });
  });
});

describe("recordReviewDecision — rejected (issue #205)", () => {
  it("rejects the Idea and records the reason verbatim", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { runId, brandId, formatId } = seedRun(db);
      const ideaId = createIdea(db, {
        runId,
        brandId,
        formatId,
        title: "x",
        brief: "y",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
      });

      recordReviewDecision(db, ideaId, {
        outcome: "rejected",
        rejectionReason: "Too close to last week's Idea 04",
      });

      const idea = getIdea(db, ideaId);
      assert.equal(idea?.status, "rejected");
      assert.equal(idea?.rejectionReason, "Too close to last week's Idea 04");
    });
  });

  it("propagates IdeaValidationError for a blank rejectionReason, changing nothing", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { runId, brandId, formatId } = seedRun(db);
      const ideaId = createIdea(db, {
        runId,
        brandId,
        formatId,
        title: "x",
        brief: "y",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
      });

      assert.throws(
        () => recordReviewDecision(db, ideaId, { outcome: "rejected", rejectionReason: "   " }),
        IdeaValidationError,
      );
      assert.equal(getIdea(db, ideaId)?.status, "suggested");
    });
  });
});
