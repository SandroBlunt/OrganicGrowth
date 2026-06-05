/**
 * `/report` command — the read-only pipeline view (issue #9).
 *
 * Two parts:
 *   - `renderReport(data)` — a PURE deep module that formats the read-only `ReportData` projection for
 *     the Operator. It surfaces production (the `casting` and `produced` Ideas the Producer introduced)
 *     and shows each Idea's **Fit Score** (predicted) and **Performance Score** (measured) in SEPARATE,
 *     clearly-labelled columns so the two are never conflated (always-rules #3). A measured score is
 *     shown together with the Channel **baseline** it is relative to (always-rules #4). An untracked
 *     Idea's Performance cell is a placeholder (never `0`, never the Fit Score). A Post is shown linked
 *     to its Idea only via the logged `post_url` (explicit attribution, #5) — never inferred.
 *   - `reportCommand(ledgerPath)` — a THIN orchestration shell: `loadReport` → `renderReport` → return.
 *     It READS `data/ledger.json` (the source of truth, #7) and writes NOTHING — `/report` never mutates
 *     state. No Magnific, no Apify, no network: `/report` runs no production and touches no Space.
 */

import {
  loadReport,
  DEFAULT_LEDGER_PATH,
  type ReportData,
  type ReportIdea,
} from "../ledger/ledger.ts";

/** Placeholder for a score that does not exist yet — NEVER `0`, NEVER borrowed from another column. */
const NONE = "—";

/** Format a score (0–1+, relative) to two decimals, or the placeholder when it has not been measured. */
function fmtScore(value: number | null): string {
  return value === null ? NONE : value.toFixed(2);
}

/** The lifecycle states that mean "currently in production" — the two the Producer introduced. */
const PRODUCTION_STATES: readonly string[] = ["casting", "produced"];

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
 *   1. Production — every Idea in `casting` and every Idea in `produced` (what is mid-pipeline now).
 *   2. All Ideas — the full run, one row each, Fit Score and Performance Score in separate columns.
 *   3. Baseline — the Channel baseline a Performance Score is relative to (or "not yet measured").
 */
export function renderReport(data: ReportData): string {
  if (data.ideas.length === 0) {
    return ["OrganicGrowth — Pipeline Report", "", "(empty — no Ideas yet; run /run-trends to start a Run.)"].join("\n");
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
    "",
    "Fit Score is PREDICTED (pre-publication); Performance Score is MEASURED (post-publication). They are",
    "kept distinct — a placeholder (—) means not-yet-measured, never a zero score and never the Fit Score.",
    "",
    "In production (casting / produced):",
    ...productionLines,
    "",
    "All Ideas this Run:",
    ...allLines,
    "",
    baselineLine,
  ].join("\n");
}

/**
 * `/report` orchestration shell: read the ledger via the read-only `loadReport` projection and render it.
 * Returns the report string (testable, no printing). READS only — never writes any file.
 */
export async function reportCommand(ledgerPath: string = DEFAULT_LEDGER_PATH): Promise<string> {
  const data = await loadReport(ledgerPath);
  return renderReport(data);
}

/** CLI entry: print the report. Only runs when invoked directly. Never writes state. */
async function main(): Promise<void> {
  const output = await reportCommand();
  process.stdout.write(output + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    process.stderr.write(`/report failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
