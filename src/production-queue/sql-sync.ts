/**
 * `syncAcceptToSql` — mirrors an accept-flow's chosen Recipes into SQL (issue #254): the Idea row, its
 * per-Recipe Asset rows, and one `queued` job per Recipe, into the SAME `job` table the unattended
 * worker's `findNextQueuedJob`/`drainQueue` (issue #208) actually reads. Before this ticket, accepting an
 * Idea wrote ONLY `data/queue.json` (`enqueue-on-accept.ts`) — the SQL `job` table held nothing an accept
 * ever put there, so the worker started, found nothing, and exited cleanly, with no signal that the work
 * had gone somewhere else. This module is the fix's deep module; `enqueue-on-accept.ts` wires it in.
 *
 * --- Every WRITE goes through `src/command-surface/` — never a store directly -------------------------
 *
 * `createIdea` / `recordReviewDecision` / `saveAsset` / `enqueueJob` / `createRun` are all command-surface
 * exports. This module also does plain READS directly against the SQL stores (`getBrandBySlug`,
 * `getFormatBySlug`, `getRunByKey`, `getIdea`, `listIdeasForRun`, `listJobsForComposite`) — reads are
 * outside the store-write boundary guard's scope by design (`src/store-write-boundary/scan.ts`'s own doc
 * comment: "Scope: writes only, never reads"), the SAME convention `command-surface/worker.ts` already
 * uses for `getAssetById`/`getBrandById`/`getIdea`.
 *
 * --- No legacy-id column: Idea identity is resolved by (run, title) ------------------------------------
 *
 * The `idea` table carries no column correlating a SQL row back to the file ledger's own `id` (e.g.
 * `"idea-05"`) — schema.ts's four frozen migrations never added one, and this ticket deliberately does
 * NOT add a fifth: three other build slices are concurrently landing their own schema/allow-list changes
 * in sibling worktrees, and `schema.ts`'s migration list is exactly the kind of shared, append-order file
 * where a second concurrent migration-5 would collide. Instead, `findExistingIdea` looks an Idea up by
 * `(run_id, title)` — every real Idea's title is a distinct headline within its own Run (idea-strategist
 * never repeats one), so this is a safe, sufficient natural key, and it costs no schema change. This is
 * ALSO what makes a re-accept of an Idea the one-shot importer already carried safe: the importer wrote a
 * real `title` on every Idea it created, so a later accept-flow call for that SAME Idea finds the
 * importer's own row by `(run_id, title)` and reuses it, rather than creating a duplicate.
 *
 * Known, documented risk: two Ideas in the SAME Run sharing an IDENTICAL title would collide under this
 * key. No real Brief has ever done this (surveyed at the time this ticket landed); flagged in
 * `handoff.md` rather than silently assumed away.
 *
 * --- Idempotency: report, not roll back --------------------------------------------------------------
 *
 * `job.idempotency_key` carries no `UNIQUE` constraint (unlike `schedule_outbox.idempotency_key`, which
 * does) — so the key set here (`"<brand>::<legacy-idea-id>::<recipe>"`, the SAME `::`-joined shape
 * `importer/execute.ts`'s own `assetKey` uses) is recorded provenance, not the enforcement mechanism.
 * The actual guard against a double-enqueued job is `listJobsForComposite` (issue #203 AC1): checked
 * BEFORE every `enqueueJob` call, so a second sync attempt for the same `(brand, idea, recipe)` finds the
 * existing job and skips — the SQL-side sibling of the file queue's own `hasJobFor`.
 *
 * This whole sync is NOT wrapped in one outer SQL transaction: `recordReviewDecision`'s own
 * `selectIdeaRecipes` half already opens its own (`withTransaction` does not nest — SQLite itself refuses
 * a `BEGIN` issued while a transaction is already open, `command-surface/ideas.ts`'s own doc comment), and
 * every step here (`createIdea`, `saveAsset`, `enqueueJob`) is individually atomic. The residual risk is a
 * process crash strictly between two of these steps — accepted, not hidden: every step here is IDEMPOTENT
 * on retry (find-or-create Idea, upsert Asset, guard-then-enqueue Job), so re-running this function after
 * a partial failure reaches the same end state rather than duplicating anything. A failure is never
 * swallowed: this function throws, loudly, naming what could not be resolved (`missing Brand`, `missing
 * Format`, `missing Brief`) or lets the underlying SQLite error (a FOREIGN KEY violation) propagate
 * unchanged — the caller decides what to do with a thrown error; this module never reports success while
 * silently doing nothing, which is the exact bug this ticket exists to close.
 */

import type { DatabaseSync } from "node:sqlite";

import { loadFullIdeas } from "../ledger/ledger.ts";
import { loadBrief } from "../importer/load-brief.ts";
import { extractSourceUrls } from "../importer/source-urls.ts";
import { getBrandBySlug } from "../brand/store.ts";
import { getFormatBySlug } from "../format/store.ts";
import { getRunByKey } from "../run/store.ts";
import { getIdea, listIdeasForRun } from "../idea/store.ts";
import { listJobsForComposite } from "./job-store.ts";
import { getRecipe } from "../recipe/registry.ts";
import { UNCLASSIFIED_HOOK_TYPE } from "../vocabulary/hook-type.ts";
import { UNCLASSIFIED_THEME } from "../vocabulary/theme.ts";
import {
  createRun,
  createIdea,
  recordReviewDecision,
  saveAsset,
  getAssetByRecipe,
  enqueueJob,
} from "../command-surface/index.ts";

/** The per-Recipe outcome of one `syncAcceptToSql` call. */
export interface SqlSyncJobOutcome {
  readonly recipe: string;
  /** `true` when a NEW `job` row was created this call; `false` when one already existed for this
   *  `(brand, idea, recipe)` composite (the SQL-side sibling of the file queue's `"already-queued"`). */
  readonly synced: boolean;
}

/** The outcome of syncing one Idea's chosen Recipes into SQL. */
export interface SqlSyncOutcome {
  /** The Idea's SQL surrogate id (freshly created, or the existing row this call resolved to). */
  readonly ideaId: string;
  /** `true` when this call created a brand-new SQL Idea row; `false` when it reused one already there
   *  (an importer-carried Idea, or a prior accept-flow call for the same ledger Idea). */
  readonly ideaCreated: boolean;
  readonly jobs: readonly SqlSyncJobOutcome[];
}

export interface SqlSyncParams {
  readonly db: DatabaseSync;
  /** The Brand slug (e.g. `"straw-motion"`) — required, matching every other accept-flow parameter. */
  readonly brand: string;
  /** The SAME ledger path the file-based accept flow reads — required, never an ambient default. */
  readonly ledgerPath: string;
  /** Passed straight through to `loadBrief` — overridden only by tests. */
  readonly brandsRoot?: string;
  readonly now?: () => string;
}

/** Finds an existing SQL Idea row for `title` within `runId`, or `null` when none exists yet. See this
 *  module's own doc comment for why `(run_id, title)` — not a legacy-id column — is the correlating
 *  key. */
function findExistingIdea(db: DatabaseSync, runId: string, title: string): string | null {
  const match = listIdeasForRun(db, runId).find((i) => i.title === title);
  return match ? match.id : null;
}

/**
 * Syncs `ideaId`'s (the FILE LEDGER's own id, e.g. `"idea-05"`) chosen `recipes` into SQL: ensures the
 * Idea row exists and is `accepted` (creating it — Brand/Format/Run included — the FIRST time this ledger
 * Idea is synced; reusing the existing row on a later call), then for each Recipe upserts its Asset
 * (`queued`) and enqueues a `job` row UNLESS one already exists for that `(brand, idea, recipe)`
 * composite. Throws, loudly and by name, when the Brand/Format/Brief this Idea needs cannot be resolved —
 * see this module's own doc comment for the full loud-failure contract. Never touches `data/queue.json`
 * — that stays `enqueue-on-accept.ts`'s own, unaffected write.
 */
export async function syncAcceptToSql(
  ideaId: string,
  recipes: readonly string[],
  params: SqlSyncParams,
): Promise<SqlSyncOutcome> {
  const { db } = params;
  const now = params.now ?? (() => new Date().toISOString());

  const brand = getBrandBySlug(db, params.brand);
  if (brand === null) {
    throw new Error(
      `syncAcceptToSql: no Brand row for slug "${params.brand}" — run the one-shot importer (or create the ` +
        `Brand row) before accepting Ideas through SQL. The file queue was still written; only the SQL sync ` +
        `failed.`,
    );
  }

  const fullIdeas = await loadFullIdeas(params.ledgerPath, params.brand);
  const ledgerIdea = fullIdeas.find((i) => i.id === ideaId);
  if (ledgerIdea === undefined) {
    throw new Error(`syncAcceptToSql: Idea "${ideaId}" not found in Brand "${params.brand}"'s ledger.`);
  }
  if (ledgerIdea.run === undefined) {
    throw new Error(`syncAcceptToSql: Idea "${ideaId}" carries no "run" — cannot resolve its SQL Run.`);
  }
  if (ledgerIdea.format === undefined) {
    throw new Error(`syncAcceptToSql: Idea "${ideaId}" carries no "format" — cannot resolve its SQL Format.`);
  }

  const format = getFormatBySlug(db, brand.id, ledgerIdea.format);
  if (format === null) {
    throw new Error(
      `syncAcceptToSql: no Format row for Brand "${params.brand}" / Format "${ledgerIdea.format}" — run the ` +
        `one-shot importer (or create the Format row) before accepting Ideas through SQL.`,
    );
  }

  const existingRun = getRunByKey(db, format.id, ledgerIdea.run);
  const runId =
    existingRun !== null
      ? existingRun.id
      : createRun(db, { brandId: brand.id, formatId: format.id, runKey: ledgerIdea.run, cadence: format.cadence, startedAt: now() }, now);

  const title = ledgerIdea.title ?? ledgerIdea.id;
  const recipeSelections = recipes.map((recipe) => ({ recipe, chosen: true }));

  const existingIdeaId = findExistingIdea(db, runId, title);
  let sqlIdeaId: string;
  let ideaCreated: boolean;

  if (existingIdeaId !== null) {
    sqlIdeaId = existingIdeaId;
    ideaCreated = false;
    const existingRecord = getIdea(db, sqlIdeaId)!;
    if (existingRecord.status === "suggested") {
      recordReviewDecision(db, sqlIdeaId, { outcome: "accepted", recipes: recipeSelections }, now);
    }
  } else {
    const briefResult = await loadBrief(
      {
        id: ledgerIdea.id,
        run: ledgerIdea.run,
        format: ledgerIdea.format,
        ...(ledgerIdea.briefPath !== undefined ? { briefPath: ledgerIdea.briefPath } : {}),
      },
      params.brand,
      params.brandsRoot,
    );
    if (!briefResult.ok) {
      throw new Error(
        `syncAcceptToSql: could not read Idea "${ideaId}"'s Brief — tried: ${briefResult.candidates.join(", ")}.`,
      );
    }
    const sourceUrls = extractSourceUrls(briefResult.content);

    sqlIdeaId = createIdea(
      db,
      {
        runId,
        brandId: brand.id,
        formatId: format.id,
        title,
        brief: briefResult.content,
        // The real Hook Type/Theme backfill (issue #206) targets the file ledger's own Briefs, not SQL —
        // mirroring the one-shot importer's own decision (`executeImport`'s own doc comment), every Idea
        // this sync creates is classified `unclassified` for both, honestly, rather than guessed.
        hookType: UNCLASSIFIED_HOOK_TYPE,
        theme: UNCLASSIFIED_THEME,
        sourceUrls,
        ...(ledgerIdea.fitScore !== undefined ? { fitScore: ledgerIdea.fitScore } : {}),
      },
      now,
    );
    ideaCreated = true;
    recordReviewDecision(db, sqlIdeaId, { outcome: "accepted", recipes: recipeSelections }, now);
  }

  const jobs: SqlSyncJobOutcome[] = [];
  for (const recipe of recipes) {
    await saveAsset(db, sqlIdeaId, recipe, { status: "queued" });
    const assetRecord = await getAssetByRecipe(db, sqlIdeaId, recipe);
    if (assetRecord === null) {
      throw new Error(`syncAcceptToSql: internal error — saveAsset for Idea "${sqlIdeaId}" Recipe "${recipe}" did not produce a readable Asset row.`);
    }

    const existingJobs = listJobsForComposite(db, brand.id, sqlIdeaId, recipe);
    if (existingJobs.length > 0) {
      jobs.push({ recipe, synced: false });
      continue;
    }

    const def = getRecipe(recipe);
    if (def === null) {
      // Defensive: `enqueueOnAccept` only ever calls this module with Recipes `planEnqueue` already
      // confirmed wired, but `syncAcceptToSql` is also callable directly — never silently treat an
      // unknown Recipe as a zero-gate one.
      throw new Error(`syncAcceptToSql: "${recipe}" is not a wired Recipe (src/recipe/registry.ts).`);
    }
    const gate = def.gates[0];
    enqueueJob(
      db,
      {
        assetId: assetRecord.id,
        brandId: brand.id,
        ...(gate !== undefined ? { gate } : {}),
        idempotencyKey: `${params.brand}::${ideaId}::${recipe}`,
      },
      now,
    );
    jobs.push({ recipe, synced: true });
  }

  return { ideaId: sqlIdeaId, ideaCreated, jobs };
}
