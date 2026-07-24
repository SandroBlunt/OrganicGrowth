/**
 * LinkedIn Handle Lookup persistence — the plain-file I/O boundary for `data/linkedin-handles.yaml`
 * (issue #126, epic #120).
 *
 * --- Operator-maintained, NOT a live lookup (AC4) ---
 *
 * `data/linkedin-handles.yaml` is a plain, hand-edited YAML file the Operator adds/edits entries to
 * directly — a name -> LinkedIn Page handle mapping. This module never makes a network request, calls a
 * LinkedIn API, or scrapes anything; it only reads the committed file. See `lookup.ts`'s module doc for
 * the full design rationale (global, not per-Brand).
 *
 * --- Defensive on read (data-handling rule 4) ---
 *
 * A missing file (the Operator hasn't created it yet, or a fresh checkout) loads as the EMPTY table —
 * "no entries yet" is a normal, expected state, never an error (mirrors `production-queue/store.ts`'s
 * ENOENT-on-load convention and `BrandAssetStore`'s "no assets directory yet" convention). A file that
 * EXISTS but fails to parse as YAML at all (a genuine syntax error — e.g. a crash mid hand-edit) throws
 * a clear, path-naming `Error` instead (mirrors `FormatStore`'s `loadFormat` parse-failure convention) —
 * a different, louder failure mode than "missing" or "one malformed entry inside an otherwise-valid
 * file" (which `parseLinkedInHandleTable` degrades on its own, per-entry).
 *
 * Kept thin and separate from the pure logic in `lookup.ts`, mirroring `production-queue/queue.ts`
 * (pure) vs `store.ts` (I/O).
 */

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

import { parseLinkedInHandleTable, resolveHandle, type LinkedInHandleTable } from "./lookup.ts";

/** Default on-disk location of the global LinkedIn Handle Lookup. */
export const DEFAULT_LINKEDIN_HANDLES_PATH = "data/linkedin-handles.yaml";

function isEnoent(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ENOENT";
}

/**
 * Load the LinkedIn Handle Lookup from disk. A missing file loads as the empty table — never throws.
 * A file that exists but fails to parse as YAML throws a clear `Error` naming the path.
 */
export async function loadLinkedInHandleTable(
  path: string = DEFAULT_LINKEDIN_HANDLES_PATH,
): Promise<LinkedInHandleTable> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err: unknown) {
    if (isEnoent(err)) {
      return parseLinkedInHandleTable(null); // no file committed yet — "no entries", not an error
    }
    throw err;
  }

  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot parse LinkedIn Handle Lookup YAML at ${path}: ${detail}. The file may be hand-edited ` +
        `incorrectly — restore it from version control or fix the syntax.`,
    );
  }

  return parseLinkedInHandleTable(raw);
}

/**
 * The one typed store function `#130`'s LinkedIn Copy variant calls: resolve `name` to its committed
 * LinkedIn Page handle, or `null` when no entry exists (AC2 — never fabricates a handle). Loads the
 * table from `path` fresh on every call (this lookup is small and hand-edited; no caching layer is
 * warranted at this scale — mirrors `getBrandAsset`'s own "reads the directory fresh" convention).
 */
export async function resolveLinkedInHandle(
  name: string,
  path: string = DEFAULT_LINKEDIN_HANDLES_PATH,
): Promise<string | null> {
  const table = await loadLinkedInHandleTable(path);
  return resolveHandle(table, name);
}
