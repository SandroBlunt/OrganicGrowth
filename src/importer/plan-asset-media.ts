/**
 * `planAssetMedia` — plans one Asset's `asset_media` rows from its legacy `asset_paths` array (issue
 * #204).
 *
 * Composes three pure modules (`relativizeLegacyPath`, `classifyMedia`) plus injectable file I/O into
 * one per-Asset decision: for each `asset_paths[i]`, in order —
 *
 *   1. Convert it to a root-relative storage key (`relativizeLegacyPath`). A path this ticket cannot
 *      safely convert (a foreign absolute root, a `..` segment) becomes a named PROBLEM — refusal-worthy
 *      (AC2: "anything it cannot parse causes a refusal", never silently dropped).
 *   2. Check the converted key exists on disk. A MISSING file becomes a DEAD path (AC6: "reported
 *      explicitly for an Operator decision, never silently nulled") — no `asset_media` row is created
 *      for it (the schema's `bytes`/`checksum` columns are NOT NULL; there is nothing real to put there
 *      for a file that does not exist, and fabricating zeros would be the "quiet repair" this ticket
 *      exists to prevent), but it is never dropped without a trace either — it is named in `dead`.
 *   3. Classify the file's kind/MIME by extension (`classifyMedia`). An EXISTING file with an
 *      unrecognized extension is a genuine parse failure — a problem, not a dead path (the file is
 *      there; this module simply does not know what it is).
 *   4. Checksum it (`digest`) and plan the `asset_media` row.
 *
 * File existence/checksum are injected (`AssetMediaFileOps`), defaulting to real `node:fs` calls —
 * tests can substitute fakes; production always uses the real filesystem.
 */

import { access } from "node:fs/promises";

import { digestFile } from "../media-backup/checksum.ts";
import { relativizeLegacyPath } from "./storage-key-from-legacy-path.ts";
import { classifyMedia } from "./media-classify.ts";

export interface AssetMediaFileOps {
  readonly exists: (absPath: string) => Promise<boolean>;
  readonly digest: (absPath: string) => Promise<{ readonly sha256: string; readonly sizeBytes: number }>;
}

async function realExists(absPath: string): Promise<boolean> {
  try {
    await access(absPath);
    return true;
  } catch {
    return false;
  }
}

/** The default, real file operations `planAssetMedia` uses when no `fileOps` is given. */
export const REAL_ASSET_MEDIA_FILE_OPS: AssetMediaFileOps = {
  exists: realExists,
  digest: digestFile,
};

/** One planned `asset_media` row, minus the fields `attachAssetMedia`/the caller supplies (`assetId`). */
export interface PlannedAssetMediaItem {
  readonly ordinal: number;
  readonly kind: "image" | "video" | "audio";
  readonly storageKey: string;
  readonly mime: string;
  readonly bytes: number;
  readonly checksum: string;
}

/** One legacy `asset_paths` entry that converted cleanly but does not exist on disk. */
export interface DeadAssetMediaPath {
  readonly ordinal: number;
  readonly storageKey: string;
}

export interface PlanAssetMediaResult {
  readonly media: readonly PlannedAssetMediaItem[];
  readonly dead: readonly DeadAssetMediaPath[];
  /** Refusal-worthy problems: a path that could not be relativized, or an existing file with an
   *  unrecognized extension. Human-readable, naming the offending index/path. */
  readonly problems: readonly string[];
}

/**
 * Plans `asset_media` rows for one Asset's legacy `asset_paths` array, in order (ordinal = array
 * index). See this module's own doc comment for the per-entry decision tree.
 */
export async function planAssetMedia(
  assetPaths: readonly string[],
  repoRoot: string,
  fileOps: AssetMediaFileOps = REAL_ASSET_MEDIA_FILE_OPS,
): Promise<PlanAssetMediaResult> {
  const media: PlannedAssetMediaItem[] = [];
  const dead: DeadAssetMediaPath[] = [];
  const problems: string[] = [];

  for (let ordinal = 0; ordinal < assetPaths.length; ordinal++) {
    const rawPath = assetPaths[ordinal]!;
    const relativized = relativizeLegacyPath(rawPath, repoRoot);
    if (!relativized.ok) {
      problems.push(`asset_paths[${ordinal}] ("${rawPath}"): ${relativized.reason}`);
      continue;
    }
    const storageKey = relativized.key;
    const absPath = `${repoRoot}/${storageKey}`;

    const fileExists = await fileOps.exists(absPath);
    if (!fileExists) {
      dead.push({ ordinal, storageKey });
      continue;
    }

    const classification = classifyMedia(storageKey);
    if (classification === null) {
      problems.push(`asset_paths[${ordinal}] ("${storageKey}"): unrecognized media extension`);
      continue;
    }

    const digest = await fileOps.digest(absPath);
    media.push({
      ordinal,
      kind: classification.kind,
      mime: classification.mime,
      storageKey,
      bytes: digest.sizeBytes,
      checksum: digest.sha256,
    });
  }

  return { media, dead, problems };
}
