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
 * `IdeaValidationError` before the row is written, rather than a raw SQLite FK error. `unclassified`
 * passes this check exactly like the ten/nine real values: this store only ever asks "is this ONE OF the
 * closed set", never "is this a REAL, classified value" — that stronger judgment is the classifier's
 * job (issue #206), never this store's.
 *
 * `createIdea` also enforces the openly-readable-source rule (issue #228, `.claude/agents/
 * idea-strategist.md` lines 69-74, Operator rule 2026-08-11 — idea-03 of the first daily Run was
 * rejected exactly for this): a Trend's `is_paywalled` flag is a momentum signal, never a citation on
 * its own, so an Idea whose `trendId` points at a paywalled Trend AND carries no `sourceUrls` of its
 * own is rejected, raising the SAME `IdeaValidationError` — never a new error type. This is deliberately
 * NOT "reject when trendId is paywalled": an Idea legitimately citing a paywalled Trend as a momentum
 * signal while carrying at least one openly readable `sourceUrls` entry of its own is accepted — #223
 * made the paywalled fact queryable (`TrendStore.listBriefableTrends`) but enforced nothing; this is the
 * actual store-boundary gate #223's AC4 asked for. Checking this needs one read (`getTrend`) — the ONE
 * exception to "before any SQL": what stays true, matching hookType/theme, is that no WRITE (`INSERT`)
 * ever runs before every validation (including this one) has passed.
 *
 * The rule is "there is a source a human could actually open", not merely "the array is non-empty"
 * (QA round-1 finding, issue #228): a blank (`""`) or whitespace-only (`"   "`) `sourceUrls` entry is
 * treated as ABSENT, never as satisfying the rule, so `sourceUrls: [""]` is rejected exactly like
 * `sourceUrls: []`. This does NOT extend to requiring the entry be URL-shaped — see
 * `assertOpenlyReadableSource`'s own doc comment for why (real Brief data reviewed, finding recorded
 * there and in this issue's `handoff.md`).
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
import { getTrend } from "../trend/store.ts";
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

/**
 * A classification's provenance (issue #206, migration 4): how `classifyIdea` arrived at the
 * `hookType`/`theme` it is writing — `'heading'` when a literal technique/subject was named in the
 * Brief's own `## Hook concept`/`## Hook Concept` heading, `'inferred'` when the classifier read the
 * Brief as a whole because the heading named no literal technique. A plain, schema-fixed two-value set
 * (`idea.hook_type_source`/`idea.theme_source`'s own `CHECK`, `src/db/schema.ts`'s `MIGRATION_4`) — not
 * one of the three cross-Brand, independently-evolving closed vocabularies (`hook_type`/`theme`/
 * `recipe_slug`), so it lives here beside `classifyIdea` rather than under `src/vocabulary/`.
 */
export type ClassificationSource = "heading" | "inferred";

const CLASSIFICATION_SOURCE_VALUES: ReadonlySet<string> = new Set<ClassificationSource>(["heading", "inferred"]);

function assertValidClassificationSource(
  field: "hookTypeSource" | "themeSource",
  value: string,
): asserts value is ClassificationSource {
  if (!CLASSIFICATION_SOURCE_VALUES.has(value)) {
    throw new IdeaValidationError(`Unknown ${field} ${JSON.stringify(value)}. Must be one of: heading, inferred.`);
  }
}

/**
 * `true` when `sourceUrls` holds at least one entry that is not blank/whitespace-only after trimming —
 * "there is a source a human could actually open", not merely "the array is non-empty" (issue #228, QA
 * round-1 finding: `sourceUrls: [""]`/`["   "]` was accepted as if it were a real source). Deliberately
 * does NOT also require the entry look URL-shaped (e.g. `new URL(...)` parsing or an `https?://` prefix
 * check): a survey of the real Briefs under every Brand's `ideas` directory (recursively, every Brief
 * markdown file — the only real-world evidence available, since no Idea row anywhere yet carries a
 * populated `sourceUrls`; #204's importer is the only thing that will ever populate it from real data,
 * and it has not run) found the "## Source(s)" section is mostly clean `https://` links but ALSO
 * legitimately carries non-URL editorial/verification notes as their own bullets (e.g. "(No distinct
 * official X corporate blog post was found for this specific feature.)", "Verification note
 * (2026-08-11): sanders.senate.gov returns 403 to automated fetchers...")
 * — commentary ABOUT sourcing, not itself a citation. #204's importer, not this store, is the thing that
 * will decide how to parse that prose into clean `sourceUrls` entries; inventing a URL-shape check here,
 * ahead of that importer and not asked for by any acceptance criterion, risks rejecting legitimate
 * imported data in a way nobody has designed for yet (see this issue's `handoff.md` Round-2 Build for
 * the full finding). No other `{ db }` store in this codebase validates URL format/content either.
 */
function hasAtLeastOneReadableSource(sourceUrls: readonly string[] | undefined): boolean {
  if (sourceUrls === undefined) return false;
  return sourceUrls.some((url) => url.trim().length > 0);
}

/**
 * The openly-readable-source rule (issue #228, `.claude/agents/idea-strategist.md` lines 69-74): a
 * paywalled Trend is a momentum signal, not a citation — an Idea that points at one via `trendId` needs
 * at least one openly readable `sourceUrls` entry of its own (blank/whitespace-only entries do not
 * count — `hasAtLeastOneReadableSource` above) before it can be briefed. Deliberately does NOT reject
 * merely because `trendId` is paywalled: an Idea carrying its own non-blank `sourceUrls` entry is
 * accepted regardless. An unset `trendId`, or a `trendId` the caller passed but this database has no
 * committed Trend row for, is never blocked by this rule — an unknown `trendId` is left for the
 * schema's own FOREIGN KEY to reject on `INSERT`, mirroring `createIdea`'s existing not-pre-validated
 * convention for `runId`/`brandId`/`formatId`.
 */
function assertOpenlyReadableSource(
  db: DatabaseSync,
  trendId: string | undefined,
  sourceUrls: readonly string[] | undefined,
): void {
  if (trendId === undefined) return;
  const trend = getTrend(db, trendId);
  if (trend === null) return;
  if (trend.isPaywalled && !hasAtLeastOneReadableSource(sourceUrls)) {
    throw new IdeaValidationError(
      `trendId ${JSON.stringify(trendId)} points at a paywalled Trend, and this Idea carries no ` +
        `non-blank sourceUrls of its own. A paywalled Trend is a momentum signal, not a citation — the ` +
        `Idea needs at least one openly readable sourceUrl (not blank/whitespace-only) before it can be ` +
        `briefed (see .claude/agents/idea-strategist.md's openly-readable-source rule, issue #228).`,
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
  /** The file ledger's own Idea id (e.g. `"idea-05"`), when this Idea correlates to one (migration 5,
   *  issue #254) — the real, per-Brand-unique identity `getIdeaByLegacyRef` looks up by. Omitted for an
   *  Idea created with no ledger correlate. Enforced UNIQUE per `brandId` by the schema itself (a partial
   *  index — `NULL` values are never compared), so two DIFFERENT `idea` rows can never silently share one. */
  readonly legacyRef?: string;
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
  /** Present only once `classifyIdea` has recorded provenance for this Idea's `hookType` (issue #206) —
   *  absent (never a fabricated value) for an Idea `createIdea` created but `classifyIdea` has never
   *  touched, INCLUDING one carrying the importer's own `unclassified` default (issue #219/#204), which
   *  records no provenance because nothing was actually read. */
  readonly hookTypeSource?: ClassificationSource;
  /** The `theme` sibling of `hookTypeSource` above — independently present/absent. */
  readonly themeSource?: ClassificationSource;
  /** The file ledger's own Idea id this row correlates to (migration 5, issue #254) — absent (never a
   *  fabricated value) for an Idea created with no ledger correlate. */
  readonly legacyRef?: string;
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
  readonly hook_type_source: string | null;
  readonly theme_source: string | null;
  readonly legacy_ref: string | null;
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
    ...(row.hook_type_source !== null ? { hookTypeSource: row.hook_type_source as ClassificationSource } : {}),
    ...(row.theme_source !== null ? { themeSource: row.theme_source as ClassificationSource } : {}),
    ...(row.legacy_ref !== null ? { legacyRef: row.legacy_ref } : {}),
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
 * `hookType`/`theme` against the closed vocabularies, and the openly-readable-source rule (issue #228)
 * against the pointed-at Trend's `is_paywalled` flag, BEFORE any write (`IdeaValidationError`). Throws
 * (SQLite FOREIGN KEY error) for an unknown `runId`/`brandId`/`formatId`/`trendId`.
 */
export function createIdea(
  db: DatabaseSync,
  input: IdeaInput,
  now: () => string = () => new Date().toISOString(),
): string {
  assertValidHookType(input.hookType);
  assertValidTheme(input.theme);
  assertOpenlyReadableSource(db, input.trendId, input.sourceUrls);

  const id = randomUUID();
  const timestamp = now();
  db.prepare(
    `INSERT INTO idea
       (id, run_id, brand_id, format_id, trend_id, title, brief, status, fit_score, relevance, momentum,
        brand_fit, hook_type, theme, legacy_ref, source_urls_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'suggested', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    input.legacyRef ?? null,
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

/**
 * Looks up an Idea by its real, per-Brand-unique identity (migration 5, issue #254): the file ledger's
 * own Idea id, scoped to `brandId` (never globally — two DIFFERENT Brands may legitimately reuse the
 * same ledger-style id, e.g. both minting `"idea-01"` for their own first Run). Returns `null` when no
 * Idea in this Brand carries `legacyRef` — never throws. This is the SAME correlating key
 * `src/production-queue/sql-sync.ts`'s accept-flow sync now resolves identity by, replacing the earlier
 * `(run_id, title)` natural key that silently merged two genuinely distinct Ideas sharing one title.
 */
export function getIdeaByLegacyRef(db: DatabaseSync, brandId: string, legacyRef: string): IdeaRecord | null {
  const row = db
    .prepare(`SELECT * FROM idea WHERE brand_id = ? AND legacy_ref = ?`)
    .get(brandId, legacyRef) as unknown as IdeaRow | undefined;
  return row ? toIdeaRecord(row) : null;
}

/**
 * Every Idea in `runId` sharing `title` EXACTLY that carries NO `legacy_ref` yet (`legacy_ref IS NULL`)
 * — the reconciliation candidate pool for `syncAcceptToSql`'s legacy-identity FALLBACK (issue #254 Round
 * 3, Defect A). `getIdeaByLegacyRef` above is the PRIMARY lookup; it returns `null` for any Idea imported
 * by the ORIGINAL one-shot importer run (2026-08-17), which predates migration 5 and so carries no
 * `legacy_ref` at all. This is the SAME `(run_id, title)` natural key Round 1 used as its own primary
 * lookup, now used ONLY as a narrow, bounded fallback — scoped to unclaimed rows (`legacy_ref IS NULL`)
 * so an already-reconciled row (one some OTHER ledger Idea already adopted) can never be matched a
 * second time. `[]` when none match (or the Run has no Ideas at all). Ordered by `created_at` for a
 * deterministic, testable order — a caller MUST still treat 2+ results as genuinely ambiguous (refuse
 * loudly, `sql-sync.ts`'s own doc comment) rather than picking the first.
 */
export function listUnclaimedIdeasForRunByTitle(db: DatabaseSync, runId: string, title: string): readonly IdeaRecord[] {
  const rows = db
    .prepare(`SELECT * FROM idea WHERE run_id = ? AND title = ? AND legacy_ref IS NULL ORDER BY created_at ASC`)
    .all(runId, title) as unknown as IdeaRow[];
  return rows.map(toIdeaRecord);
}

/**
 * Stamps `legacyRef` onto an EXISTING Idea row that currently carries none — the one-time reconciliation
 * write for a pre-migration-5 imported row (issue #254 Round 3, Defect A). Once a caller has found
 * EXACTLY ONE unclaimed same-title candidate via `listUnclaimedIdeasForRunByTitle`, this claims it,
 * atomically (`UPDATE ... WHERE legacy_ref IS NULL`, so a genuinely concurrent second claim attempt for
 * the SAME row throws rather than silently overwriting the first one's claim) — every SUBSEQUENT sync of
 * the SAME ledger Idea then takes the fast `getIdeaByLegacyRef` path. Throws, naming `id`, when the row
 * does not exist OR already carries a `legacy_ref` — this function is only ever called immediately after
 * a fresh read confirmed the row was unclaimed, so either case is a caller bug (or a lost race) worth
 * surfacing loudly, never silently ignoring.
 */
export function claimLegacyRef(
  db: DatabaseSync,
  id: string,
  legacyRef: string,
  now: () => string = () => new Date().toISOString(),
): void {
  const result = db
    .prepare(`UPDATE idea SET legacy_ref = ?, updated_at = ? WHERE id = ? AND legacy_ref IS NULL`)
    .run(legacyRef, now(), id);
  if (result.changes === 0) {
    throw new Error(
      `claimLegacyRef: Idea "${id}" not found, or already carries a legacy_ref — refusing to overwrite an existing identity claim.`,
    );
  }
}

/** Every Idea in the database, across EVERY Run/Brand/Format, in creation order — `[]` for an empty
 *  database (issue #206: the backfill classifier needs the whole table, not one Run's slice, since the
 *  61 real Briefs it upgrades span many Runs). */
export function listAllIdeas(db: DatabaseSync): readonly IdeaRecord[] {
  const rows = db.prepare(`SELECT * FROM idea ORDER BY created_at ASC`).all() as unknown as IdeaRow[];
  return rows.map(toIdeaRecord);
}

/** Every Idea currently at `hookType`, in creation order — `[]` when none currently are (issue #206's
 *  own acceptance criterion: "a query for a single hook type returns the expected Ideas"). Reflects the
 *  Idea's CURRENT `hook_type`, so an Idea `classifyIdea` later moves to a different value stops
 *  appearing here — this is a live query, not a point-in-time snapshot. */
export function listIdeasByHookType(db: DatabaseSync, hookType: HookType): readonly IdeaRecord[] {
  const rows = db
    .prepare(`SELECT * FROM idea WHERE hook_type = ? ORDER BY created_at ASC`)
    .all(hookType) as unknown as IdeaRow[];
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

// ---------------------------------------------------------------------------
// classifyIdea — the Hook Type / Theme backfill's one write (issue #206)
// ---------------------------------------------------------------------------

/** The fields `classifyIdea` writes: the two closed-vocabulary values PLUS how each was arrived at. All
 *  four are required — a classification with no recorded provenance is exactly the gap issue #206 exists
 *  to close (the Operator's own condition: "how it was arrived at ... must be queryable, not just
 *  present in a log"). */
export interface IdeaClassificationInput {
  readonly hookType: HookType;
  readonly theme: Theme;
  readonly hookTypeSource: ClassificationSource;
  readonly themeSource: ClassificationSource;
}

/**
 * Updates an EXISTING Idea's `hook_type`/`theme` plus their provenance columns, in place — this is the
 * ONE write `src/hook-theme-backfill/`'s classifier (issue #206) is allowed to make, so that "the
 * classifications are written through IdeaStore, not by editing the database directly" (issue #206's own
 * acceptance criterion) is enforced by there being no OTHER way to set these columns after creation.
 * Validates `hookType`/`theme` against the closed vocabularies and `hookTypeSource`/`themeSource`
 * against the two-value provenance set (`IdeaValidationError`, naming the bad value) BEFORE any write —
 * mirroring `createIdea`'s own validate-before-write discipline. Throws a clear error naming `ideaId`
 * for an unknown Idea. Calling this again for the SAME Idea overwrites in place (an UPDATE, never a
 * second row) — this IS the mechanism that makes the backfill job re-runnable: a second run that computes
 * the SAME desired values is a safe, idempotent no-op at the database level (the deep planning module,
 * `src/hook-theme-backfill/backfill.ts`, additionally skips calling this at all when nothing would
 * change, so a re-run's report can honestly say "0 updated").
 */
export function classifyIdea(
  db: DatabaseSync,
  ideaId: string,
  input: IdeaClassificationInput,
  now: () => string = () => new Date().toISOString(),
): void {
  assertValidHookType(input.hookType);
  assertValidTheme(input.theme);
  assertValidClassificationSource("hookTypeSource", input.hookTypeSource);
  assertValidClassificationSource("themeSource", input.themeSource);
  requireIdea(db, ideaId);

  db.prepare(
    `UPDATE idea SET hook_type = ?, theme = ?, hook_type_source = ?, theme_source = ?, updated_at = ? WHERE id = ?`,
  ).run(input.hookType, input.theme, input.hookTypeSource, input.themeSource, now(), ideaId);
}
