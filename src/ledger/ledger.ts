/**
 * Ledger reader — minimal, read-only view of `data/ledger.json` for this slice.
 *
 * The ledger is the source of truth (always-rules #7, ADR-0002). This slice only *reads* it (to
 * enforce that only `accepted` Ideas enter the Production Queue); later Producer slices add the
 * ledger-updater that writes status transitions. Defensive on parse: unknown shapes never crash a
 * Run.
 */

import { readFile } from "node:fs/promises";

/** The Idea lifecycle states the ledger uses. */
export type IdeaStatus =
  | "suggested"
  | "accepted"
  | "casting"
  | "produced"
  | "posted"
  | "tracking"
  | "scored"
  | "rejected";

/** The subset of an Idea record this slice needs. */
export interface LedgerIdea {
  readonly id: string;
  readonly status: string;
}

/** Default on-disk location of the ledger. */
export const DEFAULT_LEDGER_PATH = "data/ledger.json";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Read the ledger's Idea records (defensive: missing/garbled fields are skipped). */
export async function loadIdeas(path: string = DEFAULT_LEDGER_PATH): Promise<LedgerIdea[]> {
  const raw: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isObject(raw) || !Array.isArray(raw.ideas)) return [];
  return raw.ideas
    .filter(isObject)
    .filter((r) => typeof r.id === "string" && typeof r.status === "string")
    .map((r) => ({ id: r.id as string, status: r.status as string }));
}

/** Find one Idea by id, or null if absent. */
export function findIdea(ideas: readonly LedgerIdea[], ideaId: string): LedgerIdea | null {
  return ideas.find((i) => i.id === ideaId) ?? null;
}
