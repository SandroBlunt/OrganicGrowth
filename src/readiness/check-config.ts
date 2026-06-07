/**
 * Brand-config sanity checker — pure deep module.
 *
 * Checks a Brand's already-parsed `brand-profile.yaml` and `seeds.yaml` objects for presence and
 * sanity. Returns a `Finding[]` list. No YAML I/O happens inside this module — the caller is
 * responsible for loading and parsing the YAML; this function accepts plain objects.
 *
 * PURE: no disk, no network, no Magnific Space, no Apify, no clock access.
 * Deterministic: same inputs always produce the same output in the same order.
 *
 * Off-niche seed detection:
 *   A seed page URL prefixed with `OFF_NICHE:` is treated as an off-niche seed. This marker
 *   is set by the Operator or config author in seeds.yaml (e.g. as a note in the URL string).
 *   The conductor can also strip this prefix before using the URL for scraping.
 *   This is a simple, parse-free convention that keeps the pure core testable without heuristics.
 *
 * Findings emitted (by code):
 *   config_todo         — advisory/research  — niche or voice contains a TODO placeholder
 *   niche_unset         — advisory/research  — niche is empty or missing
 *   voice_unset         — advisory/research  — voice is empty or missing
 *   no_valid_seed       — block/research     — seed_pages has fewer than 1 entry
 *   off_niche_seed      — advisory/research  — at least one seed page is marked OFF_NICHE
 *   channel_url_missing — block/publish      — channel.url is missing or empty
 *   empty_banned_words  — advisory/research  — banned_words is empty or missing
 *
 * A fully-healthy config yields no findings (empty array).
 */

import type { Finding } from "./types.ts";
import { sortFindings } from "./sort.ts";

// ---------------------------------------------------------------------------
// Types for the already-parsed config objects
// ---------------------------------------------------------------------------

/**
 * Parsed shape of `brand-profile.yaml`. Only the fields checked by `checkConfig` are required;
 * additional fields are tolerated (open object — forward compatible).
 */
export interface BrandProfile {
  channel: {
    name?: string;
    platform?: string;
    url?: string;
  };
  niche?: string;
  language?: string;
  region?: string;
  voice?: string;
  formats?: string[];
  required_cta?: string;
  required_hashtags?: string[];
  banned_words?: string[];
  brand_safety?: string[];
}

/**
 * Parsed shape of `seeds.yaml`. Only the fields checked by `checkConfig` are required;
 * additional fields are tolerated.
 */
export interface Seeds {
  seed_pages?: string[];
  keywords?: string[];
  language?: string;
  region?: string;
  lookback_days?: number;
  format_focus?: string;
  ideas_per_run?: number;
  overperformance_only?: boolean;
  apify?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// checkConfig
// ---------------------------------------------------------------------------

/**
 * Validate a Brand's config (already-parsed profile + seeds) for presence and sanity.
 *
 * Pure and deterministic: no I/O. The inputs are NOT mutated. Same inputs → same output order.
 *
 * @param brandProfile  Parsed brand-profile.yaml contents (plain object).
 * @param seeds         Parsed seeds.yaml contents (plain object).
 */
export function checkConfig(brandProfile: BrandProfile, seeds: Seeds): Finding[] {
  const findings: Finding[] = [];

  // --- Niche ---
  const niche = (brandProfile.niche ?? "").trim();
  if (niche === "") {
    findings.push({
      severity: "advisory",
      phase: "research",
      code: "niche_unset",
      message:
        "The Brand's niche is not set. Add a niche description to brand-profile.yaml so idea generation is correctly scoped.",
    });
  } else if (/\bTODO\b/i.test(niche)) {
    findings.push({
      severity: "advisory",
      phase: "research",
      code: "config_todo",
      message:
        "The Brand's niche contains a TODO placeholder. Replace it with a real niche description before running the pipeline.",
    });
  }

  // --- Voice ---
  const voice = (brandProfile.voice ?? "").trim();
  if (voice === "") {
    findings.push({
      severity: "advisory",
      phase: "research",
      code: "voice_unset",
      message:
        "The Brand's voice is not set. Add a voice description to brand-profile.yaml so idea generation matches the Brand's tone.",
    });
  } else if (/\bTODO\b/i.test(voice)) {
    findings.push({
      severity: "advisory",
      phase: "research",
      code: "config_todo",
      message:
        "The Brand's voice contains a TODO placeholder. Replace it with a real voice description before running the pipeline.",
    });
  }

  // --- Seed pages ---
  const seedPages = seeds.seed_pages ?? [];

  if (seedPages.length < 1) {
    findings.push({
      severity: "block",
      phase: "research",
      code: "no_valid_seed",
      message:
        "No seed pages are configured. At least one seed page is required in seeds.yaml for trend research.",
    });
  }

  // Check for off-niche seed markers
  const hasOffNiche = seedPages.some((p) => p.startsWith("OFF_NICHE:"));
  if (hasOffNiche) {
    findings.push({
      severity: "advisory",
      phase: "research",
      code: "off_niche_seed",
      message:
        "One or more seed pages are marked as off-niche (OFF_NICHE: prefix). They may dilute trend research quality. Review seeds.yaml and remove or replace them.",
    });
  }

  // --- Banned words ---
  const bannedWords = brandProfile.banned_words;
  if (!bannedWords || bannedWords.length === 0) {
    findings.push({
      severity: "advisory",
      phase: "research",
      code: "empty_banned_words",
      message:
        "The banned_words list is empty. Consider adding brand-safety words to prevent unwanted content from passing the idea filter.",
    });
  }

  // --- Channel URL ---
  const channelUrl = (brandProfile.channel?.url ?? "").trim();
  if (channelUrl === "") {
    findings.push({
      severity: "block",
      phase: "publish",
      code: "channel_url_missing",
      message:
        "The Brand's Channel URL is not configured. Set channel.url in brand-profile.yaml before attempting to publish or track posts.",
    });
  }

  return sortFindings(findings);
}
