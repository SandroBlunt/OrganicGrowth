/**
 * Readiness probe orchestrator for the `/run-pipeline` conductor.
 *
 * This is the I/O-ful thin shell that:
 *   1. Reads and parses the Brand's `brand-profile.yaml` and `seeds.yaml`.
 *   2. Calls `checkConfig(brandProfile, seeds)` (pure, no I/O).
 *   3. Performs the live probes via the two injected ports (Magnific + Apify).
 *   4. Assembles `ReadinessInputs` and calls `classify(inputs)` (pure, no I/O).
 *   5. Merges and deduplicates findings, returning the combined `Finding[]` sorted by phase+severity.
 *
 * The probe ports are always injected — never instantiated here — so the build remains hermetic:
 * tests pass fake ports; the live MCP adapter is wired at runtime.
 *
 * The readiness gate lives SOLELY in `/run-pipeline`. Granular commands do NOT import this module.
 */

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

import type { Finding } from "../readiness/types.ts";
import { classify } from "../readiness/classify.ts";
import { checkConfig, type BrandProfile, type Seeds } from "../readiness/check-config.ts";
import { sortFindings } from "../readiness/sort.ts";
import type { MagniticReadinessPort, ApifyReadinessPort } from "./run-pipeline-ports.ts";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface RunReadinessOptions {
  /** Path to the Brand's `brand-profile.yaml`. */
  readonly brandProfilePath: string;
  /** Path to the Brand's `seeds.yaml`. */
  readonly seedsPath: string;
  /**
   * The Channel's current performance baseline (from the ledger), or `null` if no history yet.
   * The conductor reads this from the ledger before calling runReadiness.
   */
  readonly baseline: number | null;
  /** The Magnific probe port (fake in tests, live MCP adapter at runtime). */
  readonly magnific: MagniticReadinessPort;
  /** The Apify probe port (fake in tests, live adapter at runtime). */
  readonly apify: ApifyReadinessPort;
}

// ---------------------------------------------------------------------------
// runReadiness
// ---------------------------------------------------------------------------

/**
 * Perform all readiness probes and return the combined `Finding[]`.
 *
 * This function IS the I/O layer for the readiness check. It reads YAML from disk, performs live
 * probes via the injected ports, and feeds the results to the pure `classify` and `checkConfig`
 * functions. Never cached — called fresh on every `/run-pipeline` launch.
 *
 * Returns an empty array when everything is healthy.
 */
export async function runReadiness(options: RunReadinessOptions): Promise<Finding[]> {
  const {
    brandProfilePath,
    seedsPath,
    baseline,
    magnific,
    apify,
  } = options;

  // --- Read and parse Brand config from disk ---

  let brandProfile: BrandProfile;
  let seeds: Seeds;

  try {
    const profileRaw = await readFile(brandProfilePath, "utf8");
    brandProfile = parseYaml(profileRaw) as BrandProfile ?? {};
  } catch {
    // Missing/unreadable profile: use empty object (checkConfig will flag niche/voice/etc.)
    brandProfile = { channel: {} };
  }

  try {
    const seedsRaw = await readFile(seedsPath, "utf8");
    seeds = parseYaml(seedsRaw) as Seeds ?? {};
  } catch {
    // Missing/unreadable seeds: use empty object (checkConfig will flag no_valid_seed)
    seeds = {};
  }

  // --- Config sanity (pure, no I/O) ---

  const configFindings = checkConfig(brandProfile, seeds);

  // --- Live probes via injected ports ---

  const [spaceProbeResult, apifyTokenValid] = await Promise.all([
    magnific.probeSpace().catch(() => ({ accessible: false, creditsOk: false })),
    apify.probeToken().catch(() => false),
  ]);

  // --- Assemble ReadinessInputs for classify ---

  const seedPages = seeds.seed_pages ?? [];
  const seedCount = seedPages.length;
  const offNicheSeedCount = seedPages.filter((p) => p.startsWith("OFF_NICHE:")).length;
  const bannedWordsEmpty = !brandProfile.banned_words || brandProfile.banned_words.length === 0;
  const channelUrl = (brandProfile.channel?.url ?? "").trim() || null;

  const classifyFindings = classify({
    apifyTokenValid,
    seedCount,
    offNicheSeedCount,
    spaceAccessible: spaceProbeResult.accessible,
    creditsOk: spaceProbeResult.creditsOk,
    channelUrl,
    baseline,
    bannedWordsEmpty,
  });

  // --- Merge and deduplicate findings by code ---
  // Both checkConfig and classify may surface the same code (e.g. no_valid_seed, channel_url_missing,
  // off_niche_seed, empty_banned_words) from different vantage points. Deduplicate by code: keep
  // the first occurrence (config findings take precedence as they are static and more actionable).

  const seen = new Set<string>();
  const merged: Finding[] = [];

  for (const f of [...configFindings, ...classifyFindings]) {
    if (!seen.has(f.code)) {
      seen.add(f.code);
      merged.push(f);
    }
  }

  return sortFindings(merged);
}

// ---------------------------------------------------------------------------
// findingsBlockPhase — helper used by the conductor to check phase gating
// ---------------------------------------------------------------------------

/**
 * Returns true if `findings` contains at least one `block` finding for the given phase.
 * The conductor uses this to decide whether to stop before each phase.
 */
export function findingsBlockPhase(findings: Finding[], phase: Finding["phase"]): boolean {
  return findings.some((f) => f.severity === "block" && f.phase === phase);
}
