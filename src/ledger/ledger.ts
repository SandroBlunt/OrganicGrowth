/**
 * Ledger reader + writers for a Brand's `ledger.json`.
 *
 * The ledger is the source of truth (always-rules #7, ADR-0002). As of issue #55 (ADR-0011),
 * production state has moved OFF the Idea and onto a per-Recipe **Asset**: the Idea itself now only
 * ever stores `suggested` / `accepted` / `rejected`, plus a list of Assets (one per chosen Recipe,
 * `src/asset/asset.ts`). Every reader here (`loadIdeas`, `loadReport`) runs each raw record through
 * `asset/migrate.ts`'s `normalizeIdeaStatus` TRANSPARENTLY (never persisted) — this is what keeps a
 * Brand's ledger loadable even if it has never been run through the one-time migration script
 * (`ledger/migrate-assets.ts`): a legacy `status: "casting"` Idea still resolves to `accepted` plus
 * one Asset paused at its Cast gate, exactly as if it had already been migrated.
 *
 * Defensive on parse throughout: unknown/garbled shapes never crash a Run (data-handling rule 4).
 */

import { readJsonFile, writeFileAtomic } from "../fs/safe-io.ts";
import { normalizeIdeaStatus } from "../asset/migrate.ts";
import { deriveIdeaRollup } from "../asset/asset.ts";
import type { LedgerAssetRecord } from "../asset/asset.ts";

/** The Idea lifecycle states the ledger uses. `casting`/`produced`/`posted`/`tracking`/`scored` are
 *  RETIRED here (ADR-0011) — that production state now lives on the Idea's `assets` (`LedgerIdea`
 *  below) instead. See `deriveIdeaRollup` (`src/asset/asset.ts`) for the read-side roll-up. */
export type IdeaStatus = "suggested" | "accepted" | "rejected";

/** The subset of an Idea record most readers need: its own status plus its per-Recipe Assets
 *  (ADR-0011). `status` is ALWAYS already normalized to `suggested`/`accepted`/`rejected` by the
 *  time it reaches here — `loadIdeas` folds any legacy production status onto `assets` on the way
 *  in, transparently, so callers never see the retired vocabulary.
 *
 *  `recipes` is the Operator's Review-time Recipe selection (issue #54), read through UNCHANGED —
 *  present so a re-enqueue path (e.g. `/run-pipeline`'s stranded-Idea recovery) can enqueue the SAME
 *  Recipes the Idea was originally accepted with, rather than guessing (issue #56). Absent on an Idea
 *  accepted before recipe selection existed (every real Idea today) — callers fall back to the one
 *  wired Recipe (`asset/migrate.ts`'s `DEFAULT_ASSET_RECIPE`) in that case.
 *
 *  `format` is the Idea's Format slug (ADR-0009/0013), read through UNCHANGED — the thin Producer
 *  (issue #88) resolves it from here to know which Format's voice/Baseline-Prompt document governs
 *  this Idea's production. Absent on an Idea recorded before multi-format existed (e.g. every real
 *  MundoTip Idea today, `data/brands/mundotip/ledger.json`) — a caller MUST treat a missing `format`
 *  as an explicit STOP condition (never guess/default one; `src/producer/resolve-format.ts`), never a
 *  crash. A non-string or blank raw value degrades to omitted too (data-handling rule 4). */
export interface LedgerIdea {
  readonly id: string;
  readonly status: string;
  readonly assets?: readonly LedgerAssetRecord[];
  readonly recipes?: readonly string[];
  readonly format?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** True when `err` is a Node `ENOENT` (no such file) error. */
function isEnoent(err: unknown): boolean {
  return isObject(err) && (err as { code?: string }).code === "ENOENT";
}

/**
 * Read + parse a Brand's ledger JSON. A *parse* failure is already named by `readJsonFile`; a
 * *missing* ledger is turned into a clear "unknown Brand" error (never a raw ENOENT stack) when the
 * caller names the Brand — so `/report acme` on a Brand that does not exist explains itself. The
 * ledger stays the source of truth (always-rules #7).
 *
 * @param path   the ledger path (required — no ambient/brand-scoped default)
 * @param brand  the Brand slug, used only to shape the not-found message; omit when unknown
 */
async function readLedgerJson(path: string, brand?: string): Promise<unknown> {
  try {
    return await readJsonFile(path);
  } catch (err: unknown) {
    if (isEnoent(err)) {
      const who = brand === undefined ? `no ledger found at ${path}` : `unknown Brand "${brand}"`;
      throw new Error(`${who} (run /queue --all to list Brands).`);
    }
    throw err;
  }
}

/** Coerce a raw `recipes` field into a clean list of non-empty Recipe slugs. Malformed input → `[]`. */
function parseRecipesList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is string => typeof r === "string" && r.length > 0);
}

/** Coerce a raw `format` field into a trimmed, non-empty Format slug, or `undefined` (data-handling
 *  rule 4) — a non-string, blank, or absent value all degrade to `undefined`, never fabricated. */
function parseFormat(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Read the ledger's Idea records (defensive: a record missing a string `id` is skipped — we never
 * invent an identity). The path is required — there is no brand-scoped default. Pass `brand` so a
 * missing ledger fails as "unknown Brand <slug>" rather than a raw ENOENT.
 *
 * Every record's `status`/`assets` is run through `normalizeIdeaStatus` on the way in (ADR-0011): a
 * record already at the canonical grain passes through unchanged; a legacy production status
 * (`casting`/`produced`/`posted`/`tracking`/`scored`) resolves to `accepted` plus one folded Asset.
 * This normalization is IN-MEMORY ONLY — it is never written back here (that is
 * `ledger/migrate-assets.ts`'s job) — which is exactly what makes an un-migrated ledger still load
 * correctly. `recipes` (the Operator's Review-time Recipe selection, issue #54) is carried through
 * read-only and OMITTED entirely when absent/empty — never fabricated (issue #56).
 */
export async function loadIdeas(path: string, brand?: string): Promise<LedgerIdea[]> {
  const raw: unknown = await readLedgerJson(path, brand);
  if (!isObject(raw) || !Array.isArray(raw.ideas)) return [];
  return raw.ideas
    .filter(isObject)
    .filter((r) => typeof r.id === "string")
    .map((r) => {
      const { status, assets } = normalizeIdeaStatus(r);
      const recipes = parseRecipesList(r.recipes);
      const format = parseFormat(r.format);
      return {
        id: r.id as string,
        status,
        assets,
        ...(recipes.length > 0 ? { recipes } : {}),
        ...(format !== undefined ? { format } : {}),
      };
    });
}

/** Find one Idea by id, or null if absent. */
export function findIdea(ideas: readonly LedgerIdea[], ideaId: string): LedgerIdea | null {
  return ideas.find((i) => i.id === ideaId) ?? null;
}

// --- Report projection (issue #9: /report surfaces the whole pipeline at a glance) -----------------

/**
 * One per-Recipe Asset row `/report` shows for an Idea (ADR-0011, issue #56). Attribution stays
 * explicit: a Post is shown linked to its Idea only via `post_url`, and only via THIS specific
 * Recipe's Asset — never inferred, never collapsed onto a bare per-Idea scalar.
 */
export interface ReportAssetRow {
  readonly recipe: string;
  readonly status: string;
  /** Measured Performance Score (0–1, relative to the Channel baseline), or null until tracked. */
  readonly performance_score: number | null;
  /** The logged Post URL (explicit attribution), or null if not yet published. */
  readonly post_url: string | null;
}

/**
 * The Idea fields `/report` needs to show the whole pipeline at a glance (issue #9). Read-only:
 * `/report` never mutates the ledger. `fit_score` is the **predicted** Fit Score (pre-publication) —
 * one per Idea. `assets` is the per-Recipe breakdown (ADR-0011): zero, one, or several rows, one per
 * chosen Recipe. `best_performance_score` is the BEST measured Performance Score across `assets`, kept
 * as an explicit 1:N summary against the one `fit_score` — it is NEVER presented as if the Fit Score
 * predicted that one specific Post (always-rules #3/#4; ADR-0011 "Fit vs Performance").
 *
 * `status` is the Idea's DERIVED ROLL-UP (ADR-0011, `deriveIdeaRollup`) — for an `accepted` Idea with
 * Assets in flight, this is the rolled-up Asset stage (e.g. `in_production`), not the bare `accepted`
 * the Idea record itself carries; `suggested`/`rejected` pass through unchanged.
 */
export interface ReportIdea {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  /** Predicted Fit Score (0–1), or null if absent. NEVER the measured number. */
  readonly fit_score: number | null;
  /** One row per chosen Recipe's Asset (may be empty — an accepted Idea with no Assets yet). */
  readonly assets: readonly ReportAssetRow[];
  /** The BEST `performance_score` among `assets`, or null if none is measured yet. An explicit 1:N
   *  summary against the single `fit_score` — never implies the Fit Score judged this one Post. */
  readonly best_performance_score: number | null;
}

/** The Channel's own performance baseline — what a Performance Score is measured RELATIVE to. */
export interface ReportBaseline {
  /** ISO-8601 timestamp of the last `/track-performance`, or null before the first one. */
  readonly updated_at: string | null;
}

/** The read-only projection `/report` renders: the run's Ideas plus the Channel baseline. */
export interface ReportData {
  readonly ideas: readonly ReportIdea[];
  readonly baseline: ReportBaseline;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** The BEST (highest) `performance_score` across a set of Asset rows, or `null` if none is measured. */
function bestPerformanceScore(assets: readonly ReportAssetRow[]): number | null {
  let best: number | null = null;
  for (const asset of assets) {
    if (asset.performance_score === null) continue;
    if (best === null || asset.performance_score > best) best = asset.performance_score;
  }
  return best;
}

/**
 * Read the ledger into the read-only `/report` projection (defensive: missing/garbled fields degrade to
 * sensible defaults rather than crashing a Run — always-rules #8). Keeps the **predicted** `fit_score`
 * and the **measured** per-Asset `performance_score`s as distinct fields so `/report` never presents
 * one as the other. A record missing an `id` is skipped (we never invent a record); a missing `title`
 * degrades to the id so the row is still identifiable. `status` is the Idea's derived roll-up
 * (ADR-0011) — see `ReportIdea`.
 *
 * `assets`/`best_performance_score` are read from the Idea's per-Recipe Assets (`normalizeIdeaStatus`,
 * ADR-0011) — attribution is keyed `(Idea, Recipe)`, exactly what `/log-post` writes (issue #56), never
 * a flat top-level scalar that a second Recipe's Post would silently overwrite.
 */
export async function loadReport(path: string, brand?: string): Promise<ReportData> {
  const raw: unknown = await readLedgerJson(path, brand);
  if (!isObject(raw)) return { ideas: [], baseline: { updated_at: null } };

  const ideasRaw = Array.isArray(raw.ideas) ? raw.ideas : [];
  const ideas: ReportIdea[] = ideasRaw
    .filter(isObject)
    .filter((r) => typeof r.id === "string")
    .map((r) => {
      const id = r.id as string;
      const { status, assets: normalizedAssets } = normalizeIdeaStatus(r);
      const assets: ReportAssetRow[] = normalizedAssets.map((a) => ({
        recipe: a.recipe,
        status: a.status,
        performance_score: asNumberOrNull(a.performance_score),
        post_url: asStringOrNull(a.post_url),
      }));
      return {
        id,
        title: typeof r.title === "string" ? r.title : id,
        status: deriveIdeaRollup(status, normalizedAssets),
        fit_score: asNumberOrNull(r.fit_score),
        assets,
        best_performance_score: bestPerformanceScore(assets),
      };
    });

  const baselineRaw = isObject(raw.baseline) ? raw.baseline : {};
  return { ideas, baseline: { updated_at: asStringOrNull(baselineRaw.updated_at) } };
}

// --- Channel baseline reads + writes (issue #84) ------------------------------------------------------

/**
 * The Brand's ONE Channel baseline: per-metric rolling medians of our OWN recent posts' PUBLIC
 * metrics (`/track-performance` recomputes this), plus when it was last recomputed. There is exactly
 * ONE Channel baseline per Brand — never one per Recipe (always-rules #4). All four medians are
 * `null` until the first successful `/track-performance` run.
 */
export interface LedgerBaseline {
  readonly shares: number | null;
  readonly comments: number | null;
  readonly reactions: number | null;
  readonly views: number | null;
  readonly updated_at: string | null;
}

const EMPTY_LEDGER_BASELINE: LedgerBaseline = {
  shares: null,
  comments: null,
  reactions: null,
  views: null,
  updated_at: null,
};

/**
 * Read the Brand's ONE Channel baseline (per-metric medians) from its ledger. Defensive: a missing
 * ledger (ENOENT) or a garbled/absent `baseline` block returns the all-null `EMPTY_LEDGER_BASELINE` —
 * never throws, never fabricates a number (data-handling rule 4). A genuine JSON *parse* failure still
 * propagates (that is real file corruption, not "no baseline yet").
 */
export async function loadBaseline(path: string): Promise<LedgerBaseline> {
  let raw: unknown;
  try {
    raw = await readJsonFile(path);
  } catch (err: unknown) {
    if (isEnoent(err)) return EMPTY_LEDGER_BASELINE;
    throw err;
  }
  if (!isObject(raw) || !isObject(raw.baseline)) return EMPTY_LEDGER_BASELINE;
  const b = raw.baseline;
  return {
    shares: asNumberOrNull(b.shares),
    comments: asNumberOrNull(b.comments),
    reactions: asNumberOrNull(b.reactions),
    views: asNumberOrNull(b.views),
    updated_at: asStringOrNull(b.updated_at),
  };
}

/**
 * Overwrite the Brand's ONE Channel baseline in its ledger, preserving every other field (`ideas`,
 * etc.) untouched. Thin write shell, mirrors `writeIdeaRecipeSelection`'s shape. An unknown/missing
 * ledger is a caller error here (the ledger must already exist — `/track-performance` always reads
 * Ideas from it first, which fails loudly on a missing Brand).
 */
export async function writeBaseline(
  baseline: LedgerBaseline,
  options: WriteIdeaStatusOptions,
): Promise<void> {
  const path = options.ledgerPath;
  const raw: unknown = await readJsonFile(path);
  if (!isObject(raw)) return;
  const next = { ...raw, baseline: { ...baseline } };
  await writeFileAtomic(path, JSON.stringify(next, null, 2) + "\n");
}

// --- Recipe selection write (issue #54: the ledger Idea gains `recipes`/`declined_recipes`) ---------

/** Options for the ledger's thin write shells (this one and the AssetStore's — same shape). */
export interface WriteIdeaStatusOptions {
  /** REQUIRED: the Brand's ledger path. There is no ambient/brand-scoped default. */
  readonly ledgerPath: string;
}

/**
 * One Recipe the Operator declined at Review, with the free-text reason captured VERBATIM (mirrors
 * `rejection_reason` — logged only, v1 does not auto-apply it to future suggestions).
 */
export interface LedgerDeclinedRecipe {
  readonly recipe: string;
  readonly reason: string;
}

/** The subset of an Idea record including the Operator's Recipe selection at Review (issue #54). */
export interface LedgerIdeaWithRecipes extends LedgerIdea {
  /** The wired Recipe slugs the Operator chose to produce this Idea through. */
  readonly recipes?: readonly string[];
  /** Offered Recipes the Operator declined, each with its verbatim reason. Logged only (v1). */
  readonly declined_recipes?: readonly LedgerDeclinedRecipe[];
}

/**
 * Return a NEW ideas array with `ideaId`'s `recipes` / `declined_recipes` set. Pure: never mutates the
 * input array or its records. An unknown `ideaId` returns the array unchanged (the ledger stays
 * canonical — we never invent a record).
 */
export function applyIdeaRecipeSelection(
  ideas: readonly LedgerIdeaWithRecipes[],
  ideaId: string,
  recipes: readonly string[],
  declinedRecipes: readonly LedgerDeclinedRecipe[],
): LedgerIdeaWithRecipes[] {
  return ideas.map((idea) =>
    idea.id === ideaId
      ? {
          ...idea,
          recipes: [...recipes],
          declined_recipes: declinedRecipes.map((d) => ({ ...d })),
        }
      : idea,
  );
}

/**
 * Thin write shell: load the full ledger, set one Idea's `recipes` (the wired Recipes chosen at
 * Review) and `declined_recipes` (offered Recipes the Operator declined, with the reason logged
 * verbatim), and save. Preserves the file's other fields by editing the raw record in place. The
 * ledger remains the source of truth; an unknown `ideaId` leaves the file untouched. Mirrors
 * `AssetStore.writeAsset`'s thin edit-in-place shape.
 */
export async function writeIdeaRecipeSelection(
  ideaId: string,
  recipes: readonly string[],
  declinedRecipes: readonly LedgerDeclinedRecipe[],
  options: WriteIdeaStatusOptions,
): Promise<void> {
  const path = options.ledgerPath;
  const raw: unknown = await readJsonFile(path);
  if (!isObject(raw) || !Array.isArray(raw.ideas)) return;

  let changed = false;
  const ideas = raw.ideas.map((record) => {
    if (isObject(record) && record.id === ideaId) {
      changed = true;
      return {
        ...record,
        recipes: [...recipes],
        declined_recipes: declinedRecipes.map((d) => ({ ...d })),
      };
    }
    return record;
  });
  if (!changed) return;

  const next = { ...raw, ideas };
  await writeFileAtomic(path, JSON.stringify(next, null, 2) + "\n");
}
