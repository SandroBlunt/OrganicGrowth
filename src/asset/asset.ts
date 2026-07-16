/**
 * Asset — pure deep module for the per-Recipe production grain (CONTEXT.md "Asset"; ADR-0009,
 * ADR-0011).
 *
 * Before this slice, production state was a handful of flat scalars on the Idea record (`status`,
 * `cast`, `character`, `asset_url`, `post_url`, ...). With one Idea → many Recipes → many Assets
 * (ADR-0009), a single scalar status can't say "the Reel is mid-production while the carousel is
 * already posted". ADR-0011 moves production state OFF the Idea and onto a per-Recipe **Asset**:
 * each Idea now carries a list of Assets, one per chosen Recipe.
 *
 * An Asset moves through **`queued → in_production → produced → posted → tracking → scored`**. A
 * human pick (e.g. the *Character Explainer with Cast* Recipe's Cast pick) is a PAUSE inside
 * `in_production`, named by `pending_gate` — never a stage of its own. `casting` is retired.
 *
 * This module is PURE: no disk, no network, no Magnific Space, no clock. It holds:
 *   - the `AssetStatus` vocabulary + stage ordering (`earlierAssetStatus`, mirroring the
 *     `phase-resolver`'s `earlierPhase` pattern one level down, at the single-Idea grain),
 *   - defensive parsing of raw JSON into `LedgerAssetRecord`s (never throws on garbled input —
 *     data-handling rule 4),
 *   - pure lookup/update helpers (`findAsset`, `upsertAsset`) for the `AssetStore` write shell
 *     (`src/asset/store.ts`) to build on,
 *   - the Idea-level ROLL-UP (`deriveIdeaRollup`) and gate helpers (`ideaAtGate`,
 *     `ideaHasAssetStatus`, `pendingGateNames`) that `phase-resolver`, `report.ts`, and
 *     `pick-cast.ts` fold Assets through instead of reading a flat Idea status (ADR-0011 AC).
 *
 * `LedgerCastCandidate` (the *Character Explainer with Cast* Recipe's own gate-pick data — the
 * candidate images the Operator chooses from) lives here too: it is now RECIPE-LOCAL data carried on
 * an Asset's optional `cast`/`character` fields, not a universal Asset field (CONTEXT.md: "Cast" /
 * "Character" are that Recipe's own vocabulary). `ledger/ledger.ts` re-exports it by name so
 * `production-queue/worker.ts` (the ADR-0004 background-worker model, superseded by ADR-0008 — see
 * that module's own docstring) keeps compiling unchanged.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The six stages a per-Recipe Asset moves through (ADR-0011). `casting` is retired. */
export type AssetStatus =
  | "queued"
  | "in_production"
  | "produced"
  | "posted"
  | "tracking"
  | "scored";

/**
 * One Cast candidate: the creation identifier and its viewable image URL. Today this is the
 * *Character Explainer with Cast* Recipe's own gate data (CONTEXT.md "Cast") — carried on that
 * Recipe's Asset via the optional `cast` field, not a universal Asset concept.
 */
export interface LedgerCastCandidate {
  readonly identifier: string;
  readonly url: string;
}

/**
 * The per-Recipe production record an Idea carries one of per chosen Recipe (ADR-0011). Only
 * `recipe` + `status` are required; everything else is populated as production advances. `cast` /
 * `character` are the *Character Explainer with Cast* Recipe's own gate-local extension fields —
 * not part of ADR-0011's universal shape, but needed to keep that Recipe's Cast-pick gate working at
 * this grain (documented in `openspec/changes/issue-55-per-asset-ledger/`).
 */
export interface LedgerAssetRecord {
  /** The wired Recipe slug this Asset was produced through (`src/recipe/registry.ts`). */
  readonly recipe: string;
  readonly status: AssetStatus;
  /**
   * The gate NAME the Asset is currently paused at, present only while `status === "in_production"`
   * AND a human pick is pending (e.g. `"cast"`) — a pause, never a stage of its own (ADR-0011).
   */
  readonly pending_gate?: string;
  readonly spec_path?: string;
  readonly copy?: string;
  /** Recipe-local: the *Character Explainer with Cast* Recipe's Cast candidates (CONTEXT.md "Cast"). */
  readonly cast?: readonly LedgerCastCandidate[];
  /** Recipe-local: the *Character Explainer with Cast* Recipe's picked Character. */
  readonly character?: string;
  readonly asset_url?: string;
  readonly produced_at?: string;
  readonly post_url?: string;
  readonly posted_at?: string;
  readonly performance_score?: number;
}

// ---------------------------------------------------------------------------
// AssetStatus ordering
// ---------------------------------------------------------------------------

const ASSET_STATUS_ORDER: readonly AssetStatus[] = [
  "queued",
  "in_production",
  "produced",
  "posted",
  "tracking",
  "scored",
];

const ASSET_STATUS_PRIORITY: Readonly<Record<AssetStatus, number>> = Object.fromEntries(
  ASSET_STATUS_ORDER.map((status, index) => [status, index]),
) as Record<AssetStatus, number>;

/** Pure predicate: is `value` one of the six canonical Asset stages? Rejects the retired `"casting"`. */
export function isAssetStatus(value: unknown): value is AssetStatus {
  return typeof value === "string" && (ASSET_STATUS_ORDER as readonly string[]).includes(value);
}

/**
 * The earlier of two Asset stages (lowest priority wins), mirroring `phase-resolver`'s
 * `earlierPhase` — but one level down, at the single-Idea/Asset grain.
 */
export function earlierAssetStatus(a: AssetStatus, b: AssetStatus): AssetStatus {
  return ASSET_STATUS_PRIORITY[a] <= ASSET_STATUS_PRIORITY[b] ? a : b;
}

// ---------------------------------------------------------------------------
// Defensive parsing (never throws — data-handling rule 4)
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Parse one raw Cast candidate. Returns `null` on any malformed shape — never throws. */
export function parseCastCandidate(raw: unknown): LedgerCastCandidate | null {
  if (!isObject(raw)) return null;
  if (!nonEmptyString(raw.identifier) || !nonEmptyString(raw.url)) return null;
  return { identifier: raw.identifier, url: raw.url };
}

/** Parse a raw Cast-candidate array, dropping malformed entries. Non-array input yields `[]`. */
export function parseCastArray(raw: unknown): LedgerCastCandidate[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseCastCandidate).filter((c): c is LedgerCastCandidate => c !== null);
}

/**
 * Parse one raw Asset record. Requires a non-empty `recipe` and a valid `status`; every other field
 * is included ONLY when present and well-typed (never assigned as `undefined` — keeps the result
 * clean under `exactOptionalPropertyTypes`). Returns `null` on a malformed required field — never
 * throws, so one garbled Asset never crashes a Run.
 */
export function parseAssetRecord(raw: unknown): LedgerAssetRecord | null {
  if (!isObject(raw)) return null;
  if (!nonEmptyString(raw.recipe)) return null;
  if (!isAssetStatus(raw.status)) return null;

  const cast = parseCastArray(raw.cast);

  return {
    recipe: raw.recipe,
    status: raw.status,
    ...(nonEmptyString(raw.pending_gate) ? { pending_gate: raw.pending_gate } : {}),
    ...(nonEmptyString(raw.spec_path) ? { spec_path: raw.spec_path } : {}),
    ...(nonEmptyString(raw.copy) ? { copy: raw.copy } : {}),
    ...(cast.length > 0 ? { cast } : {}),
    ...(nonEmptyString(raw.character) ? { character: raw.character } : {}),
    ...(nonEmptyString(raw.asset_url) ? { asset_url: raw.asset_url } : {}),
    ...(nonEmptyString(raw.produced_at) ? { produced_at: raw.produced_at } : {}),
    ...(nonEmptyString(raw.post_url) ? { post_url: raw.post_url } : {}),
    ...(nonEmptyString(raw.posted_at) ? { posted_at: raw.posted_at } : {}),
    ...(isFiniteNumber(raw.performance_score) ? { performance_score: raw.performance_score } : {}),
  };
}

/** Parse a raw Assets array, dropping malformed entries. Non-array/absent input yields `[]`. */
export function parseAssetsArray(raw: unknown): LedgerAssetRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseAssetRecord).filter((a): a is LedgerAssetRecord => a !== null);
}

// ---------------------------------------------------------------------------
// Pure lookup / update (the AssetStore write shell builds on these)
// ---------------------------------------------------------------------------

/** Find one Idea's Asset by Recipe slug, or `null` if it has none for that Recipe. */
export function findAsset(assets: readonly LedgerAssetRecord[], recipe: string): LedgerAssetRecord | null {
  return assets.find((a) => a.recipe === recipe) ?? null;
}

/**
 * Return a NEW Assets array with the Recipe's Asset inserted (if absent) or updated (merged with
 * `patch`, if present). Pure: never mutates `assets` or its records. `patch` must always carry a
 * `status` (an Asset can't exist without one); every other field is merged over the existing record.
 */
export function upsertAsset(
  assets: readonly LedgerAssetRecord[],
  recipe: string,
  patch: Partial<Omit<LedgerAssetRecord, "recipe">> & { readonly status: AssetStatus },
): LedgerAssetRecord[] {
  const existing = findAsset(assets, recipe);
  const merged: LedgerAssetRecord = { ...existing, ...patch, recipe };
  if (existing === null) {
    return [...assets, merged];
  }
  return assets.map((a) => (a.recipe === recipe ? merged : a));
}

// ---------------------------------------------------------------------------
// Idea-level roll-up + gate folding (phase-resolver / report / pick-cast fold through these)
// ---------------------------------------------------------------------------

/**
 * The rolled-up stage across an Idea's Assets: the EARLIEST stage wins (mirrors
 * `phase-resolver.earlierPhase` — the least-advanced Asset is what still needs attention). Returns
 * `null` for an empty Assets list (nothing to roll up).
 */
export function rollupAssetStatus(assets: readonly LedgerAssetRecord[]): AssetStatus | null {
  let best: AssetStatus | null = null;
  for (const asset of assets) {
    best = best === null ? asset.status : earlierAssetStatus(best, asset.status);
  }
  return best;
}

/**
 * The Idea's DERIVED roll-up status (ADR-0011): the Idea itself now only ever stores
 * `suggested` / `accepted` / `rejected`. For `suggested`/`rejected` (and any other non-`accepted`
 * value — e.g. a legacy/un-migrated status passed straight through) the roll-up IS the base status
 * unchanged. For `accepted`, the roll-up is the rolled-up Asset stage — or `accepted` itself while no
 * Asset exists yet (today's real-ledger case: no live ledger has a populated Asset).
 */
export function deriveIdeaRollup(baseStatus: string, assets: readonly LedgerAssetRecord[]): string {
  if (baseStatus !== "accepted") return baseStatus;
  return rollupAssetStatus(assets) ?? "accepted";
}

/** The narrow shape the Idea-level gate/status helpers need — avoids importing `LedgerIdea` here. */
export interface AssetBearing {
  readonly assets?: readonly LedgerAssetRecord[];
}

/**
 * True when the Idea has an Asset currently PAUSED at the named gate — `in_production` AND
 * `pending_gate === gate`. This is the Asset-grain replacement for the retired
 * `idea.status === "casting"` check (ADR-0011).
 */
export function ideaAtGate(idea: AssetBearing, gate: string): boolean {
  return (idea.assets ?? []).some((a) => a.status === "in_production" && a.pending_gate === gate);
}

/** True when ANY of the Idea's Assets is at the given stage. */
export function ideaHasAssetStatus(idea: AssetBearing, status: AssetStatus): boolean {
  return (idea.assets ?? []).some((a) => a.status === status);
}

/**
 * The set of gate NAMES currently pending across ALL of an Idea's Assets (not just the earliest —
 * one Asset can be `produced`, ready to publish, while another is still `in_production` paused at a
 * DIFFERENT gate; both need surfacing). Deduplicated, order of first appearance.
 */
export function pendingGateNames(assets: readonly LedgerAssetRecord[]): readonly string[] {
  const names: string[] = [];
  for (const asset of assets) {
    if (asset.status === "in_production" && asset.pending_gate !== undefined && !names.includes(asset.pending_gate)) {
      names.push(asset.pending_gate);
    }
  }
  return names;
}
