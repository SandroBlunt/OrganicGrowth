/**
 * Wires a saved News Carousel Production Spec (`production-spec/news-carousel-contract.ts`) into the
 * Copy step's own, Recipe-agnostic slide-narrative input (`draft.ts`'s `CopyInput.slideNarrative`,
 * `CopySlideBeat[]`) — issue #120.
 *
 * This is the ONE place a News Carousel Spec's per-slide fields become the Copy step's
 * `slideNarrative`: `role` and `text` carried through verbatim, `stat_callout` renamed to
 * `statCallout` (mirroring the existing role/text wiring already exercised by `skillDraftCopy`'s own
 * tests), and the Spec's own, already-verified `companies` list passed through UNCHANGED — including
 * an empty array, so a slide naming no real company never gets a mention invented for it downstream
 * (never a fabricated mention; always-rule 8 — never fabricate).
 *
 * Pure and deterministic: no I/O, no model call, no clock, and it never mutates its input. Deliberately
 * News-Carousel-specific — the *Character Explainer with Cast* Recipe has no per-clip "companies"
 * concept and is out of scope for this wiring (issue #120's Agent Brief).
 */

import type { NewsCarouselSpec } from "../production-spec/news-carousel-contract.ts";
import type { CopySlideBeat } from "./draft.ts";

/**
 * Map a News Carousel Production Spec's `slides` (in their existing, fixed role order — see
 * `news-carousel-contract.ts`'s `CAROUSEL_ROLES`) into `CopySlideBeat[]`, ready to hand straight to
 * `CopyInput.slideNarrative`. Every field is a direct, unchanged carry-through of the source slide —
 * this function makes no judgment about which companies are "worth" mentioning; that grounding
 * decision belongs to the `write-social-copy` Skill, downstream, working only from what is passed
 * through here.
 */
export function newsCarouselSlideNarrative(spec: NewsCarouselSpec): readonly CopySlideBeat[] {
  return spec.slides.map(
    (slide): CopySlideBeat => ({
      role: slide.role,
      text: slide.text,
      statCallout: slide.stat_callout,
      companies: slide.companies,
    }),
  );
}
