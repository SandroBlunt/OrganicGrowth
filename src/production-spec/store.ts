/**
 * Production Spec persistence — the plain-file boundary for
 * `ideas/<run>/idea-NN.<recipe>.spec.json`.
 *
 * The Spec is written as the machine-readable SIBLING of the Brief: for `ideas/<run>/idea-NN.md` the
 * Spec is `ideas/<run>/idea-NN.<recipe>.spec.json` (same short `idea-NN` name, PLUS a Recipe segment —
 * ADR-0011, issue #56), so the Operator can inspect exactly what will drive a render (PRD #1 story 5)
 * and so a second chosen Recipe for the same Idea gets its OWN Spec file rather than overwriting the
 * first Recipe's. Kept thin and separate from the pure logic in `validate.ts` / `generate.ts`; the gate
 * that only valid, brand-safe Specs reach disk lives in the `compose.ts` shell.
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
 */
export function specPathFor(ideaId: string, run: string, ideasRoot: string, recipe: string): string {
  return join(ideasRoot, run, `${briefShortName(ideaId, run)}.${recipe}.spec.json`);
}

/**
 * Write a Production Spec to `path` (pretty-printed, trailing newline); creates the run dir if absent.
 * Uses the shared atomic writer so an interrupted write never leaves a half-written Spec on disk.
 *
 * `spec`'s type widens beyond the wired Recipe's own `ProductionSpec`/`Record<string, unknown>` to
 * `| object` (issue #60) so a DIFFERENT Recipe's own Spec shape (e.g. the News Carousel Recipe's
 * `NewsCarouselSpec` — a plain interface with no index signature) can be saved too; this function only
 * ever serializes it (`JSON.stringify`), never inspects its shape.
 */
export async function saveSpec(
  spec: ProductionSpec | Record<string, unknown> | object,
  path: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFileAtomic(path, JSON.stringify(spec, null, 2) + "\n");
}
