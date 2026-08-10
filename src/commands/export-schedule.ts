/**
 * `/export-schedule <brand> <format> <run> <start-date>` command — orchestration shell (issue #145,
 * parent #140, the Schedule Batch spec).
 *
 * Thin: resolve the Brand's paths, load the run's Ideas scoped to `(format, run)`
 * (`src/schedule-batch/select.ts`), decide which Assets are eligible
 * (`src/schedule-batch/eligibility.ts`), load the Brand's Zoho Social Brand config
 * (`src/production-spec/brand-profile.ts`'s `loadZohoConfig`, issue #143), run a PURE preflight
 * validation before touching any I/O (`src/schedule-batch/plan.ts`'s `validateAssetsForExport`), derive
 * + validate a deterministic schedule (`src/schedule-batch/schedule.ts`), host each eligible Asset's
 * slides via the injected `MediaHostPort` (issue #144 — the fake in every test, never live in `npm
 * test`), assemble the whole plan PURELY (`src/schedule-batch/plan.ts`'s `buildSchedulePlan`), write the
 * CSVs + manifest into the run folder, and stamp `scheduled_at` on each exported Asset via
 * `AssetStore.writeAsset` (ledger-as-source-of-truth, always-rules #7) — the Asset's `status` stays
 * `"produced"` (ADR-0011's lifecycle is unchanged; `/log-post` is still what moves it to `posted`).
 *
 * Every business-rule refusal (an empty run, a Brand not configured for Schedule Batch, a preflight
 * problem, a schedule time inside the 1-hour lead window) is a RETURNED, clearly-worded string — never
 * a throw — mirroring every other granular command's refusal style (`/log-post`'s `unknown-recipe`,
 * `/track-performance`'s `SKIPPED` lines). A genuine runtime failure (a broken ledger file, a Media Host
 * error) still propagates as a throw, exactly like every other command's underlying I/O.
 *
 * **Runs the Brand's manifest-driven S3 cleanup FIRST, automatically** (issue #147, parent #140): before
 * loading this run's Ideas at all, `runScheduleCleanup` (`src/schedule-batch/cleanup-runner.ts`) scans
 * the WHOLE Brand's Schedule Batch manifest tree (every run, every Format — not just the one being
 * exported), deletes any hosted object more than 1 day past its `scheduled_at` through the SAME injected
 * `MediaHostPort`, and records the removal onto each manifest it touches. This is what keeps published
 * media from lingering on S3 without the Operator ever having to remember a separate step; the same
 * cleanup is also runnable on its own via `/cleanup-schedule-media <brand>`.
 *
 * Brand is always explicit: `<brand>` is a required first argument, resolved via `resolveBrand` —
 * mirroring every other granular command (issue #20).
 *
 * Eligible Assets are scheduled in deterministic Idea-number order (`src/schedule-batch/order.ts`'s
 * `sortEligible`, extracted issue #160) — the SAME shared ordering the MCP schedule plan
 * (`src/schedule-batch/mcp-plan.ts`) indexes its own slots against, so a batch never gets two different
 * orderings depending on which path (CSV or MCP) ends up scheduling it.
 */

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveBrand } from "../brand/resolver.ts";
import { formatIdeasRoot } from "../format/store.ts";
import { briefShortName } from "../production-spec/store.ts";
import { loadZohoConfig } from "../production-spec/brand-profile.ts";
import { writeFileAtomic } from "../fs/safe-io.ts";
import { writeAsset } from "../asset/store.ts";

import { loadScheduleBatchIdeas } from "../schedule-batch/select.ts";
import { selectEligibleAssets, describeSkippedAssets } from "../schedule-batch/eligibility.ts";
import { sortEligible } from "../schedule-batch/order.ts";
import { deriveScheduleSlots, validateSlotsFuture } from "../schedule-batch/schedule.ts";
import { validateAssetsForExport, buildSchedulePlan, type AssetHostedMedia } from "../schedule-batch/plan.ts";
import { slideBaseName, scheduleMediaKey } from "../schedule-batch/media-key.ts";
import { runScheduleCleanup, type CleanupResult } from "../schedule-batch/cleanup-runner.ts";
import type { MediaHostPort } from "../media-host/port.ts";

const MANIFEST_FILE_NAME = "zoho-manifest.json";

// ---------------------------------------------------------------------------
// Default Media Host (deferred live wiring — mirrors DEFAULT_PERFORMANCE_SCRAPE_PORT)
// ---------------------------------------------------------------------------

function noMediaHostConfigured(): never {
  throw new Error(
    "export-schedule: no Media Host is configured. Pass options.mediaHost explicitly (e.g. " +
      "`new LiveMediaHost({ config: { bucket, region } })`, src/media-host/live/adapter.ts) — this " +
      "command's default has no live wiring, mirroring track-performance's deferred Apify port. Tests " +
      "always inject FakeMediaHost.",
  );
}

/** Runtime placeholder: THROWS rather than silently no-op'ing, because (unlike a metrics scrape
 *  returning "no data") a Media Host that does nothing would produce a CSV with broken image links —
 *  worse than refusing outright. NEVER exercised in tests (every test injects `FakeMediaHost`). */
const DEFAULT_MEDIA_HOST: MediaHostPort = {
  convertToJpg: () => noMediaHostConfigured(),
  upload: () => noMediaHostConfigured(),
  delete: () => noMediaHostConfigured(),
};

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ExportScheduleOptions {
  readonly brandsRoot?: string;
  readonly ledgerPath?: string;
  readonly brandProfilePath?: string;
  /** Override the run folder's PARENT directory (normally `<brand ideas root>/<format>`); primarily
   *  for testing against a fixture run folder. */
  readonly ideasRoot?: string;
  /** Injected clock — both the "now" the >= 1h-future validation runs against AND the manifest's
   *  `created_at`. Defaults to the real clock. */
  readonly now?: () => string;
  /** The Media Host port (fake in tests; the deferred default at runtime — see `DEFAULT_MEDIA_HOST`). */
  readonly mediaHost?: MediaHostPort;
  /** Where converted-to-JPG staging files are written before upload. Defaults to a fresh, self-cleaning
   *  temp directory (`mkdtemp`); a caller-supplied directory is left untouched by this command (the
   *  caller owns cleanup in that case) — primarily for testing. */
  readonly tempDir?: string;
}

// ---------------------------------------------------------------------------
// Reporting helpers
// ---------------------------------------------------------------------------

/** Empty when nothing was removed (the common case) — never clutters routine output. */
function describeCleanup(result: CleanupResult): string {
  if (result.actions.length === 0) return "";
  const manifestCount = new Set(result.actions.map((a) => a.manifestPath)).size;
  return (
    `Cleanup: removed hosted media for ${result.actions.length} Asset(s) across ${manifestCount} ` +
    "manifest(s) (more than 1 day past their scheduled time).\n\n"
  );
}

// ---------------------------------------------------------------------------
// exportScheduleCommand
// ---------------------------------------------------------------------------

/**
 * Run one `/export-schedule <brand> <format> <run> <start-date>` pass and return the report text
 * (testable, no printing). See the module docstring for the full pipeline.
 */
export async function exportScheduleCommand(
  brand: string,
  format: string,
  run: string,
  startDate: string,
  options: ExportScheduleOptions = {},
): Promise<string> {
  const brandPaths = resolveBrand(brand, options.brandsRoot);
  const ledgerPath = options.ledgerPath ?? brandPaths.ledger;
  const brandProfilePath = options.brandProfilePath ?? brandPaths.brandProfile;
  const runFolder =
    options.ideasRoot !== undefined
      ? join(options.ideasRoot, run)
      : join(formatIdeasRoot(brand, format, options.brandsRoot), run);
  const now = (options.now ?? (() => new Date().toISOString()))();
  const mediaHost = options.mediaHost ?? DEFAULT_MEDIA_HOST;

  // --- 0. Run the Brand's manifest-driven S3 cleanup FIRST, automatically (issue #147) --------------
  // Scans the WHOLE Brand's Schedule Batch manifest tree (every run, every Format), not just this one —
  // `options.ideasRoot` (when given) is THIS run's Format-parent folder, so its own parent is the
  // Brand-level ideas root cleanup needs to scan (mirrors `resolveBrand(...).ideasRoot` exactly).
  const cleanupIdeasRoot = options.ideasRoot !== undefined ? dirname(options.ideasRoot) : brandPaths.ideasRoot;
  const cleanup = await runScheduleCleanup(brand, {
    ideasRoot: cleanupIdeasRoot,
    now: () => now,
    mediaHost,
  });

  const header = `${describeCleanup(cleanup)}Exporting Schedule Batch for Brand: ${brand}, Format: ${format}, Run: ${run}.`;

  // --- 1. Load this run's Ideas, decide eligibility -------------------------------------------------

  const ideas = await loadScheduleBatchIdeas(ledgerPath, brand, format, run);
  const { eligible, skipped } = selectEligibleAssets(ideas);

  if (eligible.length === 0) {
    return `${header}\nNo eligible Assets to schedule — nothing written.${describeSkippedAssets(skipped)}`;
  }

  // --- 2. This Brand's Zoho Social Brand config (issue #143) ----------------------------------------

  const zohoConfig = await loadZohoConfig(brandProfilePath, brand);
  if (!zohoConfig.configured) {
    return `${header}\n${zohoConfig.message}\nNo files written.`;
  }

  const sorted = sortEligible(eligible, run);

  // --- 3. Preflight validation — before ANY I/O (never fabricate) -----------------------------------

  const problems = validateAssetsForExport(sorted, zohoConfig.zohoBrands);
  if (problems.length > 0) {
    const lines = problems.map((p) => `  - ${p.message}`);
    return (
      `${header}\nEXPORT REFUSED — ${problems.length} problem(s) found (fix these first; nothing was ` +
      `written):\n${lines.join("\n")}`
    );
  }

  // --- 4. Derive the schedule, and refuse loudly if any row is too close to now ---------------------

  const slots = deriveScheduleSlots(startDate, sorted.length);
  const nowMs = Date.parse(now);
  const futureCheck = validateSlotsFuture(slots, nowMs);
  if (!futureCheck.ok) {
    const lines = futureCheck.violations.map((v) => {
      const target = sorted[v.index]!;
      return (
        `  - ${target.ideaId}: scheduled ${new Date(v.utcMs).toISOString()} is less than 1 hour from ` +
        `now (${now}) — Zoho would silently grey out its upload button for this row.`
      );
    });
    return (
      `${header}\nEXPORT REFUSED — every schedule time must be at least 1 hour in the future (nothing ` +
      `was written):\n${lines.join("\n")}`
    );
  }

  // --- 5. Host every eligible Asset's slides once, sharing the links across its rows ----------------

  const ownsTempDir = options.tempDir === undefined;
  const stagingDir = options.tempDir ?? (await mkdtemp(join(tmpdir(), "og-schedule-batch-")));
  let hostedMedia: AssetHostedMedia[];
  try {
    hostedMedia = [];
    for (const { ideaId, asset } of sorted) {
      const ideaShortName = briefShortName(ideaId, run);
      const keys: string[] = [];
      const urls: string[] = [];
      for (const slidePath of asset.asset_paths ?? []) {
        const base = slideBaseName(slidePath);
        const key = scheduleMediaKey(brand, run, ideaShortName, base);
        const destPath = join(stagingDir, `${ideaShortName}-${base}.jpg`);
        await mediaHost.convertToJpg(slidePath, destPath);
        const { url } = await mediaHost.upload(destPath, key);
        keys.push(key);
        urls.push(url);
      }
      hostedMedia.push({ keys, urls });
    }
  } finally {
    if (ownsTempDir) {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => {
        /* best-effort cleanup; never let a cleanup failure mask the real result */
      });
    }
  }

  // --- 6. Assemble the plan PURELY, then write it ----------------------------------------------------

  const plan = buildSchedulePlan({
    brand,
    format,
    run,
    zohoBrands: zohoConfig.zohoBrands,
    eligible: sorted,
    slots,
    hostedMedia,
    createdAt: now,
  });

  await mkdir(runFolder, { recursive: true });
  for (const file of plan.csvFiles) {
    await writeFileAtomic(join(runFolder, file.fileName), file.content);
  }
  await writeFileAtomic(join(runFolder, MANIFEST_FILE_NAME), JSON.stringify(plan.manifest, null, 2) + "\n");

  // --- 7. Stamp scheduled_at on each exported Asset (status unchanged — ADR-0011) -------------------

  for (const stamp of plan.ledgerStamps) {
    await writeAsset(
      stamp.ideaId,
      stamp.recipe,
      { status: "produced", scheduled_at: stamp.scheduledAt },
      { ledgerPath },
    );
  }

  // --- 8. Report ---------------------------------------------------------------------------------

  const fileNames = [...plan.csvFiles.map((f) => f.fileName), MANIFEST_FILE_NAME].join(", ");
  const lines = [header, `Wrote ${fileNames} to ${runFolder}.`, "", plan.summary];
  const skipSuffix = describeSkippedAssets(skipped);
  if (skipSuffix.length > 0) lines.push(skipSuffix);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

/**
 * CLI entry: print the export result. Only runs when invoked directly (e.g. `npm run export-schedule`).
 * Usage: `npm run export-schedule <brand> <format> <run> <start-date>`. All four are required — never a
 * silent default (issue #20).
 *
 * Exported so tests can invoke the usage-error path directly without spawning a subprocess.
 */
export async function main(): Promise<void> {
  const [brand, format, run, startDate] = process.argv.slice(2);
  if (brand === undefined || format === undefined || run === undefined || startDate === undefined) {
    process.stderr.write(
      "usage: npm run export-schedule <brand> <format> <run> <start-date>\n" +
        "  e.g. npm run export-schedule straw-motion unhypped-news 2026-W32 2026-08-05\n",
    );
    process.exitCode = 1;
    return;
  }
  const output = await exportScheduleCommand(brand, format, run, startDate, {});
  process.stdout.write(output + "\n");
}

// C41: compare resolved paths, not a hand-built `file://` string — the latter breaks on paths with
// spaces (percent-encoded in `import.meta.url`) or symlinks, silently making a direct run a no-op.
const entryPoint = process.argv[1];
if (entryPoint !== undefined && fileURLToPath(import.meta.url) === resolve(entryPoint)) {
  main().catch((err: unknown) => {
    process.stderr.write(`/export-schedule failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
