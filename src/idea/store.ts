/**
 * IdeaStore — the SQL-backed typed store for the `idea`/`idea_recipe` tables (issue #223, ADR-0029).
 *
 * Genuinely NEW, `{ db }`-only, mirroring `src/brand/store.ts`/`src/channel/store.ts`/`src/copy/store.ts`
 * (issue #222): there was no pre-existing `{ ledgerPath }`-taking "Idea store" to bridge via an
 * overload — `src/ledger/ledger.ts`'s existing Idea reads/writes are untouched, and stay the one thing
 * real production callers actually use until issue #204's importer wires SQL onto a live command.
 *
 * `createIdea` is where two closed vocabularies (`hook_type`/`theme`, issue #201/#219) are validated at
 * the STORE boundary, not merely relied on via the schema's own FOREIGN KEY into
 * `hook_type_vocabulary`/`theme_vocabulary` — a bad value here throws a named, actionable
 * `IdeaValidationError` before any SQL runs, rather than a raw SQLite FK error. `unclassified` passes
 * this check exactly like the ten/nine real values: this store only ever asks "is this ONE OF the
 * closed set", never "is this a REAL, classified value" — that stronger judgment is the classifier's
 * job (issue #206), never this store's.
 *
 * `acceptIdea`/`rejectIdea` are the two Review outcomes (CONTEXT.md "Review": "the gate between a
 * `suggested` and an `accepted` Idea"); `selectIdeaRecipes` is Review's Recipe-selection half, recording
 * every Recipe OFFERED — chosen or declined-with-reason — as its own `idea_recipe` row, atomically
 * (`withTransaction`, issue #222).
 *
 * Pure, deterministic SQL against an already-open, already-migrated `DatabaseSync` — no file I/O, no
 * network, no clock (except the injectable `now` parameter, matching every other store issue #222/#223
 * ships).
 */

import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { withTransaction } from "../db/transaction.ts";
import { isHookType, HOOK_TYPES, type HookType } from "../vocabulary/hook-type.ts";
import { isTheme, THEMES, type Theme } from "../vocabulary/theme.ts";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown when a value given to this store fails a store-boundary validation rule (an out-of-vocabulary
 *  `hookType`/`theme`, a blank Rejection Reason, or a declined Recipe with no decline reason) — thrown
 *  BEFORE any SQL runs, never a raw SQLite constraint error standing in for one of these. */
export class IdeaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdeaValidationError";
  }
}

function assertValidHookType(value: string): asserts value is HookType {
  if (!isHookType(value)) {
    throw new IdeaValidationError(
      `Unknown hook_type ${JSON.stringify(value)}. Must be one of: ${HOOK_TYPES.map((t) => t.value).join(", ")}.`,
    );
  }
}

function assertValidTheme(value: string): asserts value is Theme {
  if (!isTheme(value)) {
    throw new IdeaValidationError(
      `Unknown theme ${JSON.stringify(value)}. Must be one of: ${THEMES.map((t) => t.value).join(", ")}.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Types — idea
// ---------------------------------------------------------------------------

/** The `idea.status` lifecycle — CONTEXT.md "Review": the gate between `suggested` and `accepted`. */
export type IdeaStatus = "suggested" | "accepted" | "rejected";

/** The fields `createIdea` requires/accepts, minus id/status/timestamps (assigned by this module —
 *  every Idea is created `suggested`; see this module's own doc comment). */
export interface IdeaInput {
  readonly runId: string;
  readonly brandId: string;
  readonly formatId: string;
  readonly trendId?: string;
  readonly title: string;
  readonly brief: string;
  /** REQUIRED — not a nullable convenience. Validated against the closed vocabulary before any write. */
  readonly hookType: HookType;
  /** REQUIRED — not a nullable convenience. Validated against the closed vocabulary before any write. */
  readonly theme: Theme;
  readonly sourceUrls?: readonly string[];
  readonly fitScore?: number;
  readonly relevance?: number;
  readonly momentum?: number;
  readonly brandFit?: number;
}

/** One `idea` row, fully typed. */
export interface IdeaRecord {
  readonly id: string;
  readonly runId: string;
  readonly brandId: string;
  readonly formatId: string;
  readonly trendId?: string;
  readonly title: string;
  readonly brief: string;
  readonly status: IdeaStatus;
  readonly rejectionReason?: string;
  readonly fitScore?: number;
  readonly relevance?: number;
  readonly momentum?: number;
  readonly brandFit?: number;
  readonly hookType: HookType;
  readonly theme: Theme;
  readonly sourceUrls: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface IdeaRow {
  readonly id: string;
  readonly run_id: string;
  readonly brand_id: string;
  readonly format_id: string;
  readonly trend_id: string | null;
  readonly title: string;
  readonly brief: string;
  readonly status: string;
  readonly rejection_reason: string | null;
  readonly fit_score: number | null;
  readonly relevance: number | null;
  readonly momentum: number | null;
  readonly brand_fit: number | null;
  readonly hook_type: string;
  readonly theme: string;
  readonly source_urls_json: string;
  readonly created_at: string;
  readonly updated_at: string;
}

function toIdeaRecord(row: IdeaRow): IdeaRecord {
  return {
    id: row.id,
    runId: row.run_id,
    brandId: row.brand_id,
    formatId: row.format_id,
    ...(row.trend_id !== null ? { trendId: row.trend_id } : {}),
    title: row.title,
    brief: row.brief,
    status: row.status as IdeaStatus,
    ...(row.rejection_reason !== null ? { rejectionReason: row.rejection_reason } : {}),
    ...(row.fit_score !== null ? { fitScore: row.fit_score } : {}),
    ...(row.relevance !== null ? { relevance: row.relevance } : {}),
    ...(row.momentum !== null ? { momentum: row.momentum } : {}),
    ...(row.brand_fit !== null ? { brandFit: row.brand_fit } : {}),
    hookType: row.hook_type as HookType,
    theme: row.theme as Theme,
    sourceUrls: JSON.parse(row.source_urls_json) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// createIdea
// ---------------------------------------------------------------------------

/**
 * Inserts one `idea` row, always at `status: 'suggested'`, and returns its generated id. Validates
 * `hookType`/`theme` against the closed vocabularies BEFORE issuing any SQL (`IdeaValidationError`).
 * Throws (SQLite FOREIGN KEY error) for an unknown `runId`/`brandId`/`formatId`/`trendId`.
 */
export function createIdea(
  db: DatabaseSync,
  input: IdeaInput,
  now: () => string = () => new Date().toISOString(),
): string {
  assertValidHookType(input.hookType);
  assertValidTheme(input.theme);

  const id = randomUUID();
  const timestamp = now();
  db.prepare(
    `INSERT INTO idea
       (id, run_id, brand_id, format_id, trend_id, title, brief, status, fit_score, relevance, momentum,
        brand_fit, hook_type, theme, source_urls_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'suggested', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.runId,
    input.brandId,
    input.formatId,
    input.trendId ?? null,
    input.title,
    input.brief,
    input.fitScore ?? null,
    input.relevance ?? null,
    input.momentum ?? null,
    input.brandFit ?? null,
    input.hookType,
    input.theme,
    JSON.stringify(input.sourceUrls ?? []),
    timestamp,
    timestamp,
  );
  return id;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Looks up one Idea by its stable id. Returns `null` for an unknown id — never throws. */
export function getIdea(db: DatabaseSync, id: string): IdeaRecord | null {
  const row = db.prepare(`SELECT * FROM idea WHERE id = ?`).get(id) as unknown as IdeaRow | undefined;
  return row ? toIdeaRecord(row) : null;
}

/** Every Idea for one Run, in creation order. `[]` for a Run with none (or an unknown Run). */
export function listIdeasForRun(db: DatabaseSync, runId: string): readonly IdeaRecord[] {
  const rows = db
    .prepare(`SELECT * FROM idea WHERE run_id = ? ORDER BY created_at ASC`)
    .all(runId) as unknown as IdeaRow[];
  return rows.map(toIdeaRecord);
}

// ---------------------------------------------------------------------------
// acceptIdea / rejectIdea — the two Review outcomes
// ---------------------------------------------------------------------------

/** Loads the Idea at `ideaId` or throws a clear "not found" error naming it — the shared guard both
 *  `acceptIdea`/`rejectIdea` open with. */
function requireIdea(db: DatabaseSync, ideaId: string): IdeaRecord {
  const idea = getIdea(db, ideaId);
  if (idea === null) {
    throw new Error(`Idea "${ideaId}" not found.`);
  }
  return idea;
}

/** Throws a clear error, naming the Idea and its current status, when `idea` is not `suggested` — the
 *  shared precondition both Review outcomes require (an already-decided Idea cannot be re-decided
 *  through this path). */
function requireSuggested(idea: IdeaRecord): void {
  if (idea.status !== "suggested") {
    throw new Error(`Idea "${idea.id}" is "${idea.status}", not "suggested" — Review can only decide a suggested Idea.`);
  }
}

/** Moves a `suggested` Idea to `accepted`. Throws (changing nothing) for an unknown `ideaId` or an
 *  Idea that is not currently `suggested`. */
export function acceptIdea(
  db: DatabaseSync,
  ideaId: string,
  now: () => string = () => new Date().toISOString(),
): void {
  const idea = requireIdea(db, ideaId);
  requireSuggested(idea);
  db.prepare(`UPDATE idea SET status = 'accepted', updated_at = ? WHERE id = ?`).run(now(), ideaId);
}

/**
 * Moves a `suggested` Idea to `rejected`, recording `rejectionReason` verbatim (CONTEXT.md "Rejection
 * Reason": always captured at Review, logged verbatim). Throws `IdeaValidationError` for a blank/
 * whitespace-only `rejectionReason` BEFORE touching the row at all — even before checking the Idea's
 * current status. Throws (changing nothing) for an unknown `ideaId` or an Idea that is not currently
 * `suggested`.
 */
export function rejectIdea(
  db: DatabaseSync,
  ideaId: string,
  rejectionReason: string,
  now: () => string = () => new Date().toISOString(),
): void {
  if (typeof rejectionReason !== "string" || rejectionReason.trim().length === 0) {
    throw new IdeaValidationError(
      "rejectIdea requires a non-empty rejectionReason (CONTEXT.md \"Rejection Reason\" — always captured at Review, logged verbatim).",
    );
  }
  const idea = requireIdea(db, ideaId);
  requireSuggested(idea);
  db.prepare(`UPDATE idea SET status = 'rejected', rejection_reason = ?, updated_at = ? WHERE id = ?`).run(
    rejectionReason,
    now(),
    ideaId,
  );
}

// ---------------------------------------------------------------------------
// selectIdeaRecipes / listIdeaRecipes — Recipe selection, the other half of Review
// ---------------------------------------------------------------------------

/** One Recipe offered at Review: kept (`chosen: true`) or declined (`chosen: false`, with a REQUIRED,
 *  non-blank `declineReason` — the Recipe-level sibling of an Idea's own Rejection Reason). */
export interface IdeaRecipeSelectionItem {
  readonly recipe: string;
  readonly chosen: boolean;
  readonly declineReason?: string;
}

/** One `idea_recipe` row, fully typed. */
export interface IdeaRecipeRecord {
  readonly id: string;
  readonly ideaId: string;
  readonly recipe: string;
  readonly chosen: boolean;
  readonly declineReason?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface IdeaRecipeRow {
  readonly id: string;
  readonly idea_id: string;
  readonly recipe_slug: string;
  readonly chosen: number;
  readonly decline_reason: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

function toIdeaRecipeRecord(row: IdeaRecipeRow): IdeaRecipeRecord {
  return {
    id: row.id,
    ideaId: row.idea_id,
    recipe: row.recipe_slug,
    chosen: row.chosen === 1,
    ...(row.decline_reason !== null ? { declineReason: row.decline_reason } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Inserts or updates ONE `idea_recipe` row, keyed on `(idea_id, recipe_slug)` (the schema's own
 *  `UNIQUE` constraint) — mirrors `upsertCopyVariant`'s keyed-upsert shape (issue #222). */
function upsertIdeaRecipeRow(
  db: DatabaseSync,
  ideaId: string,
  item: IdeaRecipeSelectionItem,
  now: () => string,
): string {
  const existing = db
    .prepare(`SELECT id FROM idea_recipe WHERE idea_id = ? AND recipe_slug = ?`)
    .get(ideaId, item.recipe) as unknown as { readonly id: string } | undefined;
  const timestamp = now();
  const declineReason = item.chosen ? null : (item.declineReason ?? null);

  if (existing === undefined) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO idea_recipe (id, idea_id, recipe_slug, chosen, decline_reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, ideaId, item.recipe, item.chosen ? 1 : 0, declineReason, timestamp, timestamp);
    return id;
  }

  db.prepare(`UPDATE idea_recipe SET chosen = ?, decline_reason = ?, updated_at = ? WHERE id = ?`).run(
    item.chosen ? 1 : 0,
    declineReason,
    timestamp,
    existing.id,
  );
  return existing.id;
}

/**
 * Writes every OFFERED Recipe's `idea_recipe` row — chosen or declined-with-reason — for one Idea,
 * inside ONE transaction (`withTransaction`, issue #222). A `chosen: false` item with a blank/absent
 * `declineReason` is rejected for the WHOLE call BEFORE any row is written (a pre-check, not a partial
 * DB round-trip). Calling this again for the SAME `(idea, recipe)` pair UPDATES that row in place —
 * never duplicates it. An unwired `recipe_slug` is rejected by the schema's own FOREIGN KEY into
 * `recipe_vocabulary` (the same registry-trusted convention `AssetStore`'s `{ db }` branch uses, issue
 * #222); when it occurs partway through a multi-item batch, the WHOLE batch rolls back, including items
 * that individually would have succeeded. Returns the row ids, in the same order as `selections`.
 */
export function selectIdeaRecipes(
  db: DatabaseSync,
  ideaId: string,
  selections: readonly IdeaRecipeSelectionItem[],
  now: () => string = () => new Date().toISOString(),
): readonly string[] {
  for (const item of selections) {
    if (!item.chosen && (typeof item.declineReason !== "string" || item.declineReason.trim().length === 0)) {
      throw new IdeaValidationError(
        `selectIdeaRecipes: declined Recipe ${JSON.stringify(item.recipe)} must carry a non-empty declineReason.`,
      );
    }
  }
  return withTransaction(db, () => selections.map((item) => upsertIdeaRecipeRow(db, ideaId, item, now)));
}

/** Every offered-Recipe row for one Idea, in write order. `[]` when no selection has been recorded
 *  yet. */
export function listIdeaRecipes(db: DatabaseSync, ideaId: string): readonly IdeaRecipeRecord[] {
  const rows = db
    .prepare(`SELECT * FROM idea_recipe WHERE idea_id = ? ORDER BY created_at ASC`)
    .all(ideaId) as unknown as IdeaRecipeRow[];
  return rows.map(toIdeaRecipeRecord);
}
