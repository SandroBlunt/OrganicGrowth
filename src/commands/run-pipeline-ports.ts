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
 * Narrow port for Apify readiness probes — the ONLY seam between the conductor and Apify.
 *
 * Models exactly what the conductor needs at launch: is the configured token valid?
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
}
