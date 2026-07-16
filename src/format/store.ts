/**
 * FormatStore — the typed store boundary for a Brand's per-Format YAML files.
 *
 * A **Format** is a Brand's editorial line (its subject + treatment, e.g. Straw Motion's
 * "Unhypped News"; CONTEXT.md, ADR-0009). It owns its voice/treatment, its trend sources, and its
 * peer-vs-curated mode — moved DOWN from the Brand (ADR-0013). One file per Format lives at
 * `data/brands/<slug>/formats/<formatSlug>.yaml`. Per ADR-0014, canonical state stays behind a typed
 * store layer even while the underlying storage is a plain, human-editable YAML file: every reader
 * of a Format's config SHOULD go through this module — never a stray `readFile` elsewhere.
 *
 * Design mirrors the existing stores in this repo (`production-queue/store.ts`,
 * `production-spec/brand-profile.ts`): a pure, defensive parser (`parseFormatFile`) that never
 * throws on garbled input (missing/invalid fields degrade to sensible defaults — data-handling rule
 * 4), plus a thin I/O shell (`loadFormat`, `listFormatSlugs`) that DOES throw a clear, actionable
 * error for the one case that must be loud: a Format that does not exist on disk at all (mirrors
 * `ledger.ts`'s "unknown Brand" pattern) — silently defaulting a whole missing Format to empty would
 * let a Run silently research nothing.
 *
 * Off-niche seed handling is NOT re-implemented here: `sources.seedPages` reuses
 * `normalizeSeeds`/`NormalizedSeed` from `readiness/check-config.ts` (same `{url, off_niche}` /
 * `OFF_NICHE:` shapes a Format's seed_pages list can carry), so the two seed-list dialects in the
 * repo (Brand-level legacy seeds, Format-level seeds) share one normalization rule.
 *
 * Write path (creating/editing a Format file) is intentionally NOT built in this slice — Format
 * files today are hand-authored/migrated documents (ADR-0014: "documents the human authors or
 * reads stay files"). A `saveFormat` shell can be added when the scaffolder's Format interview
 * (ADR-0013) is built.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

import { resolveBrand } from "../brand/resolver.ts";
import { normalizeSeeds, type NormalizedSeed } from "../readiness/check-config.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How a Format's Trend Research sources are gathered — chosen per-Format (ADR-0013). */
export type FormatSourceMode = "peer" | "curated";

/** A Format's trend-research sources + mode — moved down from the Brand's `seeds.yaml`. */
export interface FormatSources {
  readonly mode: FormatSourceMode;
  /** Peer/competitor Pages to scrape (peer-scrape mode). Off-niche flags normalized. */
  readonly seedPages: readonly NormalizedSeed[];
  /** Curated public newsletter/archive URLs to digest (curated mode). */
  readonly curatedSources: readonly string[];
  /** Optional topic-augmentation keywords. */
  readonly keywords: readonly string[];
  /** Only consider peer posts from the last N days. */
  readonly lookbackDays: number;
  /** Peer-scrape mode only: keep only posts beating their own Page's baseline. */
  readonly overperformanceOnly: boolean;
}

/**
 * One Format, fully parsed and defaulted. The typed shape `FormatStore` readers get back —
 * `trend-scout`/`idea-strategist`/`/run-trends` read voice/sources/mode from here, never from the
 * Brand (ADR-0013; issue #53 AC1).
 */
export interface FormatFile {
  /** The Format's filesystem slug (the YAML file's basename, e.g. `"life-hacks"`). */
  readonly slug: string;
  /** Human-readable Format name (e.g. `"Unhypped News"`). */
  readonly name: string;
  /** One-line niche description for this editorial line specifically. */
  readonly niche: string;
  /** Voice/treatment guidance — how this Format's Ideas should read. */
  readonly voice: string;
  /**
   * The media SHAPE trend-scout favors when scanning peer posts (e.g. `"reel"`) — deliberately
   * NOT named `format_focus`/`format`: that was the retired media-sense of "format" (ADR-0009,
   * issue #53 AC2). This is a trend-quality filter, not the editorial Format.
   */
  readonly mediaFocus: string;
  readonly sources: FormatSources;
  /** How many Idea briefs to suggest per Run of THIS Format (moved down from the Brand). */
  readonly ideasPerRun: number;
  /** Recipe slugs pre-filled at Review for Ideas of this Format (ADR-0009). Stays free-text/unvalidated
   * HERE at parse time — the in-repo Recipe registry (`src/recipe/registry.ts`, issue #54) is the
   * thing that filters these to WIRED slugs only, at offer time (`src/recipe/offer.ts`,
   * `offeredRecipes`), not here. */
  readonly defaultRecipes: readonly string[];
}

// ---------------------------------------------------------------------------
// Format-slug validation (tenancy boundary — mirrors resolver.ts's Brand-slug guard)
// ---------------------------------------------------------------------------

/**
 * The set of slugs safe to join into a Format path: 1–64 characters of lowercase letters, digits,
 * and hyphens (identical shape to `BRAND_SLUG_PATTERN`). A Format slug is untrusted input too (a raw
 * `/run-trends <brand> <format>` CLI argument) that gets joined straight into a filesystem path, so
 * it is validated here before any I/O — same tenancy-boundary reasoning as `resolver.ts`.
 */
export const FORMAT_SLUG_PATTERN = /^[a-z0-9-]{1,64}$/;

/** Pure predicate: does `slug` match `FORMAT_SLUG_PATTERN`? */
export function isValidFormatSlug(slug: string): boolean {
  return FORMAT_SLUG_PATTERN.test(slug);
}

/** Throw a clear error unless `slug` is a valid Format slug. */
export function assertValidFormatSlug(slug: string): void {
  if (!isValidFormatSlug(slug)) {
    throw new Error(
      `Invalid Format slug ${JSON.stringify(slug)}: a Format slug must be 1–64 characters of ` +
        `lowercase letters, digits, and hyphens (matching ${FORMAT_SLUG_PATTERN.source}). This ` +
        `rejects path traversal (e.g. "../..") and keeps each Format's file inside its Brand's ` +
        `formats/ directory.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Pure parsing (defensive — never throws on garbled input)
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Trim a value to a non-empty string, or fall back to `fallback`. */
function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

/** Non-empty string entries only, trimmed. Non-array/garbled input yields `[]`. */
function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/** A finite positive integer, or `fallback` when `value` is not one. */
function positiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

/**
 * Decide a Format's peer-vs-curated mode from its already-parsed `sources` object. Pure, mirrors
 * `trend-scout.md`'s own tie-break rule: an explicit `mode: peer|curated` wins; otherwise infer
 * `curated` when `curated_sources` has at least one usable entry (the Operator has already done the
 * discovery work), else default to `peer` (trend-scout's documented default mode).
 */
export function deriveSourceMode(sourcesRaw: unknown): FormatSourceMode {
  if (isObject(sourcesRaw)) {
    if (sourcesRaw.mode === "peer" || sourcesRaw.mode === "curated") {
      return sourcesRaw.mode;
    }
    if (strArray(sourcesRaw.curated_sources).length > 0) {
      return "curated";
    }
  }
  return "peer";
}

/**
 * Parse an already-YAML-parsed Format file value into a fully-defaulted `FormatFile`. PURE and
 * DEFENSIVE (data-handling rule 4): garbled/missing fields degrade to empty/sensible defaults rather
 * than throwing — a hand-edited Format file with a typo must never crash a Run. The one thing this
 * function does NOT default away is the caller-supplied `slug` (the filename IS the identity).
 *
 * @param raw   the parsed YAML value (unknown — validated here)
 * @param slug  the Format's filesystem slug (from the filename, not the file content)
 */
export function parseFormatFile(raw: unknown, slug: string): FormatFile {
  const obj = isObject(raw) ? raw : {};
  const sourcesRaw = isObject(obj.sources) ? obj.sources : {};

  const sources: FormatSources = {
    mode: deriveSourceMode(sourcesRaw),
    seedPages: normalizeSeeds(sourcesRaw.seed_pages),
    curatedSources: strArray(sourcesRaw.curated_sources),
    keywords: strArray(sourcesRaw.keywords),
    lookbackDays: positiveInt(sourcesRaw.lookback_days, 7),
    overperformanceOnly: typeof sourcesRaw.overperformance_only === "boolean"
      ? sourcesRaw.overperformance_only
      : true,
  };

  return {
    slug,
    name: str(obj.name, ""),
    niche: str(obj.niche, ""),
    voice: str(obj.voice, ""),
    mediaFocus: str(obj.media_focus, "reel"),
    sources,
    ideasPerRun: positiveInt(obj.ideas_per_run, 10),
    defaultRecipes: strArray(obj.default_recipes),
  };
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/** The on-disk path of one Format file: `<brandsRoot>/<brand>/formats/<formatSlug>.yaml`. */
export function formatFilePath(brand: string, formatSlug: string, brandsRoot?: string): string {
  assertValidFormatSlug(formatSlug);
  const paths = resolveBrand(brand, brandsRoot); // validates the Brand slug too
  return join(paths.formatsRoot, `${formatSlug}.yaml`);
}

/**
 * The Format-namespaced Ideas root for a Run: `<brandsRoot>/<brand>/ideas/<formatSlug>` — a Run's
 * output (`trends.json`/`trends.md`, `idea-NN.md`) lives under `<this>/<run>/` (issue #53 AC3).
 */
export function formatIdeasRoot(brand: string, formatSlug: string, brandsRoot?: string): string {
  assertValidFormatSlug(formatSlug);
  const paths = resolveBrand(brand, brandsRoot);
  return join(paths.ideasRoot, formatSlug);
}

// ---------------------------------------------------------------------------
// I/O shell
// ---------------------------------------------------------------------------

function isEnoent(err: unknown): boolean {
  return isObject(err) && (err as { code?: string }).code === "ENOENT";
}

/**
 * List a Brand's Format slugs by enumerating `<brandsRoot>/<brand>/formats/*.yaml` — the set of
 * Formats IS the set of files here, mirroring `listBrands`'s "the set of Brands is the set of
 * directories" convention. Defensive: a missing/unreadable `formats/` directory returns `[]`
 * (a Brand with no Formats yet, or a fresh repo checkout) rather than throwing; dotfiles and
 * non-`.yaml` entries are skipped.
 */
export async function listFormatSlugs(brand: string, brandsRoot?: string): Promise<string[]> {
  const paths = resolveBrand(brand, brandsRoot);
  let entries: string[];
  try {
    entries = await readdir(paths.formatsRoot);
  } catch {
    return [];
  }

  const slugs: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    if (!entry.endsWith(".yaml")) continue;
    const full = join(paths.formatsRoot, entry);
    try {
      const s = await stat(full);
      if (s.isFile()) slugs.push(entry.slice(0, -".yaml".length));
    } catch {
      // Unreadable entry — skip defensively, mirrors listBrands.
    }
  }
  return slugs.sort();
}

/**
 * Load one Format from disk. A genuinely MISSING Format file throws a clear, actionable error
 * naming the Brand + Format and listing the Brand's actually-available Formats (mirrors
 * `ledger.ts`'s "unknown Brand" pattern) — silently falling back to an empty Format would let a Run
 * silently scout zero sources. A file that exists but fails to parse as YAML throws too, naming the
 * path (mirrors `readJsonFile`'s parse-guard philosophy). Once read, the content is parsed
 * defensively by `parseFormatFile` (garbled fields degrade, they don't crash).
 */
export async function loadFormat(
  brand: string,
  formatSlug: string,
  brandsRoot?: string,
): Promise<FormatFile> {
  const path = formatFilePath(brand, formatSlug, brandsRoot);

  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err: unknown) {
    if (isEnoent(err)) {
      const available = await listFormatSlugs(brand, brandsRoot);
      const hint = available.length > 0
        ? `Available Formats for "${brand}": ${available.join(", ")}.`
        : `Brand "${brand}" has no Format files yet — add one at ` +
          `data/brands/${brand}/formats/<slug>.yaml before running trend research.`;
      throw new Error(`Unknown Format "${formatSlug}" for Brand "${brand}" (no file at ${path}). ${hint}`);
    }
    throw err;
  }

  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot parse Format YAML at ${path}: ${detail}. The file may be hand-edited incorrectly — ` +
        `restore it from version control or fix the syntax.`,
    );
  }

  return parseFormatFile(raw, formatSlug);
}
