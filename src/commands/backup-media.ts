/**
 * `/backup-media [<destination>] [--verify]` — orchestration shell for the media backup (issue #197).
 *
 * Thin: resolves the destination (`resolveBackupDestination`, `src/media-backup/destination.ts` —
 * explicit argument > `MEDIA_BACKUP_DEST` env var > `~/OrganicGrowth-Backups`, never a hardcoded
 * personal path), then either runs a full backup (`runMediaBackup`,
 * `src/media-backup/backup-runner.ts`) or, with `--verify`, checks an EXISTING backup's manifest
 * against its own destination (`verifyMediaBackup`, `src/media-backup/verify-runner.ts`) — no
 * argument order is required; `--verify` is recognized anywhere in argv.
 *
 * Backs up EVERY Brand under `data/brands/` (discovered, not hardcoded — see `backup-runner.ts`),
 * copying every file the Brand's ledger references (`asset_paths`, Cast candidate paths) UNION its
 * whole produced-media tree (`.output`/`.assets` bundles), to `<destination>`, alongside a
 * `manifest.json` recording each file's checksum + size. A ledger media path pointing at a file that
 * no longer exists is LISTED in the report, never silently skipped.
 *
 * Never touches the Magnific Space or the Zoho MCP tools — this is pure local filesystem I/O, always
 * hermetic. The real ~800 MB production run against live data is the Operator's own, run by hand;
 * every test in this codebase runs this command against temp directories and tiny fixture files.
 */

import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { resolveBackupDestination } from "../media-backup/destination.ts";
import { runMediaBackup } from "../media-backup/backup-runner.ts";
import { verifyMediaBackup } from "../media-backup/verify-runner.ts";
import type { BackupRunResult } from "../media-backup/backup-runner.ts";
import type { VerifyResult } from "../media-backup/verify-runner.ts";

export interface BackupMediaOptions {
  readonly brandsRoot?: string;
  readonly repoRoot?: string;
  readonly now?: () => string;
  readonly env?: NodeJS.ProcessEnv;
  readonly homeDir?: string;
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface ParsedArgs {
  readonly verify: boolean;
  readonly destArg: string | undefined;
}

function parseArgs(args: readonly string[]): ParsedArgs {
  const verify = args.includes("--verify");
  const destArg = args.find((a) => a !== "--verify");
  return { verify, destArg };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function describeBackup(result: BackupRunResult): string {
  const lines = [`Media backup written to ${result.destination} (manifest: ${result.manifestPath}).`];
  if (result.brands.length === 0) {
    lines.push("No Brands found — nothing to back up.");
    return lines.join("\n");
  }
  for (const brand of result.brands) {
    lines.push(`  - ${brand.brand}: ${brand.copiedCount} file(s) copied.`);
    if (brand.missingLedgerPaths.length > 0) {
      lines.push(
        `    ${brand.missingLedgerPaths.length} ledger media path(s) point at a file that no longer exists:`,
      );
      for (const missing of brand.missingLedgerPaths) {
        lines.push(`      - ${missing.ideaId} (${missing.recipe}): ${missing.path}`);
      }
    }
  }
  return lines.join("\n");
}

function describeVerify(result: VerifyResult): string {
  const header = `Verified ${result.manifestPath} — ${result.totalEntries} entr${
    result.totalEntries === 1 ? "y" : "ies"
  }.`;
  if (result.mismatches.length === 0) {
    return `${header} 0 mismatches.`;
  }
  const lines = [`${header} ${result.mismatches.length} mismatch(es):`];
  for (const m of result.mismatches) lines.push(`  - ${m.path}: ${m.reason}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// backupMediaCommand
// ---------------------------------------------------------------------------

/**
 * Run one `/backup-media` pass (or `--verify` an existing one) and return the report text (testable,
 * no printing). See the module docstring for what this wraps.
 */
export async function backupMediaCommand(
  args: readonly string[],
  options: BackupMediaOptions = {},
): Promise<string> {
  const { verify, destArg } = parseArgs(args);
  const homeDir = options.homeDir ?? homedir();
  const env = options.env ?? process.env;
  const destination = resolveBackupDestination({
    ...(destArg !== undefined ? { argDest: destArg } : {}),
    env,
    homeDir,
  });

  if (verify) {
    const result = await verifyMediaBackup(destination);
    return describeVerify(result);
  }

  const result = await runMediaBackup(destination, {
    ...(options.brandsRoot !== undefined ? { brandsRoot: options.brandsRoot } : {}),
    ...(options.repoRoot !== undefined ? { repoRoot: options.repoRoot } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
  });
  return describeBackup(result);
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

/**
 * CLI entry: print the backup (or verify) report. Only runs when invoked directly. Usage:
 * `npm run backup-media -- [<destination>] [--verify]`.
 *
 * Exported so tests can invoke the CLI path directly without spawning a subprocess.
 */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const output = await backupMediaCommand(args, {});
  process.stdout.write(output + "\n");
}

// C41: compare resolved paths, not a hand-built `file://` string — the latter breaks on paths with
// spaces (percent-encoded in `import.meta.url`) or symlinks, silently making a direct run a no-op.
const entryPoint = process.argv[1];
if (entryPoint !== undefined && fileURLToPath(import.meta.url) === resolve(entryPoint)) {
  main().catch((err: unknown) => {
    process.stderr.write(`/backup-media failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
