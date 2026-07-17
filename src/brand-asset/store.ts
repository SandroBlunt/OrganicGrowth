/**
 * BrandAssetStore — the typed store boundary for a Brand's reusable media (ADR-0014, ADR-0016).
 *
 * A **Brand Asset** is per-Brand reusable media (image, video, or audio — e.g. a `brand-logo`)
 * committed under `data/brands/<slug>/assets/` (CONTEXT.md "Brand Asset"). It fills a Recipe's
 * **brand-asset** canvas media slots (`src/recipe/registry.ts`'s `BrandAssetMediaSlot.brandAssetKey`)
 * at run time, reused every run — the media parallel of the Brand's watermark @handle *text*
 * parameter, which is read straight off `brand-profile.yaml` (`production.watermark_handle`).
 *
 * Design mirrors `src/format/store.ts`: the set of Brand Assets IS the set of recognized-media files
 * under the Brand's `assets/` directory — there is no separate manifest file that could drift. A
 * file's KEY is its basename with the extension stripped (mirrors a Format's slug being its YAML
 * file's basename); its media kind (image/video/audio) is inferred from the extension by the pure,
 * exported `mediaKindForFilename`. Per data-handling rule 4 and issue #82 AC2, a Brand with no
 * `assets/` directory yet is simply "no assets" — `listBrandAssets` returns `[]`, never a throw (the
 * same blanket-catch convention `listFormatSlugs` already uses for a missing `formats/` directory).
 *
 * `getBrandAsset` never throws for a missing key either (issue #82 AC1): it returns a typed
 * `BrandAssetLookup` — `{ found: true, asset }` or `{ found: false, key, message }` — a value the
 * caller (eventually the Producer's media-bind phase) can act on. Deciding to STOP a run when a
 * REQUIRED slot's asset is missing is explicitly OUT of scope here (ADR-0016; lands with the Producer
 * rework, issue #88) — this store only ever *finds*.
 *
 * All reads of a Brand's `assets/` directory SHOULD go through this module — never a stray
 * `readdir`/`readFile`/`stat` call elsewhere (ADR-0014's store-boundary discipline, so the files can
 * later swap for a database). `store.test.ts` includes a repo-wide scan proving no other source file
 * references `BrandPaths.assetsRoot` directly.
 *
 * Write path (committing a new Brand Asset file) is intentionally NOT built in this slice — Brand
 * Assets, like Format files, are hand-committed documents (ADR-0014: "documents the human authors or
 * reads stay files"); Straw Motion's real `brand-logo` ships in a later, Operator-paired slice.
 */

import { readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";

import { resolveBrand } from "../brand/resolver.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The kind of media a Brand Asset (or a Recipe's media slot) holds (ADR-0016). Structurally
 *  identical to `src/recipe/registry.ts`'s `MediaKind` — kept as an independent local definition
 *  (mirrors how `src/copy/contract.ts`'s `CopyShape` deliberately does NOT import from the registry)
 *  so this store carries no dependency on the Recipe registry. */
export type MediaKind = "image" | "video" | "audio";

/** One Brand Asset: a reusable media file, keyed by its filename's basename. */
export interface BrandAsset {
  /** The store key — the file's basename with its extension stripped (e.g. `"brand-logo"`). This is
   *  the SAME key a Recipe's `BrandAssetMediaSlot.brandAssetKey` names. */
  readonly key: string;
  /** The media kind, inferred from the file's extension. */
  readonly media: MediaKind;
  /** The on-disk path to the asset file. */
  readonly path: string;
}

/**
 * The result of looking up one Brand Asset by key — a typed, never-thrown "found or not" value
 * (issue #82 AC1). A missing key (or a Brand with no `assets/` directory at all — AC2) both yield the
 * `found: false` branch with a clear, actionable `message`; they are never distinguished by a thrown
 * error, since from the caller's point of view both mean the same thing: "this key isn't available."
 */
export type BrandAssetLookup =
  | { readonly found: true; readonly asset: BrandAsset }
  | { readonly found: false; readonly key: string; readonly message: string };

// ---------------------------------------------------------------------------
// mediaKindForFilename — pure, defensive extension -> MediaKind mapping
// ---------------------------------------------------------------------------

const EXTENSION_MEDIA_KIND: Readonly<Record<string, MediaKind>> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  svg: "image",
  bmp: "image",
  tiff: "image",
  mp4: "video",
  mov: "video",
  webm: "video",
  m4v: "video",
  avi: "video",
  mkv: "video",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  aac: "audio",
  ogg: "audio",
  flac: "audio",
};

/**
 * Classify a filename's media kind from its extension (case-insensitive). Returns `null` for an
 * unrecognized or absent extension (e.g. `"README.md"`, `".gitkeep"`, `"brand-logo"`) — PURE, never
 * throws. Unrecognized files are skipped defensively by `listBrandAssets`, mirroring how
 * `listFormatSlugs` skips non-`.yaml` entries.
 */
export function mediaKindForFilename(filename: string): MediaKind | null {
  const ext = extname(filename).slice(1).toLowerCase();
  if (ext.length === 0) return null;
  return EXTENSION_MEDIA_KIND[ext] ?? null;
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/** The on-disk root of one Brand's Brand Assets: `<brandsRoot>/<brand>/assets`. Validates the Brand
 *  slug (via `resolveBrand`) before touching the filesystem — the same tenancy boundary every other
 *  store in this repo enforces. */
export function brandAssetsRoot(brand: string, brandsRoot?: string): string {
  return resolveBrand(brand, brandsRoot).assetsRoot;
}

// ---------------------------------------------------------------------------
// listBrandAssets — directory enumeration (issue #82 AC1, AC2)
// ---------------------------------------------------------------------------

/**
 * List a Brand's reusable media by enumerating `<brandsRoot>/<brand>/assets/*` — the set of Brand
 * Assets IS the set of recognized-media files here, mirroring `listFormatSlugs`'s "the set of Formats
 * is the set of files" convention. Defensive throughout (issue #82 AC2, data-handling rule 4):
 *
 *   - A missing/unreadable `assets/` directory (a Brand with none committed yet) returns `[]` — "no
 *     assets", not an error.
 *   - Dotfiles (`.gitkeep`) and files with an unrecognized extension (`README.md`) are skipped.
 *   - A directory entry that happens to carry a recognized-media extension (or any entry `stat`
 *     otherwise fails to read) is skipped, not crashed on.
 *   - Two files sharing the same key across different extensions (e.g. `brand-logo.png` and
 *     `brand-logo.svg`) are ambiguous; the alphabetically-first filename wins and the rest are
 *     skipped, rather than throwing or silently overwriting non-deterministically.
 *
 * Results are sorted by key.
 */
export async function listBrandAssets(brand: string, brandsRoot?: string): Promise<readonly BrandAsset[]> {
  const dir = brandAssetsRoot(brand, brandsRoot); // validates the Brand slug too
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return []; // no assets/ directory yet (or unreadable) — "no assets", never an error (AC2)
  }

  const byKey = new Map<string, BrandAsset>();
  for (const entry of [...entries].sort()) {
    if (entry.startsWith(".")) continue;
    const media = mediaKindForFilename(entry);
    if (media === null) continue; // unrecognized extension — skip defensively

    const full = join(dir, entry);
    let entryStat;
    try {
      entryStat = await stat(full);
    } catch {
      continue; // unreadable entry — skip defensively
    }
    if (!entryStat.isFile()) continue; // e.g. a directory named "video.mp4" — skip defensively

    const key = entry.slice(0, entry.length - extname(entry).length);
    if (key.length === 0) continue;
    if (byKey.has(key)) continue; // duplicate key across extensions — first (alpha-sorted) wins

    byKey.set(key, { key, media, path: full });
  }

  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

// ---------------------------------------------------------------------------
// getBrandAsset — typed lookup by key (issue #82 AC1)
// ---------------------------------------------------------------------------

/**
 * Look up one Brand Asset by key. NEVER throws for a missing key or a missing `assets/` directory
 * (issue #82 AC1/AC2) — both degrade to the same `{ found: false, key, message }` shape, a value the
 * caller (the future Producer media-bind phase) can act on. The message names the key, the Brand, and
 * — when at least one asset IS committed — lists the Brand's actually-available keys, to help the
 * Operator or Producer fix a typo'd `brandAssetKey` quickly.
 *
 * Only an invalid Brand SLUG still throws (the tenancy boundary, via `resolveBrand`/
 * `brandAssetsRoot`) — a different concern from "this key isn't available", the same distinction
 * `FormatStore`/`resolveBrand` already draw between a bad slug (a bug) and an absent Format/Brand (an
 * ordinary, expected state).
 */
export async function getBrandAsset(
  brand: string,
  key: string,
  brandsRoot?: string,
): Promise<BrandAssetLookup> {
  const assets = await listBrandAssets(brand, brandsRoot);
  const asset = assets.find((a) => a.key === key);
  if (asset !== undefined) {
    return { found: true, asset };
  }

  const dir = brandAssetsRoot(brand, brandsRoot);
  const hint = assets.length > 0
    ? `Available keys for Brand "${brand}": ${assets.map((a) => a.key).join(", ")}.`
    : `Brand "${brand}" has no Brand Assets committed yet — add one at ${dir}/<key>.<ext>.`;

  return {
    found: false,
    key,
    message: `Brand Asset "${key}" not found for Brand "${brand}" (looked in ${dir}). ${hint}`,
  };
}
