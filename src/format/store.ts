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
 * Write path: creating a whole new Format file is still NOT built here — that full authoring flow
 * (niche/voice/sources, ADR-0013) stays deferred to the scaffolder's Format interview. Surgically
 * editing an EXISTING Format file's recipe-tied fields IS built (`saveFormatDefaultRecipes`,
 * `saveFormatBaselinePromptPointer`, for the Library's admin module) — each uses `yaml`'s `Document`
 * API to patch just the one field, so every other hand-authored field/comment survives untouched,
 * preserving ADR-0014's "documents the human authors... stay files, git-diffable" intent even though
 * the edit itself is now driven by a form instead of a text editor.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { parse as parseYaml, parseDocument } from "yaml";

import type { DatabaseSync } from "node:sqlite";

import { resolveBrand } from "../brand/resolver.ts";
import { normalizeSeeds, type NormalizedSeed } from "../readiness/check-config.ts";
import { writeFileAtomic } from "../fs/safe-io.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How a Format's Trend Research sources are gathered — chosen per-Format (ADR-0013). */
export type FormatSourceMode = "peer" | "curated";

/**
 * How often a Run of this Format is launched (ADR-0022, `docs/adr/0022-cadence-is-a-format-property.md`):
 * `"weekly"` (the default — every Format that predates this field parses as weekly, unchanged) or
 * `"daily"` (e.g. Straw Motion's Unhypped Daily). A Run's DEFAULT name follows this — the current ISO
 * week for `"weekly"`, the current ISO date for `"daily"` (`defaultRunId`, `./run-id.ts`) — but the
 * Run id stays an opaque label everywhere else: no code parses week/date semantics back out of it.
 */
export type FormatCadence = "weekly" | "daily";

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
  /** How often a Run of this Format is launched — `"weekly"` (default) or `"daily"` (ADR-0022). */
  readonly cadence: FormatCadence;
  /** Recipe slugs pre-filled at Review for Ideas of this Format (ADR-0009). Stays free-text/unvalidated
   * HERE at parse time — the in-repo Recipe registry (`src/recipe/registry.ts`, issue #54) is the
   * thing that filters these to WIRED slugs only, at offer time (`src/recipe/offer.ts`,
   * `offeredRecipes`), not here. */
  readonly defaultRecipes: readonly string[];
  /**
   * Per-Recipe **Baseline Prompt** POINTERS (ADR-0015, CONTEXT.md "Baseline Prompt") — recipe slug
   * -> a relative filename for that Recipe's look document, e.g.
   * `{ "news-carousel": "news-carousel.md" }`. NEVER the document's content inline: the actual
   * document is a separate file, resolved (relative to this Format's own baseline-prompts
   * directory) and read via `loadBaselinePrompt` (`src/format/baseline-prompt.ts`), which degrades a
   * missing/garbled/dangling pointer to a typed not-found result rather than throwing (issue #83).
   * Stays free-text/unvalidated against the Recipe registry HERE at parse time, same as
   * `defaultRecipes` above — a Format with no Baseline Prompt declared for a given (or any) Recipe
   * simply has no entry for it; that is a normal, expected shape, not an error.
   */
  readonly baselinePrompts: Readonly<Record<string, string>>;
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
 * Parse a Format's `cadence` field (ADR-0022). `"daily"` (trimmed, case-insensitive) selects the
 * daily cadence; anything else — absent, garbled, or any other string — defaults to `"weekly"`, so
 * every Format that predates this field (every real Format today) parses unchanged.
 */
export function parseCadence(value: unknown): FormatCadence {
  return typeof value === "string" && value.trim().toLowerCase() === "daily" ? "daily" : "weekly";
}

/**
 * A string->string map with every key and value trimmed, keeping only entries where BOTH the key
 * and the value are non-empty strings. Non-object/garbled input (and every non-string/empty-after-
 * trim entry within it) is dropped rather than crashing — the same defensive-degrade convention
 * `strArray` uses for lists (data-handling rule 4). Used for `baseline_prompts` (recipe slug -> a
 * relative pointer filename, ADR-0015): a garbled entry there is simply absent from the result, which
 * `loadBaselinePrompt` then reports as "no Baseline Prompt declared for this Recipe" — never a crash.
 */
function strRecord(value: unknown): Record<string, string> {
  if (!isObject(value)) return {};
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    if (typeof rawValue !== "string") continue;
    const key = rawKey.trim();
    const val = rawValue.trim();
    if (key.length === 0 || val.length === 0) continue;
    out[key] = val;
  }
  return out;
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
    cadence: parseCadence(obj.cadence),
    defaultRecipes: strArray(obj.default_recipes),
    baselinePrompts: strRecord(obj.baseline_prompts),
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

/**
 * The Format-namespaced Baseline Prompt root: `<brandsRoot>/<brand>/baseline-prompts/<formatSlug>`
 * (ADR-0015). A Format's per-Recipe `baseline_prompts` pointers are relative filenames resolved
 * under THIS directory — never an absolute path, never elsewhere — read via the typed loader
 * `loadBaselinePrompt` (`src/format/baseline-prompt.ts`).
 */
export function formatBaselinePromptsRoot(brand: string, formatSlug: string, brandsRoot?: string): string {
  assertValidFormatSlug(formatSlug);
  const paths = resolveBrand(brand, brandsRoot);
  return join(paths.baselinePromptsRoot, formatSlug);
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

// ---------------------------------------------------------------------------
// Surgical writes (Library admin module, issue-less follow-up to the audit's CRUD request) — edits an
// EXISTING Format file's recipe-tied fields only (never creates a new Format: that full authoring flow
// stays deferred to the scaffolder's Format interview, ADR-0013, per this module's own doc comment).
// Uses `parseDocument`/`setIn`/`deleteIn` rather than re-serializing the typed `FormatFile`, so every
// OTHER field, comment, and key order in the hand-authored file survives untouched.
// ---------------------------------------------------------------------------

/**
 * Overwrites an existing Format file's `default_recipes` list. Throws the same "Unknown Format" error
 * as `loadFormat` if the file doesn't exist — this never creates one.
 */
export async function saveFormatDefaultRecipes(
  brand: string,
  formatSlug: string,
  recipes: readonly string[],
  brandsRoot?: string,
): Promise<void> {
  await loadFormat(brand, formatSlug, brandsRoot); // throws the friendly "Unknown Format" error if absent
  const path = formatFilePath(brand, formatSlug, brandsRoot);
  const text = await readFile(path, "utf8");
  const doc = parseDocument(text);
  doc.setIn(["default_recipes"], [...recipes]);
  await writeFileAtomic(path, doc.toString());
}

/**
 * Adds/updates ("save") or removes ("delete", when `pointer` is `null`) one Recipe's `baseline_prompts`
 * pointer entry on an existing Format file. Throws the same "Unknown Format" error as `loadFormat` if
 * the file doesn't exist.
 */
export async function saveFormatBaselinePromptPointer(
  brand: string,
  formatSlug: string,
  recipeSlug: string,
  pointer: string | null,
  brandsRoot?: string,
): Promise<void> {
  await loadFormat(brand, formatSlug, brandsRoot);
  const path = formatFilePath(brand, formatSlug, brandsRoot);
  const text = await readFile(path, "utf8");
  const doc = parseDocument(text);
  if (pointer === null) {
    doc.deleteIn(["baseline_prompts", recipeSlug]);
  } else {
    doc.setIn(["baseline_prompts", recipeSlug], pointer);
  }
  await writeFileAtomic(path, doc.toString());
}

// ---------------------------------------------------------------------------
// SQL-backed store (issue #222, ADR-0029) — ADDITIVE
// ---------------------------------------------------------------------------
//
// The Format YAML file above stays the Operator-authored document (ADR-0029: "documents a human
// authors or reads directly stay files") — `loadFormat`/`listFormatSlugs`/`parseFormatFile` are
// UNCHANGED by this section. But `format` is also a real, referenced SQL table: `run.format_id`,
// `idea.format_id`, and `baseline_prompt.format_id` all foreign-key into it (`src/db/schema.ts`), so a
// `format` row is required PLUMBING for those tables to be usable at all — not an optional convenience.
// `createFormat`/`getFormatBySlug`/`getFormatById`/`listFormatsForBrand`/`updateFormat` below are that
// typed SQL boundary, `{ db }`-only (mirrors `src/brand/store.ts`/`src/channel/store.ts` — there was no
// pre-existing `{ ledgerPath }` option to port here either, since Format was always a YAML file, never
// a ledger record).

/** The fields `createFormat` requires/accepts, minus id/timestamps (assigned by this module). */
export interface FormatDbInput {
  readonly brandId: string;
  readonly slug: string;
  readonly name: string;
  readonly voice: string;
  readonly cadence?: FormatCadence;
  readonly ideasPerRun?: number;
  readonly sourceMode?: FormatSourceMode;
  readonly sources?: FormatSources;
  readonly defaultRecipes?: readonly string[];
}

/** One `format` row, fully typed. */
export interface FormatDbRecord {
  readonly id: string;
  readonly brandId: string;
  readonly slug: string;
  readonly name: string;
  readonly voice: string;
  readonly cadence: FormatCadence;
  readonly ideasPerRun: number;
  readonly sourceMode: FormatSourceMode;
  readonly sources: FormatSources;
  readonly defaultRecipes: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A patch `updateFormat` accepts — every field optional; only the given ones are written. */
export type FormatDbPatch = Partial<FormatDbInput>;

interface FormatRow {
  readonly id: string;
  readonly brand_id: string;
  readonly slug: string;
  readonly name: string;
  readonly voice: string;
  readonly cadence: string;
  readonly ideas_per_run: number;
  readonly source_mode: string;
  readonly sources_json: string;
  readonly default_recipes_json: string;
  readonly created_at: string;
  readonly updated_at: string;
}

const EMPTY_FORMAT_SOURCES = (mode: FormatSourceMode): FormatSources => ({
  mode,
  seedPages: [],
  curatedSources: [],
  keywords: [],
  lookbackDays: 7,
  overperformanceOnly: true,
});

function toDbRecord(row: FormatRow): FormatDbRecord {
  return {
    id: row.id,
    brandId: row.brand_id,
    slug: row.slug,
    name: row.name,
    voice: row.voice,
    cadence: row.cadence as FormatCadence,
    ideasPerRun: row.ideas_per_run,
    sourceMode: row.source_mode as FormatSourceMode,
    sources: JSON.parse(row.sources_json) as FormatSources,
    defaultRecipes: JSON.parse(row.default_recipes_json) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Inserts one `format` row and returns its generated id. Throws (SQLite FOREIGN KEY error) for an
 * unknown `brandId`, and (UNIQUE error) for a `(brandId, slug)` pair already committed
 * (`format`'s own `UNIQUE (brand_id, slug)`, mirroring one Format slug per Brand — same rule
 * `formatFilePath` enforces on disk by the filename itself).
 */
export function createFormat(
  db: DatabaseSync,
  input: FormatDbInput,
  now: () => string = () => new Date().toISOString(),
): string {
  const id = randomUUID();
  const timestamp = now();
  const sourceMode = input.sourceMode ?? "peer";
  const sources = input.sources ?? EMPTY_FORMAT_SOURCES(sourceMode);
  db.prepare(
    `INSERT INTO format
       (id, brand_id, slug, name, voice, cadence, ideas_per_run, source_mode, sources_json, default_recipes_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.brandId,
    input.slug,
    input.name,
    input.voice,
    input.cadence ?? "weekly",
    input.ideasPerRun ?? 10,
    sourceMode,
    JSON.stringify(sources),
    JSON.stringify(input.defaultRecipes ?? []),
    timestamp,
    timestamp,
  );
  return id;
}

/** Looks up one Format by its stable id. Returns `null` for an unknown id — never throws. */
export function getFormatById(db: DatabaseSync, id: string): FormatDbRecord | null {
  const row = db.prepare(`SELECT * FROM format WHERE id = ?`).get(id) as unknown as FormatRow | undefined;
  return row ? toDbRecord(row) : null;
}

/** Looks up one Brand's Format by slug. Returns `null` when that Brand has none for that slug. */
export function getFormatBySlug(db: DatabaseSync, brandId: string, slug: string): FormatDbRecord | null {
  const row = db
    .prepare(`SELECT * FROM format WHERE brand_id = ? AND slug = ?`)
    .get(brandId, slug) as unknown as FormatRow | undefined;
  return row ? toDbRecord(row) : null;
}

/** Every Format for one Brand, sorted by slug. `[]` for a Brand with none. */
export function listFormatsForBrand(db: DatabaseSync, brandId: string): readonly FormatDbRecord[] {
  const rows = db
    .prepare(`SELECT * FROM format WHERE brand_id = ? ORDER BY slug ASC`)
    .all(brandId) as unknown as FormatRow[];
  return rows.map(toDbRecord);
}

/**
 * Merges `patch` onto the Format at `id`. Throws a clear, actionable error naming the id for an unknown
 * Format — a Format row is a required FK anchor for `run`/`idea`/`baseline_prompt`, so a silent no-op
 * would let a caller believe an update landed when it did not.
 */
export function updateFormat(
  db: DatabaseSync,
  id: string,
  patch: FormatDbPatch,
  now: () => string = () => new Date().toISOString(),
): void {
  const existing = getFormatById(db, id);
  if (existing === null) {
    throw new Error(`Format "${id}" not found — cannot update a Format that does not exist.`);
  }
  const merged: FormatDbRecord = { ...existing, ...patch, updatedAt: now() };
  db.prepare(
    `UPDATE format
       SET slug = ?, name = ?, voice = ?, cadence = ?, ideas_per_run = ?, source_mode = ?,
           sources_json = ?, default_recipes_json = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    merged.slug,
    merged.name,
    merged.voice,
    merged.cadence,
    merged.ideasPerRun,
    merged.sourceMode,
    JSON.stringify(merged.sources),
    JSON.stringify(merged.defaultRecipes),
    merged.updatedAt,
    id,
  );
}
