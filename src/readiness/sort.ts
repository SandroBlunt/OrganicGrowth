/**
 * Deterministic finding sorter — shared by classify and checkConfig.
 *
 * Sort order (ascending):
 *   1. Phase: 'research' < 'production' < 'publish'
 *   2. Severity within phase: 'block' before 'advisory'
 *   3. Code within same phase+severity: alphabetical (stable tie-break)
 *
 * Pure: no I/O. Takes a Finding[] and returns a new sorted array (does not mutate input).
 */

import type { Finding, FindingPhase } from "./types.ts";

const PHASE_ORDER: Record<FindingPhase, number> = {
  research: 0,
  production: 1,
  publish: 2,
};

// 'block' sorts before 'advisory' (lower number = earlier)
const SEVERITY_ORDER = { block: 0, advisory: 1 } as const;

/** Return a new array of findings sorted deterministically. */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const phaseDiff = PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase];
    if (phaseDiff !== 0) return phaseDiff;

    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;

    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  });
}
