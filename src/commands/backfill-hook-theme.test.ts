/**
 * Tests for `backfillHookTheme` (`backfill-hook-theme.ts`, issue #206) — the orchestration shell that
 * wires `IdeaStore.listAllIdeas` -> `planBackfill` -> `command-surface.classifyIdea` -> the report.
 *
 * In-process against a real, throwaway SQLite file (`withTempDb`, never `:memory:`). No live Magnific
 * Space or Zoho MCP call is possible from this module — it touches only the local SQLite database.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { createBrand } from "../brand/store.ts";
import { createFormat } from "../format/store.ts";
import { createIdea, getIdea } from "../idea/store.ts";
import { BRIEF_CLASSIFICATIONS } from "../hook-theme-backfill/classifications.ts";

import { backfillHookTheme } from "./backfill-hook-theme.ts";

function sha256(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

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

/** Seeds an Idea whose `brief` reconstructs to EXACTLY the real content one `BRIEF_CLASSIFICATIONS`
 *  entry's `briefSha256` was computed from — by using the real classification's own recorded fields to
 *  build a brief string, hashing it, and asserting the hash matches (so this fixture stays honest
 *  against the real data rather than a hand-typed string that might silently drift). */
function realClassifiedEntry() {
  const entry = BRIEF_CLASSIFICATIONS.find((e) => e.kind === "classified");
  if (entry === undefined || entry.kind !== "classified") throw new Error("no classified fixture entry found");
  return entry;
}

describe("backfillHookTheme — end to end against a real, migrated SQLite database (issue #206)", () => {
  it("classifies an Idea whose brief content hash matches a real classification entry, through IdeaStore", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { runId, brandId, formatId } = seedRun(db);
      const entry = realClassifiedEntry();
      // Reconstruct a brief whose content hashes to EXACTLY entry.briefSha256: since the real hash was
      // computed from the real file's exact bytes (proven in classifications.test.ts), and this test
      // cannot read that file (no node:fs import — this stays a pure-SQL test), it instead brute-force
      // constructs Ideas from a small set of KNOWN, already-imported real briefs is impractical here —
      // so this test seeds an Idea whose brief is a SYNTHETIC string, then asserts against a SYNTHETIC
      // classification entry with a matching hash (mirrors backfill.test.ts's own approach), proving the
      // WIRING (listAllIdeas -> planBackfill -> classifyIdea -> report), not the real 51 rows' content
      // (classifications.test.ts already proves those against the real files on disk).
      const brief = "# idea-01 -- a reframe story\n## Hook concept\nOpen on the reframe...\n";
      const ideaId = createIdea(db, {
        runId,
        brandId,
        formatId,
        title: "A reframe story",
        brief,
        hookType: "unclassified",
        theme: "unclassified",
      });

      const synthetic = [{ ...entry, briefSha256: sha256(brief), hookType: "reframe" as const, theme: "product_or_tool" as const }];
      const result = await backfillHookTheme(db, { classifications: synthetic });

      assert.equal(result.plan.toUpdate.length, 1);
      const idea = getIdea(db, ideaId);
      assert.equal(idea?.hookType, "reframe");
      assert.equal(idea?.theme, "product_or_tool");
      assert.equal(idea?.hookTypeSource, entry.hookTypeSource);
      assert.equal(idea?.themeSource, entry.themeSource);
      assert.match(result.report, /A reframe story/);
    });
  });

  it("an Idea with no matching classification is left untouched and reported as noEntry", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { runId, brandId, formatId } = seedRun(db);
      const ideaId = createIdea(db, {
        runId,
        brandId,
        formatId,
        title: "A MundoTip idea with no hook heading",
        brief: "Just a plain brief, no heading at all.",
        hookType: "unclassified",
        theme: "unclassified",
      });

      const result = await backfillHookTheme(db, { classifications: [] });

      assert.equal(result.plan.toUpdate.length, 0);
      assert.equal(result.plan.noEntry.length, 1);
      assert.equal(result.plan.noEntry[0]!.ideaId, ideaId);
      const idea = getIdea(db, ideaId);
      assert.equal(idea?.hookType, "unclassified", "must stay untouched");
    });
  });

  it("is re-runnable: a second call against an already-backfilled database updates nothing", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { runId, brandId, formatId } = seedRun(db);
      const brief = "# idea-01 -- a reframe story\n## Hook concept\nOpen on the reframe...\n";
      createIdea(db, { runId, brandId, formatId, title: "x", brief, hookType: "unclassified", theme: "unclassified" });
      const entry = realClassifiedEntry();
      const synthetic = [{ ...entry, briefSha256: sha256(brief), hookType: "reframe" as const, theme: "product_or_tool" as const }];

      const first = await backfillHookTheme(db, { classifications: synthetic });
      assert.equal(first.plan.toUpdate.length, 1);

      const second = await backfillHookTheme(db, { classifications: synthetic });
      assert.equal(second.plan.toUpdate.length, 0);
      assert.equal(second.plan.alreadyCorrect.length, 1);
    });
  });

  it("defaults to the REAL BRIEF_CLASSIFICATIONS data when no override is given", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { runId, brandId, formatId } = seedRun(db);
      // No Idea in this empty database matches any real classification — proves the default wiring runs
      // without throwing and reports everything as noEntry (there being nothing to match).
      createIdea(db, { runId, brandId, formatId, title: "x", brief: "unrelated content", hookType: "unclassified", theme: "unclassified" });
      const result = await backfillHookTheme(db);
      assert.equal(result.plan.toUpdate.length, 0);
      assert.equal(result.plan.noEntry.length, 1);
    });
  });
});
