/**
 * LinkedIn Handle Lookup — pure deep module (issue #126, epic #120).
 *
 * A **LinkedIn Handle Lookup** maps a third-party company/product's plain name (e.g. `"Anthropic"`,
 * `"1Password"` — a company mentioned IN a Post's content, never a Brand's own identity) to that
 * company's LinkedIn Page **handle** (the slug in `https://www.linkedin.com/company/<handle>`).
 * Resolving a handle is a prerequisite for tagging a real LinkedIn account in composed Copy (epic
 * #120) — but wiring a resolved handle INTO Copy is a separate, downstream slice (issue #130, blocked
 * on #129); this module only ever resolves a name, or reports that it has no entry for one.
 *
 * --- Operator-maintained, NOT a live lookup (AC4) ---
 *
 * This lookup is a plain, hand-edited file (`data/linkedin-handles.yaml`, read via `store.ts`) the
 * Operator adds/edits entries to directly. There is NO live LinkedIn API call, no scraping, no network
 * request anywhere in this module or its I/O shell — it is neither of the repo's two Apify jobs
 * (data-handling rule 2: trend-scout scrapes peers, performance-tracker scrapes our own posts; this
 * lookup is a third, deliberately-static thing outside both).
 *
 * --- Global, not per-Brand (scope decision — see the change's proposal.md) ---
 *
 * Unlike a Brand Asset (`src/brand-asset/store.ts`, per-Brand reusable media), the companies/products a
 * Post's Copy names are third-party entities that can recur across ANY Brand's content — a single
 * global table, shared across every Brand, is the right grain (confirmed against ADR-0019 and issue
 * #130's own body, both of which already refer to "issue #126's lookup" in the singular). This module
 * mirrors `BrandAssetStore`'s *shape* (a typed store boundary over a plain committed file; defensive
 * parsing; a missing/empty source degrades to "nothing found," never an error) without any per-Brand
 * scoping — there is no Brand slug anywhere in this module, the same way `production-queue/queue.ts`
 * carries no Brand slug of its own for its one global `data/queue.json`.
 *
 * Design mirrors `production-queue/queue.ts` (pure logic) / `store.ts` (I/O) split: this module holds
 * ONLY the pure, deterministic shape + logic — parsing already-YAML-parsed content and resolving a
 * name. It never touches the filesystem, network, or clock. I/O lives in `store.ts`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One resolved entry: the Operator-authored display name (as committed, trimmed) and its handle. */
export interface LinkedInHandleEntry {
  /** The name as the Operator wrote it in `data/linkedin-handles.yaml` (trimmed, original casing). */
  readonly name: string;
  /** The LinkedIn Page handle (trimmed) — the slug in `https://www.linkedin.com/company/<handle>`. */
  readonly handle: string;
}

/**
 * The parsed lookup table. Keyed internally by a NORMALIZED name (trimmed, case-folded) so resolution
 * is case-insensitive and whitespace-tolerant; each entry still carries its original, Operator-authored
 * `name` for any caller that wants to display it. Never mutated after `parseLinkedInHandleTable`
 * returns it.
 */
export interface LinkedInHandleTable {
  readonly byNormalizedName: ReadonlyMap<string, LinkedInHandleEntry>;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/** Trim + case-fold a name for matching. PURE. Exported so callers can reason about match keys. */
export function normalizeCompanyName(name: string): string {
  return name.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// emptyLinkedInHandleTable — the "no entries" state (a missing/empty file's degraded shape)
// ---------------------------------------------------------------------------

/** The empty table — no entries. What a missing file, an empty file, or `{}` all degrade to. */
export function emptyLinkedInHandleTable(): LinkedInHandleTable {
  return { byNormalizedName: new Map() };
}

// ---------------------------------------------------------------------------
// parseLinkedInHandleTable — defensive parsing (data-handling rule 4)
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Parse already-YAML-parsed content into a `LinkedInHandleTable`. PURE and DEFENSIVE: never throws for
 * garbled input — `null`/`undefined` (an empty or comments-only file) and any non-object value both
 * degrade to the empty table (with a warning for the latter, since that shape is unexpected rather than
 * simply absent). Within an object, each `name -> handle` entry is validated independently:
 *
 *   - A blank/non-string name, or a blank/non-string handle, drops that ONE entry (warned), never the
 *     whole table (data-handling rule 4).
 *   - Two entries that normalize (trim + case-fold) to the same key are ambiguous; the FIRST (in
 *     object-key order) wins and the rest are dropped (warned) — mirrors `listBrandAssets`'s
 *     alphabetically-first-wins duplicate-key convention, deterministic rather than a silent overwrite.
 */
export function parseLinkedInHandleTable(raw: unknown): LinkedInHandleTable {
  if (raw === null || raw === undefined) {
    return emptyLinkedInHandleTable(); // an empty/comments-only YAML file — the normal "no entries yet" case
  }
  if (!isObject(raw)) {
    console.warn(
      `[linkedin-handle] parseLinkedInHandleTable: expected a name->handle mapping, got ${typeof raw} — treating as empty`,
    );
    return emptyLinkedInHandleTable();
  }

  const byNormalizedName = new Map<string, LinkedInHandleEntry>();
  for (const [rawName, rawHandle] of Object.entries(raw)) {
    const name = rawName.trim();
    if (name.length === 0) {
      console.warn("[linkedin-handle] parseLinkedInHandleTable: dropping entry with a blank name");
      continue;
    }
    if (typeof rawHandle !== "string" || rawHandle.trim().length === 0) {
      console.warn(
        `[linkedin-handle] parseLinkedInHandleTable: dropping entry ${JSON.stringify(name)} — handle is missing, blank, or not a string`,
      );
      continue;
    }
    const handle = rawHandle.trim();
    const key = normalizeCompanyName(name);
    if (byNormalizedName.has(key)) {
      console.warn(
        `[linkedin-handle] parseLinkedInHandleTable: dropping duplicate entry ${JSON.stringify(name)} — a name normalizing to the same key is already committed`,
      );
      continue;
    }
    byNormalizedName.set(key, { name, handle });
  }

  return { byNormalizedName };
}

// ---------------------------------------------------------------------------
// resolveHandle — typed, never-fabricating lookup (AC2)
// ---------------------------------------------------------------------------

/**
 * Resolve `name` against `table`, case-insensitively and whitespace-trimmed. Returns the committed
 * handle, or `null` when no entry exists — NEVER fabricates a handle for an unresolved name (AC2). Pure
 * and deterministic.
 */
export function resolveHandle(table: LinkedInHandleTable, name: string): string | null {
  const key = normalizeCompanyName(name);
  if (key.length === 0) return null;
  const entry = table.byNormalizedName.get(key);
  return entry ? entry.handle : null;
}
