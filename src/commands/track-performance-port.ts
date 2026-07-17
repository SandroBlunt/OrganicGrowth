/**
 * Port interface for `/track-performance`'s live Apify scrape (issue #84).
 *
 * Mirrors `src/commands/run-pipeline-ports.ts`'s `ApifyReadinessPort` pattern: a narrow seam between
 * the orchestration shell and Apify, so the build stays hermetic — no live Apify HTTP calls, no
 * credits — tests ALWAYS inject a fake. The REAL adapter (a live Apify HTTP call, mirroring the
 * `curl` commands documented in `.claude/agents/performance-tracker.md`) is deferred, exactly like
 * `run-pipeline-ports.ts`'s `DEFAULT_APIFY_PORT`/`DEFAULT_MAGNIFIC_PORT` placeholders.
 */

import type { ApifyPlatform } from "../apify/platform.ts";

export interface PerformanceScrapePort {
  /**
   * Scrape one Post's public metrics via its platform's configured Apify actor.
   *
   * Returns the raw FIRST dataset item (`unknown` JSON, mapped by the caller with
   * `src/apify/normalize-metrics.ts`'s per-platform mapper), or `null` if the actor returned nothing
   * — an empty dataset, a failed run, or a post that no longer exists publicly. `null` is a routine,
   * honestly-reported outcome (data-handling rule 8: never fabricate) — the caller skips that Asset
   * rather than writing a fabricated score.
   */
  scrapePost(url: string, platform: ApifyPlatform, actorSlug: string): Promise<unknown | null>;
}
