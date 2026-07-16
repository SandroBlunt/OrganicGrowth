/**
 * Brand profile reader — the plain-file boundary for `data/brand-profile.yaml`.
 *
 * The Brand Profile holds the hard, brand-safety constraints every Idea (and therefore every
 * Production Spec / composed Copy derived from it) must respect (always-rule 9; PRD #1 story 30).
 * Defensive throughout: a missing file, missing key, or a wrongly-typed value degrades to an empty/
 * absent constraint rather than crashing — a Run never invents constraints that aren't there.
 *
 * `banned_words` was the only field read here before this slice. ADR-0012 (issue #58) brings the two
 * DEAD Brand rules live — `required_cta` and `required_hashtags` — so the Copy step's deterministic
 * injection (`src/copy/inject.ts`) has something real to inject. `loadCopyRules` bundles all three
 * (the composed Copy's full rule set: required CTA, required hashtags, banned words) in one read.
 *
 * Uses the `yaml` package per the issue. I/O lives here; the pure scans/checks live in
 * `brand-safety.ts` (Spec-shape) and `src/copy/validate.ts` (Copy-shape).
 */

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

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
 * Extract the required CTA from already-parsed brand-profile data — a verbatim string the composed
 * Copy's caption must include (`src/copy/inject.ts` appends it when absent). Pure and defensive: a
 * missing/blank/non-string `required_cta` (the real profile's default shape — an empty string, meaning
 * "no CTA enforced") yields `null`, never an empty-string sentinel callers would have to re-check.
 */
export function requiredCtaFrom(raw: unknown): string | null {
  if (!isObject(raw)) return null;
  const value = raw.required_cta;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Extract the required-hashtags list from already-parsed brand-profile data. Pure and defensive:
 * non-string entries are dropped, blanks ignored, and a missing/non-list `required_hashtags` yields
 * `[]` (the real profile's default shape).
 */
export function requiredHashtagsFrom(raw: unknown): string[] {
  if (!isObject(raw)) return [];
  const list = raw.required_hashtags;
  if (!Array.isArray(list)) return [];
  return list
    .filter((w): w is string => typeof w === "string")
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

/** The composed Copy's full Brand rule set — required CTA, required hashtags, banned words. */
export interface BrandCopyRules {
  readonly requiredCta: string | null;
  readonly requiredHashtags: readonly string[];
  readonly bannedWords: readonly string[];
}

/**
 * Read + YAML-parse a Brand Profile file. A missing file reads as `{}` (no configured constraints) so
 * every extractor above defaults defensively rather than the caller having to special-case ENOENT.
 */
async function readProfile(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err: unknown) {
    if (isObject(err) && (err as { code?: string }).code === "ENOENT") {
      return {};
    }
    throw err;
  }
  return parseYaml(text);
}

/**
 * Load the Brand Profile's banned words from disk. A missing file loads as no banned words (a fresh
 * Channel may not have configured any), so callers never crash on first run.
 */
export async function loadBannedWords(path: string): Promise<string[]> {
  return bannedWordsFrom(await readProfile(path));
}

/**
 * Load the composed Copy's full Brand rule set from disk in one read: `required_cta`,
 * `required_hashtags`, and `banned_words`. A missing file loads as no rules configured (empty/`null`),
 * mirroring `loadBannedWords`.
 */
export async function loadCopyRules(path: string): Promise<BrandCopyRules> {
  const raw = await readProfile(path);
  return {
    requiredCta: requiredCtaFrom(raw),
    requiredHashtags: requiredHashtagsFrom(raw),
    bannedWords: bannedWordsFrom(raw),
  };
}
