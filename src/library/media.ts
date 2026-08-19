/**
 * Reads one produced Asset's media BYTES off local disk, for the Library's `/media/:id` route (issue
 * #210, AC4: "shows its media"). Media stays on local disk — never in the database (`docs/adr/0029`) —
 * behind a **root-relative** `storage_key` (`src/db/storage-key.ts`) resolved against the owning
 * Brand's own `media_root` (configuration) at READ time. This is that read-time resolution.
 *
 * One of two `node:fs` imports in `src/library/**` (the other, `vendor-assets.ts`, reads page-chrome JS
 * off `node_modules` instead of a Brand's media_root) — both registered in
 * `src/fs-boundary/allow-list.ts`, and both, deliberately, a pure READ (`readFile`); neither writes.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import type { DatabaseSync } from "node:sqlite";

import { getAssetMediaById, getAssetById } from "../asset/store.ts";
import { getIdea } from "../idea/store.ts";
import { getBrandById } from "../brand/store.ts";

/** One resolved media file, ready to stream back over HTTP. */
export interface ResolvedMediaFile {
  readonly bytes: Buffer;
  readonly mime: string;
}

/** Joins a Brand's `media_root` (which may itself be absolute — it is configuration, not a stored
 *  `storage_key`) with an already root-relative `storage_key`. `storage_key` itself was already
 *  validated as root-relative at WRITE time (`assertRootRelativeStorageKey`) — this function trusts
 *  that invariant rather than re-validating it, mirroring every other reader of a `storage_key` column
 *  in this codebase. */
export function resolveMediaAbsolutePath(mediaRoot: string, storageKey: string): string {
  return isAbsolute(mediaRoot) ? join(mediaRoot, storageKey) : join(process.cwd(), mediaRoot, storageKey);
}

/**
 * Resolves `mediaId` (an `asset_media.id`) to its owning Brand's `media_root` + `storage_key`, reads
 * the file, and returns its bytes + recorded MIME type. Returns `null` — never throws — for: an
 * unknown `mediaId`, an Asset/Idea/Brand this row cannot be joined back to (should be impossible under
 * the schema's own FOREIGN KEYs, but this function degrades rather than 500ing), or a file that is
 * genuinely not present on THIS machine. A missing file is an ordinary, expected 404, not an error to
 * surface.
 *
 * **Two storage_key conventions exist side by side.** New media the worker writes (`src/command-
 * surface/worker.ts`) records a `storage_key` relative to the Brand's own `media_root` — the documented
 * contract (`src/db/storage-key.ts`). The one-shot importer's legacy rows (`src/importer/storage-key-
 * from-legacy-path.ts`) instead relativized each ledger path against the checkout root, so a legacy
 * `storage_key` already carries the `data/brands/<slug>/…` prefix that IS `media_root` — joining
 * `media_root + storage_key` for one of these doubles that prefix and misses a file that is really
 * sitting on disk. Try the documented (`media_root`-relative) resolution first; if that file isn't
 * there, fall back to resolving `storage_key` alone against the repo root, which is what a legacy row
 * actually needs.
 */
export async function resolveMediaFile(db: DatabaseSync, mediaId: string): Promise<ResolvedMediaFile | null> {
  const media = getAssetMediaById(db, mediaId);
  if (media === null) return null;
  const asset = getAssetById(db, media.assetId);
  if (asset === null) return null;
  const idea = getIdea(db, asset.ideaId);
  if (idea === null) return null;
  const brand = getBrandById(db, idea.brandId);
  if (brand === null) return null;

  const primaryPath = resolveMediaAbsolutePath(brand.mediaRoot, media.storageKey);
  try {
    const bytes = await readFile(primaryPath);
    return { bytes, mime: media.mime };
  } catch {
    // fall through to the legacy checkout-root-relative resolution below
  }

  const legacyPath = isAbsolute(media.storageKey) ? media.storageKey : join(process.cwd(), media.storageKey);
  try {
    const bytes = await readFile(legacyPath);
    return { bytes, mime: media.mime };
  } catch {
    return null;
  }
}
