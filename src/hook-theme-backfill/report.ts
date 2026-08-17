/**
 * `countClassifications` / `formatBackfillReport` — the Hook Type / Theme backfill's report (issue
 * #206): "the job is re-runnable and reports what changed" plus "the counts per hook type and per theme
 * are posted on this issue." Pure formatting, mirroring `src/importer/reconcile.ts`'s
 * `formatReconciliationMarkdown` shape — no disk, no network, no clock.
 */

import type { BackfillPlan } from "./backfill.ts";

// ---------------------------------------------------------------------------
// countClassifications
// ---------------------------------------------------------------------------

export interface BackfillCounts {
  readonly hookType: Readonly<Record<string, number>>;
  readonly theme: Readonly<Record<string, number>>;
}

/** Counts every Idea's CURRENT `hookType`/`theme`, one tally each — the FINAL, post-backfill state
 *  (the orchestration shell passes every committed Idea, patched with any writes this run made), never
 *  merely the Ideas this particular run touched. */
export function countClassifications(ideas: readonly { readonly hookType: string; readonly theme: string }[]): BackfillCounts {
  const hookType: Record<string, number> = {};
  const theme: Record<string, number> = {};
  for (const idea of ideas) {
    hookType[idea.hookType] = (hookType[idea.hookType] ?? 0) + 1;
    theme[idea.theme] = (theme[idea.theme] ?? 0) + 1;
  }
  return { hookType, theme };
}

// ---------------------------------------------------------------------------
// formatBackfillReport
// ---------------------------------------------------------------------------

function formatCountTable(heading: string, counts: Readonly<Record<string, number>>): string[] {
  const lines: string[] = [`## ${heading}`, ""];
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (entries.length === 0) {
    lines.push("None.");
    return lines;
  }
  lines.push("| Value | Count |", "| --- | --- |");
  for (const [value, count] of entries) {
    lines.push(`| \`${value}\` | ${count} |`);
  }
  return lines;
}

/** Renders `plan` (plus the FINAL post-run `counts`) as Markdown — suitable for posting on the tracked
 *  issue (issue #206's own acceptance criterion) and for the Build Report's own summary. */
export function formatBackfillReport(plan: BackfillPlan, counts: BackfillCounts): string {
  const lines: string[] = [];

  lines.push("# Hook Type / Theme backfill report");
  lines.push("");
  lines.push(
    `Updated: **${plan.toUpdate.length}**. Already correct (no-op — a re-run's expected outcome): ` +
      `**${plan.alreadyCorrect.length}**. Reported (does not fit the closed vocabulary — never forced): ` +
      `**${plan.reported.length}**. No matching classification (expected for the 10 headingless Briefs): ` +
      `**${plan.noEntry.length}**.`,
  );
  lines.push("");

  lines.push(`## Updated (${plan.toUpdate.length})`);
  lines.push("");
  if (plan.toUpdate.length === 0) {
    lines.push("None.");
  } else {
    for (const update of plan.toUpdate) {
      lines.push(
        `- **${update.title}** (\`${update.ideaId}\`): hook_type \`${update.before.hookType}\` -> ` +
          `\`${update.after.hookType}\` (${update.after.hookTypeSource}), theme \`${update.before.theme}\` -> ` +
          `\`${update.after.theme}\` (${update.after.themeSource})`,
      );
    }
  }
  lines.push("");

  lines.push(`## Reported (${plan.reported.length}) — genuinely does not fit the closed vocabulary`);
  lines.push("");
  if (plan.reported.length === 0) {
    lines.push("None.");
  } else {
    for (const r of plan.reported) {
      lines.push(`- **${r.title}** (\`${r.ideaId}\`): ${r.reason}`);
    }
  }
  lines.push("");

  lines.push(`## No matching classification (${plan.noEntry.length})`);
  lines.push("");
  if (plan.noEntry.length === 0) {
    lines.push("None.");
  } else {
    for (const n of plan.noEntry) {
      lines.push(`- **${n.title}** (\`${n.ideaId}\`)`);
    }
  }
  lines.push("");

  lines.push(...formatCountTable("Counts per hook_type (final state, every Idea)", counts.hookType));
  lines.push("");
  lines.push(...formatCountTable("Counts per theme (final state, every Idea)", counts.theme));

  return lines.join("\n") + "\n";
}
