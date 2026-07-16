/**
 * Legacy → Asset-grain status normalization — pure deep module (issue #55, ADR-0011).
 *
 * Before this slice, production state was a handful of flat scalars on the Idea record: `status`
 * (which could be `casting` / `produced` / `posted` / `tracking` / `scored`), plus `cast`,
 * `character`, `asset_url`, `produced_at`, `post_url`, `posted_at`, `performance_score`. ADR-0011
 * retires those five statuses from the Idea and moves production state onto a per-Recipe **Asset**
 * (`src/asset/asset.ts`).
 *
 * `normalizeIdeaStatus` is the ONE place that folds a legacy-shaped raw idea record onto the new
 * grain. It is PURE and used by TWO callers:
 *
 *   - `ledger/ledger.ts`'s `loadIdeas` / `loadReport` — a TRANSPARENT, NEVER-PERSISTED read-time
 *     normalization. This is what makes the reader tolerant of an un-migrated ledger (issue #55 AC):
 *     a Brand's ledger that has never been run through `ledger/migrate-assets.ts` still loads with
 *     the correct Asset-grain phase/gates/report projection, because every reader normalizes on the
 *     way in.
 *   - `ledger/migrate-assets.ts` — the ONE-TIME migration script, which calls this to compute the
 *     canonical `{status, assets}` and then PERSISTS it (also stripping the now-redundant legacy
 *     scalar keys — that stripping is migrate-assets.ts's job, not this pure module's).
 *
 * Idempotent: normalizing an ALREADY-canonical record (status already `suggested` / `accepted` /
 * `rejected`, `assets` already an array) returns equivalent content — running it twice changes
 * nothing (issue #55 AC: "running it twice is a no-op").
 */

import { parseAssetsArray, parseCastArray, type AssetStatus, type LedgerAssetRecord } from "./asset.ts";

// ---------------------------------------------------------------------------
// The default Recipe legacy production fields fold onto
// ---------------------------------------------------------------------------

/**
 * The one wired Recipe (`src/recipe/registry.ts`) a legacy production record's scalar fields fold
 * onto when the Idea itself did not record a Recipe selection (`recipes[0]`, issue #54). This MUST
 * name a real registered Recipe slug — cross-checked in `migrate.test.ts` against
 * `listWiredRecipeSlugs()` rather than importing the registry at call time here, which would pull
 * the heavier production-spec / space-driver import graph into the hot `loadIdeas` read path for a
 * value that is, in practice, a stable constant.
 */
export const DEFAULT_ASSET_RECIPE = "character-explainer-with-cast";

// ---------------------------------------------------------------------------
// The five retired Idea-level production statuses → the Asset stage they fold onto
// ---------------------------------------------------------------------------

interface LegacyAssetMapping {
  readonly status: AssetStatus;
  readonly pendingGate?: string;
}

/**
 * The five statuses `casting` / `produced` / `posted` / `tracking` / `scored` used to occupy the
 * Idea's OWN `status` field; ADR-0011 retires them there and folds each onto the Asset stage (+
 * `pending_gate` where relevant) listed here. `casting` alone carries a `pendingGate` — it named the
 * *Character Explainer with Cast* Recipe's Cast pick, which is now a PAUSE inside `in_production`,
 * not a stage of its own.
 */
const LEGACY_ASSET_STATUS: Readonly<Record<string, LegacyAssetMapping>> = {
  casting: { status: "in_production", pendingGate: "cast" },
  produced: { status: "produced" },
  posted: { status: "posted" },
  tracking: { status: "tracking" },
  scored: { status: "scored" },
};

/** True when `status` is one of the five retired Idea-level production statuses. */
export function isLegacyProductionStatus(status: string): boolean {
  return Object.prototype.hasOwnProperty.call(LEGACY_ASSET_STATUS, status);
}

const CANONICAL_IDEA_STATUSES = new Set(["suggested", "accepted", "rejected"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** The Idea's own recorded Recipe selection (`recipes[0]`, issue #54), or `null` if absent/garbled. */
function firstRecipeSlug(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  const first = raw.find(nonEmptyString);
  return typeof first === "string" ? first : null;
}

/**
 * Fold ONE legacy production-scalar Idea record's fields into a single Asset. Field order matches
 * `parseAssetRecord`'s (a subsequence, since `spec_path`/`copy` never applied to the legacy scalar
 * shape) so re-normalizing an already-folded Asset produces an equal-shaped record — this is what
 * keeps `normalizeIdeaStatus` idempotent independent of any caller's key-order-sensitive comparison.
 */
function buildLegacyAsset(raw: Record<string, unknown>, recipe: string, legacy: LegacyAssetMapping): LedgerAssetRecord {
  const cast = parseCastArray(raw.cast);
  return {
    recipe,
    status: legacy.status,
    ...(legacy.pendingGate !== undefined ? { pending_gate: legacy.pendingGate } : {}),
    ...(cast.length > 0 ? { cast } : {}),
    ...(nonEmptyString(raw.character) ? { character: raw.character } : {}),
    ...(nonEmptyString(raw.asset_url) ? { asset_url: raw.asset_url } : {}),
    ...(nonEmptyString(raw.produced_at) ? { produced_at: raw.produced_at } : {}),
    ...(nonEmptyString(raw.post_url) ? { post_url: raw.post_url } : {}),
    ...(nonEmptyString(raw.posted_at) ? { posted_at: raw.posted_at } : {}),
    ...(isFiniteNumber(raw.performance_score) ? { performance_score: raw.performance_score } : {}),
  };
}

// ---------------------------------------------------------------------------
// normalizeIdeaStatus
// ---------------------------------------------------------------------------

/** The canonical `{status, assets}` one raw idea record resolves to (ADR-0011). */
export interface NormalizedIdeaStatus {
  /** Always `suggested` / `accepted` / `rejected` for a record this function can interpret. */
  readonly status: string;
  readonly assets: readonly LedgerAssetRecord[];
}

/**
 * PURE. Normalize one raw idea record (`raw` — already known to be a JSON object; the caller does
 * that check) to the canonical Asset grain. See the module docstring for the two callers and the
 * idempotency guarantee.
 *
 * @param raw            the raw idea record (an already-checked JSON object)
 * @param defaultRecipe  the Recipe legacy scalar fields fold onto when `raw.recipes[0]` is absent;
 *                        defaults to `DEFAULT_ASSET_RECIPE`
 */
export function normalizeIdeaStatus(
  raw: Record<string, unknown>,
  defaultRecipe: string = DEFAULT_ASSET_RECIPE,
): NormalizedIdeaStatus {
  const existingAssets = parseAssetsArray(raw.assets);
  const rawStatus = typeof raw.status === "string" ? raw.status : "";

  if (existingAssets.length > 0 || CANONICAL_IDEA_STATUSES.has(rawStatus)) {
    return { status: rawStatus.length > 0 ? rawStatus : "suggested", assets: existingAssets };
  }

  const legacy = LEGACY_ASSET_STATUS[rawStatus];
  if (legacy !== undefined) {
    const recipe = firstRecipeSlug(raw.recipes) ?? defaultRecipe;
    return { status: "accepted", assets: [buildLegacyAsset(raw, recipe, legacy)] };
  }

  // Unknown/garbled/missing status — never crash a Run (data-handling rule 4).
  return { status: "suggested", assets: [] };
}
