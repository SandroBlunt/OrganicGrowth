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
 *
 * --- Hero slides (hook + cta): the logo, and the bigger text card (issue #188) ---
 *
 * The carousel's two BOOKEND slides — `hook` (0) and `cta` (6) — are its "hero" slides: they are the
 * ONLY two slides that carry the Brand's logo at all (the 5 middle slides — `then`/`shift`/`proof`/
 * `different`/`next` — carry NO logo, removed entirely, not merely shrunk) and they are held to the
 * LARGER of the two text-card minimum-vertical-space bars below. `CAROUSEL_HERO_ROLES` is the single
 * source of truth for which roles get this bookend treatment, read by the author-phase checklist's
 * `logo-reference` and `text-card-size` items — never re-typed as an independent role list.
 *
 * --- Text-card minimum vertical space (issue #188) ---
 *
 * Before this slice the on-card text region (the pill + stat callout + supporting line) occupied
 * roughly 25-30% of the frame regardless of role — too little to read as the carousel's own visual
 * lead. `CAROUSEL_HERO_TEXT_CARD_MIN_PCT`/`CAROUSEL_STANDARD_TEXT_CARD_MIN_PCT` are the new floors: at
 * least 60% of the frame's vertical height on a hero slide, at least 50% on every other slide.
 *
 * --- Per-slide kind: generated, or real source media (ADR-0024, issue #188) ---
 *
 * Each of the 7 slides independently declares its own `kind`: `"generated"` (today's only option, and
 * the implied default when `kind` is absent — a Spec authored before this slice stays valid,
 * unchanged), `"image"` (a real photo fetched from the story's own source and composited into a
 * reserved frame), or `"video"` (a real clip fetched from the story's own source and composited into a
 * reserved window, set against a calmer, less busy generated background than a fully generated slide).
 * `source_url` is present exactly when `kind` is `"image"` or `"video"` — the story's own source the
 * Producer tries to fetch FIRST, falling back straight to a fully generated slide (never a pause for
 * the Operator) when that source is unreachable or too low quality — see
 * `src/asset/carousel-real-media.ts`'s `resolveCarouselSlideMedia`, a pure, injectable-downloader deep
 * module that performs exactly that fetch-first-fallback decision (mirroring
 * `src/asset/shot-list-media.ts`'s own News Short Script precedent). By the time a Spec is SAVED,
 * `kind` already reflects the RESOLVED outcome (post-fallback), never an unresolved "requested" kind —
 * so `hasVideoSlide` below is a simple, direct read of what the Asset will actually render.
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
 * The carousel's two "hero"/bookend roles — the ONLY slides that carry the Brand's logo, and the ONLY
 * slides held to the LARGER text-card minimum vertical space (issue #188). Single source of truth.
 */
export const CAROUSEL_HERO_ROLES: readonly CarouselRole[] = ["hook", "cta"];

/** Whether `role` is one of the carousel's two hero/bookend roles (`CAROUSEL_HERO_ROLES`). Pure,
 *  never throws. */
export function isCarouselHeroRole(role: string): boolean {
  return (CAROUSEL_HERO_ROLES as readonly string[]).includes(role);
}

/** The minimum share (%) of the frame's vertical height the text card occupies on a HERO slide
 *  (hook/cta) — issue #188's own bar, replacing the old, role-blind ~25-30%. */
export const CAROUSEL_HERO_TEXT_CARD_MIN_PCT = 60;

/** The minimum share (%) of the frame's vertical height the text card occupies on every OTHER slide
 *  (then/shift/proof/different/next) — issue #188's own bar, replacing the old, role-blind ~25-30%. */
export const CAROUSEL_STANDARD_TEXT_CARD_MIN_PCT = 50;

/** A slide's media kind (ADR-0024, issue #188): `"generated"` (today's only option before this slice,
 *  and the implied default when `kind` is absent — a pre-#188 Spec stays valid, unchanged), `"image"`,
 *  or `"video"` — see this module's own doc comment above. */
export const CAROUSEL_SLIDE_KINDS = ["generated", "image", "video"] as const;

/** One of `CAROUSEL_SLIDE_KINDS`. */
export type CarouselSlideKind = (typeof CAROUSEL_SLIDE_KINDS)[number];

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
  /**
   * This slide's media kind (ADR-0024, issue #188) — `"generated"`, `"image"`, or `"video"`. OPTIONAL,
   * backward compatible: a Spec authored before this slice carries no `kind` at all, and is treated
   * exactly as `"generated"` (see `slideKind` below) — never required to be re-authored or migrated.
   */
  readonly kind?: CarouselSlideKind;
  /**
   * The story's own source media URL this slide's real photo/video is fetched from — present exactly
   * when `kind` is `"image"` or `"video"`, absent (never a stray leftover) for a `"generated"` slide or
   * one carrying no `kind` at all (ADR-0024).
   */
  readonly source_url?: string;
}

/**
 * The News Carousel Recipe's Production Spec — media instructions only (ADR-0010/0012; no `post_copy`,
 * mirroring the wired contract). `slides` SHALL have exactly `CAROUSEL_SLIDE_COUNT` entries, in fixed
 * role order.
 */
export interface NewsCarouselSpec {
  readonly slides: readonly CarouselSlide[];
}

/** This slide's EFFECTIVE kind — `slide.kind`, or `"generated"` when absent (backward compatible with
 *  a pre-#188 Spec, ADR-0024). Pure, never throws. */
export function slideKind(slide: Pick<CarouselSlide, "kind">): CarouselSlideKind {
  return slide.kind ?? "generated";
}

/**
 * Whether `spec` carries at least one `"video"`-kind slide — the ONE fact `src/schedule-batch/
 * eligibility.ts` needs to keep a News Carousel Asset with real video media out of the images-only
 * Zoho bulk-export path (ADR-0024, issue #188), the same way any other video Recipe's Asset already is.
 * Pure, never throws; a malformed/absent `slides` array is treated as carrying no video slide.
 */
export function hasVideoSlide(spec: Pick<NewsCarouselSpec, "slides">): boolean {
  return spec.slides.some((s) => slideKind(s) === "video");
}
