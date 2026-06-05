/**
 * Production Spec contract — the compact, in-code schema/style summary the validator enforces.
 *
 * --- WHY THIS LIVES IN CODE, NOT READ FROM THE CANVAS (Spike 3, load-bearing) ---
 *
 * ADR-0003 originally assumed the Producer reads the Space's generation contract (its system prompt)
 * live from the canvas at run time. The feasibility spikes found that the Magnific read API
 * (`spaces_state` AND `spaces_get_nodes`) TRUNCATES large text nodes at ~1,900 chars and cuts the
 * system prompt off mid-section — the thumbnail / `post_copy` rules at the tail are NOT retrievable
 * from the canvas node (see `docs/producer-spikes-results.md`, Spike 3 — PARTIAL/FAIL).
 *
 * Therefore this slice does NOT source the contract from the truncated canvas system-prompt node.
 * Spike 3 offered three mitigations; we take the cleanest one for a hermetic build:
 *
 *   - We encode the contract as this compact schema/style summary in code, which `validate()`
 *     enforces. This needs no live network in tests (no WebFetch), so the build stays hermetic.
 *   - The alternative path — fetching the full contract from the canvas's `Assistant Prompt Link`
 *     node (a published Google-Doc URL) via WebFetch — is left for a future slice IF this in-code
 *     summary ever proves insufficient. It is deliberately NOT used here because tests must not
 *     depend on a live WebFetch.
 *
 * The contract is the shape the Space's `JSON master` input node enforces (CONTEXT.md "Production
 * Spec"; PRD #1): exactly 3 anthropomorphic `character_concepts`; exactly 3 narrative `clips` using
 * `character_concepts[0]`, each clip a Pixar-3D `image_prompt` that ends with the 9:16 line and a
 * `video_prompt`; and TOP-LEVEL `post_copy` (<=180 chars, 1-3 emojis) and `thumbnails` (3 prompts).
 */

/** Required count of `character_concepts` in a Production Spec. */
export const REQUIRED_CHARACTER_CONCEPTS = 3;

/** Required count of `clips` in a Production Spec. */
export const REQUIRED_CLIPS = 3;

/** Required count of `thumbnails` (top-level image prompts) in a Production Spec. */
export const REQUIRED_THUMBNAILS = 3;

/** Maximum length, in characters, of a Spec's top-level `post_copy`. */
export const MAX_POST_COPY_CHARS = 180;

/** Inclusive emoji-count bounds for a Spec's `post_copy`. */
export const MIN_POST_COPY_EMOJIS = 1;
export const MAX_POST_COPY_EMOJIS = 3;

/** The line every clip `image_prompt` must end with (the Space's 9:16 aspect-ratio rule). */
export const ASPECT_RATIO_LINE = "Aspect Ratio 9:16.";

/**
 * One narrative clip in the Production Spec. Exactly 3 clips per Spec; all use `character_concepts[0]`.
 */
export interface SpecClip {
  readonly id: string;
  readonly clip_id: number;
  readonly concept_title: string;
  /** Pixar-3D image prompt that ends with the `Aspect Ratio 9:16.` line. */
  readonly image_prompt: string;
  /** `[Camera] -> [Action] -> [Voice] -> [SFX]`, sentence case, ~8s. */
  readonly video_prompt: string;
}

/**
 * The strict Production Spec the Space's `JSON master` node consumes. `post_copy` and `thumbnails` are
 * TOP-LEVEL by contract — never nested inside a clip.
 */
export interface ProductionSpec {
  readonly character_concepts: readonly string[];
  readonly clips: readonly SpecClip[];
  /** TOP-LEVEL. <=180 chars, 1-3 emojis. */
  readonly post_copy: string;
  /** TOP-LEVEL. Exactly 3 image prompts. */
  readonly thumbnails: readonly string[];
}
