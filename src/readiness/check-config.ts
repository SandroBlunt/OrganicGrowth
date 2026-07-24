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
 *   A seed entry can be marked off-niche in two ways, both read by `normalizeSeeds`:
 *     - Structured form (preferred): `{ url: "https://…", off_niche: true }` in seeds.yaml.
 *     - Legacy string form: a URL string prefixed with `OFF_NICHE:` (the prefix is stripped).
 *   The structured form survives YAML parsing (a bare `# comment` does not), so the off-niche
 *   advisory can actually fire on the data that needs it.
 *
 * Findings emitted (by code):
 *   config_todo         — advisory/research  — niche or voice contains a TODO placeholder
 *   niche_unset         — advisory/research  — niche is empty or missing
 *   voice_unset         — advisory/research  — voice is empty or missing
 *   no_valid_seed       — block/research     — seed_pages has fewer than 1 entry
 *   off_niche_seed      — advisory/research  — at least one seed page is flagged off-niche
 *   channel_url_missing — block/publish      — the primary Channel entry's url is missing or empty
 *   empty_banned_words  — advisory/research  — banned_words is empty or missing
 *
 * A fully-healthy config yields no findings (empty array).
 *
 * Channel (ADR-0019, issue #127): `channel` is a LIST of `{ platform, url?, primary? }` entries —
 * exactly one carries `primary: true`. `channel_url_missing` is keyed off that ONE primary entry via
 * `primaryChannelFrom` (`../production-spec/brand-profile.ts`), unchanged from the pre-list
 * single-Channel behavior. The `channel` field is typed `unknown` below because `BrandProfile` types
 * an already-YAML-parsed-but-not-yet-validated object; `primaryChannelFrom` is itself defensive
 * against a missing/malformed/legacy-shaped `channel` value.
 */

import type { Finding } from "./types.ts";
import { sortFindings } from "./sort.ts";
import { primaryChannelFrom } from "../production-spec/brand-profile.ts";

// ---------------------------------------------------------------------------
// Types for the already-parsed config objects
// ---------------------------------------------------------------------------

/**
 * Parsed shape of `brand-profile.yaml`. Only the fields checked by `checkConfig` are required;
 * additional fields are tolerated (open object — forward compatible).
 */
export interface BrandProfile {
  /**
   * The Brand's Channel list (ADR-0019, issue #127) — a LIST of `{ platform, url?, primary? }`
   * entries, exactly one of which carries `primary: true`. Typed `unknown` because this interface
   * types an already-YAML-parsed-but-unvalidated object; read it via `primaryChannelFrom`
   * (`../production-spec/brand-profile.ts`), which is defensive against any shape.
   */
  channel?: unknown;
  niche?: string;
  language?: string;
  region?: string;
  voice?: string;
  required_cta?: string;
  required_hashtags?: string[];
  banned_words?: string[];
  brand_safety?: string[];
}

/**
 * A single raw `seed_pages` entry as it may appear in `seeds.yaml`:
 *   - a plain URL string (optionally with the legacy `OFF_NICHE:` prefix), or
 *   - a structured object `{ url, off_niche }`.
 * Additional/unknown shapes are tolerated and dropped by `normalizeSeeds`.
 */
export type SeedEntry = string | { url?: unknown; off_niche?: unknown };

/** A seed entry after normalization: a usable URL plus whether it is flagged off-niche. */
export interface NormalizedSeed {
  readonly url: string;
  readonly offNiche: boolean;
}

/**
 * Normalize the raw `seed_pages` value into a list of `{ url, offNiche }`.
 *
 * Defensive by contract (data-handling rule 4): NEVER throws on odd input. A non-array value,
 * or an entry that is neither a non-empty string nor an object with a non-empty string `url`
 * (e.g. `null`, a number, `{}`), is dropped rather than crashing the caller.
 *
 * Off-niche is read from either the structured `off_niche: true` field or the legacy
 * `OFF_NICHE:` string prefix (which is stripped from the returned url).
 *
 * @param raw  The parsed `seeds.seed_pages` value (unknown — validated here).
 */
export function normalizeSeeds(raw: unknown): NormalizedSeed[] {
  if (!Array.isArray(raw)) return [];
  const out: NormalizedSeed[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      const s = entry.trim();
      if (s.length === 0) continue;
      if (s.startsWith("OFF_NICHE:")) {
        const url = s.slice("OFF_NICHE:".length).trim();
        if (url.length > 0) out.push({ url, offNiche: true });
        continue;
      }
      out.push({ url: s, offNiche: false });
    } else if (entry !== null && typeof entry === "object") {
      const obj = entry as { url?: unknown; off_niche?: unknown };
      if (typeof obj.url === "string" && obj.url.trim().length > 0) {
        out.push({ url: obj.url.trim(), offNiche: obj.off_niche === true });
      }
    }
    // Any other shape (number, boolean, null, url-less object) is dropped defensively.
  }
  return out;
}

/**
 * Parsed shape of `seeds.yaml`. Only the fields checked by `checkConfig` are required;
 * additional fields are tolerated.
 */
export interface Seeds {
  seed_pages?: SeedEntry[];
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
  // Normalize first: this both guards against non-string entries (which would otherwise crash
  // string operations) and reads the off-niche flag from either the structured or legacy form.
  const seedPages = normalizeSeeds(seeds.seed_pages);

  if (seedPages.length < 1) {
    findings.push({
      severity: "block",
      phase: "research",
      code: "no_valid_seed",
      message:
        "No seed pages are configured. At least one seed page is required in seeds.yaml for trend research.",
    });
  }

  // Check for off-niche seed markers (structured `off_niche: true` or legacy `OFF_NICHE:` prefix)
  const hasOffNiche = seedPages.some((s) => s.offNiche);
  if (hasOffNiche) {
    findings.push({
      severity: "advisory",
      phase: "research",
      code: "off_niche_seed",
      message:
        "One or more seed pages are marked as off-niche. They may dilute trend research quality. Review seeds.yaml and remove or replace them.",
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

  // --- Channel URL (ADR-0019: keyed off the ONE primary Channel entry) ---
  const primaryChannel = primaryChannelFrom(brandProfile);
  const channelUrl = (primaryChannel?.url ?? "").trim();
  if (channelUrl === "") {
    findings.push({
      severity: "block",
      phase: "publish",
      code: "channel_url_missing",
      message:
        "The Brand's primary Channel URL is not configured. Set the primary entry's url in brand-profile.yaml's channel list before attempting to publish or track posts.",
    });
  }

  return sortFindings(findings);
}
