/**
 * Pure builders for new-Brand onboarding — the deep module for the staged interview → scaffold flow.
 *
 * All functions in this module are PURE: no I/O, no filesystem access, no random values, no clock
 * access. Same inputs always produce the same outputs. The builders turn interview answers into
 * serialisable data structures that the thin write shell (`scaffold-brand.ts`) materialises on disk.
 *
 * Design principle (always-rules, never-fabricate):
 *   - The builders NEVER invent brand facts. Every field in the output that derives from the
 *     Operator's answers is taken verbatim from `BrandInterviewAnswers`. Fields not supplied by the
 *     Operator are set to appropriate empty defaults ([], "", null) — never fabricated content.
 *   - Only technical defaults (Apify actor slugs, operational seed parameters) are set by the
 *     builder without Operator input; these are not brand facts.
 *
 * Slug handling:
 *   - `deriveSlug` delegates to `slugify` from the brand resolver.
 *   - `validateSlug` checks the derived slug for usability (currently: non-empty). Pure and cheap.
 *     Returns a discriminated union so callers can't ignore validation failures.
 */

import { slugify } from "./resolver.ts";

// ---------------------------------------------------------------------------
// BrandInterviewAnswers — the input contract
// ---------------------------------------------------------------------------

/**
 * The answers the Operator supplies during the staged new-Brand interview.
 *
 * Pre-scout fields (asked before Trend Research):
 *   name, niche, voice, language, region, platform, seedPages
 *
 * Deferred fields (gathered before Publish/track, NOT before scouting):
 *   channelUrl, bannedWords, requiredCta, requiredHashtags
 */
export interface BrandInterviewAnswers {
  /** Brand / Channel display name (used to derive the slug). */
  readonly name: string;
  /** One-line niche description. */
  readonly niche: string;
  /** Brand voice description (2–4 sentences). */
  readonly voice: string;
  /** Content language code (e.g. "en", "es"). */
  readonly language: string;
  /** Target region (e.g. "US", "LATAM"). */
  readonly region: string;
  /** The Channel's platform. Facebook is the only wired platform today. */
  readonly platform: "facebook" | "instagram" | "linkedin";
  /** At least one seed Page URL for trend research. */
  readonly seedPages: string[];

  // --- Deferred fields (optional; gathered before Publish/track) ---

  /** Channel URL (e.g. https://www.facebook.com/YourPage). */
  readonly channelUrl?: string;
  /** Words or claims to never use. */
  readonly bannedWords?: string[];
  /** Verbatim CTA to enforce on every post, or absent if none. */
  readonly requiredCta?: string;
  /** Hashtags to enforce on every post. */
  readonly requiredHashtags?: string[];
}

// ---------------------------------------------------------------------------
// Output types (serialisable shapes)
// ---------------------------------------------------------------------------

/** The YAML-serialisable brand-profile shape produced by `buildBrandProfile`. */
export interface BrandProfileContent {
  readonly channel: {
    readonly name: string;
    readonly platform: string;
    readonly url: string;
  };
  readonly niche: string;
  readonly language: string;
  readonly region: string;
  readonly voice: string;
  readonly required_cta: string;
  readonly required_hashtags: string[];
  readonly banned_words: string[];
  readonly brand_safety: string[];
}

/** The YAML-serialisable seeds shape produced by `buildSeeds`. */
export interface SeedsContent {
  readonly seed_pages: string[];
  readonly keywords: string[];
  readonly language: string;
  readonly region: string;
  readonly lookback_days: number;
  readonly format_focus: string;
  readonly ideas_per_run: number;
  readonly overperformance_only: boolean;
  readonly apify: Record<string, unknown>;
}

/** The canonical empty ledger shape produced by `buildEmptyLedger`. */
export interface EmptyLedger {
  readonly baseline: {
    readonly note: string;
    readonly shares: null;
    readonly comments: null;
    readonly reactions: null;
    readonly views: null;
    readonly updated_at: null;
  };
  readonly ideas: readonly never[];
}

// ---------------------------------------------------------------------------
// Slug helpers
// ---------------------------------------------------------------------------

/**
 * Derive a filesystem-safe slug from a Brand name. Delegates to `slugify`. Pure.
 */
export function deriveSlug(name: string): string {
  return slugify(name);
}

/**
 * Validate a derived slug for usability as a Brand directory name.
 *
 * Returns `{ ok: true }` for a non-empty slug.
 * Returns `{ ok: false, reason: string }` for an empty slug (which occurs when the Brand name
 * contains no alphanumeric characters after slugification).
 *
 * Pure: no I/O, deterministic.
 */
export function validateSlug(slug: string): { ok: true } | { ok: false; reason: string } {
  if (slug.length === 0) {
    return {
      ok: false,
      reason:
        "The Brand name you entered contains no letters or numbers, which means no valid " +
        "directory name can be derived from it. Please enter a name with at least one letter " +
        "or number (e.g. 'Acme Corp' or 'My Brand 2').",
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// buildBrandProfile
// ---------------------------------------------------------------------------

/** The default brand-safety rules applied to every new Brand (not brand facts — safety boilerplate). */
const DEFAULT_BRAND_SAFETY: string[] = [
  "No medical or 'cure' claims.",
  "No dangerous stunts presented as safe.",
  "No misleading 'miracle' framing.",
];

/**
 * Build a brand-profile content object from interview answers. Pure.
 *
 * Every field in the output that derives from the Operator's answers is taken verbatim from
 * `answers`. Deferred fields not supplied by the Operator default to appropriate empty values —
 * never fabricated content. Only `brand_safety` (the standard safety boilerplate) is set without
 * Operator input.
 *
 * Deliberately does NOT set a `formats` field: `brand-profile.yaml`'s old `formats: [reel]` was the
 * retired MEDIA sense of "format" (ADR-0009) — it no longer belongs on the Brand Profile at all. The
 * Brand's actual editorial **Formats** live as their own files under `formats/` (`FormatStore`,
 * `src/format/store.ts`); this builder does not create one (the Format interview is a future slice).
 *
 * @param answers  The Operator's interview answers.
 * @returns        A YAML-serialisable brand-profile shape.
 */
export function buildBrandProfile(answers: BrandInterviewAnswers): BrandProfileContent {
  return {
    channel: {
      name: answers.name,
      platform: answers.platform,
      url: answers.channelUrl ?? "",
    },
    niche: answers.niche,
    language: answers.language,
    region: answers.region,
    voice: answers.voice,
    required_cta: answers.requiredCta ?? "",
    required_hashtags: answers.requiredHashtags ?? [],
    banned_words: answers.bannedWords ?? [],
    brand_safety: DEFAULT_BRAND_SAFETY,
  };
}

// ---------------------------------------------------------------------------
// buildSeeds
// ---------------------------------------------------------------------------

/**
 * Apify actor slugs for each platform — technical defaults, not brand facts.
 *
 * Only Facebook is wired today, and its actor pair is the only one we have actually verified. For
 * Instagram and LinkedIn we do NOT invent an actor slug: `templates/brand-skeleton/seeds.yaml`
 * deliberately leaves them unknown, and shipping a plausible-but-unverified slug (e.g.
 * `apify/instagram-scraper`) would silently carry a possibly-nonexistent actor into Trend Research.
 * Instead we emit the `"..."` placeholder the template uses — an obvious "fill this in" marker that
 * fails loudly rather than pretending to work (never-fabricate).
 */
const APIFY_ACTOR_PLACEHOLDER = "...";
const APIFY_ACTORS: Record<string, { trends_actor: string; post_actor: string }> = {
  facebook: {
    trends_actor: "apify/facebook-posts-scraper",
    post_actor: "apify/facebook-post-scraper",
  },
  instagram: {
    trends_actor: APIFY_ACTOR_PLACEHOLDER,
    post_actor: APIFY_ACTOR_PLACEHOLDER,
  },
  linkedin: {
    trends_actor: APIFY_ACTOR_PLACEHOLDER,
    post_actor: APIFY_ACTOR_PLACEHOLDER,
  },
};

/**
 * Build a seeds content object from interview answers. Pure.
 *
 * Seed pages and language/region are taken verbatim from `answers`. Operational defaults
 * (lookback_days, format_focus, ideas_per_run, overperformance_only) are set to sensible values
 * that match the existing `templates/brand-skeleton/seeds.yaml`. The Apify actor block carries the
 * verified Facebook actor pair; for the not-yet-wired Instagram/LinkedIn it carries only the `"..."`
 * placeholder — we never invent an unverified actor slug (see `APIFY_ACTORS`).
 *
 * @param answers  The Operator's interview answers.
 * @returns        A YAML-serialisable seeds shape.
 */
export function buildSeeds(answers: BrandInterviewAnswers): SeedsContent {
  const actors = APIFY_ACTORS[answers.platform];
  const apify: Record<string, unknown> = actors !== undefined
    ? { [answers.platform]: actors }
    : {};

  return {
    seed_pages: answers.seedPages,
    keywords: [],
    language: answers.language,
    region: answers.region,
    lookback_days: 7,
    format_focus: "reel",
    ideas_per_run: 10,
    overperformance_only: true,
    apify,
  };
}

// ---------------------------------------------------------------------------
// buildEmptyLedger
// ---------------------------------------------------------------------------

/**
 * Build the canonical empty ledger shape. Pure.
 *
 * Matches the shape in `templates/brand-skeleton/ledger.json` and the format expected by
 * `loadIdeas`, `loadReport`, and other ledger readers. The `ideas` array is empty; all baseline
 * metric fields are null (as documented in the template).
 *
 * @returns  The canonical empty ledger value.
 */
export function buildEmptyLedger(): EmptyLedger {
  return {
    baseline: {
      note: "Rolling median of our recent posts' PUBLIC metrics; updated by performance-tracker. null until first /track-performance.",
      shares: null,
      comments: null,
      reactions: null,
      views: null,
      updated_at: null,
    },
    ideas: [],
  };
}
