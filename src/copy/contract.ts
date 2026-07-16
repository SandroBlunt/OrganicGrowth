/**
 * Copy contract — the shared shapes the Copy step's deep modules (`draft.ts`, `inject.ts`,
 * `validate.ts`, `compose.ts`) all key off (CONTEXT.md "Copy"; ADR-0012).
 *
 * `post_copy` (the old single throwaway field on the Production Spec) is retired: Copy leaves the
 * Space and the Spec entirely. A **Recipe**'s copy step composes it separately, from the Format's
 * voice + the Recipe's own copy **shape** + the Brand's hard rules + the Idea's material, and stores it
 * STRUCTURED on the Asset (`src/asset/asset.ts`'s `LedgerAssetRecord.copy`).
 *
 * `CopyShape` is intentionally a bare structural type (not imported from `src/recipe/registry.ts`):
 * `Recipe.copyShape` already has this exact `{ maxChars, minEmojis, maxEmojis }` shape, so a caller
 * passes `recipe.copyShape` straight through with no conversion, and this module carries no dependency
 * on the registry. The 180-char / 1–3-emoji values are no longer global constants — they are the
 * WIRED *Character Explainer with Cast* Recipe's own params (`src/recipe/registry.ts`); a different
 * Recipe declares its own.
 */

/** The tailored text that ships with one Asset — caption + hashtags (CONTEXT.md "Copy"). Mentions/CTA
 *  are folded into `caption` (the required CTA is injected there — `inject.ts`); the watermark @handle
 *  is NEVER part of Copy — it stays a Space parameter fed from the Brand (ADR-0012). */
export interface Copy {
  /** The voice-composed body text, including any injected required CTA line. */
  readonly caption: string;
  /** The final hashtag list — the Idea's own hashtags plus any Brand-required ones, deduped. */
  readonly hashtags: readonly string[];
}

/** A Recipe's declared copy-shape constraints — length + emoji bounds. Structurally identical to
 *  `Recipe.copyShape` (`src/recipe/registry.ts`), so a Recipe's own params pass straight through. */
export interface CopyShape {
  readonly maxChars: number;
  readonly minEmojis: number;
  readonly maxEmojis: number;
}
