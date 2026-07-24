/**
 * Apify platform resolution — pure deep module (issue #48).
 *
 * A Format's peer sources and a Post's logged URL can each be on a DIFFERENT platform than the
 * Brand's own Channel — e.g. Straw Motion's Channel is Facebook, but its recorded competitors are
 * Instagram and YouTube (`data/brands/straw-motion/seeds.yaml`). So the platform used to pick an
 * Apify actor is always derived from the URL itself (`detectPlatformFromUrl`), never assumed from
 * `brand-profile.yaml`'s `channel` list (ADR-0019, issue #127) — not even the primary entry's
 * `platform`.
 *
 * Actor slugs live in `seeds.yaml`, nested per platform (data-handling rule 2):
 * `apify.<platform>.trends_actor` / `apify.<platform>.post_actor`. `resolveApifyActor` reads that
 * shape defensively — a missing platform block, a missing purpose, or the `"..."` not-yet-wired
 * placeholder (`src/brand/scaffolder.ts`'s `APIFY_ACTOR_PLACEHOLDER`) all resolve to `null`, never a
 * fabricated actor slug (rule 8: never fabricate).
 */

/** The platforms this repo can resolve an Apify actor for. `linkedin` has no verified actor yet. */
export type ApifyPlatform = "facebook" | "instagram" | "youtube" | "linkedin";

/** Which of a platform's two actor slugs is being asked for. */
export type ApifyActorPurpose = "trends_actor" | "post_actor";

const PLATFORM_HOSTS: ReadonlyArray<readonly [ApifyPlatform, RegExp]> = [
  ["facebook", /(^|\.)(facebook\.com|fb\.com|fb\.watch)$/i],
  ["instagram", /(^|\.)instagram\.com$/i],
  ["youtube", /(^|\.)(youtube\.com|youtu\.be)$/i],
  ["linkedin", /(^|\.)linkedin\.com$/i],
];

/**
 * Detect which platform a URL belongs to, from its hostname. Returns `null` for an unparseable URL
 * or a domain that matches none of the platforms above (never guessed).
 *
 * Pure: no I/O, deterministic.
 */
export function detectPlatformFromUrl(url: string): ApifyPlatform | null {
  let hostname: string;
  try {
    hostname = new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [platform, pattern] of PLATFORM_HOSTS) {
    if (pattern.test(hostname)) return platform;
  }
  return null;
}

const NOT_WIRED_PLACEHOLDER = "...";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Resolve one Apify actor slug from an already-YAML-parsed `seeds.yaml` `apify` block.
 *
 * Returns the trimmed actor slug when the platform block and purpose are both present and hold a
 * real (non-placeholder) string. Returns `null` — never a fabricated slug — when: `apifyConfig` is
 * not an object, the platform has no block, the purpose is missing/not a string, or the value is the
 * `"..."` not-yet-wired placeholder.
 *
 * Pure: no I/O, deterministic. Defensive (data-handling rule 4): never throws on garbled input.
 */
export function resolveApifyActor(
  apifyConfig: unknown,
  platform: ApifyPlatform,
  purpose: ApifyActorPurpose,
): string | null {
  if (!isObject(apifyConfig)) return null;
  const platformBlock = apifyConfig[platform];
  if (!isObject(platformBlock)) return null;
  const actor = platformBlock[purpose];
  if (typeof actor !== "string") return null;
  const trimmed = actor.trim();
  if (trimmed.length === 0 || trimmed === NOT_WIRED_PLACEHOLDER) return null;
  return trimmed;
}
