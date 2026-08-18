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
 * simply not present on THIS machine (the real 259 media rows only exist on the Operator's own machine
 * — see this ticket's Build Report "Known Limits"). A missing file is an ordinary, expected 404, not an
 * error to surface.
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

  const absolutePath = resolveMediaAbsolutePath(brand.mediaRoot, media.storageKey);
  try {
    const bytes = await readFile(absolutePath);
    return { bytes, mime: media.mime };
  } catch {
    return null;
  }
}
