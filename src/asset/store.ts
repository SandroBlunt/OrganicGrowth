/**
 * AssetStore — the typed store boundary for a Brand's per-Idea Assets (ADR-0011, ADR-0014).
 *
 * Per ADR-0014, canonical state stays in plain files for the MVP, but every entity sits behind a
 * typed store — no stray file I/O elsewhere. Assets live INSIDE a Brand's `ledger.json` (nested under
 * each Idea, keyed by Recipe — ADR-0011), so `AssetStore` reads/writes that same file directly (its
 * own I/O, mirroring `ledger/ledger.ts`'s Cast/Asset write shells) rather than routing through
 * `ledger.ts`'s Idea-status API, which this store does not depend on.
 *
 * Reads are TRANSPARENTLY tolerant of an un-migrated ledger: `loadIdeaAssets` runs every record
 * through `normalizeIdeaStatus` (the same normalizer `ledger.ts`'s `loadIdeas`/`loadReport` use), so
 * a legacy `status: "casting"` Idea's Cast/production fields are folded into an Asset in memory even
 * before the one-time migration (`ledger/migrate-assets.ts`) has run. `writeAsset` normalizes too,
 * BEFORE upserting, so writing to a not-yet-migrated Idea never silently drops its legacy production
 * data (it is folded onto disk as part of the same write).
 */

import { readJsonFile, writeFileAtomic } from "../fs/safe-io.ts";
import { normalizeIdeaStatus } from "./migrate.ts";
import { upsertAsset, type AssetStatus, type LedgerAssetRecord } from "./asset.ts";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Options for the AssetStore's write shell — mirrors `ledger.ts`'s `WriteIdeaStatusOptions` shape. */
export interface AssetStoreOptions {
  /** REQUIRED: the Brand's ledger path. There is no ambient/brand-scoped default. */
  readonly ledgerPath: string;
}

/**
 * Read one Idea's Assets from the Brand's ledger, normalized to the canonical grain. Returns `null`
 * when the Idea is not found at all (distinct from a known Idea with no Assets yet, which returns
 * `[]`) — mirrors `ledger.ts`'s `loadIdeaCast` null-vs-empty convention.
 */
export async function loadIdeaAssets(
  ideaId: string,
  ledgerPath: string,
): Promise<readonly LedgerAssetRecord[] | null> {
  const raw: unknown = await readJsonFile(ledgerPath);
  if (!isObject(raw) || !Array.isArray(raw.ideas)) return null;
  const record = raw.ideas.find((r) => isObject(r) && r.id === ideaId);
  if (!isObject(record)) return null;
  return normalizeIdeaStatus(record).assets;
}

/**
 * Thin write shell: load the full ledger, upsert `recipe`'s Asset on `ideaId` (insert if the Idea has
 * none for that Recipe yet, merge-update if it does), and save. The target Idea's OTHER fields are
 * preserved by editing the raw record in place; other Ideas are untouched. Before upserting, the
 * target Idea's existing assets are read through `normalizeIdeaStatus` so a not-yet-migrated
 * (legacy-status) Idea is folded onto the grain as part of this same write, never silently dropped.
 * An unknown `ideaId` leaves the file untouched (the ledger stays canonical — never invents a record).
 */
export async function writeAsset(
  ideaId: string,
  recipe: string,
  patch: Partial<Omit<LedgerAssetRecord, "recipe">> & { readonly status: AssetStatus },
  options: AssetStoreOptions,
): Promise<void> {
  const path = options.ledgerPath;
  const raw: unknown = await readJsonFile(path);
  if (!isObject(raw) || !Array.isArray(raw.ideas)) return;

  let changed = false;
  const ideas = raw.ideas.map((record) => {
    if (!isObject(record) || record.id !== ideaId) return record;
    changed = true;
    const normalized = normalizeIdeaStatus(record);
    return {
      ...record,
      status: normalized.status,
      assets: upsertAsset(normalized.assets, recipe, patch),
    };
  });
  if (!changed) return;

  const next = { ...raw, ideas };
  await writeFileAtomic(path, JSON.stringify(next, null, 2) + "\n");
}
