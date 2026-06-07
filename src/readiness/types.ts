/**
 * Shared types for the readiness classifier module.
 *
 * `Finding` is the authoritative shape from the PRD issue #1 design grilling:
 *   { severity: 'block' | 'advisory', phase: 'research' | 'production' | 'publish', code, message }
 *
 * NOTE on `FindingPhase`:
 *   The three values here (`research`, `production`, `publish`) are NOT the full set of pipeline
 *   phases (which also include `review` and `track`). The mapping is deliberate:
 *   - A `block` on `'publish'` gates the downstream publish AND track pipeline phases.
 *   - A Magnific `advisory` on `'research'` surfaces its warning at the research/review pipeline steps.
 *   This keeps the Finding shape minimal and unambiguous while covering all gating scenarios.
 */

/** A finding blocks only the phase it is tagged with — phase-scoped gating. */
export type FindingPhase = "research" | "production" | "publish";

/** `block` means the tagged phase cannot proceed; `advisory` warns but never prevents proceeding. */
export type FindingSeverity = "block" | "advisory";

/**
 * A single readiness finding. Shape is authoritative (PRD issue #1 design grilling):
 * `Finding = { severity, phase, code, message }`.
 */
export interface Finding {
  readonly severity: FindingSeverity;
  readonly phase: FindingPhase;
  /** Stable, machine-checkable identifier for the finding type. */
  readonly code: string;
  /** Human-readable description of the finding. */
  readonly message: string;
}

/**
 * The would-be results of Apify and Magnific probes, passed in by the conductor.
 * `classify` is pure — it accepts these pre-computed results and never calls Apify or Magnific
 * itself.
 */
export interface ReadinessInputs {
  /** Whether the Apify API token is valid (probe result from the conductor). */
  readonly apifyTokenValid: boolean;
  /** Number of valid seed pages available for trend research. */
  readonly seedCount: number;
  /**
   * Number of gathered seed pages whose niche signals diverge from the Brand's niche.
   * The conductor computes this after scraping; 0 means all seeds are on-niche.
   */
  readonly offNicheSeedCount: number;
  /** Whether the Magnific Space can be reached. */
  readonly spaceAccessible: boolean;
  /** Whether the Magnific balance is sufficient for a generation. */
  readonly creditsOk: boolean;
  /** The Brand's Channel URL from the profile, or null if absent. */
  readonly channelUrl: string | null;
  /** The Channel's performance baseline (null if no history yet). */
  readonly baseline: number | null;
  /**
   * Whether the Brand profile has no banned words configured (empty or absent banned_words list).
   * The conductor reads this from the parsed brand profile before calling classify.
   */
  readonly bannedWordsEmpty: boolean;
}
