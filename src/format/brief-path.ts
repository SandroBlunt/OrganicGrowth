/**
 * Brief-path resolution for `/review-ideas` — where a `status: suggested` Idea's brief actually
 * lives on disk.
 *
 * QA Round 1 (issue #53) found that resolving a Brief path purely from `ideas/<Idea.format>/<run>/`
 * breaks on real, already-suggested Ideas whose `format` field still carries the PRE-SLICE
 * media-sense value (e.g. `"reel"`) and whose Brief was written to the OLD, non-namespaced path —
 * `data/brands/straw-motion/ledger.json`'s 7 pending `2026-W29` Ideas are exactly this case. The
 * fix: the ledger's own `brief_path` (when present) is the ledger's VERBATIM, canonical record of
 * where that Idea's Brief actually is (ledger-as-source-of-truth, always-rules #7) — it is trusted
 * exclusively over any reconstructed path. Only when a record has no `brief_path` at all (very old
 * or hand-authored records) do we reconstruct a path, preferring the Format-namespaced shape (the
 * current, post-slice convention) and falling back to the legacy Brand-level shape.
 *
 * PURE (no I/O): returns an ORDERED list of candidate paths — `[briefPath]` when the ledger already
 * recorded one, else `[formatNamespacedNestedDaily?, formatNamespacedFlat?, legacy]` — so a caller
 * (the `/review-ideas` prompt, or a test) tries each in order and uses the first that exists on disk.
 * This module does not perform that existence check itself: it only computes the candidates, matching
 * every other pure module in this repo (I/O stays in a thin shell one layer up).
 *
 * **The nested-daily candidate (ADR-0023, issue #185).** A daily Run's Brief actually lives under a
 * nested `<ISO-week>/<weekday>-<DD>-<month>/` leaf, not flat under `<run>/`. This module has no I/O
 * (it never loads the owning Format file), so it can't know a given Idea's Format `cadence` directly —
 * instead it recognizes a daily-SHAPED Run id structurally (`isDailyRunIdShape`, `./run-id.ts`: a
 * genuine `YYYY-MM-DD` calendar date, the only shape `defaultRunId` ever produces for a daily Run) and
 * only then adds the nested candidate. A weekly Run id (`2026-W32`) never matches that shape, so a
 * weekly Format's candidate list is completely unaffected — still exactly `[flat, legacy]`.
 */

import { join } from "node:path";

import { resolveBrand } from "../brand/resolver.ts";
import { briefShortName } from "../production-spec/store.ts";
import { formatIdeasRoot } from "./store.ts";
import { isValidRunId, isDailyRunIdShape, runPathSegments } from "./run-id.ts";

/** The subset of a ledger Idea record `resolveBriefPath` needs. */
export interface SuggestedIdeaRef {
  /** The ledger record's own `id` (e.g. `"idea-01"` or `"idea-2026-W22-01"`). */
  readonly id: string;
  /** The Run this Idea was suggested in (e.g. `"2026-W29"`). */
  readonly run: string;
  /**
   * The ledger record's own `format` field, if present. May be a real Format slug (post-slice
   * records) OR a stale pre-slice media-sense value (e.g. `"reel"`) on older records — this module
   * does NOT assume it is trustworthy on its own; see the module doc above.
   */
  readonly format?: string | null;
  /**
   * The ledger record's own `brief_path`, if present — the VERBATIM, authoritative path to this
   * Idea's Brief. When set, it is trusted exclusively (ledger-as-source-of-truth).
   */
  readonly briefPath?: string | null;
}

/** True for a non-empty, non-whitespace-only string. */
function nonEmpty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Return the ORDERED list of candidate Brief paths for `idea`, most-trusted first.
 *
 *   1. `idea.briefPath`, verbatim, if present — the ledger's own record of where the Brief is.
 *      Returned as the ONLY candidate (the ledger is canonical; no need to second-guess it).
 *   2. Otherwise, if `idea.format` is set: the nested-daily Format-namespaced path (ADR-0023 — ONLY
 *      when `idea.run` is daily-SHAPED, see module doc above), then the flat Format-namespaced path
 *      `data/brands/<brand>/ideas/<format>/<run>/idea-NN.md` (today's convention for a weekly Run),
 *      then the legacy Brand-level path as a final fallback candidate.
 *   3. Otherwise (no `format` either): just the legacy Brand-level path
 *      `data/brands/<brand>/ideas/<run>/idea-NN.md`.
 *
 * PURE: no filesystem access; NEVER throws. `idea.run` is validated (`isValidRunId`, issue #172)
 * before being joined into any reconstructed candidate — a garbled/path-traversal `run` (e.g. from
 * a hand-edited ledger record) degrades to `[]` (no reconstructed candidate at all) rather than
 * returning a dangerous path, mirroring how a garbled `format` already degrades to skipping the
 * Format-namespaced candidates below. The caller tries each returned candidate in order and uses the
 * first that exists.
 */
export function resolveBriefPathCandidates(
  idea: SuggestedIdeaRef,
  brand: string,
  brandsRoot?: string,
): string[] {
  if (nonEmpty(idea.briefPath)) {
    return [idea.briefPath.trim()];
  }

  if (!isValidRunId(idea.run)) {
    return [];
  }

  const shortName = briefShortName(idea.id, idea.run);
  const legacyPath = join(resolveBrand(brand, brandsRoot).ideasRoot, idea.run, `${shortName}.md`);

  if (nonEmpty(idea.format)) {
    // Defensive (data-handling rule 4): a hand-edited/garbled `format` value (not a valid slug)
    // must never crash this resolver — `formatIdeasRoot` throws on an invalid slug, so guard it and
    // just skip straight to the legacy candidate instead of propagating the throw.
    try {
      const formatRoot = formatIdeasRoot(brand, idea.format.trim(), brandsRoot);
      const formatNamespacedPath = join(formatRoot, idea.run, `${shortName}.md`);
      const candidates: string[] = [];
      if (isDailyRunIdShape(idea.run)) {
        // ADR-0023: a genuinely daily-shaped Run id (YYYY-MM-DD) may have been written under the
        // nested week+weekday leaf — try that FIRST, since it's the current convention going
        // forward for any Run this shape actually belongs to.
        candidates.push(join(formatRoot, ...runPathSegments(idea.run, "daily"), `${shortName}.md`));
      }
      candidates.push(formatNamespacedPath, legacyPath);
      return candidates;
    } catch {
      return [legacyPath];
    }
  }

  return [legacyPath];
}
