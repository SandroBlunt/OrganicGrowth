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
 * `getFormatBySlug`, `getRunByKey`, `getIdea`, `getIdeaByLegacyRef`, `listJobsForComposite`) — reads are
 * outside the store-write boundary guard's scope by design (`src/store-write-boundary/scan.ts`'s own doc
 * comment: "Scope: writes only, never reads"), the SAME convention `command-surface/worker.ts` already
 * uses for `getAssetById`/`getBrandById`/`getIdea`.
 *
 * --- Idea identity is the file ledger's own id — `idea.legacy_ref` (migration 5, issue #254) ----------
 *
 * QA round-1 (this ticket's own history) found that resolving identity by `(run_id, title)` silently
 * MERGED two genuinely distinct accepted Ideas that happened to share an identical title: the second
 * Idea got no Idea row, no Asset row, no Job row of its own, and its own `job` outcome read exactly like
 * a legitimate "already queued" re-accept — indistinguishable from success, the exact class of bug this
 * ticket exists to close, reproduced one layer inside the fix.
 *
 * The correct fix is the identity that was there all along: every Idea already carries a stable,
 * per-Brand-unique id (the `"idea-05"` / `"idea-2026-W32-10"` form) that `/log-post`, `/pick`, and the
 * whole attribution chain already key on. This module now looks an existing Idea up by `(brand_id,
 * legacy_ref)` via `getIdeaByLegacyRef` (`src/idea/store.ts`) — never by title, so two Ideas sharing a
 * title (a real, legitimate case: two different real-world stories can share a headline) now correctly
 * get two SEPARATE Idea/Asset/Job rows. `createIdea` stamps `legacyRef: ideaId` on every row this module
 * creates; the one-shot importer (`src/importer/execute.ts`) does the same with its own `ideaPlan.legacyId`
 * (the SAME field), so a re-accept of an importer-carried Idea still correlates correctly.
 *
 * The schema itself backstops this: `idx_idea_legacy_ref_per_brand` is a real UNIQUE index (partial —
 * `NULL` values are never compared), so even a bug that bypassed this module's own lookup entirely would
 * hit a loud `SQLITE_CONSTRAINT` on the second `createIdea` call, never a silent double-write. "A genuine
 * collision must be loud" now holds at the DATABASE level, not merely by this module's own discipline.
 *
 * --- Idempotency: report, not roll back — now backstopped by a schema index too (migration 5) ---------
 *
 * The actual, PRIMARY guard against a double-enqueued job is `listJobsForComposite` (issue #203 AC1):
 * checked BEFORE every `enqueueJob` call, so a second sync attempt for the same `(brand, idea, recipe)`
 * finds the existing job and skips — the SQL-side sibling of the file queue's own `hasJobFor`. This alone
 * is safe within one Node process (no `await` between the read and the write), but not across two
 * separate OS processes racing the same accept (QA round-1 Defect 4). `job.idempotency_key` — set here as
 * `"<brand>::<legacy-idea-id>::<recipe>"`, the SAME `::`-joined shape `importer/execute.ts`'s own
 * `assetKey` uses — now ALSO carries a partial `UNIQUE` schema index (migration 5), closing that
 * cross-process race: a genuinely concurrent second `enqueueJob` call for the same composite throws a
 * real `SQLITE_CONSTRAINT` error instead of silently creating a duplicate `queued` job.
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
import { getIdea, getIdeaByLegacyRef } from "../idea/store.ts";
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
  /** WHY `synced` is what it is (QA round-1 Defect 1: "`synced: false` currently means both 'already
   *  there' and 'silently dropped' — those must be distinguishable"). `"created"` — a brand-new `job` row
   *  was made this call. `"already-queued"` — a `job` row already existed for this EXACT `(brand, idea,
   *  recipe)` composite, found via `listJobsForComposite` — a legitimate dedupe, never a dropped write.
   *  Because identity is now the ledger's own per-Brand-unique id (`legacy_ref`, not title), two
   *  DIFFERENT ledger Ideas can never resolve to the same SQL Idea row, so `"already-queued"` can only
   *  ever mean a genuine re-sync of the SAME ledger Idea — never a second, distinct Idea silently merged
   *  into the first. */
  readonly reason: "created" | "already-queued";
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

  // The real, per-Brand-unique identity (migration 5, issue #254) — see this module's own doc comment
  // for why `(brand_id, legacy_ref)` replaces the earlier `(run_id, title)` natural key.
  const existingIdeaId = getIdeaByLegacyRef(db, brand.id, ideaId)?.id ?? null;
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
        // The real identity this row correlates back to (issue #254, migration 5) — see this module's
        // own doc comment. This is what makes `findExistingIdea` a real, per-Brand-unique lookup instead
        // of the title-based natural key that silently merged two distinct Ideas in QA round 1.
        legacyRef: ideaId,
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
      jobs.push({ recipe, synced: false, reason: "already-queued" });
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
    jobs.push({ recipe, synced: true, reason: "created" });
  }

  return { ideaId: sqlIdeaId, ideaCreated, jobs };
}
