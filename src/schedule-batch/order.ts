/**
 * Order — the shared, pure Idea-number scheduling order both the CSV Schedule Batch export
 * (`src/commands/export-schedule.ts`) and the MCP schedule plan (`src/schedule-batch/mcp-plan.ts`,
 * issue #160) index their slots against.
 *
 * Extracted verbatim (issue #160) from `export-schedule.ts`, where it was previously private — so both
 * consumers always schedule the SAME Idea in the SAME position for the SAME (Asset, run) input, rather
 * than risking two independently-drifting sort implementations that could hand the same batch two
 * different orderings depending on which path (CSV or MCP) happens to run it.
 */

import { briefShortName } from "../production-spec/store.ts";
import type { EligibleAsset } from "./eligibility.ts";

/** The numeric `NN` suffix of an eligible Asset's Idea (via `briefShortName`'s `idea-NN` short name),
 *  or `Number.MAX_SAFE_INTEGER` for an unparseable id — pushed to the end rather than crashing. */
export function ideaSortKey(ideaId: string, run: string): number {
  const shortName = briefShortName(ideaId, run);
  const match = /-(\d+)$/.exec(shortName);
  return match !== null ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/** Sort eligible Assets into a deterministic, narrative production order (idea-01, idea-02, ...) — the
 *  order a derived schedule's one-Asset-per-day rotation is indexed against. PURE: never mutates
 *  `eligible`, and the same input always returns deep-equal output. */
export function sortEligible(eligible: readonly EligibleAsset[], run: string): EligibleAsset[] {
  return [...eligible].sort((a, b) => ideaSortKey(a.ideaId, run) - ideaSortKey(b.ideaId, run));
}
