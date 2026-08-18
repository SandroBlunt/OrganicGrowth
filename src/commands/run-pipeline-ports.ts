/**
 * Port interfaces for the run-pipeline conductor's live probes.
 *
 * The conductor needs to probe two external systems at each launch:
 *   - The Magnific Space (for accessibility and credit balance)
 *   - The Apify API (for token validity)
 *
 * Both are modelled behind narrow port interfaces so that tests can inject fakes and the build
 * remains hermetic: no live `spaces_*`/`creations_*` calls, no credits, no board mutation.
 *
 * The REAL adapters (live Magnific MCP tools + Apify token ping) are NOT built here — they are
 * deferred and injected at runtime. Tests always inject fakes.
 *
 * Pattern follows `src/space-driver/port.ts` — the same hermetic-build seam used by earlier slices.
 */

/**
 * Narrow port for Magnific readiness probes — the ONLY seam between the conductor and Magnific.
 *
 * Models exactly what the conductor needs at launch: is the Space reachable, and does the balance
 * cover at least one cast+render cycle?
 *
 * In tests: a fake implementing this interface is injected.
 * At runtime: an adapter calling live Magnific MCP tools implements this interface.
 */
export interface MagnificReadinessPort {
  /**
   * Live-probe the Magnific Space for accessibility and credit balance.
   * Returns `{ accessible: boolean, creditsOk: boolean }`.
   *   - `accessible`: true if the Space can be reached and read.
   *   - `creditsOk`: true if the account balance covers at least one cast+render cycle.
   */
  probeSpace(): Promise<{ accessible: boolean; creditsOk: boolean }>;
}

/**
 * The result of probing whether one configured Apify actor slug exists (issue #253 — a dead actor
 * slug, `apify/facebook-post-scraper`, sat in config for months with nothing noticing).
 *   - `"ok"`          the actor was confirmed to exist.
 *   - `"not_found"`   the actor was confirmed NOT to exist (e.g. a 404 from Apify's own actor lookup).
 *   - `"unreachable"` the probe itself could not complete (network blip, timeout, DNS failure, …) —
 *                     existence could not be determined either way. This is DELIBERATELY never
 *                     escalated to a `block` finding — see `run-pipeline-readiness.ts`'s
 *                     `probeConfiguredActors` and this change's `proposal.md` for the reasoning
 *                     ("reporting unreachable rather than failing hard").
 */
export type ActorProbeResult = "ok" | "not_found" | "unreachable";

/**
 * Narrow port for Apify readiness probes — the ONLY seam between the conductor and Apify.
 *
 * Models exactly what the conductor needs at launch: is the configured token valid, and does each
 * configured actor slug actually exist?
 *
 * In tests: a fake implementing this interface is injected.
 * At runtime: an adapter making a lightweight Apify API call implements this interface.
 */
export interface ApifyReadinessPort {
  /**
   * Live-ping the Apify API token for validity.
   * Returns `true` if the token is valid and accepted; `false` otherwise.
   */
  probeToken(): Promise<boolean>;

  /**
   * Live-probe whether one configured Apify actor slug exists (issue #253). See `ActorProbeResult`
   * for the three possible outcomes. NEVER throws — an unexpected failure resolves to `"unreachable"`,
   * mirroring `probeToken`'s catch-to-false pattern at the call site (`runReadiness`).
   */
  probeActorExists(actorSlug: string): Promise<ActorProbeResult>;
}
