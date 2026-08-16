/**
 * Backup manifest shape + pure comparison logic (issue #197).
 *
 * A `BackupManifest` is what `runMediaBackup` (`backup-runner.ts`) writes to
 * `<destination>/manifest.json` after copying every file; `verifyMediaBackup`
 * (`verify-runner.ts`) reads it back and re-digests the destination to prove nothing has silently
 * changed since the backup ran. Everything in THIS module is pure — no filesystem, no `git`, no
 * clock — so the comparison logic itself is fully unit-testable without touching a real backup
 * destination.
 */

export interface ManifestEntry {
  readonly brand: string;
  /** The file's location UNDER the backup destination — the same value `backupKeyFor`
   *  (`path-resolve.ts`) computed when the file was copied. */
  readonly path: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}

/** One ledger-recorded media path that pointed at a file that did not exist at backup time —
 *  reported, never silently skipped (issue #197 AC). */
export interface MissingLedgerPath {
  readonly brand: string;
  readonly ideaId: string;
  readonly recipe: string;
  /** The raw path exactly as recorded in the ledger. */
  readonly path: string;
}

export interface BackupManifest {
  readonly generatedAt: string;
  readonly destination: string;
  readonly entries: readonly ManifestEntry[];
  readonly missingLedgerPaths: readonly MissingLedgerPath[];
}

/** Count of copied entries per Brand, in `entries` order of first appearance. */
export function perBrandCounts(manifest: BackupManifest): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of manifest.entries) {
    counts[entry.brand] = (counts[entry.brand] ?? 0) + 1;
  }
  return counts;
}

/** Count of missing ledger paths per Brand, in `missingLedgerPaths` order of first appearance. */
export function perBrandMissingCounts(manifest: BackupManifest): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const missing of manifest.missingLedgerPaths) {
    counts[missing.brand] = (counts[missing.brand] ?? 0) + 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

export type VerifyMismatchReason = "missing-at-destination" | "checksum-mismatch" | "size-mismatch";

export interface VerifyMismatch {
  readonly path: string;
  readonly reason: VerifyMismatchReason;
}

/** What `verify-runner.ts` found on disk for one manifest entry's backup key, or `undefined` when no
 *  file exists there at all. */
export interface ActualFileState {
  readonly sha256: string;
  readonly sizeBytes: number;
}

/**
 * Compare one manifest entry against what is ACTUALLY at its backup location. Returns `undefined`
 * when everything matches; otherwise the single most informative mismatch (missing file takes
 * priority over a checksum/size mismatch, since there is nothing further to compare once the file is
 * gone; a checksum mismatch is reported over a size mismatch when both apply, since the checksum
 * already implies the size differs too — reporting both would be redundant, not more informative).
 */
export function diffManifestEntry(
  entry: ManifestEntry,
  actual: ActualFileState | undefined,
): VerifyMismatch | undefined {
  if (actual === undefined) {
    return { path: entry.path, reason: "missing-at-destination" };
  }
  if (actual.sha256 !== entry.sha256) {
    return { path: entry.path, reason: "checksum-mismatch" };
  }
  if (actual.sizeBytes !== entry.sizeBytes) {
    return { path: entry.path, reason: "size-mismatch" };
  }
  return undefined;
}
