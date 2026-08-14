/**
 * News Short Script -> Camera Hub glue (issue #189,
 * `docs/adr/0027-producer-offers-camera-hub-teleprompter-upload.md`) — the ONE place this whole feature
 * is scoped to the `news-short-script` Recipe (ADR-0027: "Scoped to the `news-short-script` Recipe
 * only... not built as a generic hook for any Recipe"). Everything else under `src/camera-hub/` is
 * Recipe-agnostic (a plain teleprompter-library primitive); this module is where that primitive meets
 * THIS Recipe's own Asset shape.
 *
 * Two independent, PURE responsibilities:
 *
 *   - `selectUnuploadedNewsShortScripts` — the sweep: given a Brand's WHOLE ledger (every Run, every
 *     Format — no `run`/`format` scoping at all), which `news-short-script` Assets have NOT yet been
 *     uploaded to Camera Hub (ADR-0027: "sweeps ALL un-uploaded... Assets, not only ones just produced
 *     [this Run]" — no silent drops).
 *   - `outputDirFromSpecPath` / `stripNextShotMarkers` — turning ONE swept Asset's own recorded
 *     `spec_path` into the `script.txt` body text Camera Hub's library actually wants (its
 *     `[Next shot]` document marker stripped — CONTEXT.md "Shot List": that marker is "never spoken, a
 *     document marker only").
 *
 * The actual file read (`script.txt` off disk) is the thin I/O shell's job
 * (`src/commands/upload-camera-hub-scripts.ts`) — this module stays pure and disk-free.
 */

import type { AssetStatus, LedgerAssetRecord } from "../asset/asset.ts";
import { NEXT_SHOT_MARKER } from "../asset/news-short-script-output.ts";

/** The one Recipe this whole feature is scoped to (ADR-0027). */
export const SUPPORTED_RECIPE = "news-short-script";

/** An Asset in either of these stages has not been produced yet — its `script.txt` does not exist yet
 *  (the Space-less Save phase, which writes it, only runs once an Asset reaches `produced`). */
const NOT_YET_PRODUCED: ReadonlySet<AssetStatus> = new Set(["queued", "in_production"]);

/** The narrow Idea shape the sweep needs — avoids importing `LedgerIdea`/the ledger I/O module into
 *  this pure file. `src/ledger/ledger.ts`'s `LedgerIdea` already satisfies this shape structurally. */
export interface CameraHubIdea {
  readonly id: string;
  readonly assets?: readonly LedgerAssetRecord[];
}

/** One swept, not-yet-uploaded `news-short-script` Asset, paired with its owning Idea's id. */
export interface CameraHubSweepAsset {
  readonly ideaId: string;
  readonly asset: LedgerAssetRecord;
}

/**
 * Every `news-short-script` Asset across `ideas` that has NOT yet been uploaded to Camera Hub. Eligible
 * = `recipe === SUPPORTED_RECIPE` AND produced-or-later (not `queued`/`in_production`) AND no
 * `camera_hub_uploaded_at` yet. Deliberately NOT scoped to any one Run/Format — a leftover Asset from
 * an earlier Run is swept exactly the same as one produced this session (ADR-0027's "no silent drops").
 * PURE: no I/O, no clock.
 */
export function selectUnuploadedNewsShortScripts(
  ideas: readonly CameraHubIdea[],
): readonly CameraHubSweepAsset[] {
  const out: CameraHubSweepAsset[] = [];
  for (const idea of ideas) {
    for (const asset of idea.assets ?? []) {
      if (asset.recipe !== SUPPORTED_RECIPE) continue;
      if (NOT_YET_PRODUCED.has(asset.status)) continue;
      if (asset.camera_hub_uploaded_at !== undefined) continue;
      out.push({ ideaId: idea.id, asset });
    }
  }
  return out;
}

/**
 * The output bundle directory a `news-short-script` Asset's `script.txt` lives in, derived from its OWN
 * recorded `spec_path` — never reconstructed from the Idea/Run/Format (mirrors GEMINI.md's "a recorded
 * `brief_path`/`spec_path` is canonical" rule). `specPathFor` (`src/production-spec/store.ts`) and
 * `outputDirFor` (`src/asset/output-bundle.ts`) name these as siblings by construction —
 * `idea-NN.<recipe>.spec.json` next to `idea-NN.<recipe>.output` — so a plain suffix swap is exact, not
 * a guess.
 */
export function outputDirFromSpecPath(specPath: string, recipe: string): string {
  const suffix = `.${recipe}.spec.json`;
  if (specPath.endsWith(suffix)) {
    return `${specPath.slice(0, -suffix.length)}.${recipe}.output`;
  }
  // Defensive fallback for an unexpected (e.g. legacy) suffix shape — still best-effort, never throws.
  return specPath.replace(/\.spec\.json$/, ".output");
}

/**
 * Recover the plain, blank-line-paragraph body text `splitChapters` (`chapters.ts`) expects from a
 * produced `script.txt` (`scriptText`, `src/asset/news-short-script-output.ts`): strip the document-only
 * `NEXT_SHOT_MARKER` block between beats, leaving exactly the original beats' paragraphs, still
 * separated by blank lines. Never touches a beat's own spoken words.
 */
export function stripNextShotMarkers(scriptText: string): string {
  const markerBlock = `\n\n${NEXT_SHOT_MARKER}\n\n`;
  return scriptText.split(markerBlock).join("\n\n");
}
