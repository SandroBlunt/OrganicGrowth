/**
 * News Carousel Production-Spec contract — the second wired Recipe's own media-instructions shape
 * (CONTEXT.md "Production Spec"; ADR-0009/0010; issue #60).
 *
 * Unlike the wired *Character Explainer with Cast* Recipe (3 `character_concepts` + 3 `clips` + 3
 * `thumbnails`, `contract.ts`), the **News Carousel** Recipe drives a DIFFERENT Space ("AI News",
 * `recipe/registry.ts`'s `NEWS_CAROUSEL` entry) with a zero-gate, several-images plan: an ordered list
 * of `{slide_index, image_prompt}` pairs, one per Instagram carousel slide.
 *
 * --- Shape sourced from the real, captured "AI News" board (issue #60, pre-tidy) ---
 *
 * `src/space-driver/fixtures/live-captures-ai-news/00-spaces_state.pre-tidy.txt` is a sanitized,
 * read-only dump of the real live Space, captured before the Operator's node-renaming pass. Its
 * `JSON Master #2` text node (renamed `JSON Master` post-tidy — the same Spec-injection convention the
 * wired Space uses, `space-driver/driver.ts`'s `JSON_MASTER_NODE_NAME`) held EXACTLY this shape: a JSON
 * array of `{ "slide_index": N, "image_prompt": "..." }` objects, nothing more — the per-slide
 * `prompt-generator` extractor nodes (canonical name `Image Prompt Slide N`) are each instructed
 * "return ONLY image_prompt from slide_index: N", and the Space's own writing guide (`Assistant Prompt
 * #2` / canonical `Carousel Prompt Guide`) confirms no other field is expected ("Make sure to always
 * use the same variable names as here"). This module wraps that array in a top-level `{ slides: [...] }`
 * object — an in-repo authoring convenience matching every OTHER Production-Spec shape in this codebase
 * (a top-level object, never a bare array) — the per-slide field NAMES (`slide_index`, `image_prompt`)
 * are unchanged from the dump, which is the part the Space's extractors actually key on.
 *
 * --- Slide count: 5..7, only the run-points PRESENT are ever driven ---
 *
 * The board wires SEVEN parallel slide pipelines (`Image Prompt Slide 1`..`Image Prompt Slide 7`, each
 * feeding its own `Slide N Generator`), but a real post uses 5-7 slides. `MIN_SLIDES`/`MAX_SLIDES` bound
 * the Spec; `TOTAL_SLIDE_PIPELINES` is the physical count wired on the Space (also
 * `execution-protocol/protocol.ts`'s `canonicalCarouselProtocol()`, cross-checked in
 * `news-carousel-contract.test.ts`). `slideRunPointNames` resolves ONLY the run-point names for the
 * slides a given Spec actually carries, in slide order — the driver never fires a slide's generator the
 * Idea does not need (issue #60 AC: "only drive the run-points for the slides present").
 */

/** Minimum slides a News Carousel Spec may carry (a real post is never thinner than this). */
export const MIN_SLIDES = 5;
/** Maximum slides a News Carousel Spec may carry — also the physical pipeline count on the Space. */
export const MAX_SLIDES = 7;
/** The number of parallel slide pipelines wired on the "AI News" Space's canvas (fixed, not per-Idea). */
export const TOTAL_SLIDE_PIPELINES = 7;

/** One carousel slide: its 1-based position and the image prompt driving that slide's render. */
export interface CarouselSlide {
  /** 1-based slide position. A Spec's `slide_index` values are exactly `1..slides.length`, each once. */
  readonly slide_index: number;
  /** The exact image prompt the Space's `Image Prompt Slide N` extractor hands to `Slide N Generator`. */
  readonly image_prompt: string;
}

/**
 * The News Carousel Recipe's Production Spec — media instructions only (ADR-0010/0012; no `post_copy`,
 * mirroring the wired contract). `slides` SHALL have between `MIN_SLIDES` and `MAX_SLIDES` entries.
 */
export interface NewsCarouselSpec {
  readonly slides: readonly CarouselSlide[];
}

/** The canonical run-point NAME for one 1-based slide position on the "AI News" Space's canvas. */
export function slideRunPointName(slideIndex: number): string {
  return `Image Prompt Slide ${slideIndex}`;
}

/**
 * The ordered run-point NAMES to drive for a given Spec — ONE per slide actually present, in
 * `slide_index` order, never the Space's full fixed set (issue #60: "only drive the run-points for the
 * slides present"). Pure; does not validate `spec` (call `validateNewsCarouselSpec` first).
 */
export function slideRunPointNames(spec: NewsCarouselSpec): readonly string[] {
  return [...spec.slides]
    .sort((a, b) => a.slide_index - b.slide_index)
    .map((slide) => slideRunPointName(slide.slide_index));
}
