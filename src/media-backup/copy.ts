/**
 * File copy + digest, in one read (issue #197): the backup command needs both a durable copy at the
 * destination AND that copy's checksum/size for the manifest — reading the source once and reusing
 * the same in-memory buffer for both avoids a second disk read per file.
 *
 * Writes via `writeFileAtomic` (`src/fs/safe-io.ts`) — the SAME crash-safe writer every other durable
 * file write in this codebase uses (the ledger, `downloadAssetFiles`, `uploadTeleprompterScripts`): a
 * reader of the destination file never sees a half-written copy.
 */

import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { writeFileAtomic } from "../fs/safe-io.ts";
import { digestBuffer } from "./checksum.ts";
import type { FileDigest } from "./checksum.ts";

/**
 * Read `srcPath`, write it verbatim to `destPath` (creating any missing parent directories), and
 * return the copy's SHA-256 digest + size. Propagates a read/write error unchanged — the caller (the
 * backup runner) decides how to report a single file's failure without losing the rest of the batch.
 */
export async function copyFileWithDigest(srcPath: string, destPath: string): Promise<FileDigest> {
  const buf = await readFile(srcPath);
  await mkdir(dirname(destPath), { recursive: true });
  await writeFileAtomic(destPath, buf);
  return digestBuffer(buf);
}
