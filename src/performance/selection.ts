/**
 * Trackable-Asset selection — pure deep module (issue #84, ADR-0011).
 *
 * `/track-performance <brand> [idea-id]` operates at the ledger's real grain: ONE selection per
 * `(Idea, Recipe)` Asset, never per Idea (`.claude/commands/track-performance.md`). This module picks
 * exactly which Assets a run should pull metrics for, from the Brand's already-loaded ledger Ideas:
 *
 *   - Default (no `idea-id`): every Asset, across every Idea and every chosen Recipe, that has a
 *     logged `post_url` AND is at `posted` or `tracking` — a `scored` Asset is settled and is NOT
 *     re-selected by default.
 *   - Forced (`idea-id` given): EVERY Asset of that one Idea that has a logged `post_url`, regardless
 *     of status — including an already-`scored` one, to force a re-pull.
 *
 * Attribution stays explicit throughout: a pick names its own `ideaId` + the Asset's own `recipe` —
 * never inferred, never collapsed across Recipes (always-rules #5). Pure: no I/O, no clock.
 */

import type { LedgerIdea } from "../ledger/ledger.ts";
import type { LedgerAssetRecord } from "../asset/asset.ts";

/** One Asset selected for a tracking pull, plus the Idea id it belongs to (for the ledger write). */
export interface TrackablePick {
  readonly ideaId: string;
  readonly asset: LedgerAssetRecord;
}

export interface SelectTrackableOptions {
  /** When given, selects ONLY this Idea's Assets, and FORCES re-selection even of a `scored` Asset. */
  readonly ideaId?: string;
}

const DEFAULT_SELECTABLE_STATUSES = new Set(["posted", "tracking"]);

/**
 * Select the Assets a `/track-performance` run should pull metrics for. Pure, deterministic; never
 * mutates `ideas`. Only Assets with a non-empty `post_url` are ever selected (always-rules #5 — only
 * score what has been explicitly attributed to a Post).
 */
export function selectTrackableAssets(
  ideas: readonly LedgerIdea[],
  options: SelectTrackableOptions = {},
): TrackablePick[] {
  const forced = options.ideaId !== undefined;
  const picks: TrackablePick[] = [];

  for (const idea of ideas) {
    if (forced && idea.id !== options.ideaId) continue;

    for (const asset of idea.assets ?? []) {
      if (asset.post_url === undefined || asset.post_url.length === 0) continue;
      if (!forced && !DEFAULT_SELECTABLE_STATUSES.has(asset.status)) continue;
      picks.push({ ideaId: idea.id, asset });
    }
  }

  return picks;
}
