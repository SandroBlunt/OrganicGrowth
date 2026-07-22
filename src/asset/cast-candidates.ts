/**
 * Cast-candidate local download — a gate-scoped sibling of `output-bundle.ts`'s produced-Asset bundle
 * (issue #119).
 *
 * Before this slice, a Recipe's gated first leg (today: the wired *Character Explainer with Cast*
 * Recipe's Cast run-point, `Recipe.space.nodes.castRunPoint`) rendered its candidates and the Producer
 * recorded them on the ledger's `LedgerCastCandidate` as `{ identifier, url }` ONLY — no local file was
 * ever downloaded. The Operator had to be handed a raw, login-gated, expiring Magnific URL to review a
 * candidate before picking. This module extends the SAME pattern `output-bundle.ts`'s `outputDirFor` /
 * `src/asset/download.ts`'s `downloadAssetFiles` already established for a produced Asset's FINAL
 * media, to a Recipe's PRE-gate candidates:
 *
 *   - `castCandidatesDirFor` — a folder-naming function parallel to `outputDirFor`, reusing the SAME
 *     `briefShortName` id/run/recipe convention, with `.cast` in place of `.output`/`.spec.json` — a
 *     distinctly-named sibling directory, never mistaken for the final Asset's own bundle.
 *   - `downloadCastCandidates` — downloads every candidate's image via the SAME `downloadAssetFiles`
 *     primitive the Save phase already uses, and returns each candidate ready to record on the ledger
 *     with its local `path` set alongside its existing `identifier`/`url`.
 *
 * "Cast" names this generically: `Recipe.space.nodes.castRunPoint`, `LedgerCastCandidate`, and
 * `fetchCast` (`src/space-driver/driver.ts`) already use this vocabulary for ANY Recipe's gated first
 * leg with multiple candidates, not only the wired *Character Explainer with Cast* Recipe (CONTEXT.md:
 * "Cast" is that ONE Recipe's own product-facing vocabulary; the codebase's `cast*` identifiers are the
 * generic MECHANISM name for the same shape any future gated Recipe would reuse). Both functions here
 * take a `recipe` slug as an explicit parameter — never hard-coded to one Recipe — mirroring
 * `outputDirFor`'s own genericity.
 *
 * This module has NO dependency on the Space driver (`src/space-driver/`) — it downloads whatever
 * `(identifier, url)` pairs it is given, exactly like `download.ts` itself takes no Space dependency.
 */

import { join } from "node:path";
import { briefShortName } from "../production-spec/store.ts";
import { downloadAssetFiles, type AssetDownloadTarget } from "./download.ts";
import type { LedgerCastCandidate } from "./asset.ts";

// ---------------------------------------------------------------------------
// castCandidatesDirFor — the folder-naming function, parallel to outputDirFor
// ---------------------------------------------------------------------------

/**
 * The on-disk directory a Recipe's rendered gate candidates download into:
 * `<ideasRoot>/<run>/idea-NN.<recipe>.cast` — a sibling of the Brief (`idea-NN.md`), the Spec
 * (`idea-NN.<recipe>.spec.json`), and the eventual produced Asset's own bundle
 * (`idea-NN.<recipe>.output/`) — mirroring `src/production-spec/store.ts`'s `specPathFor`/
 * `briefShortName` id/run/recipe convention exactly (reusing `briefShortName`, never re-deriving it),
 * with the `.cast` suffix in place of `.spec.json`/`.output`, so it is never mistaken for either.
 */
export function castCandidatesDirFor(ideaId: string, run: string, ideasRoot: string, recipe: string): string {
  return join(ideasRoot, run, `${briefShortName(ideaId, run)}.${recipe}.cast`);
}

// ---------------------------------------------------------------------------
// castCandidateFilename — a stable, readable filename per candidate
// ---------------------------------------------------------------------------

/** One raw candidate as the Space driver returns it (`src/space-driver/port.ts`'s `Creation` shares
 *  this exact shape) — kept as its own narrow type so this module has no dependency on the driver. */
export interface CastCandidateSource {
  readonly identifier: string;
  readonly url: string;
}

const DEFAULT_CANDIDATE_EXTENSION = ".png";

/** Best-effort URL pathname for extension-guessing; a malformed/relative `url` falls back to itself
 *  rather than throwing (this is a filename hint, never a correctness-critical parse). */
function urlPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** Guess a candidate's file extension from its URL's own path (stripping any query/hash first via
 *  `urlPathname`), defaulting to `.png` when none is recognizable — every Cast candidate rendered
 *  today is a still image, and a wrong/missing extension is cosmetic, never a correctness issue. */
function guessExtension(url: string): string {
  const match = /\.([a-zA-Z0-9]{1,5})$/.exec(urlPathname(url));
  return match ? `.${match[1]}` : DEFAULT_CANDIDATE_EXTENSION;
}

/**
 * A stable, readable local filename for one candidate: its 1-based order among the candidate set, then
 * its own creation identifier (already a short, filesystem-safe token — this generic module has no
 * Recipe-specific concept/style metadata to name it by), and a guessed extension. `index` is supplied
 * by the caller (never inferred from array position alone) so a candidate's filename is stable even if
 * the caller re-orders or filters between calls.
 */
export function castCandidateFilename(index: number, candidate: CastCandidateSource): string {
  return `${index}-${candidate.identifier}${guessExtension(candidate.url)}`;
}

// ---------------------------------------------------------------------------
// downloadCastCandidates — download + zip into ledger-ready LedgerCastCandidate records
// ---------------------------------------------------------------------------

/**
 * Download every rendered gate candidate's image into `destDir` — via the SAME `downloadAssetFiles`
 * primitive a produced Asset's final media already uses, so a failure mode (a non-OK response, a
 * network error) behaves identically here: sequential, and it throws naming the failed candidate on the
 * FIRST failure rather than silently recording some candidates with a local path and others without
 * (never a half-downloaded Cast). Returns the candidates ready to record on the ledger: `identifier`/
 * `url` unchanged, `path` set to the just-downloaded durable local file, in the SAME order as
 * `candidates`.
 *
 * Recipe- and gate-generic: takes no Recipe slug or gate name of its own — the caller already resolved
 * `destDir` (via `castCandidatesDirFor`) for whichever Recipe/gate this candidate set belongs to.
 */
export async function downloadCastCandidates(
  destDir: string,
  candidates: readonly CastCandidateSource[],
  fetchImpl: typeof fetch = fetch,
): Promise<readonly LedgerCastCandidate[]> {
  const targets: readonly AssetDownloadTarget[] = candidates.map((candidate, i) => ({
    url: candidate.url,
    filename: castCandidateFilename(i + 1, candidate),
  }));
  const downloaded = await downloadAssetFiles(destDir, targets, fetchImpl);
  return candidates.map((candidate, i) => ({
    identifier: candidate.identifier,
    url: candidate.url,
    path: downloaded[i]!.path,
  }));
}
