/**
 * `/pick-cast <idea-id> <n>` command — orchestration shell (Gate 2 — Cast pick; ADR-0003 Phase B).
 *
 * Thin: load the Idea's recorded Cast from `data/ledger.json`, select the **nth** Cast member (1-based
 * `<n>`, per the issue) as the chosen **Character**, and report it — recording the Operator's pick so
 * production resumes (the unattended Phase-B render against the live Space is the deferred worker slice;
 * the pure selection + the driver's `pinCharacter`/`pickAndRender` are exercised hermetically).
 *
 * All logic lives in the deep modules (`ledger.ts` for the read, the pure `selectCharacter` here for the
 * 1-based pick). No Magnific, no Apify, no network in this shell. An unknown Idea, an Idea with no Cast,
 * or an out-of-range `<n>` returns an identifiable, non-crashing message — it never invents a Character.
 */

import { loadIdeaCast, type LedgerCastCandidate } from "../ledger/ledger.ts";
import { DEFAULT_LEDGER_PATH } from "../ledger/ledger.ts";
import { enqueueRender } from "../production-queue/queue.ts";
import { loadQueue, saveQueue, DEFAULT_QUEUE_PATH } from "../production-queue/store.ts";

/** The result of selecting a Character from a Cast: the chosen identifier, or an identifiable reason. */
export type SelectResult =
  | { readonly ok: true; readonly character: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Select the **nth** Cast member (1-based `<n>`) as the chosen Character. Pure: indexes into the Idea's
 * `cast` array; the chosen candidate's identifier IS the Character to pin. An out-of-range `n` (or an
 * empty Cast) returns an identifiable reason rather than throwing or inventing a Character.
 */
export function selectCharacter(cast: readonly LedgerCastCandidate[], n: number): SelectResult {
  if (!Number.isInteger(n) || n < 1 || n > cast.length) {
    return {
      ok: false,
      reason: `pick <n> must be between 1 and ${cast.length} (got ${n}); no Character selected.`,
    };
  }
  return { ok: true, character: cast[n - 1]!.identifier };
}

/** Options for `/pick-cast` (injected paths + clock keep the shell testable without ambient I/O). */
export interface PickCastOptions {
  readonly ledgerPath?: string;
  readonly queuePath?: string;
  /** Injected clock for the render job's `enqueued_at`; defaults to now. */
  readonly now?: () => string;
}

/**
 * Produce the `/pick-cast` output string for a given Idea and pick (testable, no printing).
 *
 * Reads the Idea's recorded Cast, selects the Character, and — on a valid pick — **enqueues the render**
 * for that Idea (ADR-0004: "picking a Cast enqueues the render"; idempotent per render job). The Producer
 * worker drains that render against the Space when it is free (the unattended Phase-B render). Never
 * crashes on an unknown Idea, a missing Cast, or an out-of-range pick — and never enqueues a render in
 * those cases (no Character ⇒ no render).
 */
export async function pickCastCommand(
  ideaId: string,
  n: number,
  options: PickCastOptions = {},
): Promise<string> {
  const ledgerPath = options.ledgerPath ?? DEFAULT_LEDGER_PATH;
  const queuePath = options.queuePath ?? DEFAULT_QUEUE_PATH;
  const now = (options.now ?? (() => new Date().toISOString()))();

  const cast = await loadIdeaCast(ideaId, ledgerPath);
  if (cast === null) {
    return `/pick-cast: no Cast recorded for Idea ${ideaId} (is it at the Cast gate?). No Character selected.`;
  }
  const selected = selectCharacter(cast, n);
  if (!selected.ok) {
    return `/pick-cast ${ideaId}: ${selected.reason}`;
  }

  // The Character is picked — enqueue the render so the worker renders it when the Space is free.
  const queue = await loadQueue(queuePath);
  await saveQueue(enqueueRender(queue, ideaId, now), queuePath);

  return `/pick-cast ${ideaId}: picked Cast member ${n} — Character ${selected.character}. Resuming production (render queued).`;
}

/** CLI entry: print the pick result. Only runs when invoked directly (e.g. `npm run pick-cast`). */
async function main(): Promise<void> {
  const [ideaId, nRaw] = process.argv.slice(2);
  if (ideaId === undefined || nRaw === undefined) {
    process.stderr.write("usage: npm run pick-cast <idea-id> <n>\n");
    process.exitCode = 1;
    return;
  }
  const output = await pickCastCommand(ideaId, Number(nRaw), {});
  process.stdout.write(output + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    process.stderr.write(`/pick-cast failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
