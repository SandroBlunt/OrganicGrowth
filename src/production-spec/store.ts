/**
 * Production Spec persistence — the plain-file boundary for `ideas/<run>/idea-NN.spec.json`.
 *
 * The Spec is written as the machine-readable SIBLING of the Brief (`ideas/<run>/idea-NN.md`), so the
 * Operator can inspect exactly what will drive a render (PRD #1 story 5). Kept thin and separate from
 * the pure logic in `validate.ts` / `generate.ts`; the gate that only valid, brand-safe Specs reach
 * disk lives in the `compose.ts` shell.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ProductionSpec } from "./contract.ts";

/** Default root directory holding `ideas/<run>/...`. */
export const DEFAULT_IDEAS_ROOT = "ideas";

/**
 * The on-disk path of a Spec: `<ideasRoot>/<run>/<ideaId>.spec.json` — sitting beside the Brief
 * (`<ideaId>.md`).
 */
export function specPathFor(
  ideaId: string,
  run: string,
  ideasRoot: string = DEFAULT_IDEAS_ROOT,
): string {
  return join(ideasRoot, run, `${ideaId}.spec.json`);
}

/** Write a Production Spec to `path` (pretty-printed, trailing newline); creates the run dir if absent. */
export async function saveSpec(
  spec: ProductionSpec | Record<string, unknown>,
  path: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(spec, null, 2) + "\n", "utf8");
}
