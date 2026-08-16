/**
 * Path resolution for the media backup (issue #197) — pure, no I/O (no `existsSync`/`stat` — the
 * caller decides existence).
 *
 * A ledger-recorded media path is EITHER relative to the repo root (`data/brands/<slug>/...`, the
 * normal shape) OR, for a handful of older records, an absolute filesystem path recorded at
 * production time on whatever machine produced it. `resolveRawLedgerPath` turns either shape into
 * one absolute path to check/copy. `backupKeyFor` then turns that absolute path into the relative
 * location the file is written to under the backup destination, mirroring the repo's own
 * `data/brands/<slug>/...` layout whenever the file lives inside `repoRoot` (the common case), and
 * falling back to a collision-safe, brand-namespaced key for anything outside it (an absolute path
 * from a different machine, which will not resolve under THIS machine's `repoRoot` at all).
 */

import { createHash } from "node:crypto";
import { basename, isAbsolute, join, relative } from "node:path";

/** Resolve a raw ledger-recorded path to one absolute filesystem path. An already-absolute path is
 *  returned unchanged; a relative one is resolved against `repoRoot`. */
export function resolveRawLedgerPath(rawPath: string, repoRoot: string): string {
  return isAbsolute(rawPath) ? rawPath : join(repoRoot, rawPath);
}

/**
 * The relative path a file is written to under the backup destination. When `absPath` lives inside
 * `repoRoot`, this is simply its path relative to `repoRoot` (mirroring the source tree exactly, e.g.
 * `data/brands/acme/ideas/2026-W01/idea-01.news-carousel.output/0-hook.png`) — a re-run always maps
 * the same source file to the same backup key, and `verify-runner.ts` can check a backed-up file
 * without consulting the ledger again. When `absPath` does NOT live inside `repoRoot` (an older
 * record's absolute path from a different machine, or any other out-of-tree path), falls back to
 * `external/<brand>/<12-hex-fingerprint-of-absPath>-<basename>` — still deterministic and collision-
 * safe (the fingerprint is of the FULL path, so two different out-of-tree files with the same
 * basename never collide), just not a mirror of a tree that doesn't exist on this machine.
 */
export function backupKeyFor(absPath: string, repoRoot: string, brand: string): string {
  const rel = relative(repoRoot, absPath);
  const isInsideRepoRoot = rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
  if (isInsideRepoRoot) return rel;

  const fingerprint = createHash("sha256").update(absPath, "utf8").digest("hex").slice(0, 12);
  return join("external", brand, `${fingerprint}-${basename(absPath)}`);
}
