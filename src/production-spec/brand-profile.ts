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
 *
 * `zohoConfigFrom`/`loadZohoConfig` (issue #143, PRD #140) read the Brand's OPTIONAL `zoho` field — a
 * DIFFERENT per-Brand parameter than `channel` above: it groups this Brand's platforms into **Zoho
 * Social Brands** (Zoho's own container of connected accounts; one OrganicGrowth Brand's Channels can
 * span several), so the future Schedule Batch export can write one CSV per group, with that
 * platform's EXACT Zoho channel label (e.g. `"LinkedInProfile"` for a personal profile — never
 * `"LinkedIn"`, a different, company-Page channel) and the IANA timezone identifier that Zoho Social
 * Brand's clock is configured to (schedule times for its file are written in that clock). Never
 * throws: a Brand with no `zoho` key reads as a typed "not configured for Schedule Batch" result
 * (the expected shape for a Brand that hasn't wired this yet, e.g. MundoTip today); a `zoho` key that
 * IS present but broken reads as a typed "malformed" result naming every problem found, never a
 * silent guess. Mirrors `src/format/baseline-prompt.ts`'s `BaselinePromptLookup` never-throwing
 * discriminated-result convention.
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

// --- Zoho Social Brand config for Schedule Batch (issue #143, PRD #140) -------------------------

/**
 * One platform's exact Zoho channel label within one **Zoho Social Brand** grouping. `platform`
 * matches the same free-string values used in `Channel.platform` above (e.g. `"facebook"`,
 * `"linkedin"`, `"x"`) — this reader does NOT cross-validate it against the Brand's own `channel`
 * list (a deliberate scope limit; see the module doc). `label` is the EXACT string Zoho's bulk
 * uploader matches for that platform's connected account and is read and passed through verbatim,
 * NEVER normalized/guessed/title-cased — e.g. a personal LinkedIn profile is `"LinkedInProfile"`,
 * a different channel than the company-Page `"LinkedIn"`.
 */
export interface ZohoChannelMapping {
  readonly platform: string;
  readonly label: string;
}

/**
 * One **Zoho Social Brand** — Zoho's own container of connected accounts, distinct from an
 * OrganicGrowth **Brand**. One OrganicGrowth Brand's Channels can span several of these; each is
 * meant to become its own CSV file in the (separately built) Schedule Batch export.
 */
export interface ZohoSocialBrand {
  /** A human-readable label for this grouping (e.g. `"Straw Motion"`, `"Straw Motion Personal"`) —
   *  informational only, never matched against anything in Zoho itself. Defaults to `""` when the
   *  Operator hasn't set one; a blank name is never treated as a config error. */
  readonly name: string;
  /**
   * The IANA timezone identifier (e.g. `"Europe/Berlin"`) this Zoho Social Brand's clock is
   * configured to in the Operator's real Zoho account — the clock the (deferred) Schedule Batch
   * export must write THIS file's schedule times in. An IANA identifier (rather than a fixed UTC
   * offset) was chosen because it is DST-aware using only the standard library (`Intl.DateTimeFormat`
   * — no new dependency) and because Zoho's own account settings present timezones by representative
   * city, which map directly to IANA zone names.
   */
  readonly timezone: string;
  /** This Zoho Social Brand's platform -> label mappings — which OrganicGrowth Channel platforms
   *  post through this one file, and each one's exact Zoho channel label. Never empty on a
   *  `configured: true` result (an empty list fails validation as malformed). */
  readonly channels: readonly ZohoChannelMapping[];
}

/** A Brand's full Zoho Social Brand config, successfully read and validated. */
export interface ZohoConfigFound {
  readonly configured: true;
  /** The Brand identity this config was read for (as supplied by the caller). */
  readonly brand: string;
  readonly zohoBrands: readonly ZohoSocialBrand[];
}

/** Why a Zoho Social Brand config lookup came back empty. `"not_configured"` is the ordinary,
 *  expected shape for a Brand that hasn't wired Schedule Batch yet (e.g. MundoTip today) — never an
 *  error. `"malformed"` means a `zoho` key IS present but is broken in some way; `errors` names every
 *  problem found (never just the first), so the Brand Profile can be fixed in one pass. */
export type ZohoConfigNotConfiguredReason = "not_configured" | "malformed";

/** A Zoho Social Brand config lookup that found nothing usable — never a throw, always a clear,
 *  Brand-naming reason + message (issue #143 AC1/AC3). */
export interface ZohoConfigNotConfigured {
  readonly configured: false;
  readonly brand: string;
  readonly reason: ZohoConfigNotConfiguredReason;
  readonly message: string;
  /** Itemized validation problems. Always `[]` for `reason: "not_configured"`; always non-empty for
   *  `reason: "malformed"`. */
  readonly errors: readonly string[];
}

/** The result of looking up one Brand's Zoho Social Brand config. Never thrown; always one of these
 *  two typed shapes. */
export type ZohoConfigLookup = ZohoConfigFound | ZohoConfigNotConfigured;

/** A non-empty, trimmed string, or `null` when `value` isn't a usable non-empty string. Distinct
 *  from `str()`-style helpers elsewhere in the repo that silently default: the Zoho config validator
 *  must know WHETHER a field failed, so it can report it, never guess a default in its place. */
function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** True when `tz` is a timezone identifier `Intl.DateTimeFormat` accepts — the standard-library,
 *  no-new-dependency IANA timezone database check built into Node's ICU. Used to catch a typo'd Zoho
 *  Brand clock at read time (a clear, named error) rather than a silent wrong-time schedule export
 *  later. */
function isValidIanaTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function zohoConfigMalformed(brand: string, errors: readonly string[]): ZohoConfigNotConfigured {
  return {
    configured: false,
    brand,
    reason: "malformed",
    message:
      `Brand "${brand}"'s "zoho" config in brand-profile.yaml is malformed: ${errors.join("; ")}. ` +
      `Fix data/brands/${brand}/brand-profile.yaml before running the Schedule Batch export.`,
    errors,
  };
}

/**
 * Extract a Brand's Zoho Social Brand config from already-parsed brand-profile data (issue #143).
 * Pure and defensive (data-handling rule 4): NEVER throws, for any input shape.
 *
 * The optional top-level `zoho` field's shape is `{ brands: ZohoSocialBrand[] }`, where each entry is
 * `{ name?, timezone, channels: { platform, label }[] }`. Absence of the `zoho` key entirely is the
 * ordinary "not configured for Schedule Batch" outcome (`reason: "not_configured"`) — the real,
 * expected shape for a Brand that hasn't wired this yet (issue #143 AC3; MundoTip stays out of scope
 * per the parent spec). A `zoho` key that IS present is validated in full and, on ANY problem,
 * returns `reason: "malformed"` with EVERY problem found in `errors` (never just the first, never a
 * best-effort partial guess) — including: `zoho`/`zoho.brands`/an entry/its `channels` not being the
 * right shape; a missing/blank `timezone`; a `timezone` that isn't a recognized IANA identifier; a
 * missing/blank `platform`/`label`; and the SAME platform appearing under more than one Zoho Social
 * Brand (each platform must map to exactly one CSV file). `name` is the one optional field — it
 * defaults to `""` and is never itself a validation problem.
 *
 * @param raw   the parsed brand-profile.yaml value (unknown — validated here)
 * @param brand the Brand identity to name in the returned message (its slug or display name) —
 *              an explicit, caller-supplied parameter, mirroring `parseFormatFile(raw, slug)`'s
 *              explicit-identity argument, since parsed profile data alone doesn't carry its own
 *              Brand's name
 */
export function zohoConfigFrom(raw: unknown, brand: string): ZohoConfigLookup {
  const obj = isObject(raw) ? raw : {};
  const zohoRaw = obj.zoho;

  if (zohoRaw === undefined) {
    return {
      configured: false,
      brand,
      reason: "not_configured",
      message:
        `Brand "${brand}" has no "zoho" config in its brand-profile.yaml — not configured for ` +
        "Schedule Batch (expected until the Operator wires this Brand's Zoho Social Brands).",
      errors: [],
    };
  }

  if (!isObject(zohoRaw)) {
    return zohoConfigMalformed(brand, [`"zoho" must be an object, not ${typeof zohoRaw}`]);
  }

  const brandsRaw = zohoRaw.brands;
  if (!Array.isArray(brandsRaw) || brandsRaw.length === 0) {
    return zohoConfigMalformed(brand, [
      `"zoho.brands" must be a non-empty array of Zoho Social Brand entries`,
    ]);
  }

  const errors: string[] = [];
  const seenPlatforms = new Set<string>();
  const zohoBrands: ZohoSocialBrand[] = [];

  brandsRaw.forEach((entryRaw: unknown, index: number) => {
    const prefix = `zoho.brands[${index}]`;
    if (!isObject(entryRaw)) {
      errors.push(`${prefix} must be an object`);
      return;
    }

    const nameRaw = entryRaw.name;
    const name = typeof nameRaw === "string" ? nameRaw.trim() : "";

    const timezone = nonEmptyString(entryRaw.timezone);
    if (timezone === null) {
      errors.push(`${prefix}.timezone must be a non-empty string`);
    } else if (!isValidIanaTimezone(timezone)) {
      errors.push(`${prefix}.timezone "${timezone}" is not a recognized IANA timezone`);
    }

    const channelsRaw = entryRaw.channels;
    const channels: ZohoChannelMapping[] = [];
    if (!Array.isArray(channelsRaw) || channelsRaw.length === 0) {
      errors.push(`${prefix}.channels must be a non-empty array`);
    } else {
      channelsRaw.forEach((chRaw: unknown, chIndex: number) => {
        const chPrefix = `${prefix}.channels[${chIndex}]`;
        if (!isObject(chRaw)) {
          errors.push(`${chPrefix} must be an object`);
          return;
        }
        const platform = nonEmptyString(chRaw.platform);
        if (platform === null) {
          errors.push(`${chPrefix}.platform must be a non-empty string`);
          return;
        }
        const label = nonEmptyString(chRaw.label);
        if (label === null) {
          errors.push(`${chPrefix}.label must be a non-empty string`);
          return;
        }
        if (seenPlatforms.has(platform)) {
          errors.push(
            `platform "${platform}" is assigned to more than one Zoho Social Brand — each ` +
              "platform must map to exactly one CSV file",
          );
          return;
        }
        seenPlatforms.add(platform);
        channels.push({ platform, label });
      });
    }

    zohoBrands.push({ name, timezone: timezone ?? "", channels });
  });

  if (errors.length > 0) {
    return zohoConfigMalformed(brand, errors);
  }

  return { configured: true, brand, zohoBrands };
}

/**
 * Load a Brand's Zoho Social Brand config from disk (issue #143). NEVER throws: mirrors
 * `zohoConfigFrom`'s never-throwing discriminated-result contract exactly — a missing Brand Profile
 * file degrades to the SAME `reason: "not_configured"` result an absent `zoho` key in an existing
 * file gets (both are "nothing configured here"), never a crash.
 *
 * @param path  the Brand Profile YAML file's on-disk path
 * @param brand the Brand identity to name in the returned message (see `zohoConfigFrom`)
 */
export async function loadZohoConfig(path: string, brand: string): Promise<ZohoConfigLookup> {
  return zohoConfigFrom(await readProfile(path), brand);
}
