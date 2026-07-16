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
 * Tenancy boundary: a Brand slug is joined straight into on-disk paths, so `resolveBrand` (and the
 * scaffolder) VALIDATE the slug against `BRAND_SLUG_PATTERN` before use — an unvalidated slug like
 * `"../.."` would escape the brands root and read/write another tenant's (or the repo's) files.
 *
 * Defensive throughout: `listBrands` skips dotfiles, files, and unreadable entries; `brandExists`
 * returns false only for a genuinely absent path (`ENOENT`) and rethrows other I/O errors (e.g. a
 * permission failure must never masquerade as "does not exist"); `resolveBrand` never touches the
 * filesystem.
 */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_QUEUE_PATH as STORE_QUEUE_PATH } from "../production-queue/store.ts";

/** True when `err` is a Node error carrying the given `errno` code (e.g. `"ENOENT"`). */
function hasErrnoCode(err: unknown, code: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === code
  );
}

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
 * Six paths are per-Brand (under `<brandsRoot>/<slug>/`). `queuePath` is the global Production
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
   * `<brandsRoot>/<slug>/formats` — root directory for the Brand's per-Format YAML files
   * (`<formatSlug>.yaml`, one per editorial line; ADR-0009, ADR-0013). Read through the typed
   * `FormatStore` (`src/format/store.ts`) — never stray `readFile` calls elsewhere.
   */
  readonly formatsRoot: string;
  /**
   * The global Production Queue path — `data/queue.json`. Brand-agnostic; the same value for
   * every Brand. NOT derived from the slug (ADR-0004, ADR-0006).
   */
  readonly queuePath: string;
}

// ---------------------------------------------------------------------------
// Slug validation (tenancy boundary)
// ---------------------------------------------------------------------------

/**
 * The set of slugs safe to join into an on-disk path: 1–64 characters of lowercase letters, digits,
 * and hyphens. This is exactly the shape `slugify` produces, and it rejects path-traversal (`..`),
 * separators (`/`, `\`), and uppercase — the things that would let a slug escape the brands root.
 */
export const BRAND_SLUG_PATTERN = /^[a-z0-9-]{1,64}$/;

/** Pure predicate: does `slug` match `BRAND_SLUG_PATTERN`? */
export function isValidBrandSlug(slug: string): boolean {
  return BRAND_SLUG_PATTERN.test(slug);
}

/**
 * Throw a clear error unless `slug` is a valid Brand slug. Called at every point that turns a slug
 * into a filesystem path (the tenancy boundary), because callers pass raw CLI arguments and raw
 * `queue.json` values straight through — neither is trusted.
 */
export function assertValidBrandSlug(slug: string): void {
  if (!isValidBrandSlug(slug)) {
    throw new Error(
      `Invalid Brand slug ${JSON.stringify(slug)}: a Brand slug must be 1–64 characters of ` +
        `lowercase letters, digits, and hyphens (matching ${BRAND_SLUG_PATTERN.source}). ` +
        `This rejects path traversal (e.g. "../..") and keeps each Brand's state isolated.`,
    );
  }
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
 * Map a Brand slug to its on-disk paths. Does NOT touch the filesystem, but it is NOT a blind
 * string join: the slug is validated against `BRAND_SLUG_PATTERN` first and an invalid slug throws.
 * This is the tenancy boundary — callers pass raw CLI arguments and raw `queue.json` values, so a
 * slug like `"../.."` must never be allowed to resolve to a path outside `<brandsRoot>/<slug>/`.
 *
 * The five per-Brand paths all live under `<brandsRoot>/<slug>/`. The `queuePath` is always
 * `DEFAULT_QUEUE_PATH` — brand-agnostic, never slug-derived (ADR-0006).
 *
 * @param slug        The Brand's filesystem slug (e.g. `"mundotip"`).
 * @param brandsRoot  Root for all Brand directories; defaults to `DEFAULT_BRANDS_ROOT`.
 * @throws            If `slug` does not match `BRAND_SLUG_PATTERN`.
 */
export function resolveBrand(slug: string, brandsRoot: string = DEFAULT_BRANDS_ROOT): BrandPaths {
  assertValidBrandSlug(slug);
  const base = join(brandsRoot, slug);
  return {
    ledger: join(base, "ledger.json"),
    brandProfile: join(base, "brand-profile.yaml"),
    seeds: join(base, "seeds.yaml"),
    ideasRoot: join(base, "ideas"),
    yourData: join(base, "your-data"),
    formatsRoot: join(base, "formats"),
    queuePath: DEFAULT_QUEUE_PATH,
  };
}

// ---------------------------------------------------------------------------
// brandExists
// ---------------------------------------------------------------------------

/**
 * Check whether a Brand directory exists at `<brandsRoot>/<slug>`. Returns `true` only if the
 * path exists AND is a directory; returns `false` for a genuinely absent path (`ENOENT`) or a
 * non-directory (a file with the same name).
 *
 * Only `ENOENT` means "does not exist". Any other `stat` error — a permission failure (`EACCES`),
 * a non-directory in the path (`ENOTDIR`), etc. — is rethrown, because reporting "Brand does not
 * exist" for a permission error would make a caller offer to *create* a Brand that is already there.
 */
export async function brandExists(
  slug: string,
  brandsRoot: string = DEFAULT_BRANDS_ROOT,
): Promise<boolean> {
  const brandDir = join(brandsRoot, slug);
  try {
    const s = await stat(brandDir);
    return s.isDirectory();
  } catch (err: unknown) {
    if (hasErrnoCode(err, "ENOENT")) return false;
    throw err;
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
