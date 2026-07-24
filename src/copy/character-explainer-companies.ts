/**
 * Wires a saved Character Explainer with Cast Production Spec (`production-spec/contract.ts`) into the
 * Copy step's own, Recipe-agnostic `CopyInput.companies` field (`draft.ts`) — issue #125.
 *
 * Mirrors `news-carousel-slide-narrative.ts`'s `newsCarouselSlideNarrative` wiring pattern (a saved
 * Spec's own, already-authored field carried through UNCHANGED into the Copy step's input, including
 * an empty list, never invented), but at the WHOLE-Asset grain this single-media Recipe's Copy step
 * already works at: `CopyInput.companies`, not `CopyInput.slideNarrative` — the Character Explainer
 * Recipe has no per-clip/per-beat narrative concept (its 3 clips are one continuous story about the
 * SAME picked Character), so `companies` lives at the Asset grain, alongside `thumbnails`'s own
 * precedent for a top-level (not per-clip) field on this contract.
 *
 * Pure and deterministic: no I/O, no model call, no clock, never mutates its input.
 */

import type { ProductionSpec } from "../production-spec/contract.ts";

/**
 * Read a saved Character Explainer Spec's own `companies` field, unchanged — normalized to `[]` when
 * the Spec's `companies` is absent (never fabricated; a Spec authored before this change, or an Idea
 * naming no real company, both read the same "nothing to draw on" way). This is the ONE place a
 * Character Explainer Recipe's saved Spec becomes the Copy step's `CopyInput.companies`.
 */
export function characterExplainerCompanies(spec: ProductionSpec): readonly string[] {
  return spec.companies ?? [];
}
