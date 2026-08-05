/**
 * Mention Handle Registry — pure deep module (issue #149, epic #120; supersedes issue #126's
 * LinkedIn-only lookup).
 *
 * A **Mention Handle Registry** maps a third-party company/product's plain name (e.g. `"Anthropic"`,
 * `"1Password"` — a company mentioned IN a Post's content, never a Brand's own identity) to that
 * company's **handle** on one or more platforms (`linkedin` / `x` / `instagram` / `tiktok` /
 * `facebook`). Resolving a handle is a prerequisite for tagging a real account in composed Copy (epic
 * #120) — but wiring a resolved handle INTO Copy stays a separate, per-platform, downstream concern
 * (today: the LinkedIn variant only, `src/copy/linkedin-mentions.ts`, issue #130); this module only ever
 * resolves a `(name, platform)` pair, or reports that it has no entry for one.
 *
 * --- Operator-maintained, NOT a live lookup (AC4) ---
 *
 * This lookup is a plain, hand-edited file (`data/mention-handles.yaml`, read via `store.ts`) the
 * Operator adds/edits entries to directly. There is NO live API call, no scraping, no network request
 * anywhere in this module or its I/O shell — it is neither of the repo's two Apify jobs (data-handling
 * rule 2: trend-scout scrapes peers, performance-tracker scrapes our own posts; this lookup is a third,
 * deliberately-static thing outside both).
 *
 * --- Global, not per-Brand (scope decision inherited from issue #126) ---
 *
 * Unlike a Brand Asset (`src/brand-asset/store.ts`, per-Brand reusable media), the companies/products a
 * Post's Copy names are third-party entities that can recur across ANY Brand's content — a single
 * global table, shared across every Brand, is the right grain. This module mirrors `BrandAssetStore`'s
 * *shape* (a typed store boundary over a plain committed file; defensive parsing; a missing/empty source
 * degrades to "nothing found," never an error) without any per-Brand scoping — there is no Brand slug
 * anywhere in this module, the same way `production-queue/queue.ts` carries no Brand slug of its own for
 * its one global `data/queue.json`.
 *
 * --- Platform-keyed (issue #149) ---
 *
 * Each committed company entry carries a per-platform map of handles — a company may have a confirmed
 * handle on some platforms and none on others; an omitted platform key for an otherwise-known company
 * resolves to no handle, NEVER a guess (AC2). Only `MENTION_PLATFORMS` are recognized; an unrecognized
 * platform key under a company entry is dropped defensively (warned), keeping that company's other,
 * valid platform handles intact.
 *
 * Design mirrors `production-queue/queue.ts` (pure logic) / `store.ts` (I/O) split: this module holds
 * ONLY the pure, deterministic shape + logic — parsing already-YAML-parsed content and resolving a
 * name+platform pair. It never touches the filesystem, network, or clock. I/O lives in `store.ts`.
 */

// ---------------------------------------------------------------------------
// Platforms
// ---------------------------------------------------------------------------

/** Every platform this registry recognizes (issue #149's own list). A platform key outside this list is
 *  dropped defensively when parsing — never silently misfiled, never fabricated. */
export const MENTION_PLATFORMS = ["linkedin", "x", "instagram", "tiktok", "facebook"] as const;

/** One of `MENTION_PLATFORMS`. */
export type MentionPlatform = (typeof MENTION_PLATFORMS)[number];

function isMentionPlatform(value: string): value is MentionPlatform {
  return (MENTION_PLATFORMS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One resolved company: the Operator-authored display name (as committed, trimmed) and its per-platform
 *  handles (only the platforms the Operator has actually confirmed — never every platform). */
export interface MentionHandleEntry {
  /** The name as the Operator wrote it in `data/mention-handles.yaml` (trimmed, original casing). */
  readonly name: string;
  /** Platform -> handle (trimmed), only for the platforms this company has a committed handle for. */
  readonly handles: ReadonlyMap<MentionPlatform, string>;
}

/**
 * The parsed registry. Keyed internally by a NORMALIZED company name (trimmed, case-folded) so
 * resolution is case-insensitive and whitespace-tolerant; each entry still carries its original,
 * Operator-authored `name` for any caller that wants to display it. Never mutated after
 * `parseMentionHandleTable` returns it.
 */
export interface MentionHandleTable {
  readonly byNormalizedName: ReadonlyMap<string, MentionHandleEntry>;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/** Trim + case-fold a company name for matching. PURE. Exported so callers can reason about match keys. */
export function normalizeCompanyName(name: string): string {
  return name.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// emptyMentionHandleTable — the "no entries" state (a missing/empty file's degraded shape)
// ---------------------------------------------------------------------------

/** The empty table — no entries. What a missing file, an empty file, or `{}` all degrade to. */
export function emptyMentionHandleTable(): MentionHandleTable {
  return { byNormalizedName: new Map() };
}

// ---------------------------------------------------------------------------
// parseMentionHandleTable — defensive parsing (data-handling rule 4)
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Parse already-YAML-parsed content into a `MentionHandleTable`. PURE and DEFENSIVE: never throws for
 * garbled input — `null`/`undefined` (an empty or comments-only file) and any non-object value both
 * degrade to the empty table (with a warning for the latter, since that shape is unexpected rather than
 * simply absent). Within an object, each `company -> { platform: handle }` entry is validated
 * independently:
 *
 *   - A blank/non-string company name drops that ONE entry (warned), never the whole table.
 *   - A company value that isn't itself a `platform -> handle` mapping drops that ONE entry (warned).
 *   - Within a company's platform map, an unrecognized platform key (not one of `MENTION_PLATFORMS`) is
 *     dropped (warned), keeping that company's OTHER, valid platform handles intact.
 *   - A blank/non-string handle drops that ONE platform entry (warned), keeping the company's other
 *     platforms intact.
 *   - A company left with ZERO valid platform handles after the above is dropped entirely (warned) —
 *     an entry with nothing resolvable is the same as no entry.
 *   - Two company names that normalize (trim + case-fold) to the same key are ambiguous; the FIRST (in
 *     object-key order) wins and the rest are dropped (warned) — mirrors `listBrandAssets`'s
 *     alphabetically-first-wins duplicate-key convention, deterministic rather than a silent overwrite.
 */
export function parseMentionHandleTable(raw: unknown): MentionHandleTable {
  if (raw === null || raw === undefined) {
    return emptyMentionHandleTable(); // an empty/comments-only YAML file — the normal "no entries yet" case
  }
  if (!isObject(raw)) {
    console.warn(
      `[mention-handle] parseMentionHandleTable: expected a company->platform mapping, got ${typeof raw} — treating as empty`,
    );
    return emptyMentionHandleTable();
  }

  const byNormalizedName = new Map<string, MentionHandleEntry>();
  for (const [rawName, rawPlatforms] of Object.entries(raw)) {
    const name = rawName.trim();
    if (name.length === 0) {
      console.warn("[mention-handle] parseMentionHandleTable: dropping entry with a blank company name");
      continue;
    }
    if (!isObject(rawPlatforms)) {
      console.warn(
        `[mention-handle] parseMentionHandleTable: dropping entry ${JSON.stringify(name)} — expected ` +
          `a platform->handle mapping, got ${typeof rawPlatforms}`,
      );
      continue;
    }

    const handles = new Map<MentionPlatform, string>();
    for (const [rawPlatform, rawHandle] of Object.entries(rawPlatforms)) {
      const platform = rawPlatform.trim().toLowerCase();
      if (!isMentionPlatform(platform)) {
        console.warn(
          `[mention-handle] parseMentionHandleTable: dropping unrecognized platform ` +
            `${JSON.stringify(rawPlatform)} for ${JSON.stringify(name)}`,
        );
        continue;
      }
      if (typeof rawHandle !== "string" || rawHandle.trim().length === 0) {
        console.warn(
          `[mention-handle] parseMentionHandleTable: dropping ${platform} handle for ` +
            `${JSON.stringify(name)} — missing, blank, or not a string`,
        );
        continue;
      }
      handles.set(platform, rawHandle.trim());
    }

    if (handles.size === 0) {
      console.warn(
        `[mention-handle] parseMentionHandleTable: dropping entry ${JSON.stringify(name)} — no valid ` +
          `platform handles`,
      );
      continue;
    }

    const key = normalizeCompanyName(name);
    if (byNormalizedName.has(key)) {
      console.warn(
        `[mention-handle] parseMentionHandleTable: dropping duplicate entry ${JSON.stringify(name)} — ` +
          `a name normalizing to the same key is already committed`,
      );
      continue;
    }
    byNormalizedName.set(key, { name, handles });
  }

  return { byNormalizedName };
}

// ---------------------------------------------------------------------------
// resolveHandle — typed, platform-keyed, never-fabricating lookup (AC2)
// ---------------------------------------------------------------------------

/**
 * Resolve `(name, platform)` against `table`, case-insensitively and whitespace-trimmed for the name.
 * Returns the committed handle, or `null` when either the company or that specific platform key has no
 * entry — NEVER fabricates a handle (AC2: a missing platform key on an otherwise-known company resolves
 * to `null`, never a guess). Pure and deterministic.
 */
export function resolveHandle(
  table: MentionHandleTable,
  name: string,
  platform: MentionPlatform,
): string | null {
  const key = normalizeCompanyName(name);
  if (key.length === 0) return null;
  const entry = table.byNormalizedName.get(key);
  if (!entry) return null;
  return entry.handles.get(platform) ?? null;
}
