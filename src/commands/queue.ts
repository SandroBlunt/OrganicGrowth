/**
 * `/queue` command — orchestration shell.
 *
 * Thin: load the Production Queue from `data/queue.json`, render it with the pure formatter, print.
 * All logic lives in the deep modules (`store.ts`, `render.ts`). No Magnific, no Apify, no network —
 * this slice is queue plumbing only.
 */

import { loadQueue, DEFAULT_QUEUE_PATH } from "../production-queue/store.ts";
import { renderQueue } from "../production-queue/render.ts";

/** Produce the `/queue` output string for a given queue file (testable, no printing). */
export async function queueCommand(queuePath: string = DEFAULT_QUEUE_PATH): Promise<string> {
  const state = await loadQueue(queuePath);
  return renderQueue(state);
}

/** CLI entry: print the queue. Only runs when invoked directly (e.g. `npm run queue`). */
async function main(): Promise<void> {
  const output = await queueCommand();
  process.stdout.write(output + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    process.stderr.write(`/queue failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
