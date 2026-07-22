/**
 * `/track-performance <brand> [idea-id]` command — orchestration shell (issue #84, ADR-0011).
 *
 * Before this slice, `/track-performance` had NO code behind it at all: the `performance-tracker`
 * agent did every step by hand (raw `curl` + freeform arithmetic + manual ledger edits), still
 * thinking in the pre-ADR-0011 per-Idea shape the doc prose had already moved past. This shell brings
 * it in line with every other granular command (`/log-post`, `/pick-cast`, `/report`): a thin,
 * testable, deterministic pipeline over the REAL per-Asset grain —
 *
 *   1. Select trackable Assets (`src/performance/selection.ts`) — one selection PER (Idea, Recipe)
 *      Asset, never per Idea.
 *   2. For each, detect its platform from its OWN `post_url` (`src/apify/platform.ts`), resolve that
 *      platform's `post_actor` from the Brand's `seeds.yaml`, and scrape it via the injected
 *      `PerformanceScrapePort` (fake in tests — never live Apify, no credits, hermetic build).
 *   3. Normalize the raw item (`src/apify/normalize-metrics.ts`) and compute the Performance Score
 *      relative to the Brand's ONE Channel baseline (`src/performance/score.ts`).
 *   4. Decide `tracking` vs `scored` from THAT Asset's OWN `posted_at` age (`src/performance/maturity.ts`).
 *   5. Write `metrics`/`performance_score`/`tracked_at`/`history`/`status` onto THAT ONE Asset via
 *      `AssetStore.writeAsset` — a sibling Recipe's Asset on the same Idea is never touched (explicit
 *      attribution, always-rules #5). Immediately after, refresh that SAME Asset's output-bundle
 *      `post.json` (`src/asset/output-bundle.ts`'s `refreshOutputBundle`, issue #112) — a GENERATED
 *      view of the ledger, so it can never drift; an Asset with no known local bundle directory yet is
 *      skipped cleanly by that function, never surfaced as an error here.
 *   6. Recompute + write the Brand's ONE Channel baseline (`src/performance/metrics.ts`) from every
 *      `scored` Asset's `metrics` across the WHOLE ledger (falling back to whatever `metrics` exist at
 *      all, when nothing has matured yet — the "seed the baseline from this batch" case).
 *
 * The actual live Apify HTTP call is DEFERRED (mirrors `run-pipeline-ports.ts`'s
 * `DEFAULT_APIFY_PORT`/`DEFAULT_MAGNIFIC_PORT` placeholders): `DEFAULT_PERFORMANCE_SCRAPE_PORT` always
 * returns `null` and is never exercised in tests. Until a live adapter is wired, the
 * `performance-tracker` agent's own Bash-tool-driven Apify calls
 * (`.claude/agents/performance-tracker.md`) remain the sanctioned way to pull real metrics — this
 * module is the canonical, tested reference for the SELECTION/SCORING/STATUS/LEDGER-WRITE logic that
 * process must match.
 *
 * Brand is always explicit: `<brand>` is a required first argument, resolved via `resolveBrand`.
 */

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { loadIdeas, loadBaseline, writeBaseline } from "../ledger/ledger.ts";
import { resolveBrand } from "../brand/resolver.ts";
import { selectTrackableAssets } from "../performance/selection.ts";
import { computePerformanceScore } from "../performance/score.ts";
import { assetMaturityStatus } from "../performance/maturity.ts";
import { recomputeBaseline } from "../performance/metrics.ts";
import { detectPlatformFromUrl, resolveApifyActor, type ApifyPlatform } from "../apify/platform.ts";
import {
  mapFacebookItem,
  mapInstagramItem,
  mapYoutubeItem,
  type NormalizedMetrics,
} from "../apify/normalize-metrics.ts";
import { writeAsset } from "../asset/store.ts";
import { refreshOutputBundle } from "../asset/output-bundle.ts";
import type { AssetMetrics, LedgerAssetRecord } from "../asset/asset.ts";
import type { PerformanceScrapePort } from "./track-performance-port.ts";

// ---------------------------------------------------------------------------
// Default port (deferred live adapter — see module docstring)
// ---------------------------------------------------------------------------

const DEFAULT_PERFORMANCE_SCRAPE_PORT: PerformanceScrapePort = {
  async scrapePost() {
    // Runtime placeholder: the live Apify HTTP adapter is deferred. This path is NEVER exercised in
    // tests (tests always inject a fake). If called for real, report "no data" rather than fabricate.
    return null;
  },
};

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface TrackPerformanceOptions {
  readonly ledgerPath?: string;
  readonly seedsPath?: string;
  /** Optional override for the brands root directory; defaults to `data/brands` (primarily testing). */
  readonly brandsRoot?: string;
  /** Injected clock for `tracked_at`/the baseline's `updated_at`; defaults to now. */
  readonly now?: () => string;
  /** The Apify scrape port (fake in tests; the deferred default at runtime). */
  readonly apify?: PerformanceScrapePort;
}

// ---------------------------------------------------------------------------
// seeds.yaml → apify config (defensive: missing/broken file → undefined, never a crash)
// ---------------------------------------------------------------------------

async function loadApifyConfig(seedsPath: string): Promise<Record<string, unknown> | undefined> {
  let raw: string;
  try {
    raw = await readFile(seedsPath, "utf8");
  } catch {
    return undefined;
  }
  try {
    const parsed = parseYaml(raw) as { apify?: Record<string, unknown> } | null;
    return parsed?.apify;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Per-platform normalization dispatch
// ---------------------------------------------------------------------------

function normalizeForPlatform(platform: ApifyPlatform, raw: unknown): NormalizedMetrics | null {
  switch (platform) {
    case "facebook":
      return mapFacebookItem(raw);
    case "instagram":
      return mapInstagramItem(raw);
    case "youtube":
      return mapYoutubeItem(raw);
    case "linkedin":
      // No metrics mapper wired yet (and no live actor is ever configured for it today either — see
      // resolveApifyActor, which already reports "not trackable" for linkedin before this is reached).
      return null;
  }
}

// ---------------------------------------------------------------------------
// trackPerformanceCommand
// ---------------------------------------------------------------------------

/**
 * Run one `/track-performance <brand> [idea-id]` pass and return the report text (testable, no
 * printing). See the module docstring for the full pipeline.
 *
 * @param brand    The Brand slug (e.g. `"mundotip"`). Required — never a silent default (issue #20).
 * @param ideaId   Optional: force-select every one of this ONE Idea's Assets with a `post_url`
 *                 (including an already-`scored` one). Omit to select every Brand Asset at
 *                 `posted`/`tracking` across every Idea and Recipe (the default).
 * @param options  Path/clock/port overrides for testing; the live Apify port is deferred at runtime.
 */
export async function trackPerformanceCommand(
  brand: string,
  ideaId: string | undefined,
  options: TrackPerformanceOptions = {},
): Promise<string> {
  const brandPaths = resolveBrand(brand, options.brandsRoot);
  const ledgerPath = options.ledgerPath ?? brandPaths.ledger;
  const seedsPath = options.seedsPath ?? brandPaths.seeds;
  const now = (options.now ?? (() => new Date().toISOString()))();
  const apify = options.apify ?? DEFAULT_PERFORMANCE_SCRAPE_PORT;

  const header = `Tracking performance for Brand: ${brand}.`;

  const ideas = await loadIdeas(ledgerPath, brand);
  const picks = selectTrackableAssets(ideas, ideaId !== undefined ? { ideaId } : {});

  if (picks.length === 0) {
    const scope = ideaId !== undefined ? ` for Idea ${ideaId}` : "";
    return `${header}\nNo trackable Assets${scope} — nothing with a logged Post URL at posted/tracking status (or forced by idea-id).`;
  }

  const baseline = await loadBaseline(ledgerPath);
  const apifyConfig = await loadApifyConfig(seedsPath);
  const lines: string[] = [header];

  for (const { ideaId: pickIdeaId, asset } of picks) {
    const label = `${pickIdeaId} · ${asset.recipe}`;
    const url = asset.post_url!; // selection guarantees a non-empty post_url

    const platform = detectPlatformFromUrl(url);
    if (platform === null) {
      lines.push(`${label}: SKIPPED — could not detect a platform from "${url}".`);
      continue;
    }

    const actorSlug = resolveApifyActor(apifyConfig, platform, "post_actor");
    if (actorSlug === null) {
      lines.push(`${label}: SKIPPED — ${platform} has no post_actor configured yet (not trackable).`);
      continue;
    }

    if (asset.posted_at === undefined) {
      lines.push(`${label}: SKIPPED — no posted_at recorded, cannot assess maturity.`);
      continue;
    }
    const maturity = assetMaturityStatus(asset.posted_at, now);
    if (maturity === null) {
      lines.push(`${label}: SKIPPED — posted_at "${asset.posted_at}" is unparseable.`);
      continue;
    }

    let rawItem: unknown;
    try {
      rawItem = await apify.scrapePost(url, platform, actorSlug);
    } catch (err: unknown) {
      lines.push(`${label}: SKIPPED — scrape failed: ${String(err)}.`);
      continue;
    }
    if (rawItem === null || rawItem === undefined) {
      lines.push(`${label}: SKIPPED — the actor returned no data for ${url}.`);
      continue;
    }

    const normalized = normalizeForPlatform(platform, rawItem);
    if (normalized === null) {
      lines.push(`${label}: SKIPPED — no metrics mapper for platform "${platform}".`);
      continue;
    }

    const sample: AssetMetrics = {
      shares: normalized.shares,
      comments: normalized.comments,
      reactions: normalized.reactions,
      views: normalized.views,
    };
    const score = computePerformanceScore(sample, baseline);

    // Keep prior reads in `history` — Performance is a moving number until a Post matures.
    const previousSnapshot =
      asset.metrics !== undefined && asset.performance_score !== undefined && asset.tracked_at !== undefined
        ? { tracked_at: asset.tracked_at, performance_score: asset.performance_score, metrics: asset.metrics }
        : undefined;
    const newHistory =
      previousSnapshot !== undefined ? [...(asset.history ?? []), previousSnapshot] : (asset.history ?? []);

    await writeAsset(
      pickIdeaId,
      asset.recipe,
      {
        status: maturity,
        performance_score: score,
        metrics: sample,
        tracked_at: now,
        ...(newHistory.length > 0 ? { history: newHistory } : {}),
      },
      { ledgerPath },
    );

    // Refresh THIS Asset's output-bundle post.json from the ledger we just wrote (issue #112) — a
    // silent side effect; an Asset with no known local bundle directory yet is skipped cleanly.
    await refreshOutputBundle(brand, pickIdeaId, asset.recipe, { ledgerPath });

    lines.push(
      `${label}: ${maturity} · score=${score.toFixed(2)} · shares=${sample.shares} comments=${sample.comments} ` +
        `reactions=${sample.reactions} views=${sample.views} · ${url}`,
    );
  }

  // --- Recompute the ONE Channel baseline from the FULL ledger, fresh from disk after the writes ---

  const freshIdeas = await loadIdeas(ledgerPath, brand);
  const allAssets: readonly LedgerAssetRecord[] = freshIdeas.flatMap((i) => i.assets ?? []);
  const scoredMetrics = allAssets
    .filter((a) => a.status === "scored" && a.metrics !== undefined)
    .map((a) => a.metrics!);
  const anyMetrics = allAssets.filter((a) => a.metrics !== undefined).map((a) => a.metrics!);
  // Prefer settled (`scored`) readings; before anything has matured, seed the baseline from whatever
  // has been measured so far (`.claude/agents/performance-tracker.md`: "If baseline is null (first
  // run), seed it from this batch's medians").
  const baselineSamples = scoredMetrics.length > 0 ? scoredMetrics : anyMetrics;

  if (baselineSamples.length > 0) {
    const recomputed = recomputeBaseline(baselineSamples);
    await writeBaseline({ ...recomputed, updated_at: now }, { ledgerPath });
    lines.push(
      `Channel baseline updated (Brand: ${brand}): shares=${recomputed.shares ?? "n/a"} ` +
        `comments=${recomputed.comments ?? "n/a"} reactions=${recomputed.reactions ?? "n/a"} ` +
        `views=${recomputed.views ?? "n/a"} (updated_at=${now}).`,
    );
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

/**
 * CLI entry: print the tracking result. Only runs when invoked directly (e.g. `npm run
 * track-performance`). Usage: `npm run track-performance <brand> [idea-id]`. Brand is required —
 * omitting it is a usage error, never a silent default Brand (issue #20).
 *
 * Exported so tests can invoke the usage-error path directly without spawning a subprocess.
 */
export async function main(): Promise<void> {
  const [brand, ideaId] = process.argv.slice(2);
  if (brand === undefined) {
    process.stderr.write(
      "usage: npm run track-performance <brand> [idea-id]\n" +
        "  e.g. npm run track-performance mundotip\n" +
        "  e.g. npm run track-performance mundotip idea-2026-W22-01   # forces a re-pull of every Asset\n",
    );
    process.exitCode = 1;
    return;
  }
  const output = await trackPerformanceCommand(brand, ideaId, {});
  process.stdout.write(output + "\n");
}

// C41: compare resolved paths, not a hand-built `file://` string — the latter breaks on paths with
// spaces (percent-encoded in `import.meta.url`) or symlinks, silently making a direct run a no-op.
const entryPoint = process.argv[1];
if (entryPoint !== undefined && fileURLToPath(import.meta.url) === resolve(entryPoint)) {
  main().catch((err: unknown) => {
    process.stderr.write(`/track-performance failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
