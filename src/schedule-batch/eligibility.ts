/**
 * Eligibility — pure deep module deciding which of a run's Assets a Schedule Batch export includes
 * (issue #145, parent #140).
 *
 * The Zoho bulk scheduler's CSV path is IMAGES-ONLY (PRD #140 "Out of Scope" — video/Reels keep the
 * manual publish path). Today's registry (`src/recipe/registry.ts`) has exactly one images-based Recipe
 * — `"news-carousel"` — and one video Recipe — `"character-explainer-with-cast"` (a Reel). This module
 * therefore scopes the export to `SUPPORTED_RECIPE` alone: any OTHER Recipe's Asset is a video Asset in
 * today's registry and is skipped with a note (issue #145 AC2) rather than silently dropped or crashing
 * — a future images-based second Recipe extending this export is a later slice's job (out of scope
 * here, matching the issue's own "turns a run's produced News Carousel Assets" framing).
 *
 * Eligible = `recipe === SUPPORTED_RECIPE` AND `status === "produced"` AND no `scheduled_at` yet (issue
 * #145 AC5 — re-running the export after a successful one must schedule nothing twice; excluding an
 * already-`scheduled_at` Asset is what makes a re-run naturally converge to "nothing eligible", the SAME
 * code path as an empty run).
 */

import type { LedgerAssetRecord } from "../asset/asset.ts";

/** The one Recipe this images-only export supports today (see module doc). */
export const SUPPORTED_RECIPE = "news-carousel";

/** The narrow Idea shape this module needs — read directly off the ledger's raw JSON (never through
 *  `ledger.ts`'s `loadIdeas`, which does not expose `run`/`title` — see `select.ts`). */
export interface ScheduleBatchIdea {
  readonly id: string;
  readonly title: string;
  readonly run: string;
  readonly format: string;
  readonly assets: readonly LedgerAssetRecord[];
}

/** One Asset the export will include as a CSV row source. */
export interface EligibleAsset {
  readonly ideaId: string;
  readonly title: string;
  readonly asset: LedgerAssetRecord;
}

/** Why an Asset was left out of the batch. `"video"` is the one reason issue #145 AC2 explicitly
 *  requires a note for; `"not-produced"` covers every other status (still in flight, or already
 *  posted/tracking/scored); `"already-scheduled"` is what makes a re-run a safe no-op (AC5). */
export type SkipReason = "video" | "not-produced" | "already-scheduled";

/** One Asset the export left out, with a human-readable note naming the Idea and why. */
export interface SkippedAsset {
  readonly ideaId: string;
  readonly title: string;
  readonly recipe: string;
  readonly reason: SkipReason;
  readonly note: string;
}

/** The full eligibility pass over a run's Ideas: what's IN the batch, and what was left out and why. */
export interface EligibilityResult {
  readonly eligible: readonly EligibleAsset[];
  readonly skipped: readonly SkippedAsset[];
}

/**
 * Decide, for every Asset of every Idea in `ideas`, whether it belongs in this Schedule Batch export.
 * PURE: no I/O, no clock — a straight fold over already-loaded data. Each Asset of an Idea is judged
 * INDEPENDENTLY (an Idea may contribute one eligible Asset and one skipped Asset at once).
 */
export function selectEligibleAssets(ideas: readonly ScheduleBatchIdea[]): EligibilityResult {
  const eligible: EligibleAsset[] = [];
  const skipped: SkippedAsset[] = [];

  for (const idea of ideas) {
    for (const asset of idea.assets) {
      if (asset.recipe !== SUPPORTED_RECIPE) {
        skipped.push({
          ideaId: idea.id,
          title: idea.title,
          recipe: asset.recipe,
          reason: "video",
          note:
            `${idea.id}: recipe "${asset.recipe}" is not image-carousel-based — Zoho's bulk scheduler ` +
            "is images-only, so this video Asset is skipped (it keeps the manual publish path).",
        });
        continue;
      }

      if (asset.status !== "produced") {
        const already = asset.status === "posted" || asset.status === "tracking" || asset.status === "scored";
        skipped.push({
          ideaId: idea.id,
          title: idea.title,
          recipe: asset.recipe,
          reason: "not-produced",
          note: already
            ? `${idea.id}: this news-carousel Asset is already ${asset.status} — skipped (Schedule ` +
              "Batch only exports produced, not-yet-posted Assets)."
            : `${idea.id}: this news-carousel Asset is still ${asset.status} (not yet produced) — skipped.`,
        });
        continue;
      }

      if (asset.scheduled_at !== undefined) {
        skipped.push({
          ideaId: idea.id,
          title: idea.title,
          recipe: asset.recipe,
          reason: "already-scheduled",
          note:
            `${idea.id}: already scheduled at ${asset.scheduled_at} — skipped (re-running the export ` +
            "never double-schedules).",
        });
        continue;
      }

      eligible.push({ ideaId: idea.id, title: idea.title, asset });
    }
  }

  return { eligible, skipped };
}
