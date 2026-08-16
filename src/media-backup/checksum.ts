/**
 * Checksum helpers for the media backup (issue #197). Mirrors `downloadAssetFiles`
 * (`src/asset/download.ts`) and `uploadTeleprompterScripts` (`src/camera-hub/upload.ts`) in reading a
 * whole file into memory rather than streaming — consistent with how every other media write in this
 * codebase already works, and simple to reason about for the file sizes the Producer actually
 * produces (single-digit MB images/short clips). Never exercised against the Operator's real 813 MB
 * corpus in a test — every test here uses tiny fixture files.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export interface FileDigest {
  readonly sha256: string;
  readonly sizeBytes: number;
}

/** SHA-256 hex digest + byte length of an in-memory buffer. Pure. */
export function digestBuffer(buf: Uint8Array): FileDigest {
  return { sha256: createHash("sha256").update(buf).digest("hex"), sizeBytes: buf.length };
}

/** Read `path` and return its SHA-256 hex digest + byte size. Propagates a read error unchanged
 *  (e.g. `ENOENT`) — callers that need "missing is not an error" handle that themselves. */
export async function digestFile(path: string): Promise<FileDigest> {
  const buf = await readFile(path);
  return digestBuffer(buf);
}
