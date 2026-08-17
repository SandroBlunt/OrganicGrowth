/**
 * `resolvePostPlatform` — pure host-based platform resolution for a Post's logged URL (issue #240).
 *
 * The ledger's `post_url` carries no field of its own naming which platform it was published to (issue
 * #240's own finding: the importer dropped all 7 real Straw Motion Posts partly BECAUSE nothing forced
 * that question to be asked). The Channel a Post belongs to is therefore resolved from the URL's own
 * hostname alone — never assumed from the Brand's primary Channel, never hardcoded to Facebook just
 * because every real Post today happens to be one. This is deliberately its OWN small module, not a
 * reuse of `src/apify/platform.ts`'s `detectPlatformFromUrl`: that resolver is scoped to the platforms
 * this repo has a VERIFIED Apify actor for (`facebook`/`instagram`/`youtube`/`linkedin` — its own doc
 * comment is explicit that `linkedin` "has no verified actor yet" and `x`/`tiktok` are absent entirely),
 * a different, narrower concern than this module's: the full `KNOWN_PLATFORMS` closed vocabulary the
 * `channel`/`post` tables' own CHECK constraints and `channel.platform` FK actually require
 * (`src/copy/platform-shape.ts`, ADR-0019). Coupling Post-Channel resolution to Apify's actor coverage
 * would silently refuse a real LinkedIn/X/TikTok Post the moment one exists, for a reason that has
 * nothing to do with whether it can be imported.
 *
 * Pure: no I/O, no network, deterministic.
 */

import type { KnownPlatform } from "../copy/platform-shape.ts";

/** One platform's recognized hostnames, including the short-link/alt domains this repo's real data (or
 *  common real-world usage) actually uses — `fb.watch`/`fb.com` alongside `facebook.com`,
 *  `twitter.com` alongside `x.com`, `youtu.be` alongside `youtube.com`. Every `KNOWN_PLATFORMS` entry
 *  has exactly one row here (proven by this module's own test, which iterates `KNOWN_PLATFORMS`) — a
 *  platform this repo's schema accepts can never be silently unreachable by this resolver. */
const PLATFORM_HOSTS: ReadonlyArray<readonly [KnownPlatform, RegExp]> = [
  ["facebook", /(^|\.)(facebook\.com|fb\.com|fb\.watch)$/i],
  ["instagram", /(^|\.)instagram\.com$/i],
  ["linkedin", /(^|\.)linkedin\.com$/i],
  ["x", /(^|\.)(x\.com|twitter\.com)$/i],
  ["tiktok", /(^|\.)tiktok\.com$/i],
  ["youtube", /(^|\.)(youtube\.com|youtu\.be)$/i],
];

/**
 * Detect which of `KNOWN_PLATFORMS` a logged Post `url` belongs to, from its hostname alone. Returns
 * `null` — never a guess — for a URL that does not parse as an absolute URL, or whose hostname matches
 * none of the six known platforms.
 */
export function resolvePostPlatform(url: string): KnownPlatform | null {
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
