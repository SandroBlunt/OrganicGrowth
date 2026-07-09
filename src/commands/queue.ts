/**
 * `/queue [<brand>]` command — orchestration shell.
 *
 * Thin: load the global Production Queue from `data/queue.json`, render it with the pure formatter,
 * print. All logic lives in the deep modules (`store.ts`, `render.ts`). No Magnific, no Apify, no
 * network — this slice is queue plumbing only.
 *
 * The global queue is brand-agnostic (ADR-0004, ADR-0006): one lock, one queue, shared across all
 * Brands. The `<brand>` argument, when supplied, filters the output to that Brand's jobs only. When
 * omitted (or `--all`), all jobs across all Brands are shown. Each job line now includes its Brand
 * label so the Operator can see which Brand each job belongs to (AC6, issue #21).
 */

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadQueue, DEFAULT_QUEUE_PATH } from "../production-queue/store.ts";
import { formatQueue } from "../production-queue/format.ts";

/** Produce the `/queue` output string for a given queue file (testable, no printing). */
export async function queueCommand(
  brandFilter?: string,
  queuePath: string = DEFAULT_QUEUE_PATH,
): Promise<string> {
  const state = await loadQueue(queuePath);
  return formatQueue(state, brandFilter);
}

/**
 * Map the first CLI positional to a brand filter (pure, so it is unit-testable — C49):
 * no arg or the explicit `--all` sentinel → show all Brands (`undefined`); anything else is a
 * Brand slug to filter by.
 */
export function resolveBrandFilter(brandArg: string | undefined): string | undefined {
  return brandArg === undefined || brandArg === "--all" ? undefined : brandArg;
}

/** CLI entry: print the queue. Only runs when invoked directly (e.g. `npm run queue`). */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const brandFilter = resolveBrandFilter(args[0]);
  const output = await queueCommand(brandFilter);
  process.stdout.write(output + "\n");
}

// C41: compare resolved paths, not a hand-built `file://` string — the latter breaks on paths with
// spaces (percent-encoded in `import.meta.url`) or symlinks, silently making a direct run a no-op.
const entryPoint = process.argv[1];
if (entryPoint !== undefined && fileURLToPath(import.meta.url) === resolve(entryPoint)) {
  main().catch((err: unknown) => {
    process.stderr.write(`/queue failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
