/**
 * Verify runner — reads a backup destination's own `manifest.json` and re-digests every entry's file
 * AT THE DESTINATION, reporting any mismatch (issue #197's "re-running the manifest check against the
 * backup reports zero mismatches"). Deliberately independent of the SOURCE repository: verifying a
 * backup answers "is the copy still intact", not "does the source still match" — the whole point of a
 * durable backup is that it survives even if the source Brand's `data/` tree is later cleaned up.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { readJsonFile } from "../fs/safe-io.ts";
import { digestBuffer } from "./checksum.ts";
import { diffManifestEntry } from "./manifest.ts";
import type { BackupManifest, VerifyMismatch } from "./manifest.ts";

export interface VerifyResult {
  readonly manifestPath: string;
  readonly totalEntries: number;
  readonly mismatches: readonly VerifyMismatch[];
}

/**
 * Read `<destination>/manifest.json` and verify every entry's file still exists there with the exact
 * recorded checksum + size. Throws a clear, named error if the manifest itself is missing or
 * unparseable — there is nothing to verify against without it (mirrors `loadIdeas`'s own "unknown
 * Brand" clarity rather than a bare `ENOENT` stack).
 */
export async function verifyMediaBackup(destination: string): Promise<VerifyResult> {
  const manifestPath = join(destination, "manifest.json");

  let manifest: BackupManifest;
  try {
    manifest = await readJsonFile<BackupManifest>(manifestPath);
  } catch (err: unknown) {
    if (isEnoent(err)) {
      throw new Error(
        `verifyMediaBackup: no manifest found at ${manifestPath} — run a backup before verifying it.`,
      );
    }
    throw err;
  }

  const mismatches: VerifyMismatch[] = [];
  for (const entry of manifest.entries) {
    const filePath = join(destination, entry.path);
    let buf: Buffer | undefined;
    try {
      buf = await readFile(filePath);
    } catch {
      buf = undefined;
    }
    const actual = buf === undefined ? undefined : digestBuffer(buf);
    const mismatch = diffManifestEntry(entry, actual);
    if (mismatch !== undefined) mismatches.push(mismatch);
  }

  return { manifestPath, totalEntries: manifest.entries.length, mismatches };
}

/** True when `err` is a Node `ENOENT` (no such file) error — mirrors `src/ledger/ledger.ts`'s own
 *  helper of the same name. */
function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}
