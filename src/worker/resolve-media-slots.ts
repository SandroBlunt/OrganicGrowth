/**
 * `resolveMediaSlotResolutions` — resolves a Recipe's declared media slots against the SQL stores,
 * turning them into the `MediaSlotResolutions` shape `producer/bind-media.ts`'s `bindMediaSlots`
 * consumes (issue #208). A brand-asset slot resolves via `brand-asset/store.ts`'s `getBrandAssetByKey`
 * (a READ — this module imports no store WRITE function, so the store-write boundary guard has nothing
 * to say about it either way); an idea-pick slot resolves from an already-known `pick` (the RESUMED
 * leg's gate-decision choice, `plan-leg.ts`'s own job), or is left unresolved when no pick is supplied
 * (a FIRST leg has nothing to bind an idea-pick slot with yet — see `command-surface/worker.ts`'s own
 * doc comment for WHY bind-media only ever runs on a leg about to render).
 */

import type { DatabaseSync } from "node:sqlite";

import { getBrandAssetByKey } from "../brand-asset/store.ts";
import type { Recipe } from "../recipe/registry.ts";
import type { MediaSlotResolution, MediaSlotResolutions } from "../producer/bind-media.ts";

/**
 * Resolve every media slot `recipe.canvasInputs.mediaSlots` declares against the SQL stores. A
 * Space-less Recipe (`canvasInputs` absent) resolves to `{}` — nothing to bind. Pure aside from the
 * one `getBrandAssetByKey` read per brand-asset slot.
 */
export function resolveMediaSlotResolutions(
  db: DatabaseSync,
  brandId: string,
  recipe: Recipe,
  pick: string | undefined,
): MediaSlotResolutions {
  const slots = recipe.canvasInputs?.mediaSlots ?? {};
  const resolutions: Record<string, MediaSlotResolution> = {};

  for (const [name, slot] of Object.entries(slots)) {
    if (slot.kind === "brand-asset") {
      const asset = getBrandAssetByKey(db, brandId, slot.brandAssetKey);
      resolutions[name] = asset
        ? { kind: "brand-asset", found: true, path: asset.storageKey }
        : {
            kind: "brand-asset",
            found: false,
            message: `Brand Asset "${slot.brandAssetKey}" not found for Brand "${brandId}".`,
          };
      continue;
    }
    resolutions[name] = pick !== undefined ? { kind: "idea-pick", found: true, pick } : { kind: "idea-pick", found: false };
  }

  return resolutions;
}
