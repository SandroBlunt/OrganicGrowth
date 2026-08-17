/**
 * `loadBrief` — reads one Idea's Brief markdown content off disk (issue #204).
 *
 * The thin I/O shell over `src/format/brief-path.ts`'s existing, PURE `resolveBriefPathCandidates` —
 * the SAME candidate-path logic `/review-ideas` already models (trust the ledger's own `brief_path`
 * verbatim when present; otherwise try the nested-daily, format-namespaced-flat, then legacy-flat
 * candidates, in that order — the four real folder layouts this ticket's own brief names). This module
 * adds nothing to that resolution logic itself; it only tries each candidate against a real filesystem
 * and returns the first that exists, or the full candidate list when none do (so a refusal can name
 * every path it tried).
 */

import { readFile } from "node:fs/promises";

import { resolveBriefPathCandidates, type SuggestedIdeaRef } from "../format/brief-path.ts";

export type { SuggestedIdeaRef };

/** The outcome of trying to load one Idea's Brief content. */
export type BriefLoadResult =
  | { readonly ok: true; readonly content: string; readonly path: string }
  | { readonly ok: false; readonly candidates: readonly string[] };

function isEnoent(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ENOENT";
}

/**
 * Reads `idea`'s Brief markdown content, trying `resolveBriefPathCandidates`'s ordered candidates in
 * turn and returning the content of the first one that exists. Returns `ok: false` (naming every
 * candidate tried) when none exist, or when `idea.run` is too garbled to produce any candidate at all
 * (e.g. a path-traversal attempt) — never throws.
 */
export async function loadBrief(idea: SuggestedIdeaRef, brand: string, brandsRoot?: string): Promise<BriefLoadResult> {
  const candidates = resolveBriefPathCandidates(idea, brand, brandsRoot);
  for (const candidate of candidates) {
    try {
      const content = await readFile(candidate, "utf8");
      return { ok: true, content, path: candidate };
    } catch (err: unknown) {
      if (isEnoent(err)) continue;
      throw err;
    }
  }
  return { ok: false, candidates };
}
