/**
 * Shared file-safety helpers for the plain-file state store.
 *
 * OrganicGrowth keeps all state in plain files (no database); each Brand's `ledger.json` and the
 * global `data/queue.json` are canonical (always-rules #7). Two hazards recur at every I/O boundary
 * and are fixed once, here:
 *
 *   - **Crash-safety on write.** A direct `writeFile` that is interrupted (crash / power-loss) leaves a
 *     truncated file — and the *canonical* file at that. `writeFileAtomic` writes a sibling temp file
 *     then `rename`s it over the target; `rename(2)` is atomic on the same filesystem, so a reader
 *     never sees a half-written file and an interrupted write leaves the previous file intact.
 *   - **Parse guard on read.** A hand-edited or truncated JSON file makes an unguarded `JSON.parse`
 *     throw a bare `SyntaxError` that names no file. `readJsonFile` wraps the parse so a failure throws
 *     an `Error` that NAMES the path and gives a recovery hint.
 *
 * Exported so the ledger, the production-spec store, and the brand scaffolder can share one
 * implementation instead of re-deriving these guards per module.
 */

import { readFile, writeFile, rename, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";

/**
 * Atomically write `data` to `path`: write to a sibling temp file, then `rename` it over the target.
 * `rename(2)` is atomic on the same filesystem, so a concurrent reader sees either the old file or the
 * complete new one — never a partial write — and a crash mid-write leaves the previous file intact
 * (only the temp is orphaned). The temp file lives beside the target so the rename stays same-filesystem.
 *
 * On any failure the temp file is removed (best-effort) before the original error is re-thrown.
 *
 * @param path  the target file path
 * @param data  the full file contents to write
 */
export async function writeFileAtomic(path: string, data: string): Promise<void> {
  const tmp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, data, "utf8");
    await rename(tmp, path);
  } catch (err: unknown) {
    await rm(tmp, { force: true }).catch(() => {
      /* best-effort cleanup; surface the original error, not the cleanup failure */
    });
    throw err;
  }
}

/**
 * Read and JSON-parse a file. Read errors (e.g. a missing file's `ENOENT`) propagate unchanged so
 * callers can special-case them; a *parse* failure is re-thrown as an `Error` that NAMES the path and
 * gives a recovery hint, instead of a bare `SyntaxError` that names nothing.
 *
 * @typeParam T  the caller's expected shape (unchecked — the caller still validates defensively)
 * @param path   the file to read
 */
export async function readJsonFile<T = unknown>(path: string): Promise<T> {
  const text = await readFile(path, "utf8");
  try {
    return JSON.parse(text) as T;
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot parse JSON at ${path}: ${detail}. ` +
        `The file may be truncated or hand-edited — restore it from version control or a backup.`,
    );
  }
}
