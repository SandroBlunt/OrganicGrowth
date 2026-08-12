/**
 * Cleanup runner — the thin I/O shell for the manifest-driven S3 cleanup (issue #147, parent #140).
 *
 * Scans EVERY `zoho-manifest.json` under a Brand's `ideas/` tree (recursively — this covers
 * Format-namespaced weekly runs, `ideas/<format>/<run>/`, a `cadence: daily` Format's NESTED runs,
 * `ideas/<format>/<ISO-week>/<weekday>-<DD>-<month>/` (ADR-0023, issue #185), and any legacy
 * pre-Format run, `ideas/<run>/`; see CLAUDE.md's "Legacy layout note" — the recursive walk needs no
 * code change for the nested shape, it just finds the manifest one level deeper), decides which Asset
 * entries are due (the pure `planManifestCleanup`
 * in `cleanup.ts`), deletes each due entry's hosted keys through the injected `MediaHostPort`, and
 * records the removal back onto that entry's OWN manifest file as a `cleaned_at` timestamp (issue #147
 * AC1: "the removals are recorded"). Runs BOTH automatically — `/export-schedule` calls this before it
 * does anything else — and standalone, via `/cleanup-schedule-media`.
 *
 * Never touches the ledger: hosted-media cleanup is infrastructure housekeeping about S3 objects and the
 * manifest, entirely separate from an Asset's `status` lifecycle (ADR-0011) — `scheduled_at` and every
 * other ledger field are untouched by this module.
 *
 * Write-back is a raw-JSON merge (mirrors `AssetStore.writeAsset`'s own style): each manifest file is
 * read as `unknown`, only the matching `(idea, recipe)` entries are patched with `cleaned_at`, and every
 * other field/entry is left byte-for-byte as-is — never a lossy typed round-trip through the full
 * `ScheduleManifest` shape. Each due entry is recorded IMMEDIATELY after its own keys are deleted (not
 * batched across a whole manifest), so a Media Host failure partway through a batch never loses the
 * record of entries that already, genuinely, succeeded — a later run simply retries what's left (safe:
 * `MediaHostPort.delete` is documented idempotent).
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { resolveBrand } from "../brand/resolver.ts";
import { readJsonFile, writeFileAtomic } from "../fs/safe-io.ts";
import type { MediaHostPort } from "../media-host/port.ts";
import {
  planManifestCleanup,
  type CleanupAction,
  type CleanupCandidateEntry,
  type ManifestCleanupTarget,
} from "./cleanup.ts";

const MANIFEST_FILE_NAME = "zoho-manifest.json";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

// ---------------------------------------------------------------------------
// Discovery — recursive scan for every zoho-manifest.json under a Brand's ideas root
// ---------------------------------------------------------------------------

/**
 * Recursively find every `zoho-manifest.json` under `root`, sorted for determinism. Defensive: a
 * missing/unreadable directory (or any subdirectory encountered while walking) yields nothing further
 * from that branch rather than throwing — mirrors `listBrands`/`listFormatSlugs`'s own "the set of
 * things is the set of what's actually readable on disk" convention.
 */
async function findManifestFiles(root: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name === MANIFEST_FILE_NAME) {
        found.push(full);
      }
    }
  }

  await walk(root);
  return found.sort();
}

// ---------------------------------------------------------------------------
// Reading — extract only the cleanup-relevant view from one manifest's raw JSON
// ---------------------------------------------------------------------------

/**
 * Read one manifest file's raw JSON, extracting only the cleanup-relevant fields (field names mirror
 * `ScheduleManifestAssetEntry`'s on-disk shape exactly: `idea`, `recipe`, `scheduled_at`, `s3_keys`,
 * `cleaned_at`). A missing file, a JSON-parse failure, or any other garbled shape (not an object, no
 * `ideas` array) yields an EMPTY target rather than throwing — one malformed manifest must never crash
 * the whole cleanup scan (data-handling rule 4). A garbled INDIVIDUAL entry within an otherwise-good
 * manifest is skipped the same way, never invented.
 */
async function readCleanupTarget(manifestPath: string): Promise<ManifestCleanupTarget> {
  let raw: unknown;
  try {
    raw = await readJsonFile(manifestPath);
  } catch {
    return { manifestPath, entries: [] };
  }
  if (!isObject(raw) || !Array.isArray(raw.ideas)) return { manifestPath, entries: [] };

  const entries: CleanupCandidateEntry[] = [];
  for (const rawEntry of raw.ideas) {
    if (!isObject(rawEntry)) continue;
    if (typeof rawEntry.idea !== "string" || typeof rawEntry.recipe !== "string") continue;
    if (typeof rawEntry.scheduled_at !== "string") continue;
    entries.push({
      ideaId: rawEntry.idea,
      recipe: rawEntry.recipe,
      scheduledAt: rawEntry.scheduled_at,
      keys: strArray(rawEntry.s3_keys),
      alreadyCleaned: typeof rawEntry.cleaned_at === "string",
    });
  }
  return { manifestPath, entries };
}

// ---------------------------------------------------------------------------
// Writing — record ONE Asset entry's cleanup back onto its own manifest file
// ---------------------------------------------------------------------------

/**
 * Patch a single `(idea, recipe)` entry inside `manifestPath`'s raw JSON with `cleaned_at`, leaving
 * every other field and every other entry byte-for-byte untouched. A manifest that has since become
 * unreadable/garbled is left alone (nothing to patch) rather than throwing — the delete itself already
 * happened by the time this is called, so failing to record it is logged as a thrown error by the
 * caller's own read, never silently swallowed here.
 */
async function recordManifestCleanup(
  manifestPath: string,
  ideaId: string,
  recipe: string,
  cleanedAtIso: string,
): Promise<void> {
  const raw: unknown = await readJsonFile(manifestPath);
  if (!isObject(raw) || !Array.isArray(raw.ideas)) return;

  const ideas = raw.ideas.map((entry) => {
    if (!isObject(entry)) return entry;
    if (entry.idea !== ideaId || entry.recipe !== recipe) return entry;
    return { ...entry, cleaned_at: cleanedAtIso };
  });

  await writeFileAtomic(manifestPath, JSON.stringify({ ...raw, ideas }, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// runScheduleCleanup
// ---------------------------------------------------------------------------

export interface RunScheduleCleanupOptions {
  readonly brandsRoot?: string;
  /** Override the Brand's ideas root to scan (normally `resolveBrand(brand, brandsRoot).ideasRoot`) —
   *  primarily for testing against a fixture tree. */
  readonly ideasRoot?: string;
  /** Injected clock. Defaults to the real clock. */
  readonly now?: () => string;
  /** The Media Host port (fake in tests). REQUIRED — the caller owns its own deferred-default/throwing
   *  placeholder for the "not configured at runtime" case, mirroring `/export-schedule`'s own
   *  `DEFAULT_MEDIA_HOST`. */
  readonly mediaHost: MediaHostPort;
}

export interface CleanupResult {
  readonly manifestsScanned: number;
  /** Every action actually attempted (deleted + recorded), in scan order. */
  readonly actions: readonly CleanupAction[];
}

/**
 * Scan `brand`'s entire Schedule Batch manifest tree, delete every hosted key whose Asset entry is more
 * than 1 day past its `scheduled_at` and not already recorded as cleaned, and record the removal back
 * onto its own manifest file. Manifest-driven end to end: nothing about which run/Idea to clean is
 * hardcoded — it all comes from what the manifests themselves say.
 */
export async function runScheduleCleanup(
  brand: string,
  options: RunScheduleCleanupOptions,
): Promise<CleanupResult> {
  const ideasRoot = options.ideasRoot ?? resolveBrand(brand, options.brandsRoot).ideasRoot;
  const now = (options.now ?? (() => new Date().toISOString()))();
  const nowMs = Date.parse(now);

  const manifestPaths = await findManifestFiles(ideasRoot);
  const targets = await Promise.all(manifestPaths.map(readCleanupTarget));
  const actions = planManifestCleanup(targets, nowMs);

  for (const action of actions) {
    for (const key of action.keys) {
      await options.mediaHost.delete(key);
    }
    await recordManifestCleanup(action.manifestPath, action.ideaId, action.recipe, now);
  }

  return { manifestsScanned: manifestPaths.length, actions };
}
