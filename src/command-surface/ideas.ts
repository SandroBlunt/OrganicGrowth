/**
 * `createIdea` / `recordReviewDecision` — the typed command surface's Idea operations (issue #205 AC1,
 * epic #195's "creating an Idea" and "recording a Review decision" — thin orchestration shells over
 * `src/idea/store.ts`).
 *
 * `recordReviewDecision` composes IdeaStore's two separate Review primitives — `acceptIdea`/`rejectIdea`
 * plus, for an acceptance, `selectIdeaRecipes` — behind ONE call matching CONTEXT.md's own "Review"
 * definition: "the gate between a `suggested` and an `accepted` Idea ... Accepting enqueues one
 * production job per chosen Recipe" is one Operator decision, not two independent store calls a caller
 * has to remember to sequence correctly.
 *
 * `acceptIdea` and `selectIdeaRecipes` are each already atomic on their own (`selectIdeaRecipes` wraps
 * its own `withTransaction`); they are NOT wrapped in a further outer transaction here, because
 * `withTransaction` does not support nesting (`src/db/transaction.ts`'s own doc comment — SQLite itself
 * rejects a `BEGIN` issued while a transaction is already open) and `selectIdeaRecipes`'s own internal
 * transaction cannot be un-wrapped without duplicating its upsert logic here. Both calls are
 * SYNCHRONOUS (`node:sqlite`'s `DatabaseSync`) with no `await` between them, so no other code can ever
 * interleave between "Idea accepted" and "Recipes recorded" in this process — the only residual risk is
 * a process crash in the narrow window between the two statements, the same class of risk this
 * codebase already accepts between e.g. `createJob` and a separate `createGateRequest` call elsewhere.
 */

import type { DatabaseSync } from "node:sqlite";

import {
  createIdea as createIdeaRow,
  acceptIdea,
  rejectIdea,
  selectIdeaRecipes,
  classifyIdea as classifyIdeaRow,
  claimLegacyRef as claimLegacyRefRow,
  type IdeaInput,
  type IdeaRecipeSelectionItem,
  type IdeaClassificationInput,
} from "../idea/store.ts";

export type { IdeaInput, IdeaRecipeSelectionItem, IdeaClassificationInput };

/** The Operator's Review decision for one Idea (CONTEXT.md "Review") — accept with its chosen/declined
 *  Recipes, or reject with a required, non-blank reason. */
export type ReviewDecision =
  | { readonly outcome: "accepted"; readonly recipes: readonly IdeaRecipeSelectionItem[] }
  | { readonly outcome: "rejected"; readonly rejectionReason: string };

/** Creates a new, `suggested` Idea. Returns its generated id. Throws `IdeaValidationError` for an
 *  out-of-vocabulary `hookType`/`theme`, or the openly-readable-source violation (issue #228), BEFORE
 *  any write. See `src/idea/store.ts`'s `createIdea` for the full contract. */
export function createIdea(
  db: DatabaseSync,
  input: IdeaInput,
  now: () => string = () => new Date().toISOString(),
): string {
  return createIdeaRow(db, input, now);
}

/**
 * Records the Operator's Review decision for `ideaId`. For `"accepted"`, moves the Idea to `accepted`
 * and records every offered Recipe's selection (`decision.recipes` — may be `[]`, meaning no Recipe
 * selection is being recorded YET). For `"rejected"`, moves the Idea to `rejected` and records
 * `decision.rejectionReason` verbatim. Throws (changing nothing) for an Idea that is not currently
 * `suggested`, an unknown `ideaId`, a blank `rejectionReason`, or a declined Recipe with no
 * `declineReason` — see `src/idea/store.ts`'s `acceptIdea`/`rejectIdea`/`selectIdeaRecipes` for the
 * full per-case contract.
 */
export function recordReviewDecision(
  db: DatabaseSync,
  ideaId: string,
  decision: ReviewDecision,
  now: () => string = () => new Date().toISOString(),
): void {
  if (decision.outcome === "accepted") {
    acceptIdea(db, ideaId, now);
    selectIdeaRecipes(db, ideaId, decision.recipes, now);
    return;
  }
  rejectIdea(db, ideaId, decision.rejectionReason, now);
}

/**
 * Records one Idea's `hookType`/`theme` classification, plus how each was arrived at (issue #206's
 * backfill classifier — `src/hook-theme-backfill/`'s only write, and the only sanctioned entry point for
 * setting these columns after `createIdea`). Throws `IdeaValidationError` for an out-of-vocabulary
 * `hookType`/`theme`/source, or a plain error naming an unknown `ideaId`, BEFORE any write — see
 * `src/idea/store.ts`'s `classifyIdea` for the full contract.
 */
export function classifyIdea(
  db: DatabaseSync,
  ideaId: string,
  input: IdeaClassificationInput,
  now: () => string = () => new Date().toISOString(),
): void {
  classifyIdeaRow(db, ideaId, input, now);
}

/**
 * Reconciles a pre-migration-5 Idea row (one carrying no `legacy_ref` yet) to the file ledger's real
 * identity — the command-surface entry point for `production-queue/sql-sync.ts`'s legacy-identity
 * fallback (issue #254 Round 3, Defect A). Throws for an unknown `id`, or one that already carries a
 * `legacy_ref` — see `src/idea/store.ts`'s `claimLegacyRef` for the full contract.
 */
export function claimLegacyRef(
  db: DatabaseSync,
  id: string,
  legacyRef: string,
  now: () => string = () => new Date().toISOString(),
): void {
  claimLegacyRefRow(db, id, legacyRef, now);
}
