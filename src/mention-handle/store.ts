/**
 * Mention Handle Registry persistence — the plain-file I/O boundary for `data/mention-handles.yaml`
 * (issue #149, epic #120; supersedes issue #126's LinkedIn-only `data/linkedin-handles.yaml`).
 *
 * --- Operator-maintained, NOT a live lookup (AC4) ---
 *
 * `data/mention-handles.yaml` is a plain, hand-edited YAML file the Operator adds/edits entries to
 * directly — a company -> `{ platform: handle }` mapping. This module never makes a network request,
 * calls a platform API, or scrapes anything; it only reads the committed file. See `lookup.ts`'s module
 * doc for the full design rationale (global, not per-Brand; platform-keyed).
 *
 * --- Defensive on read (data-handling rule 4) ---
 *
 * A missing file (the Operator hasn't created it yet, or a fresh checkout) loads as the EMPTY table —
 * "no entries yet" is a normal, expected state, never an error (mirrors `production-queue/store.ts`'s
 * ENOENT-on-load convention and `BrandAssetStore`'s "no assets directory yet" convention). A file that
 * EXISTS but fails to parse as YAML at all (a genuine syntax error — e.g. a crash mid hand-edit) throws
 * a clear, path-naming `Error` instead (mirrors `FormatStore`'s `loadFormat` parse-failure convention) —
 * a different, louder failure mode than "missing" or "one malformed entry inside an otherwise-valid
 * file" (which `parseMentionHandleTable` degrades on its own, per-entry).
 *
 * Kept thin and separate from the pure logic in `lookup.ts`, mirroring `production-queue/queue.ts`
 * (pure) vs `store.ts` (I/O).
 */

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

import {
  parseMentionHandleTable,
  resolveHandle,
  type MentionHandleTable,
  type MentionPlatform,
} from "./lookup.ts";

/** Default on-disk location of the global Mention Handle Registry. */
export const DEFAULT_MENTION_HANDLES_PATH = "data/mention-handles.yaml";

function isEnoent(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ENOENT";
}

/**
 * Load the Mention Handle Registry from disk. A missing file loads as the empty table — never throws.
 * A file that exists but fails to parse as YAML throws a clear `Error` naming the path.
 */
export async function loadMentionHandleTable(
  path: string = DEFAULT_MENTION_HANDLES_PATH,
): Promise<MentionHandleTable> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err: unknown) {
    if (isEnoent(err)) {
      return parseMentionHandleTable(null); // no file committed yet — "no entries", not an error
    }
    throw err;
  }

  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot parse Mention Handle Registry YAML at ${path}: ${detail}. The file may be hand-edited ` +
        `incorrectly — restore it from version control or fix the syntax.`,
    );
  }

  return parseMentionHandleTable(raw);
}

/**
 * The generic, platform-keyed typed store function: resolve `(name, platform)` to its committed handle,
 * or `null` when no entry exists for that company, or the company exists but has no handle for that
 * SPECIFIC platform (AC2 — never fabricates a handle, and a missing platform key is never a guess).
 * Loads the table from `path` fresh on every call (this registry is small and hand-edited; no caching
 * layer is warranted at this scale — mirrors `getBrandAsset`'s own "reads the directory fresh"
 * convention).
 */
export async function resolveMentionHandle(
  name: string,
  platform: MentionPlatform,
  path: string = DEFAULT_MENTION_HANDLES_PATH,
): Promise<string | null> {
  const table = await loadMentionHandleTable(path);
  return resolveHandle(table, name, platform);
}

/**
 * Friendly, LinkedIn-only convenience alias over the generic, platform-keyed store above — mirrors
 * `/pick-cast`'s own friendly alias built on the generic `/pick` command (ADR-0010). This is the exact
 * function name issue #130's `src/copy/linkedin-mentions.ts` already called before issue #149; only the
 * underlying data source changed — from the old LinkedIn-only `data/linkedin-handles.yaml` to this
 * store's platform-keyed `data/mention-handles.yaml` — so that caller's contract stays unchanged.
 */
export async function resolveLinkedInHandle(
  name: string,
  path: string = DEFAULT_MENTION_HANDLES_PATH,
): Promise<string | null> {
  return resolveMentionHandle(name, "linkedin", path);
}
