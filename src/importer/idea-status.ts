/**
 * `resolveIdeaStatus` — the final `idea.status` value (`'suggested' | 'accepted' | 'rejected'`, the SQL
 * CHECK's own closed set) for one ledger-loaded, `normalizeIdeaStatus`-normalized Idea record (issue
 * #204).
 *
 * Straw Motion's THIRD Idea shape (alongside "no Assets yet" and "Assets populated, canonical status"):
 * a real record whose `assets` array is already populated at the canonical grain, but whose OWN
 * top-level `status` still carries a RETIRED ADR-0011 production value (e.g. `"produced"` —
 * `idea-2026-08-11-12` in `data/brands/straw-motion/ledger.json`, a leftover of a write that populated
 * `assets` directly without also clearing the sibling `status` field back to a canonical value).
 * `src/asset/migrate.ts`'s `normalizeIdeaStatus` deliberately passes such a record's raw `status`
 * through UNCHANGED (its own doc comment: the function's `existingAssets.length > 0` branch never
 * re-derives a legacy status — that branch exists for records ALREADY at the canonical grain, which
 * this leftover-status record technically also satisfies by having a populated `assets` array).
 *
 * This module is the one place that final coercion happens, for the SQL `idea.status` column
 * specifically (which has no room for a fourth "canonical-shaped but stale-status" state — the CHECK
 * constraint only knows the three Review outcomes). The rule: any status is NOT one of the three
 * canonical Review outcomes is treated as `accepted` when the Idea already has at least one Asset —
 * every one of ADR-0011's five retired statuses (`casting`/`produced`/`posted`/`tracking`/`scored`) only
 * ever occupied the Idea's own `status` field POST-acceptance (ADR-0011's own doc comment: "the five
 * retired statuses ... used to occupy the Idea's OWN status field" as production stages). This is a
 * documented, narrow coercion of a real, evidenced shape — never a guess: an Idea cannot legally have
 * Assets without having been accepted (CONTEXT.md "Review": "Accepting enqueues one production job per
 * chosen Recipe"), so a non-canonical status alongside populated Assets can only ever mean "accepted".
 *
 * Pure: no disk, no network, no clock.
 */

const CANONICAL_STATUSES = new Set(["suggested", "accepted", "rejected"]);

/** The SQL `idea.status` CHECK's own closed set. */
export type CanonicalIdeaStatus = "suggested" | "accepted" | "rejected";

/**
 * Resolves the final `idea.status` for one loader-normalized record. `rawStatus` is whatever
 * `normalizeIdeaStatus` returned (already-canonical, or a legacy value passed through because Assets
 * were already populated); `assetCount` is that same call's `assets.length`.
 */
export function resolveIdeaStatus(rawStatus: string, assetCount: number): CanonicalIdeaStatus {
  if (CANONICAL_STATUSES.has(rawStatus)) {
    return rawStatus as CanonicalIdeaStatus;
  }
  // A non-canonical status can only occur pre-Review (no Assets, no decision made — degrade to
  // "suggested", data-handling rule 4) or post-acceptance-with-a-stale-status-field (populated
  // Assets — coerce to "accepted", see this module's own doc comment).
  return assetCount > 0 ? "accepted" : "suggested";
}
