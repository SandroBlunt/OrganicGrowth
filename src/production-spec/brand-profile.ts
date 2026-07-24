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
 *
 * `watermarkHandleFrom`/`loadWatermarkHandle` (QA-1, issue #88) read `production.watermark_handle` — a
 * DIFFERENT per-Brand parameter than Copy: the thin Producer sets it onto a Recipe's declared
 * `watermarkNode` before the final render, never folding it into the composed Copy (ADR-0012).
 *
 * `channelsFrom`/`primaryChannelFrom`/`loadChannels`/`loadPrimaryChannel` (ADR-0019, issue #127) read
 * the Brand's `channel` field — a LIST of `{ platform, url?, primary? }` entries, exactly one of which
 * carries `primary: true`. This is a migrate-in-place change with NO back-compat shim for the old
 * single-object `channel: { name, platform, url }` shape: a `channel` value that is not an array (the
 * old shape, or anything else malformed) reads as `[]`, same as a missing `channel` key — never
 * crashes, never silently reinterprets the old shape. The Channel performance-tracker, the baseline,
 * readiness checks (`src/readiness/check-config.ts`), and ledger attribution all key off the ONE
 * primary entry `primaryChannelFrom` returns — unchanged machinery from the pre-list single-Channel
 * behavior (ADR-0019's own scope note; per-Channel tracking for the rest is a deferred future epic).
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

/**
 * Extract the Brand's watermark `@handle` from already-parsed brand-profile data
 * (`production.watermark_handle` — QA-1, issue #88). This is the value the thin Producer sets onto a
 * Recipe's declared `watermarkNode` before the final render (`src/space-driver/driver.ts`'s
 * `setWatermarkHandle`) — a Brand-wide hard rule, NOT part of the Asset's Copy (ADR-0012). Pure and
 * defensive, mirroring `requiredCtaFrom`: a missing/blank/non-string `watermark_handle` (the real
 * profile's default shape — not yet configured) yields `""`, never `null`/`undefined` — the caller
 * simply skips the watermark step when this is blank, rather than having to re-check a sentinel.
 */
export function watermarkHandleFrom(raw: unknown): string {
  if (!isObject(raw)) return "";
  const production = raw.production;
  if (!isObject(production)) return "";
  const value = production.watermark_handle;
  if (typeof value !== "string") return "";
  return value.trim();
}

/**
 * Load the Brand's watermark `@handle` from disk. A missing file, or a profile with no `production`
 * block / no `watermark_handle` set, loads as `""` (not yet configured) — never crashes.
 */
export async function loadWatermarkHandle(path: string): Promise<string> {
  return watermarkHandleFrom(await readProfile(path));
}

// --- Channel list (ADR-0019, issue #127) ---------------------------------------------------------

/**
 * One entry on the Brand Profile's `channel` list. A Brand may publish to several platforms; exactly
 * one entry carries `primary: true` — the entry the Channel performance-tracker, the baseline,
 * readiness checks, and ledger attribution key off (unchanged from the pre-list single-Channel
 * behavior). `url` is required BY CONVENTION on the primary entry (enforced downstream by
 * `checkConfig`'s `channel_url_missing` finding, not by this reader) and optional/blank on the others
 * until the Operator supplies it — represented here as `""`, never `null`/`undefined`, so callers
 * never re-check a sentinel. No `handle` field — LinkedIn `@mention` tagging is a separate lookup
 * (issue #126).
 */
export interface Channel {
  readonly platform: string;
  readonly url: string;
  readonly primary: boolean;
}

/**
 * Extract the Brand's Channel list from already-parsed brand-profile data (ADR-0019). Pure and
 * defensive (data-handling rule 4): `channel` must be an ARRAY — the pre-ADR-0019 single-object shape
 * (`channel: { name, platform, url }`) is NOT back-compat-parsed (the ADR calls for migrate-in-place
 * with no shim) and yields `[]`, exactly like a missing/absent `channel` key. Each list entry is then
 * validated independently: an entry that isn't an object, or whose `platform` is missing, blank, or
 * non-string, is dropped rather than crashing the whole Run; a malformed/absent `url` defaults to
 * `""` and a malformed/absent `primary` defaults to `false`.
 */
export function channelsFrom(raw: unknown): Channel[] {
  if (!isObject(raw)) return [];
  const list = raw.channel;
  if (!Array.isArray(list)) return [];
  const out: Channel[] = [];
  for (const entry of list) {
    if (!isObject(entry)) continue;
    const platform = entry.platform;
    if (typeof platform !== "string" || platform.trim().length === 0) continue;
    const url = typeof entry.url === "string" ? entry.url.trim() : "";
    out.push({ platform: platform.trim(), url, primary: entry.primary === true });
  }
  return out;
}

/**
 * Find the Brand's ONE primary Channel from already-parsed brand-profile data (ADR-0019) — the entry
 * every existing single-Channel caller (readiness checks, the Channel baseline, ledger attribution)
 * now reads instead of the old singular `channel.platform`/`channel.url`. Pure and defensive: returns
 * `null` when no entry is marked `primary: true` (e.g. a fresh, legacy-shaped, or misconfigured
 * profile) — callers already treat a `null`/blank Channel URL as "not yet configured" (the existing
 * `channel_url_missing` finding). If more than one entry is (mis)configured `primary: true`, the
 * first one wins deterministically — never throws, never picks arbitrarily.
 */
export function primaryChannelFrom(raw: unknown): Channel | null {
  const channels = channelsFrom(raw);
  return channels.find((c) => c.primary) ?? null;
}

/**
 * Load the Brand's full Channel list from disk (ADR-0019). A missing file loads as `[]`, mirroring
 * `channelsFrom`'s defaults.
 */
export async function loadChannels(path: string): Promise<Channel[]> {
  return channelsFrom(await readProfile(path));
}

/**
 * Load the Brand's ONE primary Channel from disk (ADR-0019). A missing file, or one with no
 * `primary: true` entry, loads as `null` — never crashes.
 */
export async function loadPrimaryChannel(path: string): Promise<Channel | null> {
  return primaryChannelFrom(await readProfile(path));
}
