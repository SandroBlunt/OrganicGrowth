/**
 * Brand resolver — the single home for the on-disk layout of a Brand's state.
 *
 * A Brand is the top-level tenant in OrganicGrowth (CONTEXT.md). All per-Brand state lives under
 * `data/brands/<slug>/`. The set of Brands IS the set of directories under the brands root — there
 * is no separate registry file that can drift. This module is the **only** place the path convention
 * is defined; every caller that needs a Brand path calls `resolveBrand(slug)`.
 *
 * The global Production Queue (`data/queue.json`) is brand-agnostic (ADR-0004, ADR-0006): one lock,
 * one queue, shared across all Brands. It is exposed here as a constant — NOT derived from a slug.
 *
 * Defensive throughout: `listBrands` skips dotfiles, files, and unreadable entries; `brandExists`
 * returns false (not throw) for a missing path; `resolveBrand` never touches the filesystem.
 */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_QUEUE_PATH as STORE_QUEUE_PATH } from "../production-queue/store.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default root for all Brand directories. The set of Brands is the set of dirs here. */
export const DEFAULT_BRANDS_ROOT = "data/brands";

/**
 * The global Production Queue path — brand-agnostic, shared across all Brands.
 * This is the SAME constant as `src/production-queue/store.ts` exports; re-exported here
 * so callers can get both the Brand paths and the queue path from one import.
 * It is NEVER derived from a Brand slug (ADR-0004, ADR-0006).
 */
export const DEFAULT_QUEUE_PATH: string = STORE_QUEUE_PATH;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * All the on-disk paths associated with one Brand.
 *
 * Five paths are per-Brand (under `<brandsRoot>/<slug>/`). `queuePath` is the global Production
 * Queue — always `data/queue.json`, never derived from the slug.
 */
export interface BrandPaths {
  /** `<brandsRoot>/<slug>/ledger.json` — the Brand's canonical Idea ledger. */
  readonly ledger: string;
  /** `<brandsRoot>/<slug>/brand-profile.yaml` — the Brand's hard brand-safety constraints. */
  readonly brandProfile: string;
  /** `<brandsRoot>/<slug>/seeds.yaml` — the Brand's trend research seeds. */
  readonly seeds: string;
  /** `<brandsRoot>/<slug>/ideas` — root directory for the Brand's Idea briefs and specs. */
  readonly ideasRoot: string;
  /** `<brandsRoot>/<slug>/your-data` — the Brand's Meta export / Channel History. */
  readonly yourData: string;
  /**
   * The global Production Queue path — `data/queue.json`. Brand-agnostic; the same value for
   * every Brand. NOT derived from the slug (ADR-0004, ADR-0006).
   */
  readonly queuePath: string;
}

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

/**
 * Convert an arbitrary Brand name to a filesystem-safe slug. Rules:
 *   - Lowercase.
 *   - Non-alphanumeric characters replaced with hyphens.
 *   - Consecutive hyphens collapsed to one.
 *   - Leading/trailing hyphens stripped.
 *   - Truncated to 64 characters.
 *
 * Pure: no I/O, deterministic.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // replace runs of non-alphanumeric with a single hyphen
    .replace(/-+/g, "-")          // collapse any remaining consecutive hyphens
    .replace(/^-+|-+$/g, "")      // strip leading/trailing hyphens
    .slice(0, 64);
}

// ---------------------------------------------------------------------------
// resolveBrand
// ---------------------------------------------------------------------------

/**
 * Map a Brand slug to its on-disk paths. Pure: does NOT touch the filesystem; the caller
 * is responsible for ensuring the slug is valid and the Brand directory exists.
 *
 * The five per-Brand paths all live under `<brandsRoot>/<slug>/`. The `queuePath` is always
 * `DEFAULT_QUEUE_PATH` — brand-agnostic, never slug-derived (ADR-0006).
 *
 * @param slug        The Brand's filesystem slug (e.g. `"mundotip"`).
 * @param brandsRoot  Root for all Brand directories; defaults to `DEFAULT_BRANDS_ROOT`.
 */
export function resolveBrand(slug: string, brandsRoot: string = DEFAULT_BRANDS_ROOT): BrandPaths {
  const base = join(brandsRoot, slug);
  return {
    ledger: join(base, "ledger.json"),
    brandProfile: join(base, "brand-profile.yaml"),
    seeds: join(base, "seeds.yaml"),
    ideasRoot: join(base, "ideas"),
    yourData: join(base, "your-data"),
    queuePath: DEFAULT_QUEUE_PATH,
  };
}

// ---------------------------------------------------------------------------
// brandExists
// ---------------------------------------------------------------------------

/**
 * Check whether a Brand directory exists at `<brandsRoot>/<slug>`. Returns `true` only if the
 * path exists AND is a directory. Returns `false` (does not throw) for a missing path, a file
 * with the same name, or any I/O error — defensive by design.
 */
export async function brandExists(
  slug: string,
  brandsRoot: string = DEFAULT_BRANDS_ROOT,
): Promise<boolean> {
  const brandDir = join(brandsRoot, slug);
  try {
    const s = await stat(brandDir);
    return s.isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// listBrands
// ---------------------------------------------------------------------------

/**
 * Return a sorted list of Brand slugs by enumerating `brandsRoot`. The set of Brands IS the
 * set of directories here — there is no separate registry.
 *
 * Defensive:
 *   - A missing or unreadable `brandsRoot` returns `[]` (no throw).
 *   - Dotfiles (names starting with `.`) are silently excluded.
 *   - Non-directory entries (plain files, symlinks, etc.) are silently excluded.
 *   - Any entry whose `stat` fails is silently skipped.
 *
 * @param brandsRoot  Root for all Brand directories; defaults to `DEFAULT_BRANDS_ROOT`.
 */
export async function listBrands(brandsRoot: string = DEFAULT_BRANDS_ROOT): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(brandsRoot);
  } catch {
    // Missing or unreadable directory — no Brands yet (or first run)
    return [];
  }

  const slugs: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue; // skip dotfiles
    const fullPath = join(brandsRoot, entry);
    try {
      const s = await stat(fullPath);
      if (s.isDirectory()) {
        slugs.push(entry);
      }
    } catch {
      // Unreadable entry — skip defensively
    }
  }

  return slugs.sort();
}
