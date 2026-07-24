/**
 * Per-platform CopyShape bounds — issue #128 (epic #120).
 *
 * Today a Recipe declares exactly ONE `CopyShape` (`src/recipe/registry.ts`'s `RecipeCopyShape` /
 * `./contract.ts`'s `CopyShape`: `{ maxChars, minEmojis, maxEmojis }`) — length + emoji bounds shared
 * across whatever the Brand's single Channel happens to be. ADR-0019 (issue #127, merged) made a
 * Brand's `channel` field a LIST — a Brand may now target several platforms
 * (`production-spec/brand-profile.ts`'s `Channel.platform`), each with its own caption conventions (a
 * tight X post vs. a long-form LinkedIn update vs. a short, punchy TikTok caption). This module is the
 * SHAPE half of that: a brand-agnostic, in-repo table of documented per-platform `CopyShape` bounds,
 * plus `resolveCopyShapeForPlatform` — a pure lookup that "extends" a Recipe's own single `CopyShape`
 * into a per-platform-aware one, falling back to that Recipe's own numbers for a platform this table
 * doesn't (yet) document, never fabricating bounds for an unknown platform (rule 8).
 *
 * SCOPE (issue #128 is the shape + validation only):
 *   - Net-new and additive. Nothing here is wired into `compose.ts`/`draft.ts`/`inject.ts` or the
 *     Recipe registry's two wired Recipes — those keep calling `validateCopy`/`composeCopy` with their
 *     OWN single `copyShape` exactly as before (AC3: the single-Channel path is byte-for-byte
 *     unchanged; see `validate.ts`'s `validateCopyForPlatform` for the additive checking half).
 *   - Actually composing a DISTINCT caption variant per platform (the `write-social-copy` Skill,
 *     `CopyInput`/`Copy` carrying several variants) is issue #129, not this one.
 *   - Resolving a LinkedIn mention to a real Page handle (`src/linkedin-handle/`) is issue #130 — this
 *     module (and `validate.ts`'s mention-syntax check) only cares whether a caption's `@mention` TEXT
 *     is well-formed, never whether the name resolves to a real handle.
 *
 * BOUNDS — documented, standard platform conventions (not fabricated), Operator-configurable (the
 * issue's own words: "sane and documented — not a hard science"):
 *   - `facebook`  — Facebook's technical post cap is 63,206 chars, but the feed visually truncates
 *     around ~477 chars before "See more"; that practical, above-the-fold bound is used here. The two
 *     WIRED Recipes never consult this entry for their own primary Facebook Channel — they keep using
 *     their own `copyShape` (180 / 2200) unchanged (AC3); this entry is the general-purpose default for
 *     a Recipe with no opinion of its own.
 *   - `instagram` — Instagram's documented hard caption cap is 2,200 chars — matches the already-shipped
 *     News Carousel Recipe's own `copyShape` (`src/recipe/registry.ts`). Editorial/news tone favors
 *     light emoji use.
 *   - `linkedin`  — LinkedIn's documented post character limit is 3,000 chars; professional tone favors
 *     little/no emoji. LinkedIn's compose UI creates an inline mention by typing `@` directly against
 *     the entity's name (no space) — `supportsMentions: true` turns on `validate.ts`'s syntax check.
 *   - `x`         — X's standard post cap is 280 chars; the tight budget favors sparing emoji use.
 *   - `tiktok`    — TikTok's API cap is 2,200 chars, but its caption UI truncates the preview around
 *     ~150 chars and its culture favors short, punchy captions — this table uses that practical bound,
 *     not the technical ceiling, with a generous emoji allowance to match TikTok's playful tone.
 *   - `youtube`   — YouTube's description field technically allows up to 5,000 chars; only the first
 *     couple of lines show above "Show more", so this table uses a shorter, still-generous practical
 *     bound that leaves room for a real description plus links/timestamps.
 *
 * Pure, deterministic, no I/O — mirrors `src/recipe/registry.ts`'s in-repo, brand-agnostic pattern.
 */

import type { CopyShape } from "./contract.ts";

/** The platforms this table currently declares documented `CopyShape` bounds for (issue #128). A Brand
 *  Profile's own `Channel.platform` (`production-spec/brand-profile.ts`) stays a free string — this
 *  list is only what THIS table currently knows, never a closed constraint on the Brand Profile shape
 *  itself (a platform outside this list simply falls back via `resolveCopyShapeForPlatform`). */
export const KNOWN_PLATFORMS = ["facebook", "instagram", "linkedin", "x", "tiktok", "youtube"] as const;

/** One of `KNOWN_PLATFORMS`. */
export type KnownPlatform = (typeof KNOWN_PLATFORMS)[number];

/**
 * One platform's own caption bounds (issue #128): the base `CopyShape` fields (`maxChars`,
 * `minEmojis`, `maxEmojis`) plus `supportsMentions` — whether this platform's caption text carries a
 * typed `@Handle` inline mention. `validate.ts`'s `validateCopyForPlatform` only runs its mention-
 * syntax check for a platform where this is `true` (today: only `linkedin`).
 */
export interface PlatformCopyShape extends CopyShape {
  readonly platform: KnownPlatform;
  readonly description: string;
  readonly supportsMentions: boolean;
}

const PLATFORM_COPY_SHAPES_TABLE: readonly PlatformCopyShape[] = [
  {
    platform: "facebook",
    description:
      "Facebook's technical post cap is 63,206 chars; the feed visually truncates around ~477 chars " +
      'before "See more", so that practical, above-the-fold bound is used here. The two wired Recipes ' +
      "never consult this entry for their own primary Facebook Channel (they keep their own copyShape, " +
      "180/2200) — this is the general-purpose default for a Recipe with no opinion of its own.",
    maxChars: 477,
    minEmojis: 0,
    maxEmojis: 3,
    supportsMentions: false,
  },
  {
    platform: "instagram",
    description:
      "Instagram's documented hard caption cap is 2,200 chars — matches the already-shipped News " +
      "Carousel Recipe's own copyShape (src/recipe/registry.ts). Editorial/news tone favors light " +
      "emoji use.",
    maxChars: 2200,
    minEmojis: 0,
    maxEmojis: 2,
    supportsMentions: false,
  },
  {
    platform: "linkedin",
    description:
      "LinkedIn's documented post character limit is 3,000 chars; professional tone favors little/no " +
      'emoji. LinkedIn\'s compose UI creates an inline mention by typing "@" directly against the ' +
      "entity's name (no space) — resolving that name to a real Page handle is a separate lookup " +
      "(src/linkedin-handle/, issue #126/#130), not this table's job.",
    maxChars: 3000,
    minEmojis: 0,
    maxEmojis: 1,
    supportsMentions: true,
  },
  {
    platform: "x",
    description: "X's standard post cap is 280 chars; the tight budget favors sparing emoji use.",
    maxChars: 280,
    minEmojis: 0,
    maxEmojis: 2,
    supportsMentions: false,
  },
  {
    platform: "tiktok",
    description:
      "TikTok's API cap is 2,200 chars, but its caption UI truncates the preview around ~150 chars " +
      "and its culture favors short, punchy captions — this uses that practical bound, not the " +
      "technical ceiling, with a generous emoji allowance to match TikTok's playful tone.",
    maxChars: 150,
    minEmojis: 0,
    maxEmojis: 4,
    supportsMentions: false,
  },
  {
    platform: "youtube",
    description:
      "YouTube's description field technically allows up to 5,000 chars, but only the first couple of " +
      'lines show above "Show more" — this uses a shorter, still-generous practical bound with room ' +
      "for a real description plus links/timestamps.",
    maxChars: 1000,
    minEmojis: 0,
    maxEmojis: 2,
    supportsMentions: false,
  },
];

const PLATFORM_COPY_SHAPES: ReadonlyMap<string, PlatformCopyShape> = new Map(
  PLATFORM_COPY_SHAPES_TABLE.map((shape) => [shape.platform, shape]),
);

/** Trim + lowercase a platform string for lookup — mirrors `Channel.platform`'s own free-string shape
 *  (`production-spec/brand-profile.ts`), never assumes a closed union at the read boundary. */
function normalizePlatform(platform: string): string {
  return platform.trim().toLowerCase();
}

/**
 * Look up the documented `CopyShape` bounds for `platform` (case/whitespace-insensitive). Returns
 * `null` for a platform this table doesn't (yet) document — never fabricates bounds (rule 8).
 */
export function platformCopyShapeFor(platform: string): PlatformCopyShape | null {
  return PLATFORM_COPY_SHAPES.get(normalizePlatform(platform)) ?? null;
}

/**
 * Resolve the `CopyShape` to validate a caption against for `platform`, given a Recipe's own
 * `baseShape` (`Recipe.copyShape`) as the fallback (issue #128 AC1 — "extending" the single per-Recipe
 * `CopyShape` into a per-platform-aware one). A platform this table has documented bounds for uses
 * THOSE bounds; an unrecognized platform falls back to `baseShape` unchanged — this function never
 * crashes and never invents bounds for a platform it doesn't know.
 */
export function resolveCopyShapeForPlatform(baseShape: CopyShape, platform: string): CopyShape {
  return platformCopyShapeFor(platform) ?? baseShape;
}

/** Every documented platform `CopyShape`, in table order — for callers/tests that want to iterate all
 *  of them (e.g. asserting each of the six platforms is distinct). */
export function listPlatformCopyShapes(): readonly PlatformCopyShape[] {
  return PLATFORM_COPY_SHAPES_TABLE;
}
