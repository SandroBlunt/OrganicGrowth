/**
 * Load one Apify actor slug straight from a Brand's own `seeds.yaml` on disk (issue #253).
 *
 * WHY THIS EXISTS: before this slice, `src/apify/live/smoke.ts` — the one script whose entire job is
 * verifying the live Facebook mapping — hardcoded its actor slug as a string literal instead of reading
 * the Brand's configured one. That literal happened to be `apify/facebook-post-scraper`, a dead slug
 * (404 — it never existed; the real actor is `apify/facebook-posts-scraper`, plural), so the one script
 * that exists to prove the live mapping works never actually exercised the configured actor at all.
 *
 * This is the thin I/O wrapper around the pure `resolveApifyActor` (`./platform.ts`) — mirrors
 * `trackPerformanceCommand`'s private `loadApifyConfig` helper (`src/commands/track-performance.ts`)
 * but is exported/shared so both callers read a Brand's actor the same way.
 *
 * Defensive by contract (data-handling rule 4/8): a missing/unreadable/unparseable `seeds.yaml`, or a
 * missing/placeholder actor, resolves to `null` — NEVER throws, never fabricates a slug.
 */

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

import { resolveApifyActor, type ApifyActorPurpose, type ApifyPlatform } from "./platform.ts";

/**
 * Read `seeds.yaml` at `seedsPath` and resolve one `apify.<platform>.<purpose>` actor slug.
 *
 * Returns `null` — never throws — when: the file cannot be read, the YAML cannot be parsed, or
 * `resolveApifyActor` itself returns `null` (missing platform block, missing purpose, or the `"..."`
 * not-yet-wired placeholder).
 *
 * @param seedsPath  Absolute (or cwd-relative) path to the Brand's `seeds.yaml` (e.g.
 *                   `resolveBrand(brand).seeds`).
 */
export async function loadConfiguredActorSlug(
  seedsPath: string,
  platform: ApifyPlatform,
  purpose: ApifyActorPurpose,
): Promise<string | null> {
  let raw: string;
  try {
    raw = await readFile(seedsPath, "utf8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch {
    return null;
  }

  const apifyConfig =
    typeof parsed === "object" && parsed !== null
      ? (parsed as { apify?: unknown }).apify
      : undefined;

  return resolveApifyActor(apifyConfig, platform, purpose);
}
