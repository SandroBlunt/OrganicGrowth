/**
 * Production Spec persistence — the plain-file boundary for
 * `ideas/<run>/idea-NN.<recipe>.spec.json`.
 *
 * The Spec is written as the machine-readable SIBLING of the Brief: for `ideas/<run>/idea-NN.md` the
 * Spec is `ideas/<run>/idea-NN.<recipe>.spec.json` (same short `idea-NN` name, PLUS a Recipe segment —
 * ADR-0011, issue #56), so the Operator can inspect exactly what will drive a render (PRD #1 story 5)
 * and so a second chosen Recipe for the same Idea gets its OWN Spec file rather than overwriting the
 * first Recipe's. Kept thin and separate from the pure logic in `validate.ts` / `generate.ts`; the gate
 * that only valid, brand-safe Specs reach disk is `author-at-review.ts`'s `authorSpecForRecipe`
 * (self-checked against `auditAuthorPhase`, at accept time — ADR-0031, issue #264). This module never
 * calls the Recipe's generator/validator/brand-safety scanner itself — it only locates and writes.
 */

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { DatabaseSync } from "node:sqlite";

import type { ProductionSpec } from "./contract.ts";
import { writeFileAtomic } from "../fs/safe-io.ts";
import { assertValidRunId, runPathSegments } from "../format/run-id.ts";
import type { FormatCadence } from "../format/store.ts";

/**
 * Derive a Brief's SHORT on-disk name (`idea-NN`) from its full ledger id (`idea-<run>-NN`).
 *
 * Briefs live on disk as `ideas/<run>/idea-NN.md` (e.g. `idea-01.md`), but the ledger id carries the
 * run (`idea-2026-W22-01`). The Spec must sit BESIDE its Brief as `idea-NN.spec.json`, so we strip the
 * run prefix; if the id is already short (no run prefix), we fall back to the final `-NN` segment. This
 * keeps the derivation idempotent (`idea-01` → `idea-01`).
 *
 * Exported so other Brief-path-deriving modules (e.g. `src/format/brief-path.ts`, issue #53) reuse
 * the SAME id→filename rule instead of re-deriving it.
 */
export function briefShortName(ideaId: string, run: string): string {
  const prefix = `idea-${run}-`;
  const nn = ideaId.startsWith(prefix)
    ? ideaId.slice(prefix.length)
    : ideaId.slice(ideaId.lastIndexOf("-") + 1);
  return `idea-${nn}`;
}

/**
 * The on-disk path of a Spec: `<ideasRoot>/<run>/idea-NN.<recipe>.spec.json` — sitting BESIDE the
 * Brief (`idea-NN.md`), matching the real `data/brands/<slug>/ideas/<run>/` tree. `ideasRoot` is
 * required (there is no ambient default; a bare `"ideas"` root was deliberately removed with the
 * legacy folder). `recipe` is REQUIRED (issue #56): the Recipe segment is what lets two Recipes of one
 * Idea each keep their own Spec file instead of the second overwriting the first (ADR-0011).
 *
 * `run` is validated (`assertValidRunId`, issue #172) BEFORE it is joined into the path — a Run id is
 * untrusted input (a raw `/run-trends <brand> <format> [<run-id>]` CLI argument), so a path-traversal
 * value is rejected here, loudly, before any I/O.
 *
 * `cadence` (ADR-0023, issue #185) decides how `run` itself expands into path segments
 * (`runPathSegments`, `src/format/run-id.ts`) — a `"daily"` Run nests under its ISO week and a
 * weekday-named leaf instead of sitting flat. Defaults to `"weekly"`, so every existing call site
 * (which never knew about cadence) keeps producing the exact same flat path it always has.
 */
export function specPathFor(
  ideaId: string,
  run: string,
  ideasRoot: string,
  recipe: string,
  cadence: FormatCadence = "weekly",
): string {
  assertValidRunId(run);
  return join(ideasRoot, ...runPathSegments(run, cadence), `${briefShortName(ideaId, run)}.${recipe}.spec.json`);
}

/**
 * Write a Production Spec to `path` (pretty-printed, trailing newline); creates the run dir if absent.
 * Uses the shared atomic writer so an interrupted write never leaves a half-written Spec on disk.
 */
export async function saveSpec(
  spec: ProductionSpec | Record<string, unknown>,
  path: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFileAtomic(path, JSON.stringify(spec, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// SQL-backed persistence (issue #222, ADR-0029) — ADDITIVE
// ---------------------------------------------------------------------------
//
// `saveSpec`/`specPathFor` above stay untouched — the file-based Spec sitting beside a Brief is not
// removed by this ticket. SQL-backed, the Production Spec has no table of its own (`src/db/schema.ts`,
// frozen from issue #201): it lives inline as `asset.spec_json`, the SAME column
// `src/asset/store.ts`'s SQL-backed `writeAsset`/`DbAssetPatch.spec` also writes. These two functions
// are a narrower, assetId-keyed sibling for a caller that already has an Asset row id in hand (e.g. the
// author phase, once media exists) and wants to save/load JUST the Spec, without touching status or any
// other Asset field.

/**
 * Writes `spec` onto `asset.spec_json` for the Asset at `assetId`. Throws a clear, actionable error
 * naming the id when no such Asset exists — a genuinely missing Asset id is a caller bug, not an
 * ordinary "nothing to do yet" state (unlike `loadProductionSpec` below, which degrades a missing Asset
 * to "no spec", matching "no spec saved yet").
 */
export function saveProductionSpec(
  db: DatabaseSync,
  assetId: string,
  spec: ProductionSpec | Record<string, unknown>,
  now: () => string = () => new Date().toISOString(),
): void {
  const result = db
    .prepare(`UPDATE asset SET spec_json = ?, updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(spec), now(), assetId);
  if (result.changes === 0) {
    throw new Error(`Asset "${assetId}" not found — cannot save a Production Spec to an Asset that does not exist.`);
  }
}

/**
 * Reads the Production Spec off `asset.spec_json` for the Asset at `assetId`. Returns `null` both when
 * the Asset does not exist AND when it exists but carries no Spec yet — from a caller's point of view
 * both mean "no Spec available" (mirrors `getBrandAsset`'s own found/not-found convention elsewhere in
 * this codebase). Never throws.
 */
export function loadProductionSpec(db: DatabaseSync, assetId: string): ProductionSpec | Record<string, unknown> | null {
  const row = db.prepare(`SELECT spec_json FROM asset WHERE id = ?`).get(assetId) as unknown as
    | { readonly spec_json: string | null }
    | undefined;
  if (row === undefined || row.spec_json === null) return null;
  return JSON.parse(row.spec_json) as ProductionSpec | Record<string, unknown>;
}
