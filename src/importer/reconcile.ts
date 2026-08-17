/**
 * `buildReconciliation` / `formatReconciliationMarkdown` — the one-shot importer's per-entity
 * reconciliation (issue #204 AC9/AC10/AC12): "the run ends with a per-entity reconciliation: counts in
 * versus counts out, for both Brands... the reconciliation accounts for all 54 Assets, all 61 Briefs and
 * all 66 queue jobs."
 *
 * "Counts in" are read from the `ImportPlan` (`src/importer/plan.ts`) — `planImport` already refuses
 * (rather than silently drops) anything it cannot parse, so a successful plan's own counts ARE a
 * faithful count of the source data. "Counts out" are a REAL query against the database, run AFTER
 * `executeImport` — deliberately NOT an echo of the plan's own numbers: an executor bug that silently
 * failed to write something the plan said it would would show up here as a genuine mismatch, which an
 * "in vs in" comparison could never catch. `idea` doubles as CONTEXT.md's "Brief" count (a Brief is the
 * `idea.brief` column's content, not a separate table — see this ticket's `handoff.md`), so the "Ideas"
 * row is the same number this ticket's AC12 calls "Briefs".
 *
 * A read-only, diagnostic module — the direct `db.prepare(...)` queries here are COUNTs run purely for
 * reporting, never a write; issue #233's command-surface-write guard is explicitly scoped to writes
 * (its own `proposal.md`: "Scope is writes only, not reads"), so this stays outside that boundary by
 * design, same as `src/db/schema.test.ts`'s own direct-SQL reads.
 */

import type { DatabaseSync } from "node:sqlite";

import type { ImportPlan, DeadMediaPathReport, DuplicateJobKeyReport } from "./plan.ts";

export interface BrandReconciliation {
  readonly brand: string;
  readonly ideasIn: number;
  readonly ideasOut: number;
  readonly assetsIn: number;
  readonly assetsOut: number;
  readonly jobsIn: number;
  readonly jobsOut: number;
}

export interface ReconciliationTotals {
  readonly ideasIn: number;
  readonly ideasOut: number;
  readonly assetsIn: number;
  readonly assetsOut: number;
  readonly jobsIn: number;
  readonly jobsOut: number;
}

export interface ReconciliationReport {
  readonly generatedAt: string;
  readonly brands: readonly BrandReconciliation[];
  readonly totals: ReconciliationTotals;
  readonly deadMediaPaths: readonly DeadMediaPathReport[];
  readonly duplicateJobKeys: readonly DuplicateJobKeyReport[];
}

function countIn(plan: ImportPlan, brandSlug: string): { readonly ideas: number; readonly assets: number; readonly jobs: number } {
  const brandPlan = plan.brands.find((b) => b.slug === brandSlug);
  let ideas = 0;
  let assets = 0;
  if (brandPlan !== undefined) {
    for (const format of brandPlan.formats) {
      for (const run of format.runs) {
        ideas += run.ideas.length;
        for (const idea of run.ideas) assets += idea.assets.length;
      }
    }
  }
  const jobs = plan.jobs.filter((j) => j.brand === brandSlug).length;
  return { ideas, assets, jobs };
}

function countOut(db: DatabaseSync, brandSlug: string): { readonly ideas: number; readonly assets: number; readonly jobs: number } {
  const brandRow = db.prepare(`SELECT id FROM brand WHERE slug = ?`).get(brandSlug) as unknown as { readonly id: string } | undefined;
  if (brandRow === undefined) return { ideas: 0, assets: 0, jobs: 0 };
  const ideas = (db.prepare(`SELECT COUNT(*) AS c FROM idea WHERE brand_id = ?`).get(brandRow.id) as unknown as { readonly c: number }).c;
  const assets = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM asset a JOIN idea i ON a.idea_id = i.id WHERE i.brand_id = ?`)
      .get(brandRow.id) as unknown as { readonly c: number }
  ).c;
  const jobs = (db.prepare(`SELECT COUNT(*) AS c FROM job WHERE brand_id = ?`).get(brandRow.id) as unknown as { readonly c: number }).c;
  return { ideas, assets, jobs };
}

/**
 * Builds the full reconciliation report: per-Brand counts in vs counts out, plus totals across every
 * Brand `plan` names, plus the two report-only categories (dead media paths, duplicate job identity
 * keys) carried straight through from the plan.
 */
export function buildReconciliation(db: DatabaseSync, plan: ImportPlan, now: () => string = () => new Date().toISOString()): ReconciliationReport {
  const brands: BrandReconciliation[] = plan.brands.map((brandPlan) => {
    const inCounts = countIn(plan, brandPlan.slug);
    const outCounts = countOut(db, brandPlan.slug);
    return {
      brand: brandPlan.slug,
      ideasIn: inCounts.ideas,
      ideasOut: outCounts.ideas,
      assetsIn: inCounts.assets,
      assetsOut: outCounts.assets,
      jobsIn: inCounts.jobs,
      jobsOut: outCounts.jobs,
    };
  });

  const totals: ReconciliationTotals = brands.reduce(
    (acc, b) => ({
      ideasIn: acc.ideasIn + b.ideasIn,
      ideasOut: acc.ideasOut + b.ideasOut,
      assetsIn: acc.assetsIn + b.assetsIn,
      assetsOut: acc.assetsOut + b.assetsOut,
      jobsIn: acc.jobsIn + b.jobsIn,
      jobsOut: acc.jobsOut + b.jobsOut,
    }),
    { ideasIn: 0, ideasOut: 0, assetsIn: 0, assetsOut: 0, jobsIn: 0, jobsOut: 0 },
  );

  return { generatedAt: now(), brands, totals, deadMediaPaths: plan.deadMediaPaths, duplicateJobKeys: plan.duplicateJobKeys };
}

function matchMark(inCount: number, outCount: number): string {
  return inCount === outCount ? "OK" : "MISMATCH";
}

/** Renders `report` as Markdown — suitable for posting on the tracked issue (AC9/AC10) and for
 *  committing alongside the real run (AC11). */
export function formatReconciliationMarkdown(report: ReconciliationReport): string {
  const lines: string[] = [];
  lines.push(`# Import reconciliation — ${report.generatedAt}`);
  lines.push("");
  lines.push("Ideas doubles as CONTEXT.md's \"Brief\" count — a Brief is the `idea.brief` column, not a separate table.");
  lines.push("");
  lines.push("| Brand | Ideas (Briefs) in | out | Assets in | out | Jobs in | out |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const b of report.brands) {
    lines.push(
      `| ${b.brand} | ${b.ideasIn} | ${b.ideasOut} (${matchMark(b.ideasIn, b.ideasOut)}) | ${b.assetsIn} | ${b.assetsOut} (${matchMark(b.assetsIn, b.assetsOut)}) | ${b.jobsIn} | ${b.jobsOut} (${matchMark(b.jobsIn, b.jobsOut)}) |`,
    );
  }
  lines.push(
    `| **Totals** | **${report.totals.ideasIn}** | **${report.totals.ideasOut}** (${matchMark(report.totals.ideasIn, report.totals.ideasOut)}) | **${report.totals.assetsIn}** | **${report.totals.assetsOut}** (${matchMark(report.totals.assetsIn, report.totals.assetsOut)}) | **${report.totals.jobsIn}** | **${report.totals.jobsOut}** (${matchMark(report.totals.jobsIn, report.totals.jobsOut)}) |`,
  );
  lines.push("");

  lines.push(`## Dead media paths (${report.deadMediaPaths.length}) — reported for an Operator decision, never silently nulled`);
  lines.push("");
  if (report.deadMediaPaths.length === 0) {
    lines.push("None.");
  } else {
    for (const dead of report.deadMediaPaths) {
      lines.push(`- ${dead.brand} / ${dead.ideaLegacyId} / ${dead.recipe} [${dead.ordinal}]: \`${dead.storageKey}\``);
    }
  }
  lines.push("");

  lines.push(`## Duplicate job identity keys (${report.duplicateJobKeys.length}) — reported for an Operator decision, not resolved`);
  lines.push("");
  if (report.duplicateJobKeys.length === 0) {
    lines.push("None.");
  } else {
    for (const dup of report.duplicateJobKeys) {
      lines.push(`- ${dup.brand} / ${dup.ideaLegacyId} / ${dup.recipe} (${dup.jobs.length} jobs):`);
      for (const job of dup.jobs) {
        lines.push(`  - gate=${job.gate ?? "null"} status=${job.status} enqueued_at=${job.enqueuedAt}${job.pick !== undefined ? ` pick=${job.pick}` : ""}`);
      }
    }
  }

  return lines.join("\n") + "\n";
}
