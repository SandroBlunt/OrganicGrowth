/**
 * Brand profile reader — the plain-file boundary for `data/brand-profile.yaml`.
 *
 * The Brand Profile holds the hard, brand-safety constraints every Idea (and therefore every
 * Production Spec derived from it) must respect (always-rule 9; PRD #1 story 30). This module reads
 * just the `banned_words` list. Defensive: a missing file, missing key, or a non-list value yields an
 * empty banned-words list rather than crashing — and a Run never invents constraints that aren't there.
 *
 * Uses the `yaml` package per the issue. I/O lives here; the pure scan lives in `brand-safety.ts`.
 */

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

/**
 * Default on-disk location of the Brand Profile — points to the `mundotip` Brand's brand-profile
 * under the migrated Brand directory structure (issue #19). The resolver (`src/brand/resolver.ts`)
 * is the single source of the path layout; this constant mirrors
 * `resolveBrand("mundotip").brandProfile` as a transitional default until later slices make the
 * Brand explicit on every command.
 */
export const DEFAULT_BRAND_PROFILE_PATH = "data/brands/mundotip/brand-profile.yaml";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Extract the banned-words list from already-parsed brand-profile data. Pure and defensive: non-string
 * entries are dropped, blanks ignored, and a missing/non-list `banned_words` yields `[]`.
 */
export function bannedWordsFrom(raw: unknown): string[] {
  if (!isObject(raw)) return [];
  const list = raw.banned_words;
  if (!Array.isArray(list)) return [];
  return list
    .filter((w): w is string => typeof w === "string")
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

/**
 * Load the Brand Profile's banned words from disk. A missing file loads as no banned words (a fresh
 * Channel may not have configured any), so callers never crash on first run.
 */
export async function loadBannedWords(
  path: string = DEFAULT_BRAND_PROFILE_PATH,
): Promise<string[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err: unknown) {
    if (isObject(err) && (err as { code?: string }).code === "ENOENT") {
      return [];
    }
    throw err;
  }
  return bannedWordsFrom(parseYaml(text));
}
