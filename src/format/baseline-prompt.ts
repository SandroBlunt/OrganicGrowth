/**
 * Baseline Prompt loader — reads a Format's per-Recipe "look" document (CONTEXT.md "Baseline
 * Prompt"; ADR-0015; issue #83).
 *
 * A **Baseline Prompt** is the document a **Format** holds for each **Recipe** it produces
 * through — its definitions (card styles, the pill/eyebrow text, logo placement, fonts), a core
 * structure example, and samples. It lives as its **own referenced file**, never inline YAML: the
 * Format file (`src/format/store.ts`'s `FormatFile.baselinePrompts`) carries only a per-Recipe
 * POINTER — a relative filename — and THIS module resolves and reads the actual document.
 *
 * A pointer resolves under `data/brands/<slug>/baseline-prompts/<formatSlug>/` (the Format's OWN
 * baseline-prompts directory — `formatBaselinePromptsRoot`, `src/format/store.ts`), never anywhere
 * else. `resolveBaselinePromptPath` is the pure, no-I/O guard: it rejects (never throws) a pointer
 * that is empty, absolute, or that normalizes outside that directory (a path-traversal attempt) —
 * the SAME tenancy-boundary reasoning `assertValidFormatSlug`/`assertValidBrandSlug` apply to
 * slugs, applied here to a hand-editable relative-path VALUE instead of a slug.
 *
 * `loadBaselinePrompt` is the thin, async I/O shell built on top of it. It NEVER throws for an
 * ordinary "nothing to read" outcome — mirroring `BrandAssetStore.getBrandAsset`'s never-throwing
 * typed lookup — because a Format with no Baseline Prompt declared for a Recipe is a normal,
 * expected shape (issue #83 AC1: a clear "none" result, not an error), and a malformed or dangling
 * pointer must never crash a production run (data-handling rule 4; issue #83 AC3). It distinguishes
 * three distinct "not found" reasons so a caller (eventually a Recipe's producer Skill, ADR-0018)
 * can log/report precisely what happened:
 *
 *   - `"not-declared"` — the Format has no pointer for this Recipe at all (the ordinary "none").
 *   - `"malformed"`     — the declared pointer is unsafe/unusable (empty, absolute, path-traversal).
 *   - `"dangling"`      — the pointer is safe and well-formed, but no file exists at the resolved path.
 *
 * Only an invalid Brand/Format SLUG still throws (delegated to `resolveBrand`/
 * `assertValidFormatSlug` via `formatBaselinePromptsRoot`) — that is the pre-existing tenancy
 * boundary every store in this repo enforces, a different concern from "this pointer isn't usable."
 *
 * Interpreting the document's contents (reproducing its fixed clauses, swapping the bracketed
 * per-shot parts) is explicitly OUT of scope here — that is a Recipe's producer Skill's job
 * (ADR-0018, issue #87). This module only ever finds and reads the raw text.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, join, normalize, relative } from "node:path";

import { formatBaselinePromptsRoot, type FormatFile } from "./store.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A Baseline Prompt document, found and read. */
export interface BaselinePromptFound {
  readonly found: true;
  /** The Recipe slug this document was looked up for. */
  readonly recipe: string;
  /** The pointer as declared in the Format file (the relative filename). */
  readonly pointer: string;
  /** The resolved, absolute on-disk path the document was read from. */
  readonly path: string;
  /** The document's raw text content, byte-faithful (no interpretation performed here). */
  readonly content: string;
}

/** Why a Baseline Prompt lookup came back empty — see module doc above. */
export type BaselinePromptNotFoundReason = "not-declared" | "malformed" | "dangling";

/** A Baseline Prompt lookup that found nothing — never a throw, always a clear reason + message. */
export interface BaselinePromptNotFound {
  readonly found: false;
  readonly recipe: string;
  readonly reason: BaselinePromptNotFoundReason;
  readonly message: string;
}

/** The result of looking up one Format's Baseline Prompt for one Recipe. Never thrown; always one
 *  of these two typed shapes (issue #83 AC1/AC3). */
export type BaselinePromptLookup = BaselinePromptFound | BaselinePromptNotFound;

// ---------------------------------------------------------------------------
// resolveBaselinePromptPath — pure, no I/O, the tenancy/traversal guard
// ---------------------------------------------------------------------------

/**
 * Resolve a Format's declared Baseline Prompt POINTER (e.g. `"news-carousel.md"`) to an absolute
 * on-disk path under that Format's own baseline-prompts directory, WITHOUT touching the filesystem.
 *
 * Returns `{ ok: false, message }` — NEVER throws — for a pointer that is:
 *   - not a non-empty string,
 *   - an absolute path (pointers are always relative to the Format's own directory),
 *   - or one that normalizes OUTSIDE that directory (a path-traversal attempt, e.g. `"../../etc"`).
 *
 * A Format/Brand slug that is itself invalid still throws (delegated to
 * `formatBaselinePromptsRoot`/`resolveBrand`) — the pre-existing tenancy boundary, a different
 * concern from "this pointer value is unusable."
 */
export function resolveBaselinePromptPath(
  brand: string,
  formatSlug: string,
  pointer: string,
  brandsRoot?: string,
): { readonly ok: true; readonly path: string } | { readonly ok: false; readonly message: string } {
  const root = formatBaselinePromptsRoot(brand, formatSlug, brandsRoot); // validates slugs too

  if (typeof pointer !== "string" || pointer.trim().length === 0) {
    return { ok: false, message: "the pointer is empty" };
  }
  const trimmed = pointer.trim();
  if (isAbsolute(trimmed)) {
    return { ok: false, message: `"${trimmed}" is an absolute path — a pointer must be relative` };
  }

  const resolved = normalize(join(root, trimmed));
  const rel = relative(root, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return {
      ok: false,
      message: `"${trimmed}" escapes its Format's baseline-prompts directory (${root})`,
    };
  }

  return { ok: true, path: resolved };
}

// ---------------------------------------------------------------------------
// loadBaselinePrompt — the async I/O shell
// ---------------------------------------------------------------------------

/**
 * Look up and read one Recipe's Baseline Prompt document for an already-loaded `FormatFile`. NEVER
 * throws for an ordinary "nothing to read" outcome (issue #83 AC1/AC3) — see the three
 * `BaselinePromptNotFoundReason` values in the module doc above.
 *
 * @param brand      the Brand slug the Format belongs to (needed to resolve the on-disk path)
 * @param format     an already-parsed `FormatFile` (e.g. from `loadFormat`)
 * @param recipeSlug the Recipe slug to look up (free-text — not validated against the Recipe
 *                    registry here, mirrors how `FormatFile.defaultRecipes`/`.baselinePrompts`
 *                    themselves stay unvalidated at this layer)
 * @param brandsRoot optional override for the Brands root (tests use a temp directory)
 */
export async function loadBaselinePrompt(
  brand: string,
  format: FormatFile,
  recipeSlug: string,
  brandsRoot?: string,
): Promise<BaselinePromptLookup> {
  const pointer = format.baselinePrompts[recipeSlug];
  if (pointer === undefined) {
    return {
      found: false,
      recipe: recipeSlug,
      reason: "not-declared",
      message:
        `Format "${format.slug}" declares no Baseline Prompt for Recipe "${recipeSlug}" — its ` +
        "producer Skill will author the media prompt without a look document (ADR-0015). This is " +
        "expected until the Operator authors one for this (Format × Recipe) pair.",
    };
  }

  const resolved = resolveBaselinePromptPath(brand, format.slug, pointer, brandsRoot);
  if (!resolved.ok) {
    return {
      found: false,
      recipe: recipeSlug,
      reason: "malformed",
      message:
        `Format "${format.slug}"'s Baseline Prompt pointer for Recipe "${recipeSlug}" ` +
        `(${JSON.stringify(pointer)}) is malformed: ${resolved.message}. Fix the pointer in ` +
        `data/brands/${brand}/formats/${format.slug}.yaml.`,
    };
  }

  let content: string;
  try {
    content = await readFile(resolved.path, "utf8");
  } catch {
    return {
      found: false,
      recipe: recipeSlug,
      reason: "dangling",
      message:
        `Format "${format.slug}"'s Baseline Prompt pointer for Recipe "${recipeSlug}" ` +
        `(${JSON.stringify(pointer)}) does not resolve to a file on disk (looked at ` +
        `${resolved.path}). The Format file may reference a document that was renamed, moved, or ` +
        "never committed — fix the pointer or add the missing file.",
    };
  }

  return { found: true, recipe: recipeSlug, pointer, path: resolved.path, content };
}
