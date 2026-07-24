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
 *
 * `variants` (issue #129, ADR-0019) is the ADDITIVE, optional carrier for a Brand that targets MORE
 * THAN ONE Channel platform: one `CopyVariant` per targeted platform, each composed and validated
 * against that platform's own bounds (`./platform-shape.ts`'s `resolveCopyShapeForPlatform`/
 * `./validate.ts`'s `validateCopyForPlatform`, issue #128). A Brand with exactly ONE Channel — today's
 * shape — never gets this field at all: `caption`/`hashtags` alone, exactly as before (AC1/AC5). When
 * present, `caption`/`hashtags` still mirror the PRIMARY Channel's own variant, so every existing
 * single-variant consumer (`validateCopy`, the output bundle, `/log-post`'s surfaced Copy) keeps
 * working unmodified on the top-level fields; `variants` carries the FULL, platform-labeled set
 * (including the primary) for the Operator to pick the right one per Channel at Publish.
 */

/** One platform-tuned Copy variant (issue #129) — the SAME `caption`/`hashtags` shape as `Copy` itself,
 *  plus the platform it was composed for (a `Channel.platform` value, e.g. `"linkedin"`). */
export interface CopyVariant {
  readonly platform: string;
  /** The voice-composed body text, including any injected required CTA line, sized to THIS platform's
   *  own bounds. */
  readonly caption: string;
  /** The final hashtag list — the Idea's own hashtags plus any Brand-required ones, deduped. */
  readonly hashtags: readonly string[];
}

/** The tailored text that ships with one Asset — caption + hashtags (CONTEXT.md "Copy"). Mentions/CTA
 *  are folded into `caption` (the required CTA is injected there — `inject.ts`); the watermark @handle
 *  is NEVER part of Copy — it stays a Space parameter fed from the Brand (ADR-0012). */
export interface Copy {
  /** The voice-composed body text, including any injected required CTA line — the PRIMARY Channel's
   *  own variant when `variants` is present. */
  readonly caption: string;
  /** The final hashtag list — the Idea's own hashtags plus any Brand-required ones, deduped. */
  readonly hashtags: readonly string[];
  /** One entry per targeted Channel platform (issue #129), present ONLY when the Brand targets more
   *  than one Channel — absent for today's single-Channel shape (AC1/AC5). Includes the primary
   *  Channel's own variant too (duplicating `caption`/`hashtags` above under its own `platform` label),
   *  so the full, labeled set is always self-contained here. */
  readonly variants?: readonly CopyVariant[];
}

/** A Recipe's declared copy-shape constraints — length + emoji bounds. Structurally identical to
 *  `Recipe.copyShape` (`src/recipe/registry.ts`), so a Recipe's own params pass straight through. */
export interface CopyShape {
  readonly maxChars: number;
  readonly minEmojis: number;
  readonly maxEmojis: number;
}
