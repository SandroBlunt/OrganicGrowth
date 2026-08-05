/**
 * `/cleanup-schedule-media <brand>` — the STANDALONE trigger for the manifest-driven S3 cleanup (issue
 * #147, parent #140). Thin: wraps `runScheduleCleanup` (`src/schedule-batch/cleanup-runner.ts`) — the
 * SAME function `/export-schedule` runs automatically, first, before it does anything else — and reports
 * what was scanned and removed.
 *
 * Brand is always explicit: `<brand>` is a required first argument, resolved via `resolveBrand`
 * (through `runScheduleCleanup`) — mirroring every other granular command (issue #20).
 */

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { runScheduleCleanup, type CleanupResult } from "../schedule-batch/cleanup-runner.ts";
import type { MediaHostPort } from "../media-host/port.ts";

// ---------------------------------------------------------------------------
// Default Media Host (deferred live wiring — mirrors export-schedule's own DEFAULT_MEDIA_HOST)
// ---------------------------------------------------------------------------

function noMediaHostConfigured(): never {
  throw new Error(
    "cleanup-schedule-media: no Media Host is configured. Pass options.mediaHost explicitly (e.g. " +
      "`new LiveMediaHost({ config: { bucket, region } })`, src/media-host/live/adapter.ts) — this " +
      "command's default has no live wiring, mirroring /export-schedule's own deferred default. Tests " +
      "always inject FakeMediaHost.",
  );
}

/** Runtime placeholder: THROWS rather than silently no-op'ing, so a genuinely due cleanup never
 *  silently fails to remove anything. NEVER exercised when there is nothing due to clean, and NEVER
 *  exercised in tests (every test injects `FakeMediaHost`). */
const DEFAULT_MEDIA_HOST: MediaHostPort = {
  convertToJpg: () => noMediaHostConfigured(),
  upload: () => noMediaHostConfigured(),
  delete: () => noMediaHostConfigured(),
};

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface CleanupScheduleMediaOptions {
  readonly brandsRoot?: string;
  /** Override the Brand's ideas root to scan; primarily for testing against a fixture tree. */
  readonly ideasRoot?: string;
  /** Injected clock. Defaults to the real clock. */
  readonly now?: () => string;
  /** The Media Host port (fake in tests; the deferred default at runtime — see `DEFAULT_MEDIA_HOST`). */
  readonly mediaHost?: MediaHostPort;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function describeResult(brand: string, result: CleanupResult): string {
  const header = `Schedule Batch cleanup for Brand: ${brand}.`;
  if (result.manifestsScanned === 0) {
    return `${header}\nNo Schedule Batch manifests found — nothing to clean.`;
  }
  if (result.actions.length === 0) {
    return (
      `${header}\nScanned ${result.manifestsScanned} manifest(s) — nothing is more than 1 day past its ` +
      "scheduled time; nothing removed."
    );
  }
  const lines = result.actions.map(
    (a) =>
      `  - ${a.ideaId} (${a.recipe}), scheduled ${a.scheduledAt}: removed ${a.keys.length} object(s).`,
  );
  return (
    `${header}\nScanned ${result.manifestsScanned} manifest(s) — removed hosted media for ` +
    `${result.actions.length} Asset(s):\n${lines.join("\n")}`
  );
}

// ---------------------------------------------------------------------------
// cleanupScheduleMediaCommand
// ---------------------------------------------------------------------------

/**
 * Run one `/cleanup-schedule-media <brand>` pass and return the report text (testable, no printing).
 * See the module docstring for what this wraps.
 */
export async function cleanupScheduleMediaCommand(
  brand: string,
  options: CleanupScheduleMediaOptions = {},
): Promise<string> {
  const mediaHost = options.mediaHost ?? DEFAULT_MEDIA_HOST;
  const result = await runScheduleCleanup(brand, {
    ...(options.brandsRoot !== undefined ? { brandsRoot: options.brandsRoot } : {}),
    ...(options.ideasRoot !== undefined ? { ideasRoot: options.ideasRoot } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
    mediaHost,
  });
  return describeResult(brand, result);
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

/**
 * CLI entry: print the cleanup result. Only runs when invoked directly. Usage:
 * `npm run cleanup-schedule-media <brand>`. `<brand>` is required — never a silent default (issue #20).
 *
 * Exported so tests can invoke the usage-error path directly without spawning a subprocess.
 */
export async function main(): Promise<void> {
  const [brand] = process.argv.slice(2);
  if (brand === undefined) {
    process.stderr.write(
      "usage: npm run cleanup-schedule-media <brand>\n" +
        "  e.g. npm run cleanup-schedule-media straw-motion\n",
    );
    process.exitCode = 1;
    return;
  }
  const output = await cleanupScheduleMediaCommand(brand, {});
  process.stdout.write(output + "\n");
}

// C41: compare resolved paths, not a hand-built `file://` string — the latter breaks on paths with
// spaces (percent-encoded in `import.meta.url`) or symlinks, silently making a direct run a no-op.
const entryPoint = process.argv[1];
if (entryPoint !== undefined && fileURLToPath(import.meta.url) === resolve(entryPoint)) {
  main().catch((err: unknown) => {
    process.stderr.write(`/cleanup-schedule-media failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
