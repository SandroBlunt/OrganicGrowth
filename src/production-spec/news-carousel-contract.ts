/**
 * News Carousel Production-Spec contract — the second wired Recipe's own media-instructions shape
 * (CONTEXT.md "Production Spec"; ADR-0009/0010/0016; issue #81, map ticket #77).
 *
 * Unlike the wired *Character Explainer with Cast* Recipe (3 `character_concepts` + 3 `clips` + 3
 * `thumbnails`, `contract.ts`), the **News Carousel** Recipe drives the single-lane "Carrousel" Space
 * with one JSON array of exactly 7 slides, injected wholesale into that Space's "JSON Master" node
 * (`recipe/registry.ts`'s `NEWS_CAROUSEL` entry; node name verified against the live capture, issue
 * #86/#89) — no per-slide run-point, no gate.
 *
 * --- Shape decided by the #77 prototype (GO on the thin-spec bet, with one refinement) ---
 *
 * Ticket #77 prototyped the Recipe Skill authoring on-contract carousel prompts from the Format's
 * Baseline Prompt + a real Brief, and audited the output against the author-phase checklist: truly
 * MINIMAL `{ slide_index, image_prompt }` was not enough, because re-running that checklist (text
 * length, role order, card style) needs STRUCTURED fields, not a ~250-word prompt parsed after the
 * fact. The stored Spec therefore keeps the handful of fields the checklist actually audits —
 * `role`, `card_style`, `stat_callout`, `text` — alongside `image_prompt`; everything richer (card
 * styles' visual definitions, the pill/eyebrow mechanics, logo placement, fonts) stays in the Format's
 * Baseline Prompt document (ADR-0015), never persisted here.
 *
 * --- Exactly 7 slides, roles in FIXED order ---
 *
 * A News Carousel post is always 7 slides, one per role, in this exact order: `hook` (the stopping
 * headline) -> `then` (what used to be true) -> `shift` (what changed) -> `proof` (a grounded, real
 * example) -> `different` (why this time is different) -> `next` (what happens next) -> `cta` (the
 * close). `slide_index` is 0-based and SHALL equal the slide's position (`CAROUSEL_ROLES`'s index for
 * its role) — the Producer/driver injects the array in this order; there is no per-slide run-point to
 * reorder against.
 */

/** The fixed number of slides every News Carousel Spec carries — no more, no fewer (map #77). */
export const CAROUSEL_SLIDE_COUNT = 7;

/** The News Carousel's fixed, ordered slide roles (map #77's prototype-proven structure). */
export const CAROUSEL_ROLES = [
  "hook",
  "then",
  "shift",
  "proof",
  "different",
  "next",
  "cta",
] as const;

/** One of the News Carousel's 7 fixed roles, in its declared order. */
export type CarouselRole = (typeof CAROUSEL_ROLES)[number];

/** The max length (chars) a slide's on-card `text` may run — the Format's voice, kept card-readable. */
export const CAROUSEL_TEXT_MAX_CHARS = 140;

/**
 * One carousel slide: the structured fields the author-phase checklist audits, plus the full authored
 * `image_prompt` (map #77). `card_style`/`stat_callout` are free strings — the CATALOG of valid card
 * styles lives in the Format's Baseline Prompt (ADR-0015), not hard-coded on this contract.
 */
export interface CarouselSlide {
  /** 0-based slide position. A Spec's `slide_index` values are exactly `0..6`, in `CAROUSEL_ROLES` order. */
  readonly slide_index: number;
  /** This slide's fixed role — must equal `CAROUSEL_ROLES[slide_index]`. */
  readonly role: CarouselRole;
  /** The Baseline-Prompt-declared card style this slide renders in (e.g. `"full_width"`). */
  readonly card_style: string;
  /** The short stat/quote callout this slide surfaces (e.g. `"3 companies."`). */
  readonly stat_callout: string;
  /**
   * The real companies whose logos appear next to the pill badge on THIS slide — e.g.
   * `["OpenAI", "Anthropic"]` — or an empty array when the slide names no real company (map #77's
   * fixed "three tiny real product logos" clause was previously improvised prose only; issue #102
   * finding #1). A checkable, per-slide field instead of a fact buried inside `image_prompt`.
   */
  readonly companies: readonly string[];
  /** The on-card supporting line, at most `CAROUSEL_TEXT_MAX_CHARS` chars, in the Format's voice. */
  readonly text: string;
  /** The full authored image prompt the Space's single "JSON Master" node renders this slide from. */
  readonly image_prompt: string;
}

/**
 * The News Carousel Recipe's Production Spec — media instructions only (ADR-0010/0012; no `post_copy`,
 * mirroring the wired contract). `slides` SHALL have exactly `CAROUSEL_SLIDE_COUNT` entries, in fixed
 * role order.
 */
export interface NewsCarouselSpec {
  readonly slides: readonly CarouselSlide[];
}
