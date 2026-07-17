/**
 * Bind-media resolution — pure deep module for a Recipe's bind phase (issue #88, ADR-0016, ADR-0017).
 *
 * A Recipe's canvas declares a named **media-slot map** (`Recipe.canvasInputs.mediaSlots`,
 * `src/recipe/registry.ts`): each slot is either a **brand-asset** slot (filled from the Brand's
 * `BrandAssetStore`, issue #82) or an **idea-pick** slot (filled from a human gate's resolved pick).
 * This module is the ONE place that turns "here is what each slot resolved to" into either a
 * "proceed" result (which slots ended up bound, ready for `recipe/phase-contract.ts`'s
 * `auditBindMediaPhase`) or a STOP (ADR-0016: "a missing required slot's asset STOPS the run — never
 * bind a half-complete Asset").
 *
 * Kept pure and I/O-free on purpose: the CALLER (the Producer's thin conductor) already did the real
 * lookups — a `BrandAssetStore.getBrandAsset` call for a brand-asset slot, or read the queue job's
 * resolved `pick` for an idea-pick slot — and hands the RESULT in as a `MediaSlotResolutions` map. This
 * module only enforces ADR-0016's STOP rule uniformly across every wired Recipe's slot map, mirroring
 * how `recipe/phase-contract.ts`'s generic auditors already work off `Recipe.canvasInputs.mediaSlots`.
 */

import type { MediaSlot, Recipe } from "../recipe/registry.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How one media slot resolved, as already looked up by the caller. A `found: false` resolution (or no
 *  resolution at all) means "nothing to bind this slot with" — the SAME outcome, whether the lookup
 *  came back empty or was never attempted. */
export type MediaSlotResolution =
  | { readonly kind: "brand-asset"; readonly found: true; readonly path: string }
  | { readonly kind: "brand-asset"; readonly found: false; readonly message: string }
  | { readonly kind: "idea-pick"; readonly found: true; readonly pick: string }
  | { readonly kind: "idea-pick"; readonly found: false };

/** One Recipe's slot-name -> resolution map. A slot name absent here is treated exactly like a
 *  `found: false` resolution for that slot. */
export type MediaSlotResolutions = Readonly<Record<string, MediaSlotResolution>>;

/** One slot that successfully bound: its declared shape plus the resolution that filled it. */
export interface BoundMediaSlot {
  readonly name: string;
  readonly slot: MediaSlot;
  readonly resolution: Extract<MediaSlotResolution, { found: true }>;
}

/** The result of binding a Recipe's whole media-slot map: every bound slot, or a STOP naming the first
 *  missing REQUIRED slot (ADR-0016) — never a partial "ok" with some required slots left unbound. */
export type BindMediaResult =
  | {
      readonly ok: true;
      readonly bound: readonly BoundMediaSlot[];
      /** The bound slot NAMEs, ready to feed `recipe/phase-contract.ts`'s `auditBindMediaPhase`. */
      readonly boundSlotNames: ReadonlySet<string>;
    }
  | { readonly ok: false; readonly missingSlot: string; readonly message: string };

// ---------------------------------------------------------------------------
// bindMediaSlots
// ---------------------------------------------------------------------------

function missingSlotMessage(recipe: Recipe, name: string, slot: MediaSlot): string {
  return (
    `Media slot "${name}" (${slot.kind}, ${slot.media}) is REQUIRED but has no resolved asset for ` +
    `Recipe "${recipe.slug}" — the run STOPS (ADR-0016): never bind a half-complete Asset.`
  );
}

/**
 * Resolve a Recipe's declared media slots against already-looked-up `resolutions` (issue #88,
 * ADR-0016). Walks `recipe.canvasInputs.mediaSlots` in declaration order:
 *
 * - a slot with a `found: true` resolution is BOUND (added to `bound`);
 * - a REQUIRED slot with no resolution, or a `found: false` one, STOPS the whole bind immediately —
 *   returns `ok: false` with a clear, actionable message (the looked-up `message` when the caller
 *   supplied one, e.g. `BrandAssetStore.getBrandAsset`'s own hint; a generic ADR-0016 message
 *   otherwise) — never proceeds to bind the remaining slots;
 * - an OPTIONAL slot with no resolution is simply skipped.
 *
 * Pure: no I/O, no BrandAssetStore call, no Magnific — the caller already did the real lookups.
 */
export function bindMediaSlots(recipe: Recipe, resolutions: MediaSlotResolutions): BindMediaResult {
  const bound: BoundMediaSlot[] = [];

  for (const [name, slot] of Object.entries(recipe.canvasInputs.mediaSlots)) {
    const resolution = resolutions[name];

    if (resolution === undefined || !resolution.found) {
      if (!slot.required) continue; // optional, unresolved — skip
      const message =
        resolution !== undefined && !resolution.found && "message" in resolution
          ? resolution.message
          : missingSlotMessage(recipe, name, slot);
      return { ok: false, missingSlot: name, message };
    }

    bound.push({ name, slot, resolution });
  }

  return { ok: true, bound, boundSlotNames: new Set(bound.map((b) => b.name)) };
}
