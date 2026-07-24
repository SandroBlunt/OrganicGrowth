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
import { checkConfig, normalizeSeeds, type BrandProfile, type Seeds } from "../readiness/check-config.ts";
import { sortFindings } from "../readiness/sort.ts";
import { primaryChannelFrom } from "../production-spec/brand-profile.ts";
import type { MagnificReadinessPort, ApifyReadinessPort } from "./run-pipeline-ports.ts";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface RunReadinessOptions {
  /** Path to the Brand's `brand-profile.yaml`. */
  readonly brandProfilePath: string;
  /** Path to the Brand's `seeds.yaml`. */
  readonly seedsPath: string;
  /**
   * Whether the Channel has a performance baseline yet. `true` once the performance-tracker has
   * written per-metric medians to the ledger (its `baseline.updated_at` is set); `false` otherwise.
   * The conductor derives this from the ledger before calling runReadiness — the numeric medians
   * themselves live in the ledger and are surfaced by `/report`, not needed here.
   */
  readonly baselineExists: boolean;
  /** The Magnific probe port (fake in tests, live MCP adapter at runtime). */
  readonly magnific: MagnificReadinessPort;
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
    baselineExists,
    magnific,
    apify,
  } = options;

  // --- Read and parse Brand config from disk ---
  //
  // A MISSING file (ENOENT) is a legitimate "not set up yet" state → empty config, and checkConfig
  // reports the specific gaps (niche_unset / no_valid_seed / …). A file that EXISTS but does not
  // parse is a different problem: reporting it as "field not set" sends the Operator to edit fields
  // instead of fixing the broken YAML. So parse (and non-ENOENT read) failures become a blocking
  // finding that names the file and quotes the error verbatim.

  const parseErrors: Finding[] = [];

  const brandProfile = await loadConfigFile<BrandProfile>(
    brandProfilePath,
    "brand_profile_unparseable",
    "Brand profile",
    { channel: [] },
    parseErrors,
  );
  const seeds = await loadConfigFile<Seeds>(
    seedsPath,
    "seeds_unparseable",
    "Seeds file",
    {},
    parseErrors,
  );

  // A broken config file blocks research; surface it (and only it) rather than a wall of misleading
  // "field not set" advisories derived from the empty fallback.
  if (parseErrors.length > 0) {
    return sortFindings(parseErrors);
  }

  // --- Config sanity (pure, no I/O) ---

  const configFindings = checkConfig(brandProfile, seeds);

  // --- Live probes via injected ports ---

  const [spaceProbeResult, apifyTokenValid] = await Promise.all([
    magnific.probeSpace().catch(() => ({ accessible: false, creditsOk: false })),
    apify.probeToken().catch(() => false),
  ]);

  // --- Assemble ReadinessInputs for classify ---

  // Normalize seeds defensively (drops non-string/url-less entries; reads either off-niche form).
  const normalizedSeeds = normalizeSeeds(seeds.seed_pages);
  const seedCount = normalizedSeeds.length;
  const offNicheSeedCount = normalizedSeeds.filter((s) => s.offNiche).length;
  const bannedWordsEmpty = !brandProfile.banned_words || brandProfile.banned_words.length === 0;
  // ADR-0019 (issue #127): `channel` is a list; key off the ONE primary entry, same as checkConfig.
  const channelUrl = (primaryChannelFrom(brandProfile)?.url ?? "").trim() || null;

  const classifyFindings = classify({
    apifyTokenValid,
    seedCount,
    offNicheSeedCount,
    spaceAccessible: spaceProbeResult.accessible,
    creditsOk: spaceProbeResult.creditsOk,
    channelUrl,
    // classify only distinguishes "has a baseline" from "no baseline yet"; the numeric medians
    // live in the ledger. Map presence to the number|null shape classify expects.
    baseline: baselineExists ? 0 : null,
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
// loadConfigFile — read + parse one YAML config file, distinguishing missing from broken
// ---------------------------------------------------------------------------

/** True when an error is a filesystem "no such file" (ENOENT). */
function isENOENT(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * Read and parse one YAML config file.
 *
 *   - File missing (ENOENT)         → return `fallback` (the "not set up yet" state).
 *   - File present but unparseable  → push a blocking Finding (naming the file + the error) and
 *                                     return `fallback`.
 *   - Other read errors             → treated like a parse error (blocking Finding).
 *
 * @param path        Absolute path to the YAML file.
 * @param code        Stable Finding code for a parse failure of this file.
 * @param label       Human label for the file (e.g. "Brand profile").
 * @param fallback    Value to return when the file is missing/broken.
 * @param sink        Findings array to append a parse-error Finding to.
 */
async function loadConfigFile<T>(
  path: string,
  code: string,
  label: string,
  fallback: T,
  sink: Finding[],
): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if (!isENOENT(err)) {
      sink.push({
        severity: "block",
        phase: "research",
        code,
        message: `${label} at ${path} could not be read: ${String(err)}`,
      });
    }
    return fallback;
  }

  try {
    return (parseYaml(raw) as T) ?? fallback;
  } catch (err) {
    sink.push({
      severity: "block",
      phase: "research",
      code,
      message: `${label} at ${path} could not be parsed as YAML: ${String(err)}`,
    });
    return fallback;
  }
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
