/**
 * Select — the thin I/O shell that reads a run's Ideas, scoped to `(format, run)`, off a Brand's raw
 * ledger for the Schedule Batch export (issue #145, parent #140).
 *
 * `src/ledger/ledger.ts`'s `loadIdeas` deliberately does not expose an Idea's `run`/`title` fields
 * (`LedgerIdea` only carries `id`/`status`/`assets`/`recipes`/`format`) — this export needs `run` to
 * scope to exactly one Run, so it reads the raw ledger JSON directly, mirroring `src/asset/store.ts`'s
 * own raw-read style (`isObject` + `Array.isArray` checks, no throw on a garbled record). Every raw
 * record's status/assets is still folded through the SAME `normalizeIdeaStatus` every other ledger
 * reader uses, so a not-yet-migrated (legacy-status) Idea's production data resolves correctly here too.
 */

import { readJsonFile } from "../fs/safe-io.ts";
import { normalizeIdeaStatus } from "../asset/migrate.ts";
import type { ScheduleBatchIdea } from "./eligibility.ts";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEnoent(err: unknown): boolean {
  return isObject(err) && (err as { code?: string }).code === "ENOENT";
}

/** Read + parse a Brand's ledger JSON, turning a missing file into a clear "unknown Brand" error
 *  (mirrors `ledger.ts`'s own `readLedgerJson`) rather than a raw ENOENT stack. */
async function readLedgerRaw(path: string, brand: string): Promise<unknown> {
  try {
    return await readJsonFile(path);
  } catch (err: unknown) {
    if (isEnoent(err)) {
      throw new Error(`unknown Brand "${brand}" (run /queue --all to list Brands).`);
    }
    throw err;
  }
}

/**
 * Read every Idea in `format`'s `run` from the Brand's ledger at `ledgerPath`, normalized to the
 * canonical Asset grain (`normalizeIdeaStatus`). A record with no string `id`, or whose `format`/`run`
 * doesn't match exactly, is left out — never invented, never guessed. A missing ledger throws a clear
 * "unknown Brand" error; a garbled (non-object, or no `ideas` array) ledger returns `[]`.
 */
export async function loadScheduleBatchIdeas(
  ledgerPath: string,
  brand: string,
  format: string,
  run: string,
): Promise<ScheduleBatchIdea[]> {
  const raw = await readLedgerRaw(ledgerPath, brand);
  if (!isObject(raw) || !Array.isArray(raw.ideas)) return [];

  const out: ScheduleBatchIdea[] = [];
  for (const record of raw.ideas) {
    if (!isObject(record)) continue;
    if (typeof record.id !== "string" || record.id.length === 0) continue;
    if (record.format !== format) continue;
    if (record.run !== run) continue;

    const { assets } = normalizeIdeaStatus(record);
    const title = typeof record.title === "string" && record.title.length > 0 ? record.title : record.id;
    out.push({ id: record.id, title, run, format, assets });
  }
  return out;
}
