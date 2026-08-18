/**
 * `buildReconciliation` / `formatReconciliationMarkdown` — the one-shot importer's per-entity
 * reconciliation (issue #204 AC9/AC10/AC12, extended by issue #240 AC4): "the run ends with a
 * per-entity reconciliation: counts in versus counts out, for both Brands... the reconciliation
 * accounts for all 54 Assets, all 61 Briefs and all 66 queue jobs" — now joined by a fourth counted
 * category, Posts (issue #240: 61/61, 54/54, 66/66 all matched on the real run while 7 real Posts were
 * silently dropped, BECAUSE Posts were never a category this report named at all).
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
 * **What this report does and does not cover (issue #240's own lesson).** Ideas/Briefs, Assets, Jobs,
 * and now Posts are the FOUR entities this report actually counts and cross-checks. Every other row
 * this import writes — `brand`, `channel`, `format`, `run`, `trend`, `idea_recipe`, `asset_media`,
 * `gate_request`, `copy_variant`, `metric_snapshot`, `performance_score`, `channel_baseline`,
 * `brand_asset`, `baseline_prompt` — is created as a necessary part of this import but is NOT
 * independently counted here: a category never named on this report cannot be proven complete by it
 * alone, exactly the gap that let 7 real Posts go missing while every counted category still matched
 * exactly. `formatReconciliationMarkdown` states this in prose, not just in this doc comment, so it is
 * visible on the report itself, not only to a reader of this source file.
 *
 * A read-only, diagnostic module — the direct `db.prepare(...)` queries here are COUNTs run purely for
 * reporting, never a write; issue #233's command-surface-write guard is explicitly scoped to writes
 * (its own `proposal.md`: "Scope is writes only, not reads"), so this stays outside that boundary by
 * design, same as `src/db/schema.test.ts`'s own direct-SQL reads.
 *
 * Since issue #243 round 2 (QA round 1's Defect 1), `report.unresolvedPosts` is a THIRD report-only
 * category carried straight through from `plan.unresolvedPosts`, alongside `deadMediaPaths`/
 * `duplicateJobKeys` — a Post whose `post_url` could not be resolved to a specific Channel is named
 * here (never silently dropped) but does NOT block the plan. `Posts in`/`Posts out` above deliberately
 * EXCLUDE these, so the two counts stay meaningful; see `formatReconciliationMarkdown`'s own prose for
 * why that exclusion itself is stated on the report, not just here.
 */

import type { DatabaseSync } from "node:sqlite";

import type { ImportPlan, DeadMediaPathReport, DuplicateJobKeyReport, UnresolvedPostReport } from "./plan.ts";

export interface BrandReconciliation {
  readonly brand: string;
  readonly ideasIn: number;
  readonly ideasOut: number;
  readonly assetsIn: number;
  readonly assetsOut: number;
  readonly jobsIn: number;
  readonly jobsOut: number;
  readonly postsIn: number;
  readonly postsOut: number;
}

export interface ReconciliationTotals {
  readonly ideasIn: number;
  readonly ideasOut: number;
  readonly assetsIn: number;
  readonly assetsOut: number;
  readonly jobsIn: number;
  readonly jobsOut: number;
  readonly postsIn: number;
  readonly postsOut: number;
}

export interface ReconciliationReport {
  readonly generatedAt: string;
  readonly brands: readonly BrandReconciliation[];
  readonly totals: ReconciliationTotals;
  readonly deadMediaPaths: readonly DeadMediaPathReport[];
  readonly duplicateJobKeys: readonly DuplicateJobKeyReport[];
  /** Every Post whose `post_url` could not be resolved to a SPECIFIC Channel (issue #243 round 2 — QA
   *  round 1's Defect 1), carried straight through from `plan.unresolvedPosts`. `Posts in`/`Posts out`
   *  above deliberately EXCLUDE these — see `formatReconciliationMarkdown`'s own prose. */
  readonly unresolvedPosts: readonly UnresolvedPostReport[];
}

function countIn(
  plan: ImportPlan,
  brandSlug: string,
): { readonly ideas: number; readonly assets: number; readonly jobs: number; readonly posts: number } {
  const brandPlan = plan.brands.find((b) => b.slug === brandSlug);
  let ideas = 0;
  let assets = 0;
  let posts = 0;
  if (brandPlan !== undefined) {
    for (const format of brandPlan.formats) {
      for (const run of format.runs) {
        ideas += run.ideas.length;
        for (const idea of run.ideas) {
          assets += idea.assets.length;
          for (const asset of idea.assets) {
            if (asset.postUrl !== undefined) posts++;
          }
        }
      }
    }
  }
  const jobs = plan.jobs.filter((j) => j.brand === brandSlug).length;
  return { ideas, assets, jobs, posts };
}

function countOut(
  db: DatabaseSync,
  brandSlug: string,
): { readonly ideas: number; readonly assets: number; readonly jobs: number; readonly posts: number } {
  const brandRow = db.prepare(`SELECT id FROM brand WHERE slug = ?`).get(brandSlug) as unknown as { readonly id: string } | undefined;
  if (brandRow === undefined) return { ideas: 0, assets: 0, jobs: 0, posts: 0 };
  const ideas = (db.prepare(`SELECT COUNT(*) AS c FROM idea WHERE brand_id = ?`).get(brandRow.id) as unknown as { readonly c: number }).c;
  const assets = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM asset a JOIN idea i ON a.idea_id = i.id WHERE i.brand_id = ?`)
      .get(brandRow.id) as unknown as { readonly c: number }
  ).c;
  const jobs = (db.prepare(`SELECT COUNT(*) AS c FROM job WHERE brand_id = ?`).get(brandRow.id) as unknown as { readonly c: number }).c;
  const posts = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM post p JOIN asset a ON p.asset_id = a.id JOIN idea i ON a.idea_id = i.id WHERE i.brand_id = ?`)
      .get(brandRow.id) as unknown as { readonly c: number }
  ).c;
  return { ideas, assets, jobs, posts };
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
      postsIn: inCounts.posts,
      postsOut: outCounts.posts,
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
      postsIn: acc.postsIn + b.postsIn,
      postsOut: acc.postsOut + b.postsOut,
    }),
    { ideasIn: 0, ideasOut: 0, assetsIn: 0, assetsOut: 0, jobsIn: 0, jobsOut: 0, postsIn: 0, postsOut: 0 },
  );

  return {
    generatedAt: now(),
    brands,
    totals,
    deadMediaPaths: plan.deadMediaPaths,
    duplicateJobKeys: plan.duplicateJobKeys,
    unresolvedPosts: plan.unresolvedPosts,
  };
}

function matchMark(inCount: number, outCount: number): string {
  return inCount === outCount ? "OK" : "MISMATCH";
}

/** Renders `report` as Markdown — suitable for posting on the tracked issue (AC9/AC10) and for
 *  committing alongside the real run (AC11). Extended by issue #240 (AC4) with a Posts in/out column
 *  and a prose section naming exactly what this report does and does not account for. */
export function formatReconciliationMarkdown(report: ReconciliationReport): string {
  const lines: string[] = [];
  lines.push(`# Import reconciliation — ${report.generatedAt}`);
  lines.push("");
  lines.push("Ideas doubles as CONTEXT.md's \"Brief\" count — a Brief is the `idea.brief` column, not a separate table.");
  lines.push("");
  lines.push("| Brand | Ideas (Briefs) in | out | Assets in | out | Jobs in | out | Posts in | out |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const b of report.brands) {
    lines.push(
      `| ${b.brand} | ${b.ideasIn} | ${b.ideasOut} (${matchMark(b.ideasIn, b.ideasOut)}) | ${b.assetsIn} | ${b.assetsOut} (${matchMark(b.assetsIn, b.assetsOut)}) | ${b.jobsIn} | ${b.jobsOut} (${matchMark(b.jobsIn, b.jobsOut)}) | ${b.postsIn} | ${b.postsOut} (${matchMark(b.postsIn, b.postsOut)}) |`,
    );
  }
  lines.push(
    `| **Totals** | **${report.totals.ideasIn}** | **${report.totals.ideasOut}** (${matchMark(report.totals.ideasIn, report.totals.ideasOut)}) | **${report.totals.assetsIn}** | **${report.totals.assetsOut}** (${matchMark(report.totals.assetsIn, report.totals.assetsOut)}) | **${report.totals.jobsIn}** | **${report.totals.jobsOut}** (${matchMark(report.totals.jobsIn, report.totals.jobsOut)}) | **${report.totals.postsIn}** | **${report.totals.postsOut}** (${matchMark(report.totals.postsIn, report.totals.postsOut)}) |`,
  );
  lines.push("");

  lines.push("## What this reconciliation covers, and what it does not (issue #240)");
  lines.push("");
  lines.push(
    "Counted and cross-checked above, per Brand and in total: **Ideas** (doubling as Briefs), **Assets**, " +
      "**Jobs**, and **Posts** (every Asset carrying a ledger `post_url` **that resolved to a SPECIFIC " +
      "Channel** becomes one `post` row, keyed to its Asset and its resolved Channel, ADR-0028).",
  );
  lines.push("");
  lines.push(
    "**`Posts in`/`Posts out` exclude any Post reported below as unresolved (issue #243).** A `post_url` " +
      "that could not be resolved to a specific Channel is never folded into either count — it is named, " +
      "by Brand/Idea/Recipe/URL/reason, in its own **Unresolved Posts** section below, and its Idea/Asset " +
      "still import normally, just without that one `post` row. This keeps the two counts meaningful " +
      "(a genuine executor bug still shows up as a mismatch) while never repeating issue #240's own " +
      "lesson: a category silently excluded from every count, and never named anywhere else either, is " +
      "the exact shape that let 7 real Posts go missing behind an all-green report.",
  );
  lines.push("");
  lines.push(
    "**NOT independently counted here** — created as a necessary part of this import, but their own " +
      "counts are never cross-checked the way the four above are: `brand`, `channel`, `format`, `run`, " +
      "`trend`, `idea_recipe`, `asset_media`, `gate_request`, `copy_variant`, `metric_snapshot`, " +
      "`performance_score`, `channel_baseline`, `brand_asset`, `baseline_prompt`. A category never named " +
      "on this report cannot be proven complete by it alone — the real lesson of issue #240: this same " +
      "table read 61/61, 54/54, 66/66 (all matching) on the run that silently dropped all 7 real Posts, " +
      "because Posts were not a category this report named at all before this change.",
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
  lines.push("");

  lines.push(
    `## Unresolved Posts (${report.unresolvedPosts.length}) — reported for an Operator decision, never silently dropped, never blocking the rest of the plan (issue #243)`,
  );
  lines.push("");
  if (report.unresolvedPosts.length === 0) {
    lines.push("None.");
  } else {
    for (const u of report.unresolvedPosts) {
      lines.push(`- ${u.brand} / ${u.ideaLegacyId} / ${u.recipe}: \`${u.postUrl}\` — ${u.reason}`);
    }
  }

  return lines.join("\n") + "\n";
}
