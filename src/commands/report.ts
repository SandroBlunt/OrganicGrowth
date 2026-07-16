/**
 * `/report <brand>` command — the read-only pipeline view (issue #9, updated in issue #20; the
 * production states re-grained onto Assets in issue #55 / ADR-0011).
 *
 * Two parts:
 *   - `renderReport(data, brand?)` — a PURE deep module that formats the read-only `ReportData`
 *     projection for the Operator. It surfaces production (the `in_production` and `produced` Ideas
 *     the Producer introduced — an Idea's `status` here is `loadReport`'s DERIVED roll-up across its
 *     Assets, ADR-0011; `casting` is also tolerated for a Brand's not-yet-migrated ledger) and shows
 *     each Idea's **Fit Score** (predicted) and **Performance Score**
 *     (measured) in SEPARATE, clearly-labelled columns so the two are never conflated (always-rules #3).
 *     A measured score is shown together with the Channel **baseline** it is relative to (always-rules
 *     #4). An untracked Idea's Performance cell is a placeholder (never `0`, never the Fit Score). A
 *     Post is shown linked to its Idea only via the logged `post_url` (explicit attribution, #5) —
 *     never inferred. The Brand is restated in the report header so the Operator can see which Brand is
 *     being reported on (issue #20: Brand is explicit, never inferred).
 *   - `reportCommand(brand, ledgerPath?)` — a THIN orchestration shell: resolves the Brand's ledger
 *     path via the Brand resolver (issue #20), then `loadReport` → `renderReport` → return. It READS
 *     the Brand's ledger (the source of truth, #7) and writes NOTHING — `/report` never mutates state.
 *     No Magnific, no Apify, no network: `/report` runs no production and touches no Space.
 *
 * Brand is always explicit: `<brand>` is a required first argument. Omitting it is a usage error, never
 * a silent MundoTip fallback (issue #20).
 */

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  loadReport,
  type ReportData,
  type ReportIdea,
} from "../ledger/ledger.ts";
import { resolveBrand } from "../brand/resolver.ts";

/** Placeholder for a score that does not exist yet — NEVER `0`, NEVER borrowed from another column. */
const NONE = "—";

/** Format a score (0–1+, relative) to two decimals, or the placeholder when it has not been measured. */
function fmtScore(value: number | null): string {
  return value === null ? NONE : value.toFixed(2);
}

/**
 * The (rolled-up) states that mean "currently in production" — the Producer-introduced Asset stages
 * `loadReport` rolls an accepted Idea's status up to (ADR-0011). `"casting"` is ALSO included here so
 * a Brand whose ledger has not yet been run through `ledger/migrate-assets.ts` still shows its
 * mid-production Ideas in this section — `loadReport` normalizes transparently, so in practice this
 * literal never reaches here from a real ledger read, but a caller feeding `renderReport` a raw
 * `ReportData` directly (e.g. a test, or a future caller) stays tolerant either way.
 */
const PRODUCTION_STATES: readonly string[] = ["casting", "in_production", "produced"];

/** One table row: id · title · status · Fit Score (predicted) · Performance Score (measured) · Post. */
function ideaRow(idea: ReportIdea): string {
  const post = idea.post_url ?? ""; // explicit attribution: only the logged URL, never inferred
  return [
    idea.id,
    idea.title,
    idea.status,
    fmtScore(idea.fit_score),
    fmtScore(idea.performance_score),
    post,
  ].join("  |  ");
}

/** Column legend — makes the predicted/measured distinction explicit so neither is read as the other. */
const COLUMN_HEADER = "id  |  title  |  status  |  Fit Score (predicted)  |  Performance Score (measured)  |  Post URL";

/**
 * Render the read-only `/report` view. Pure: same input → same output, no I/O, input not mutated.
 *
 * Sections:
 *   0. Brand header — restates the Brand being reported on so the Operator is never in doubt.
 *   1. Production — every Idea rolled up to `in_production` and every Idea rolled up to `produced`
 *      (what is mid-pipeline now; ADR-0011).
 *   2. All Ideas — the full run, one row each, Fit Score and Performance Score in separate columns.
 *   3. Baseline — the Channel baseline a Performance Score is relative to (or "not yet measured").
 *
 * @param data   The read-only projection of the Brand's ledger.
 * @param brand  The Brand slug, restated in the header so the Operator sees which Brand this is.
 */
export function renderReport(data: ReportData, brand?: string): string {
  const brandHeader = brand ? `Brand: ${brand}` : undefined;

  if (data.ideas.length === 0) {
    const lines = [
      "OrganicGrowth — Pipeline Report",
      ...(brandHeader ? [brandHeader] : []),
      "",
      "(empty — no Ideas yet; run /run-trends to start a Run.)",
    ];
    return lines.join("\n");
  }

  const inProduction = data.ideas.filter((i) => PRODUCTION_STATES.includes(i.status));

  const productionLines =
    inProduction.length === 0
      ? ["(nothing in production right now)"]
      : [COLUMN_HEADER, ...inProduction.map(ideaRow)];

  const allLines = [COLUMN_HEADER, ...data.ideas.map(ideaRow)];

  const baselineLine =
    data.baseline.updated_at === null
      ? "Channel baseline: not yet measured (run /track-performance) — a Performance Score is shown relative to this baseline, never as an absolute count."
      : `Channel baseline: last updated ${data.baseline.updated_at} — a Performance Score is relative to this baseline, never an absolute count.`;

  return [
    "OrganicGrowth — Pipeline Report",
    ...(brandHeader ? [brandHeader] : []),
    "",
    "Fit Score is PREDICTED (pre-publication); Performance Score is MEASURED (post-publication). They are",
    "kept distinct — a placeholder (—) means not-yet-measured, never a zero score and never the Fit Score.",
    "",
    "In production (in_production / produced):",
    ...productionLines,
    "",
    "All Ideas this Run:",
    ...allLines,
    "",
    baselineLine,
  ].join("\n");
}

/**
 * `/report <brand>` orchestration shell: resolve the Brand's ledger path via the Brand resolver,
 * read the ledger via the read-only `loadReport` projection, and render it.
 *
 * Returns the report string (testable, no printing). READS only — never writes any file.
 *
 * Brand is always explicit: `brand` is a required first argument. When `ledgerPath` is not provided,
 * the ledger path is derived from `resolveBrand(brand, brandsRoot).ledger`. Omitting `brand` from
 * the CLI is a usage error, not a silent MundoTip fallback (issue #20).
 *
 * @param brand       The Brand slug (e.g. `"mundotip"`). Required.
 * @param ledgerPath  Optional override for the ledger path; defaults to `resolveBrand(brand, brandsRoot).ledger`.
 * @param brandsRoot  Optional override for the brands root directory; defaults to `data/brands`.
 *                    Primarily for testing: lets tests inject a temp directory without touching real state.
 */
export async function reportCommand(brand: string, ledgerPath?: string, brandsRoot?: string): Promise<string> {
  const resolvedLedgerPath = ledgerPath ?? resolveBrand(brand, brandsRoot).ledger;
  const data = await loadReport(resolvedLedgerPath, brand);
  return renderReport(data, brand);
}

/**
 * CLI entry: print the report. Only runs when invoked directly. Never writes state.
 * Usage: `npm run report <brand>` (or `npx tsx src/commands/report.ts <brand>`).
 * Brand is required — omitting it is a usage error, never a silent MundoTip fallback.
 *
 * Exported so tests can invoke the usage-error path directly without spawning a subprocess.
 */
export async function main(): Promise<void> {
  const brand = process.argv[2];
  if (brand === undefined) {
    process.stderr.write("usage: npm run report <brand>\n  e.g. npm run report mundotip\n");
    process.exitCode = 1;
    return;
  }
  const output = await reportCommand(brand);
  process.stdout.write(output + "\n");
}

// C41: compare resolved paths, not a hand-built `file://` string — the latter breaks on paths with
// spaces (percent-encoded in `import.meta.url`) or symlinks, silently making a direct run a no-op.
const entryPoint = process.argv[1];
if (entryPoint !== undefined && fileURLToPath(import.meta.url) === resolve(entryPoint)) {
  main().catch((err: unknown) => {
    process.stderr.write(`/report failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
