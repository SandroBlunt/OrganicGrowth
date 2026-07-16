/**
 * `migrate-assets` — the ONE-TIME, IDEMPOTENT ledger migration to the Asset grain (issue #55, ADR-0011).
 *
 * Converges a Brand's `ledger.json` onto ADR-0011's shape: every Idea gains `assets: []` (if it
 * doesn't have one already), and any Idea still carrying one of the FIVE retired production statuses
 * (`casting` / `produced` / `posted` / `tracking` / `scored`) is folded onto a single Asset — the
 * Idea's own `status` narrows to `accepted`, and the now-redundant top-level scalar fields (`cast`,
 * `character`, `asset_url`, `produced_at`, `post_url`, `posted_at`, `performance_score`) are stripped
 * ONLY once they have actually been folded (a canonical `accepted` Idea's inert `null` placeholders
 * for these same field NAMES — the real ledgers pre-populate `post_url`/`posted_at`/
 * `performance_score` as `null` on every Idea — are left untouched, so the real-file diff stays
 * minimal: today, with no live ledger holding a populated Asset, running this against
 * `data/brands/mundotip/ledger.json` / `data/brands/straw-motion/ledger.json` adds nothing but
 * `"assets": []` to each Idea).
 *
 * The actual status/Asset computation is `asset/migrate.ts`'s `normalizeIdeaStatus` — the SAME
 * function `ledger/ledger.ts`'s `loadIdeas`/`loadReport` run transparently on every read (never
 * persisted there). This script's OWN job is narrower: decide whether anything actually changed
 * (idempotency), strip the legacy scalar keys once folded, and persist via the atomic writer.
 *
 * Idempotent: a second run against an already-migrated ledger reports `changed: false` for every Idea
 * and does NOT touch the file on disk (mtime included) — see `migrateLedgerFile`.
 */

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readJsonFile, writeFileAtomic } from "../fs/safe-io.ts";
import { resolveBrand, listBrands } from "../brand/resolver.ts";
import { normalizeIdeaStatus, isLegacyProductionStatus, DEFAULT_ASSET_RECIPE } from "../asset/migrate.ts";

const LEGACY_SCALAR_KEYS = [
  "cast",
  "character",
  "asset_url",
  "produced_at",
  "post_url",
  "posted_at",
  "performance_score",
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Order-independent structural equality — used instead of `JSON.stringify` so key ORDER never
 *  produces a spurious "changed" verdict (the source of a subtle idempotency bug). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

// ---------------------------------------------------------------------------
// migrateIdeaRecord — pure, per-record
// ---------------------------------------------------------------------------

/** The result of migrating one idea record: the (possibly unchanged) record, and whether it changed. */
export interface MigratedIdeaRecord {
  readonly record: unknown;
  readonly changed: boolean;
}

/**
 * PURE. Migrate ONE raw idea record to the canonical Asset grain. A non-object entry (garbled JSON)
 * is passed through UNTOUCHED (`changed: false`) — never fabricated, never dropped.
 */
export function migrateIdeaRecord(raw: unknown, defaultRecipe: string = DEFAULT_ASSET_RECIPE): MigratedIdeaRecord {
  if (!isObject(raw)) {
    return { record: raw, changed: false };
  }

  const rawStatus = typeof raw.status === "string" ? raw.status : "";
  const wasLegacyProductionStatus = isLegacyProductionStatus(rawStatus);

  const { status, assets } = normalizeIdeaStatus(raw, defaultRecipe);
  const next: Record<string, unknown> = { ...raw };
  let changed = false;

  if (next.status !== status) {
    next.status = status;
    changed = true;
  }
  if (!deepEqual(next.assets, assets)) {
    next.assets = assets;
    changed = true;
  }
  // Strip the legacy scalar keys ONLY for a record that actually had a legacy production status
  // folded — a canonical Idea's inert null placeholders (post_url/posted_at/performance_score, which
  // the real ledgers pre-populate on every Idea) are left alone, keeping the real-file diff minimal.
  if (wasLegacyProductionStatus) {
    for (const key of LEGACY_SCALAR_KEYS) {
      if (key in next) {
        delete next[key];
        changed = true;
      }
    }
  }

  return { record: next, changed };
}

// ---------------------------------------------------------------------------
// migrateLedgerObject — pure, whole-ledger
// ---------------------------------------------------------------------------

/** The result of migrating a whole ledger's `ideas` array. */
export interface MigratedLedger {
  readonly ledger: unknown;
  readonly changed: boolean;
  readonly ideasChanged: number;
}

/**
 * PURE. Migrate every idea record in a raw ledger object. A non-ledger-shaped input (no `ideas`
 * array) is returned untouched. Returns the SAME `raw` reference when nothing changed, so a caller
 * checking `result.ledger === raw` can skip a needless disk write (idempotency at the file level —
 * see `migrateLedgerFile`).
 */
export function migrateLedgerObject(raw: unknown, defaultRecipe: string = DEFAULT_ASSET_RECIPE): MigratedLedger {
  if (!isObject(raw) || !Array.isArray(raw.ideas)) {
    return { ledger: raw, changed: false, ideasChanged: 0 };
  }
  let ideasChanged = 0;
  const ideas = raw.ideas.map((entry) => {
    const { record, changed } = migrateIdeaRecord(entry, defaultRecipe);
    if (changed) ideasChanged++;
    return record;
  });
  return {
    ledger: ideasChanged > 0 ? { ...raw, ideas } : raw,
    changed: ideasChanged > 0,
    ideasChanged,
  };
}

// ---------------------------------------------------------------------------
// migrateLedgerFile — the I/O shell
// ---------------------------------------------------------------------------

/** The result of migrating one ledger FILE on disk. */
export interface MigrateFileResult {
  readonly path: string;
  readonly changed: boolean;
  readonly ideasChanged: number;
}

/**
 * Migrate one ledger file on disk: load, migrate, and — ONLY if anything actually changed — write
 * back atomically. Idempotent: a second run against an already-migrated file reports
 * `changed: false` and does NOT touch the file (mtime included), which is what "running it twice is
 * a no-op" means at the file level (issue #55 AC).
 */
export async function migrateLedgerFile(path: string): Promise<MigrateFileResult> {
  const raw: unknown = await readJsonFile(path);
  const result = migrateLedgerObject(raw);
  if (result.changed) {
    await writeFileAtomic(path, JSON.stringify(result.ledger, null, 2) + "\n");
  }
  return { path, changed: result.changed, ideasChanged: result.ideasChanged };
}

/** Migrate every Brand's ledger under `brandsRoot` (defaults to `data/brands`, via `listBrands`). */
export async function migrateAllBrandLedgers(brandsRoot?: string): Promise<MigrateFileResult[]> {
  const brands = await listBrands(brandsRoot);
  const results: MigrateFileResult[] = [];
  for (const brand of brands) {
    results.push(await migrateLedgerFile(resolveBrand(brand, brandsRoot).ledger));
  }
  return results;
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

/**
 * CLI entry. Usage: `npx tsx src/ledger/migrate-assets.ts <brand>` (one Brand) or
 * `npx tsx src/ledger/migrate-assets.ts --all` (every Brand under `data/brands`). Prints one line per
 * ledger migrated (or confirmed already up to date). Exported so tests can invoke the usage-error
 * path directly without spawning a subprocess.
 */
export async function main(): Promise<void> {
  const arg = process.argv[2];
  if (arg === undefined) {
    process.stderr.write("usage: npx tsx src/ledger/migrate-assets.ts <brand>|--all\n");
    process.exitCode = 1;
    return;
  }

  const results = arg === "--all" ? await migrateAllBrandLedgers() : [await migrateLedgerFile(resolveBrand(arg).ledger)];
  for (const r of results) {
    const summary = r.changed ? `migrated (${r.ideasChanged} Idea(s) updated)` : "already up to date (no-op)";
    process.stdout.write(`${r.path}: ${summary}\n`);
  }
}

// C41: compare resolved paths, not a hand-built `file://` string — the latter breaks on paths with
// spaces (percent-encoded in `import.meta.url`) or symlinks, silently making a direct run a no-op.
const entryPoint = process.argv[1];
if (entryPoint !== undefined && fileURLToPath(import.meta.url) === resolve(entryPoint)) {
  main().catch((err: unknown) => {
    process.stderr.write(`migrate-assets failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
