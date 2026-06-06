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

import { loadQueue, DEFAULT_QUEUE_PATH } from "../production-queue/store.ts";
import { renderQueue } from "../production-queue/render.ts";

/** Produce the `/queue` output string for a given queue file (testable, no printing). */
export async function queueCommand(
  brandFilter?: string,
  queuePath: string = DEFAULT_QUEUE_PATH,
): Promise<string> {
  const state = await loadQueue(queuePath);
  return renderQueue(state, brandFilter);
}

/** CLI entry: print the queue. Only runs when invoked directly (e.g. `npm run queue`). */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  // --all or no arg → show all; otherwise treat the arg as a brand filter.
  const brandArg = args[0];
  const brandFilter = brandArg === undefined || brandArg === "--all" ? undefined : brandArg;
  const output = await queueCommand(brandFilter);
  process.stdout.write(output + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    process.stderr.write(`/queue failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
