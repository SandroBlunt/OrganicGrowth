/**
 * Readiness classifier — pure deep module.
 *
 * Accepts the would-be results of Apify and Magnific probes (performed by the conductor, a later
 * slice) and returns a `Finding[]` list encoding the phase-scoped gating policy:
 * a finding blocks ONLY the phase it is tagged with.
 *
 * PURE: no disk, no network, no Magnific Space, no Apify, no clock access. The conductor
 * performs the probes and passes their results in as a plain `ReadinessInputs` object.
 * Same inputs always produce the same output in the same order (deterministic).
 *
 * Phase-scoped gating policy:
 *   - apifyTokenValid === false → block on research (code: apify_token_invalid)
 *   - seedCount < 1             → block on research (code: no_valid_seed)
 *   - spaceAccessible === false → advisory on research (space_inaccessible_advisory)
 *                                 + block on production (space_inaccessible)
 *   - creditsOk === false       → advisory on research (credits_low_advisory)
 *                                 + block on production (credits_low)
 *   - channelUrl === null        → block on publish (channel_url_missing)
 *   - baseline === null          → advisory on research (null_baseline)
 *   - offNicheSeedCount > 0     → advisory on research (off_niche_seed) — never blocks
 *   - bannedWordsEmpty === true  → advisory on research (empty_banned_words) — never blocks
 *
 * NOTE on duplication with checkConfig: checkConfig detects off-niche seeds and empty banned-words
 * from the static config file (seed URL markers, profile fields). classify detects the same
 * conditions from conductor-gathered runtime probe results passed in as ReadinessInputs. Both
 * functions legitimately surface these signals — from different vantage points, not by accident.
 *
 * NOTE on FindingPhase: exactly three values ('research' | 'production' | 'publish').
 * The pipeline also uses 'review' and 'track' phases but these are NOT Finding.phase values.
 * A block on 'publish' gates the downstream publish AND track pipeline phases.
 * A Magnific advisory on 'research' surfaces the warning at research/review pipeline steps.
 */

import type { Finding, ReadinessInputs } from "./types.ts";
import { sortFindings } from "./sort.ts";

/**
 * Classify a set of readiness probe results into a `Finding[]` list.
 *
 * Pure and deterministic: no I/O. The inputs are NOT mutated. Same inputs → same output order.
 *
 * @param inputs  The would-be results of Apify/Magnific probes, passed in by the conductor.
 */
export function classify(inputs: ReadinessInputs): Finding[] {
  const findings: Finding[] = [];

  // --- block × research ---

  if (!inputs.apifyTokenValid) {
    findings.push({
      severity: "block",
      phase: "research",
      code: "apify_token_invalid",
      message:
        "The Apify API token is invalid or rejected. Trend research cannot proceed until a valid token is configured.",
    });
  }

  if (inputs.seedCount < 1) {
    findings.push({
      severity: "block",
      phase: "research",
      code: "no_valid_seed",
      message:
        "No valid seed pages are configured. At least one seed page is required for trend research.",
    });
  }

  // --- advisory × research + block × production (Space inaccessible) ---

  if (!inputs.spaceAccessible) {
    findings.push({
      severity: "advisory",
      phase: "research",
      code: "space_inaccessible_advisory",
      message:
        "The Magnific Space is currently unreachable. Trend research and idea review can proceed, but production will be blocked.",
    });
    findings.push({
      severity: "block",
      phase: "production",
      code: "space_inaccessible",
      message:
        "The Magnific Space is unreachable. Asset production cannot proceed until the Space is accessible.",
    });
  }

  // --- advisory × research + block × production (credits low) ---

  if (!inputs.creditsOk) {
    findings.push({
      severity: "advisory",
      phase: "research",
      code: "credits_low_advisory",
      message:
        "The Magnific account balance is insufficient for a generation. Trend research and review can proceed, but production will be blocked.",
    });
    findings.push({
      severity: "block",
      phase: "production",
      code: "credits_low",
      message:
        "The Magnific account balance is too low to run a generation. Top up credits before starting production.",
    });
  }

  // --- block × publish ---

  if (inputs.channelUrl === null) {
    findings.push({
      severity: "block",
      phase: "publish",
      code: "channel_url_missing",
      message:
        "The Brand's Channel URL is not configured. Research and production can proceed, but publishing and tracking will be blocked until the URL is set.",
    });
  }

  // --- advisory × research (null baseline) ---

  if (inputs.baseline === null) {
    findings.push({
      severity: "advisory",
      phase: "research",
      code: "null_baseline",
      message:
        "No Channel performance baseline exists yet. Performance Scores will not be available until at least one Post has been tracked.",
    });
  }

  // --- advisory × research (off-niche seed) — never blocks ---

  if (inputs.offNicheSeedCount > 0) {
    findings.push({
      severity: "advisory",
      phase: "research",
      code: "off_niche_seed",
      message:
        `${inputs.offNicheSeedCount} seed page(s) appear off-niche for this Brand. Trend research can proceed, but results may be less relevant.`,
    });
  }

  // --- advisory × research (empty banned-words) — never blocks ---

  if (inputs.bannedWordsEmpty) {
    findings.push({
      severity: "advisory",
      phase: "research",
      code: "empty_banned_words",
      message:
        "The Brand has no banned words configured. Brand-safety filtering will not apply until banned_words is set in the profile.",
    });
  }

  return sortFindings(findings);
}
