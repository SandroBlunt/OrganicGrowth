/**
 * `/import-data` — the one-shot importer's single command (issue #204): plans, executes, and reconciles
 * in one call, so that "when the Operator says go, the real run is a single command with no remaining
 * unknowns."
 *
 * A thin orchestration shell over the deep modules this ticket built: `planImport` (never writes),
 * `executeImport` (writes an already-validated plan through the command surface), and
 * `buildReconciliation`/`formatReconciliationMarkdown` (the per-entity counts-in-vs-counts-out report).
 *
 * **Refuses to run against a non-empty database.** No file this importer reads carries `updated_at`, a
 * version, or an etag, so the import cannot be incremental or resumable — it is one shot (this ticket's
 * own brief). Rather than let a second run against an already-populated database fail confusingly on a
 * `UNIQUE` constraint partway through, this shell checks first and refuses with a clear, actionable
 * message: start over with a fresh database file.
 *
 * Used identically for a rehearsal (point `--checkout-root`/`--db` at a scratch copy) and for the real
 * run (point them at the real checkout and the real database) — the ONLY difference is which paths are
 * given, never a special "dry run" code path, which is the whole point: a rehearsal proves the exact
 * command the real run will use.
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { openDatabase } from "../db/connection.ts";
import { runMigrations } from "../db/migrate.ts";
import { listBrands } from "../brand/store.ts";
import { planImport } from "./plan.ts";
import { executeImport } from "./execute.ts";
import { buildReconciliation, formatReconciliationMarkdown } from "./reconcile.ts";

/** The one, fixed, historical absolute path prefix baked into every legacy `asset_paths` entry in this
 *  repo's real data (verified: the ONLY prefix present anywhere in either real ledger). The default for
 *  a real run; a rehearsal against a relocated copy still passes the SAME value explicitly (the prefix
 *  baked into the DATA never changes just because the copy lives somewhere else — see
 *  `plan-asset-media.ts`'s own doc comment on `legacyAbsolutePrefix` vs `checkoutRoot`). */
const DEFAULT_LEGACY_ABSOLUTE_PREFIX = "/Users/CaxtonTaylor/Developer/OrganicGrowth";
const DEFAULT_BRAND_SLUGS = ["mundotip", "straw-motion"];
const DEFAULT_DB_PATH = "data/organicgrowth.db";

export interface ImportCliOptions {
  readonly now?: () => string;
}

export interface ImportCommandResult {
  readonly ok: boolean;
  readonly report: string;
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface ParsedArgs {
  readonly brandSlugs: readonly string[];
  readonly checkoutRoot: string;
  readonly legacyAbsolutePrefix: string;
  readonly dbPath: string;
  readonly reconciliationOut?: string;
}

function findFlag(args: readonly string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 || i === args.length - 1 ? undefined : args[i + 1];
}

function parseArgs(args: readonly string[]): ParsedArgs {
  const brandsArg = findFlag(args, "--brands");
  const checkoutRoot = findFlag(args, "--checkout-root") ?? process.cwd();
  const legacyAbsolutePrefix = findFlag(args, "--legacy-prefix") ?? DEFAULT_LEGACY_ABSOLUTE_PREFIX;
  const dbPath = findFlag(args, "--db") ?? DEFAULT_DB_PATH;
  const reconciliationOut = findFlag(args, "--reconciliation-out");
  return {
    brandSlugs: brandsArg !== undefined ? brandsArg.split(",").map((s) => s.trim()).filter((s) => s.length > 0) : DEFAULT_BRAND_SLUGS,
    checkoutRoot,
    legacyAbsolutePrefix,
    dbPath,
    ...(reconciliationOut !== undefined ? { reconciliationOut } : {}),
  };
}

// ---------------------------------------------------------------------------
// importCommand
// ---------------------------------------------------------------------------

function formatProblems(problems: readonly string[]): string {
  return [`REFUSED — ${problems.length} problem(s) found. Nothing was written.`, "", ...problems.map((p) => `- ${p}`)].join("\n") + "\n";
}

/**
 * Runs one full import pass (plan -> execute -> reconcile) and returns `{ ok, report }` — never throws
 * for an ordinary planning refusal (that is a NORMAL, expected outcome this ticket calls "a good
 * outcome"); throws only for a genuine precondition failure (a non-empty target database).
 */
export async function importCommand(args: readonly string[], options: ImportCliOptions = {}): Promise<ImportCommandResult> {
  const parsed = parseArgs(args);
  const now = options.now ?? (() => new Date().toISOString());

  const db = await openDatabase(parsed.dbPath);
  try {
    runMigrations(db);

    const existingBrands = listBrands(db);
    if (existingBrands.length > 0) {
      throw new Error(
        `Refusing to import into a non-empty database ("${parsed.dbPath}" already has ${existingBrands.length} Brand(s): ` +
          `${existingBrands.map((b) => b.slug).join(", ")}). The import is one-shot, not incremental (issue #204) — ` +
          `start over with a fresh database file.`,
      );
    }

    const planResult = await planImport({
      brandSlugs: parsed.brandSlugs,
      legacyAbsolutePrefix: parsed.legacyAbsolutePrefix,
      checkoutRoot: parsed.checkoutRoot,
      now,
    });

    if (!planResult.ok) {
      return { ok: false, report: formatProblems(planResult.problems) };
    }

    await executeImport(db, planResult.plan, now);
    const reconciliation = buildReconciliation(db, planResult.plan, now);
    const report = formatReconciliationMarkdown(reconciliation);

    if (parsed.reconciliationOut !== undefined) {
      await writeFile(parsed.reconciliationOut, report, "utf8");
    }

    return { ok: true, report };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

/**
 * CLI entry: print the reconciliation (or the refusal report) and set a non-zero exit code on refusal.
 * Usage: `npm run import-data -- [--brands a,b] [--checkout-root <path>] [--legacy-prefix <path>]
 * [--db <path>] [--reconciliation-out <path>]`.
 */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const result = await importCommand(args);
  process.stdout.write(result.report + "\n");
  if (!result.ok) process.exitCode = 1;
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && fileURLToPath(import.meta.url) === resolve(entryPoint)) {
  main().catch((err: unknown) => {
    process.stderr.write(`/import-data failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
