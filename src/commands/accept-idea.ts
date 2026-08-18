/**
 * `accept-idea` — the compiled Gate-1 "accept" mutation `/review-ideas` calls (issue #254 Round 3,
 * Defect B).
 *
 * QA's round-2 finding: `/review-ideas` — the ORDINARY way an Idea is accepted every week — had NO
 * compiled TypeScript backing at all, unlike `/pick`, `/pick-cast`, `/log-post`, `/queue`, and every
 * other gated command. Before this ticket, the accept mutation (write the Recipe selection, set the
 * Idea `accepted`, enqueue production — file queue AND SQL) was performed by an LLM agent executing
 * freeform prose instructions turn by turn; nothing stopped an agent from forgetting a step (most
 * pointedly, forgetting to pass `db` to `enqueueOnAccept`, silently leaving the SQL `job` table
 * untouched — Round 1/Round 2's own finding). This module is that missing compiled backing.
 *
 * Scope, deliberately narrow: this is ONLY the deterministic mutation AFTER the Operator's decision is
 * already made (which Idea; which Recipes chosen/declined-with-reasons). The CONVERSATIONAL parts of
 * `/review-ideas` — presenting suggested Ideas, taking the Operator's free-text verdict, letting them
 * trim/extend the offered Recipe set — stay prose; an LLM's job, not this command's. `/review-ideas`
 * itself remains a prompt-driven command with no compiled turn-by-turn runtime (like `/run-trends`); this
 * is the one piece of it that now IS code, callable via a single, fixed shell invocation
 * (`npm run accept-idea -- ...`) instead of an ad-hoc script an agent would otherwise have to write
 * correctly from scratch every time.
 *
 * What it does, in order:
 *   1. `writeIdeaRecipeSelection` — records the chosen/declined Recipes on the Brand's ledger (unchanged
 *      write, `src/ledger/ledger.ts`, issue #54) — the Operator's FULL decision, regardless of whether a
 *      chosen Recipe's Spec goes on to author successfully below.
 *   2. `markIdeaAccepted` — sets that Idea's `status` to `"accepted"` (no compiled function performed
 *      this write anywhere in the codebase before issue #254).
 *   3. **Author + self-check each chosen Recipe's Production Spec (ADR-0031, issue #264) — BEFORE
 *      anything is enqueued.** For each Recipe in `chosen`: build a minimal Brief from the ledger Idea's
 *      own `run`/`title`, load the Brand's banned words, and call
 *      `src/production-spec/author-at-review.ts`'s `authorSpecForRecipe`. A Recipe whose Spec fails its
 *      author-phase self-check is reported PLAINLY in the returned message and is DROPPED from the set
 *      passed to `enqueueOnAccept` — no job is ever enqueued for it, in EITHER queue. Review is now the
 *      single point a Spec is authored; the attended Producer no longer authors its own (see
 *      `.claude/agents/producer.md`), and the unattended worker's own author-phase check always finds
 *      one because a job never reaches the queue without a Spec already attached.
 *   4. When at least one Recipe authored successfully: `enqueueOnAccept` — writes `data/queue.json`
 *      exactly as always, PLUS the SQL `job` table, by opening + migrating `data/organicgrowth.db` BY
 *      DEFAULT (mirroring `run-pipeline.ts`'s stranded-idea resume branch, issue #254 Round 2's own
 *      Defect-2 fix) — never depending on a caller remembering to pass `db`. A database open/migrate
 *      failure degrades to "file queue only" (surfaced in the returned message, never silent); a SQL
 *      SYNC failure (the database opened fine, but e.g. the Brand/Format row is missing) is surfaced
 *      LOUDLY in the returned message too, AFTER the file queue has already landed —
 *      `enqueueOnAccept`'s own contract, unchanged.
 *   5. Once the SQL sync lands, EACH newly-enqueued Recipe's authored Spec is persisted onto its SQL
 *      Asset row (`saveAssetSpec`) and regenerated as the on-disk per-Idea Spec file (`refreshSpecFile`)
 *      — a GENERATED VIEW read back from the SAME SQL row, never a second, independently-authored copy
 *      (mirroring `post.json`'s relationship to the ledger's Asset, ADR-0028).
 *
 * No Magnific, no Apify, no network — this command never touches the Space and never publishes anything
 * (generate-never-publish, ADR-0002): accepting only queues production. The Spec authorship itself is a
 * deterministic, hermetic stand-in for a Recipe's `producerSkill` (never a live model call) — see
 * `src/production-spec/author-at-review.ts`'s own doc comment.
 */

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import type { DatabaseSync } from "node:sqlite";

import { resolveBrand } from "../brand/resolver.ts";
import { writeIdeaRecipeSelection, markIdeaAccepted, loadFullIdeas, type LedgerDeclinedRecipe } from "../ledger/ledger.ts";
import { enqueueOnAccept, type EnqueueOnAcceptOptions } from "../production-queue/enqueue-on-accept.ts";
import { openDatabase } from "../db/connection.ts";
import { runMigrations } from "../db/migrate.ts";
import { getRecipe } from "../recipe/registry.ts";
import { loadBannedWords } from "../production-spec/brand-profile.ts";
import { authorSpecForRecipe, type Brief } from "../production-spec/author-at-review.ts";
import { specPathFor } from "../production-spec/store.ts";
import { loadFormat, type FormatCadence } from "../format/store.ts";
import { getAssetByRecipe, saveAssetSpec, refreshSpecFile } from "../command-surface/index.ts";

export type { LedgerDeclinedRecipe };

/**
 * Resolve `format`'s cadence, best-effort — used ONLY to compute where the regenerated Spec file view
 * lands (`specPathFor`'s own `cadence` segment). Never blocks the accept: a missing/unreadable Format
 * file degrades to `"weekly"` (the flat, non-nested path every pre-multi-format Idea already uses),
 * exactly like `specPathFor`'s own default parameter — the SQL row (the canonical Spec) is unaffected
 * either way.
 */
async function resolveCadenceSafely(brand: string, format: string | undefined, brandsRoot: string | undefined): Promise<FormatCadence> {
  if (format === undefined) return "weekly";
  try {
    const loaded = await loadFormat(brand, format, brandsRoot);
    return loaded.cadence;
  } catch {
    return "weekly";
  }
}

/** The SAME default `data/organicgrowth.db` path every other command uses (`run-pipeline.ts`,
 *  `backfill-hook-theme.ts`) — the local SQLite database the unattended worker's `findNextQueuedJob`/
 *  `drainQueue` (issue #208) actually reads. Overridden by `options.dbPath` in every test (a throwaway
 *  temp file), so no test ever opens or migrates the real, committed database. */
const DEFAULT_DB_PATH = "data/organicgrowth.db";

/** Options for `acceptIdeaCommand` (injected paths/clock/db keep the shell testable without ambient
 *  I/O — mirrors every other command's shape). */
export interface AcceptIdeaOptions {
  /** Optional override for the brands root directory; defaults to `data/brands` (primarily testing). */
  readonly brandsRoot?: string;
  /** The global Production Queue path; defaults to the Brand's own resolved `queuePath`
   *  (the brand-agnostic `data/queue.json`, ADR-0006/0008). */
  readonly queuePath?: string;
  /** Injected clock for the enqueued job's `enqueued_at`; defaults to now. */
  readonly now?: () => string;
  /** Overrides the default `data/organicgrowth.db` path this command opens BY DEFAULT. Every test sets
   *  this to a throwaway temp file; the real CLI entry never does. */
  readonly dbPath?: string;
  /** Escape hatch for a caller that wants to inject an ALREADY-OPEN database (mirrors
   *  `enqueueOnAccept`'s own `db` option); when given, this command does NOT open or close it — the
   *  caller owns its lifecycle. Mutually exclusive with `dbPath` in practice (this option wins). */
  readonly db?: DatabaseSync;
}

/**
 * Performs Gate 1's "accept" mutation for one Idea, given the Operator's already-made decision: records
 * the Recipe selection, marks the Idea `accepted`, and — when at least one Recipe was chosen — enqueues
 * production into BOTH `data/queue.json` and the SQL `job` table (opened/migrated by default). Returns a
 * human-readable summary string (never throws for an ordinary SQL problem — see this module's own doc
 * comment for the loud-but-non-fatal SQL failure contract; DOES throw for a file-system problem reading
 * or writing the ledger itself, matching `writeIdeaRecipeSelection`'s/`markIdeaAccepted`'s own contract).
 *
 * @param brand     The Brand slug (e.g. `"straw-motion"`). Required — never a fallback Brand.
 * @param ideaId    The Idea's ledger id.
 * @param chosen    The Operator's final chosen Recipe slugs (may be `[]` — nothing is enqueued then).
 * @param declined  Offered-but-declined Recipes, each with its verbatim reason (may be `[]`).
 * @param options   Optional path/clock/db overrides for testing.
 */
export async function acceptIdeaCommand(
  brand: string,
  ideaId: string,
  chosen: readonly string[],
  declined: readonly LedgerDeclinedRecipe[],
  options: AcceptIdeaOptions = {},
): Promise<string> {
  const brandPaths = resolveBrand(brand, options.brandsRoot);
  const ledgerPath = brandPaths.ledger;
  const queuePath = options.queuePath ?? brandPaths.queuePath;

  await writeIdeaRecipeSelection(ideaId, chosen, declined, { ledgerPath });
  await markIdeaAccepted(ideaId, { ledgerPath });

  const lines: string[] = [`/review-ideas: Idea "${ideaId}" accepted for Brand ${brand}.`];

  if (chosen.length === 0) {
    lines.push("No Recipe was chosen — nothing enqueued yet. Adding a Recipe later is not yet supported (v1).");
    return lines.join("\n");
  }

  // --- Author + self-check each chosen Recipe's Production Spec (ADR-0031, issue #264) — BEFORE ------
  // anything is written to EITHER queue. A Recipe whose Spec fails its author-phase self-check is
  // reported here, loudly, and dropped from the set `enqueueOnAccept` below ever sees.
  const fullIdeas = await loadFullIdeas(ledgerPath, brand);
  const ledgerIdea = fullIdeas.find((i) => i.id === ideaId);
  const brief: Brief = { id: ideaId, run: ledgerIdea?.run ?? "unknown-run", title: ledgerIdea?.title ?? ideaId };
  const bannedWords = await loadBannedWords(brandPaths.brandProfile);

  const authoredSpecs = new Map<string, Record<string, unknown>>();
  for (const recipe of chosen) {
    const recipeDef = getRecipe(recipe);
    if (recipeDef === null) {
      lines.push(`AUTHORSHIP SKIPPED for Recipe "${recipe}": not a wired Recipe — nothing was enqueued for it.`);
      continue;
    }
    try {
      const outcome = authorSpecForRecipe(recipeDef, brief, bannedWords);
      if (!outcome.ok) {
        const detail = outcome.audit.items
          .filter((i) => i.ok === false)
          .map((i) => i.detail ?? i.description)
          .join("; ");
        lines.push(
          `AUTHORSHIP FAILED for Recipe "${recipe}": the author-phase self-check did not pass (${detail}). ` +
            "Nothing was enqueued for this Recipe, in either queue — fix the failure (e.g. the Brand's " +
            "banned words, or the Idea's material) and re-run this command to retry.",
        );
        continue;
      }
      authoredSpecs.set(recipe, outcome.spec);
    } catch (err) {
      lines.push(
        `AUTHORSHIP FAILED for Recipe "${recipe}": ${err instanceof Error ? err.message : String(err)}. ` +
          "Nothing was enqueued for this Recipe, in either queue.",
      );
    }
  }

  const enqueueTargets = chosen.filter((recipe) => authoredSpecs.has(recipe));
  if (enqueueTargets.length === 0) {
    lines.push("No Recipe's Spec was successfully authored — nothing enqueued.");
    return lines.join("\n");
  }

  // Open + migrate the SAME SQLite database `/run-worker` drains, BY DEFAULT — never depending on a
  // markdown paragraph being followed correctly (issue #254 Round 1/2's own finding, closed for the
  // stranded-idea resume path in Round 2; this closes it for the PRIMARY, everyday accept path too).
  // Migrating an already-current database is a safe no-op. If even OPENING the database fails, this
  // command still enqueues into the file queue alone — a database problem never blocks the attended,
  // file-based pipeline this ticket has never changed.
  let db: DatabaseSync | undefined = options.db;
  let ownsDb = false;
  if (db === undefined) {
    const dbPath = options.dbPath ?? DEFAULT_DB_PATH;
    try {
      db = await openDatabase(dbPath);
      runMigrations(db);
      ownsDb = true;
    } catch (err) {
      lines.push(
        `SQL sync unavailable: could not open/migrate "${dbPath}" (${err instanceof Error ? err.message : String(err)}). Continuing with the file queue only.`,
      );
      db = undefined;
    }
  }

  try {
    const enqueueOptions: EnqueueOnAcceptOptions = {
      ledgerPath,
      queuePath,
      ...(options.now !== undefined ? { now: options.now } : {}),
      ...(db !== undefined ? { db } : {}),
      ...(options.brandsRoot !== undefined ? { brandsRoot: options.brandsRoot } : {}),
    };
    const result = await enqueueOnAccept(ideaId, brand, enqueueTargets, enqueueOptions);
    const newlyEnqueued = result.outcomes.filter((o) => o.enqueued).map((o) => o.recipe);
    if (newlyEnqueued.length > 0) {
      lines.push(`Enqueued for production: ${newlyEnqueued.join(", ")}.`);
    } else {
      lines.push("No new Recipe was enqueued (already queued).");
    }
    if (result.sql !== undefined) {
      lines.push(
        `SQL sync: idea row ${result.sql.ideaCreated ? "created" : "reused"}; ${result.sql.jobs.length} job(s) synced — visible to /run-worker.`,
      );

      // --- Persist each newly-enqueued Recipe's authored Spec to SQL, then regenerate the on-disk -----
      // file view FROM that SAME row (ADR-0031) — never a second, independently-authored copy.
      if (db !== undefined) {
        const cadence = await resolveCadenceSafely(brand, ledgerIdea?.format, options.brandsRoot);
        for (const recipe of newlyEnqueued) {
          const spec = authoredSpecs.get(recipe);
          if (spec === undefined) continue; // defensive: only ever-authored Recipes reach enqueueTargets
          const assetRecord = await getAssetByRecipe(db, result.sql.ideaId, recipe);
          if (assetRecord === null) continue; // defensive: syncAcceptToSql always creates this row
          saveAssetSpec(db, assetRecord.id, spec, options.now);
          const specPath = specPathFor(ideaId, brief.run, brandPaths.ideasRoot, recipe, cadence);
          const wrote = await refreshSpecFile(db, assetRecord.id, specPath);
          if (wrote) lines.push(`Spec persisted for "${recipe}" and regenerated at ${specPath}.`);
        }
      }
    }
  } catch (err) {
    // enqueueOnAccept always writes the file queue BEFORE attempting the SQL sync (its own contract) —
    // surface loudly, never retry silently, never swallow.
    lines.push(`Enqueued (file queue only — SQL sync failed): ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (ownsDb) db?.close();
  }

  return lines.join("\n");
}

/**
 * CLI entry: performs the accept mutation and prints the result.
 * Usage: `npm run accept-idea -- <brand> <idea-id> <chosen-csv|-> [<declined-json>]`.
 * `<chosen-csv>` is a comma-separated list of Recipe slugs, or `-` (or an empty string) when the
 * Operator chose NO Recipe. `<declined-json>`, if given, is a JSON array of `{ "recipe", "reason" }`.
 *
 * Exported so tests can invoke the usage-error path directly without spawning a subprocess.
 */
export async function main(): Promise<void> {
  const [brand, ideaId, chosenArg, declinedArg] = process.argv.slice(2);
  if (brand === undefined || ideaId === undefined || chosenArg === undefined) {
    process.stderr.write(
      "usage: npm run accept-idea -- <brand> <idea-id> <chosen-csv|-> [<declined-json>]\n" +
        "  e.g. npm run accept-idea -- straw-motion idea-2026-W33-01 news-carousel\n" +
        '  e.g. npm run accept-idea -- straw-motion idea-2026-W33-01 - \'[{"recipe":"character-explainer-with-cast","reason":"not this week"}]\'\n' +
        "  Use '-' (or an empty string) for <chosen-csv> when the Operator chose NO Recipe.\n",
    );
    process.exitCode = 1;
    return;
  }

  const chosen =
    chosenArg === "-" || chosenArg.trim() === ""
      ? []
      : chosenArg
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

  let declined: readonly LedgerDeclinedRecipe[] = [];
  if (declinedArg !== undefined && declinedArg.trim() !== "") {
    try {
      declined = JSON.parse(declinedArg) as readonly LedgerDeclinedRecipe[];
    } catch {
      process.stderr.write(`accept-idea: <declined-json> is not valid JSON: ${declinedArg}\n`);
      process.exitCode = 1;
      return;
    }
  }

  const output = await acceptIdeaCommand(brand, ideaId, chosen, declined, {});
  process.stdout.write(output + "\n");
}

// C41: compare resolved paths, not a hand-built `file://` string (the latter breaks on paths with
// spaces, percent-encoded in `import.meta.url`, or symlinks, silently making a direct run a no-op).
const entryPoint = process.argv[1];
if (entryPoint !== undefined && fileURLToPath(import.meta.url) === resolve(entryPoint)) {
  main().catch((err: unknown) => {
    process.stderr.write(`accept-idea failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
