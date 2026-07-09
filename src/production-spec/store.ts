/**
 * Production Spec persistence — the plain-file boundary for `ideas/<run>/idea-NN.spec.json`.
 *
 * The Spec is written as the machine-readable SIBLING of the Brief: for `ideas/<run>/idea-NN.md` the
 * Spec is `ideas/<run>/idea-NN.spec.json` (same short `idea-NN` name), so the Operator can inspect
 * exactly what will drive a render (PRD #1 story 5). Kept thin and separate from the pure logic in
 * `validate.ts` / `generate.ts`; the gate that only valid, brand-safe Specs reach disk lives in the
 * `compose.ts` shell.
 */

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ProductionSpec } from "./contract.ts";
import { writeFileAtomic } from "../fs/safe-io.ts";

/**
 * Derive a Brief's SHORT on-disk name (`idea-NN`) from its full ledger id (`idea-<run>-NN`).
 *
 * Briefs live on disk as `ideas/<run>/idea-NN.md` (e.g. `idea-01.md`), but the ledger id carries the
 * run (`idea-2026-W22-01`). The Spec must sit BESIDE its Brief as `idea-NN.spec.json`, so we strip the
 * run prefix; if the id is already short (no run prefix), we fall back to the final `-NN` segment. This
 * keeps the derivation idempotent (`idea-01` → `idea-01`).
 */
function briefShortName(ideaId: string, run: string): string {
  const prefix = `idea-${run}-`;
  const nn = ideaId.startsWith(prefix)
    ? ideaId.slice(prefix.length)
    : ideaId.slice(ideaId.lastIndexOf("-") + 1);
  return `idea-${nn}`;
}

/**
 * The on-disk path of a Spec: `<ideasRoot>/<run>/idea-NN.spec.json` — sitting BESIDE the Brief
 * (`idea-NN.md`), matching the real `data/brands/<slug>/ideas/<run>/` tree. `ideasRoot` is required
 * (there is no ambient default; a bare `"ideas"` root was deliberately removed with the legacy folder).
 */
export function specPathFor(ideaId: string, run: string, ideasRoot: string): string {
  return join(ideasRoot, run, `${briefShortName(ideaId, run)}.spec.json`);
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
