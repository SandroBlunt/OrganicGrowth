/**
 * `/backfill-hook-theme` — the Hook Type / Theme backfill's orchestration shell (issue #206).
 *
 * Thin: read every committed Idea (`IdeaStore.listAllIdeas`), hand them plus the static classification
 * data (`src/hook-theme-backfill/classifications.ts`'s `BRIEF_CLASSIFICATIONS`) to the pure planner
 * (`planBackfill`), apply every planned update through the typed command surface's `classifyIdea`
 * (never a store or raw SQL directly — issue #206's own acceptance criterion), then format the report.
 * All the real decision logic lives in `planBackfill`/`countClassifications`/`formatBackfillReport`;
 * this module is the wiring around them, mirroring `src/importer/cli.ts`'s own shape.
 *
 * Re-runnable by construction: `planBackfill` already treats an Idea whose current classification
 * matches the desired one as `alreadyCorrect`, never re-issuing a write for it — a second run against an
 * already-backfilled database reports 0 updated (see `backfill-hook-theme.test.ts`'s own re-run test).
 *
 * Touches only the local SQLite database — no Magnific Space, no Zoho MCP, no Apify call is reachable
 * from this module.
 */

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import type { DatabaseSync } from "node:sqlite";

import { openDatabase } from "../db/connection.ts";
import { runMigrations } from "../db/migrate.ts";
import { listAllIdeas, type IdeaRecord } from "../idea/store.ts";
import { classifyIdea } from "../command-surface/index.ts";
import { planBackfill, type ExistingIdeaSnapshot, type BackfillPlan } from "../hook-theme-backfill/backfill.ts";
import { countClassifications, formatBackfillReport } from "../hook-theme-backfill/report.ts";
import { BRIEF_CLASSIFICATIONS, type BriefClassificationEntry } from "../hook-theme-backfill/classifications.ts";

const DEFAULT_DB_PATH = "data/organicgrowth.db";

export interface BackfillHookThemeOptions {
  readonly now?: () => string;
  /** Overrides `BRIEF_CLASSIFICATIONS` — real production callers never pass this; tests use it to wire
   *  synthetic classification data against a synthetic Idea without needing the real 51 Briefs on disk. */
  readonly classifications?: readonly BriefClassificationEntry[];
}

export interface BackfillHookThemeResult {
  readonly plan: BackfillPlan;
  readonly report: string;
}

function toSnapshot(idea: IdeaRecord): ExistingIdeaSnapshot {
  return {
    id: idea.id,
    title: idea.title,
    brief: idea.brief,
    hookType: idea.hookType,
    theme: idea.theme,
    ...(idea.hookTypeSource !== undefined ? { hookTypeSource: idea.hookTypeSource } : {}),
    ...(idea.themeSource !== undefined ? { themeSource: idea.themeSource } : {}),
  };
}

/**
 * Runs one backfill pass: plans, writes every planned update through `classifyIdea`, and returns
 * `{ plan, report }`. Never throws for an ordinary "nothing to do" outcome (an empty database, or an
 * already-fully-backfilled one) — those are normal, expected results, not failures.
 */
export async function backfillHookTheme(db: DatabaseSync, options: BackfillHookThemeOptions = {}): Promise<BackfillHookThemeResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const classifications = options.classifications ?? BRIEF_CLASSIFICATIONS;

  const existingIdeas = listAllIdeas(db).map(toSnapshot);
  const plan = planBackfill(existingIdeas, classifications);

  for (const update of plan.toUpdate) {
    classifyIdea(
      db,
      update.ideaId,
      {
        hookType: update.after.hookType,
        theme: update.after.theme,
        hookTypeSource: update.after.hookTypeSource,
        themeSource: update.after.themeSource,
      },
      now,
    );
  }

  // The FINAL state every counted Idea ends up in: an updated Idea gets its plan's own `after` values
  // (never a second query — the plan already computed them); every other Idea keeps what it already had.
  const afterByIdeaId = new Map(plan.toUpdate.map((u) => [u.ideaId, u.after]));
  const finalIdeas = existingIdeas.map((idea) => afterByIdeaId.get(idea.id) ?? idea);
  const counts = countClassifications(finalIdeas);
  const report = formatBackfillReport(plan, counts);

  return { plan, report };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

/** CLI entry: run one backfill pass against `data/organicgrowth.db` (or `--db <path>`) and print the
 *  report. Usage: `npm run backfill-hook-theme -- [--db <path>]`. */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dbFlagIndex = args.indexOf("--db");
  const dbPath = dbFlagIndex !== -1 && args[dbFlagIndex + 1] !== undefined ? args[dbFlagIndex + 1]! : DEFAULT_DB_PATH;

  const db = await openDatabase(dbPath);
  try {
    runMigrations(db);
    const result = await backfillHookTheme(db);
    process.stdout.write(result.report + "\n");
  } finally {
    db.close();
  }
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && fileURLToPath(import.meta.url) === resolve(entryPoint)) {
  main().catch((err: unknown) => {
    process.stderr.write(`/backfill-hook-theme failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
