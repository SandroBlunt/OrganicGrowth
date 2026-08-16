/**
 * Asset file download — turns a rendered creation's remote, signed/expiring URL into a durable local
 * file (issue #102 finding #3). A remote URL alone is not a usable Asset: it expires, and it can't be
 * opened to inspect or attached to publish a Post. The Operator needs a real file on disk, the same
 * way every other piece of OrganicGrowth's state is a plain file (CLAUDE.md "State").
 *
 * Sequential, not parallel — mirrors the rest of the Producer's one-thing-at-a-time posture (one Space
 * generation at a time; ADR-0008) and keeps a failure attributable to exactly one target instead of a
 * partial batch. Throws on the FIRST failed fetch or write: a half-downloaded Asset (e.g. 4 of 7
 * carousel slides) is worse than a clearly failed one — never silently ship a partial Asset.
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "../fs/safe-io.ts";

/** One remote creation to download, and the local file name to save it under. */
export interface AssetDownloadTarget {
  readonly url: string;
  /** The file name to write within the destination directory (e.g. `"0-hook.png"`). Never a full
   *  path — `destDir` supplies the directory. */
  readonly filename: string;
}

/** One target, downloaded and written to disk. */
export interface DownloadedAssetFile {
  readonly filename: string;
  readonly path: string;
}

/**
 * Download every target's bytes into `destDir` (created, including parents, if absent) and write each
 * to its own file via the atomic writer (crash-safe: a reader never sees a half-written file).
 * Returns the written files in the SAME order as `targets`. `fetchImpl` is injectable so tests never
 * hit the network — defaults to the global `fetch`.
 *
 * @throws when any target's fetch fails, returns a non-OK status, or the write fails — names WHICH
 *   target failed, never leaving the caller to guess.
 */
export async function downloadAssetFiles(
  destDir: string,
  targets: readonly AssetDownloadTarget[],
  fetchImpl: typeof fetch = fetch,
): Promise<readonly DownloadedAssetFile[]> {
  await mkdir(destDir, { recursive: true });

  const results: DownloadedAssetFile[] = [];
  for (const target of targets) {
    let response: Response;
    try {
      response = await fetchImpl(target.url);
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`downloadAssetFiles: fetch failed for "${target.filename}": ${detail}`);
    }
    if (!response.ok) {
      throw new Error(
        `downloadAssetFiles: "${target.filename}" download failed — ` +
          `${response.status} ${response.statusText} (${target.url})`,
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const path = join(destDir, target.filename);
    await writeFileAtomic(path, bytes);
    results.push({ filename: target.filename, path });
  }
  return results;
}
