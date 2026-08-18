/**
 * Orchestration shell — auto-enqueue an accepted Idea's chosen Recipes (ADR-0008, issue #56).
 *
 * Wires the read-only ledger to the pure queue logic and the file store. Kept thin: the decision
 * logic ("accepted-only", "no-duplicate", "wired-only") lives in `queue.ts` / `recipe/registry.ts`;
 * this just sequences load → guard → enqueue-per-recipe → save. Called by the `/review-ideas` accept
 * path; there is no separate `/produce` kickoff.
 *
 * The queue is derived from the ledger, never the reverse: an Idea must already be `accepted` in the
 * ledger before its Recipes can be enqueued (the ledger stays the source of truth).
 *
 * --- One job per (brand, idea, recipe) — issue #56 ---
 *
 * `enqueueOnAccept` takes the CHOSEN Recipe set explicitly (the Operator's Review-time pick, resolved
 * via `resolveRecipeSelection` and written to the ledger by `/review-ideas` — see
 * `src/recipe/offer.ts`/`src/ledger/ledger.ts`) and enqueues ONE job per Recipe, each keyed on the
 * composite `(brand, idea_id, recipe)`. A second Recipe on the same accepted Idea is never dropped as a
 * duplicate of the first — the two jobs are distinct triples.
 *
 * --- OPTIONAL SQL sync (issue #254) ---
 *
 * `data/queue.json` is written EXACTLY as before this ticket — unconditionally, unaffected by anything
 * below. When the caller ALSO passes `options.db`, this module additionally syncs every Recipe the file
 * queue decided was genuinely NEW (never one already `"already-queued"` there — that Recipe's SQL row was
 * synced on an earlier call, or predates this ticket via the one-shot importer) into SQL, through
 * `sql-sync.ts`'s `syncAcceptToSql` — the SAME `job` table the unattended worker's `findNextQueuedJob`
 * actually reads. Omitting `db` (every existing caller, until this ticket wires one in) leaves this
 * function's behavior byte-for-byte unchanged. A SQL sync failure is NEVER swallowed: it throws, after
 * the file queue has already been saved — so the attended, file-based pipeline this ticket promises not
 * to change is never blocked by a SQL problem, but nobody calling this function can mistake a failed SQL
 * sync for a quiet success either. See `sql-sync.ts`'s own doc comment for the full contract.
 */

import type { DatabaseSync } from "node:sqlite";

import { findIdea, loadIdeas } from "../ledger/ledger.ts";
import { getRecipe } from "../recipe/registry.ts";
import { enqueue, hasJobFor, type QueueState } from "./queue.ts";
import { loadQueue, saveQueue, DEFAULT_QUEUE_PATH } from "./store.ts";
import { syncAcceptToSql, type SqlSyncOutcome } from "./sql-sync.ts";

/** Why one Recipe was NOT enqueued. */
export type EnqueueSkipReason = "not-accepted" | "already-queued" | "unknown-idea" | "unwired-recipe";

/** The per-Recipe outcome of an enqueue-on-accept attempt. */
export interface EnqueueOutcome {
  readonly recipe: string;
  readonly enqueued: boolean;
  /** Present when `enqueued` is false. */
  readonly reason?: EnqueueSkipReason;
}

/** Outcome of an enqueue-on-accept attempt across every requested Recipe. */
export interface EnqueueResult {
  /** True when at least one Recipe was newly enqueued. */
  readonly enqueued: boolean;
  /** Per-Recipe outcome, in the order `recipes` was given. */
  readonly outcomes: readonly EnqueueOutcome[];
  /** The queue state after the attempt. */
  readonly state: QueueState;
  /** Present only when `options.db` was given AND at least one Recipe was newly enqueued in the file
   *  queue this call (issue #254) — the SQL sync outcome for those same Recipes. Absent (never a
   *  fabricated empty value) when no `db` was given, or when nothing was newly enqueued. */
  readonly sql?: SqlSyncOutcome;
}

export interface EnqueueOnAcceptOptions {
  /** REQUIRED: the Brand's ledger path. There is no ambient/brand-scoped default (acceptance is
   *  always validated against the named Brand's own ledger, never a fallback Brand's). */
  readonly ledgerPath: string;
  /** The global Production Queue path; defaults to the brand-agnostic `DEFAULT_QUEUE_PATH`
   *  (one queue shared across all Brands — ADR-0006/0008). */
  readonly queuePath?: string;
  /** Injected clock for deterministic timestamps in tests; defaults to now. */
  readonly now?: () => string;
  /** OPTIONAL (issue #254): when given, ALSO syncs the newly-enqueued Recipes into SQL — see this
   *  module's own doc comment. Omitted, this function's behavior is unchanged from before this ticket. */
  readonly db?: DatabaseSync;
  /** Passed straight through to the SQL sync's Brief lookup; overridden only by tests. */
  readonly brandsRoot?: string;
}

/**
 * Decide what enqueueing an Idea's chosen Recipes should do, given the current ledger and queue state.
 * Pure: no I/O. Exposed so the accepted-only + no-duplicate + wired-only policy is unit-testable
 * without the filesystem.
 *
 * @param ideas    the current ledger Ideas
 * @param queue    the current queue state
 * @param ideaId   the Idea to enqueue
 * @param now      ISO-8601 timestamp for `enqueued_at`
 * @param brand    the Brand slug to stamp on every enqueued job (required — never ambient/session)
 * @param recipes  the CHOSEN Recipe slugs to enqueue one job each for (issue #56)
 */
export function planEnqueue(
  ideas: Parameters<typeof findIdea>[0],
  queue: QueueState,
  ideaId: string,
  now: string,
  brand: string,
  recipes: readonly string[],
): EnqueueResult {
  const idea = findIdea(ideas, ideaId);
  if (idea === null) {
    return {
      enqueued: false,
      outcomes: recipes.map((recipe) => ({ recipe, enqueued: false, reason: "unknown-idea" as const })),
      state: queue,
    };
  }
  if (idea.status !== "accepted") {
    // Rejected (or suggested) Ideas never produce a job — credits only on accepted Ideas.
    return {
      enqueued: false,
      outcomes: recipes.map((recipe) => ({ recipe, enqueued: false, reason: "not-accepted" as const })),
      state: queue,
    };
  }

  let state = queue;
  let anyEnqueued = false;
  const outcomes: EnqueueOutcome[] = [];
  for (const recipe of recipes) {
    const def = getRecipe(recipe);
    if (def === null) {
      // Defensive: an unwired Recipe slug is never enqueued — `/review-ideas` already filters to wired
      // Recipes only, but this guard never fabricates a gate for a Recipe this registry does not know.
      outcomes.push({ recipe, enqueued: false, reason: "unwired-recipe" });
      continue;
    }
    if (hasJobFor(state, brand, ideaId, recipe)) {
      outcomes.push({ recipe, enqueued: false, reason: "already-queued" });
      continue;
    }
    const firstGate = def.gates[0] ?? null;
    state = enqueue(state, ideaId, now, brand, recipe, firstGate);
    outcomes.push({ recipe, enqueued: true });
    anyEnqueued = true;
  }

  return { enqueued: anyEnqueued, outcomes, state };
}

/**
 * Load ledger + queue, apply the enqueue policy for every chosen Recipe, and persist if anything
 * changed.
 *
 * @param ideaId   the Idea to enqueue
 * @param brand    the Brand slug to stamp on every enqueued job (required — never ambient/session)
 * @param recipes  the CHOSEN Recipe slugs (the Operator's Review-time pick) to enqueue one job each for
 * @param options  optional path/clock overrides
 */
export async function enqueueOnAccept(
  ideaId: string,
  brand: string,
  recipes: readonly string[],
  options: EnqueueOnAcceptOptions,
): Promise<EnqueueResult> {
  const ledgerPath = options.ledgerPath;
  const queuePath = options.queuePath ?? DEFAULT_QUEUE_PATH;
  const now = (options.now ?? (() => new Date().toISOString()))();

  const ideas = await loadIdeas(ledgerPath, brand);
  const queue = await loadQueue(queuePath);
  const result = planEnqueue(ideas, queue, ideaId, now, brand, recipes);

  if (result.enqueued) {
    await saveQueue(result.state, queuePath);
  }

  // --- OPTIONAL SQL sync (issue #254) — never affects the file write above, which already happened ----
  if (options.db !== undefined) {
    const newlyEnqueuedRecipes = result.outcomes.filter((o) => o.enqueued).map((o) => o.recipe);
    if (newlyEnqueuedRecipes.length > 0) {
      const sql = await syncAcceptToSql(ideaId, newlyEnqueuedRecipes, {
        db: options.db,
        brand,
        ledgerPath,
        ...(options.brandsRoot !== undefined ? { brandsRoot: options.brandsRoot } : {}),
        now: () => now,
      });
      return { ...result, sql };
    }
  }

  return result;
}
