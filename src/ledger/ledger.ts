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
 *  in, transparently, so callers never see the retired vocabulary. */
export interface LedgerIdea {
  readonly id: string;
  readonly status: string;
  readonly assets?: readonly LedgerAssetRecord[];
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
 * correctly.
 */
export async function loadIdeas(path: string, brand?: string): Promise<LedgerIdea[]> {
  const raw: unknown = await readLedgerJson(path, brand);
  if (!isObject(raw) || !Array.isArray(raw.ideas)) return [];
  return raw.ideas
    .filter(isObject)
    .filter((r) => typeof r.id === "string")
    .map((r) => {
      const { status, assets } = normalizeIdeaStatus(r);
      return { id: r.id as string, status, assets };
    });
}

/** Find one Idea by id, or null if absent. */
export function findIdea(ideas: readonly LedgerIdea[], ideaId: string): LedgerIdea | null {
  return ideas.find((i) => i.id === ideaId) ?? null;
}

// --- Report projection (issue #9: /report surfaces the whole pipeline at a glance) -----------------

/**
 * The Idea fields `/report` needs to show the whole pipeline at a glance (issue #9). Read-only:
 * `/report` never mutates the ledger. `fit_score` is the **predicted** Fit Score (pre-publication);
 * `performance_score` is the **measured** Performance Score (post-publication, relative to the Channel
 * baseline) — they are kept as SEPARATE fields here so the renderer can never conflate the two
 * (always-rules #3/#4). Either may be `null` (a Fit Score is absent on a malformed Idea; a Performance
 * Score is `null` until `/track-performance` measures it).
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
  /** Measured Performance Score (0–1, relative to the Channel baseline), or null until tracked. */
  readonly performance_score: number | null;
  /** The logged Post URL (explicit attribution), or null if not yet published. */
  readonly post_url: string | null;
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

/**
 * Read the ledger into the read-only `/report` projection (defensive: missing/garbled fields degrade to
 * sensible defaults rather than crashing a Run — always-rules #8). Keeps the **predicted** `fit_score`
 * and the **measured** `performance_score` as distinct fields so `/report` never presents one as the
 * other. A record missing an `id` is skipped (we never invent a record); a missing `title` degrades to
 * the id so the row is still identifiable. `status` is the Idea's derived roll-up (ADR-0011) — see
 * `ReportIdea`.
 *
 * `performance_score`/`post_url` still read the Idea's own top-level fields (pre-Recipe-keyed) — with
 * one Idea now able to yield several Assets/Posts (ADR-0009/0011), re-scoping Post/Performance
 * attribution to `(Idea, Recipe)` and re-keying `/log-post` is deferred to a follow-up slice (see this
 * slice's `handoff.md`, "Known limits"); this projection is unaffected either way for every real
 * ledger today (no Idea has left `accepted`).
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
      const { status, assets } = normalizeIdeaStatus(r);
      return {
        id,
        title: typeof r.title === "string" ? r.title : id,
        status: deriveIdeaRollup(status, assets),
        fit_score: asNumberOrNull(r.fit_score),
        performance_score: asNumberOrNull(r.performance_score),
        post_url: asStringOrNull(r.post_url),
      };
    });

  const baselineRaw = isObject(raw.baseline) ? raw.baseline : {};
  return { ideas, baseline: { updated_at: asStringOrNull(baselineRaw.updated_at) } };
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
 * `writeIdeaCast`'s shape.
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

// --- Legacy re-exports (production-queue/worker.ts, ADR-0004 — superseded by ADR-0008) --------------

/**
 * Re-exported for `production-queue/worker.ts` (the ADR-0004 background-worker model; see its own
 * docstring — no live command wires it up, and ADR-0008 supersedes the runtime it belonged to). The
 * live per-Recipe Asset grain's Cast candidate shape is IDENTICAL (`LedgerAssetRecord.cast`,
 * `src/asset/asset.ts`); this alias just keeps `worker.ts`'s existing import (`from "../ledger/
 * ledger.ts"`) compiling unchanged rather than forcing an unrelated-to-this-slice edit there.
 */
export type { LedgerCastCandidate } from "../asset/asset.ts";

/**
 * LEGACY scalar shape `production-queue/worker.ts` writes on a render completion — retained ONLY for
 * that module's compatibility (see the re-export note above). NOT the live Asset grain: that is
 * `LedgerAssetRecord` (`src/asset/asset.ts`, ADR-0011). Do not extend this type or give it new
 * callers — it predates the per-Recipe Asset and is scoped to the one already-orphaned module that
 * still references it.
 */
export interface LedgerAsset {
  readonly character: string;
  readonly asset_url: string;
  /** ISO-8601 timestamp, INJECTED by the caller (never read from the clock here). */
  readonly produced_at: string;
}
