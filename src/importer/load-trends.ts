/**
 * `parseTrendsFile` / `loadTrendsFile` — a Run's `trends.json` reader (issue #204).
 *
 * No pre-existing TypeScript module reads a Run's `trends.json` today (it is authored/read by the
 * `trend-scout` model-prompting Skill, never by a code module) — this is genuinely NEW parsing logic,
 * not a bypass of an existing loader. Both Brands' real files share the SAME shape (`id`, `label`,
 * `momentum`, `evidence: [{ url, ... }]` — MundoTip's evidence entries additionally carry `page`/
 * `overperformance`/`text`, Straw Motion's carry `source`; neither is read here, only `url`).
 *
 * `is_paywalled`/`platform` are deliberately NOT read here: no real `trends.json` carries either field
 * (both are new, #201/#219 schema concepts with no legacy on-disk representation) — the importer commits
 * every imported Trend at `isPaywalled: false` (see this ticket's `handoff.md`), never guessed from
 * prose.
 */

import { readFile } from "node:fs/promises";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** One legacy Trend record, as read from a Run's `trends.json`. */
export interface LegacyTrendRecord {
  readonly id: string;
  readonly label: string;
  readonly momentum?: number;
  readonly sourceUrls: readonly string[];
}

function parseSourceUrls(evidenceRaw: unknown): string[] {
  if (!Array.isArray(evidenceRaw)) return [];
  const urls: string[] = [];
  for (const entry of evidenceRaw) {
    if (isObject(entry) && nonEmptyString(entry.url) && !urls.includes(entry.url)) {
      urls.push(entry.url);
    }
  }
  return urls;
}

/**
 * PURE. Parses a Run's already-JSON-parsed `trends.json` body into `LegacyTrendRecord[]`. Requires a
 * non-empty `id` and `label`; drops any entry missing either (never crashes the whole file over one bad
 * entry — data-handling rule 4). Non-array input yields `[]`.
 */
export function parseTrendsFile(raw: unknown): LegacyTrendRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: LegacyTrendRecord[] = [];
  for (const entry of raw) {
    if (!isObject(entry)) continue;
    if (!nonEmptyString(entry.id) || !nonEmptyString(entry.label)) continue;
    const momentum = typeof entry.momentum === "number" && Number.isFinite(entry.momentum) ? entry.momentum : undefined;
    out.push({
      id: entry.id,
      label: entry.label,
      ...(momentum !== undefined ? { momentum } : {}),
      sourceUrls: parseSourceUrls(entry.evidence),
    });
  }
  return out;
}

function isEnoent(err: unknown): boolean {
  return isObject(err) && (err as { code?: string }).code === "ENOENT";
}

/** Reads + parses `path` (a Run's `trends.json`). A missing file loads as `[]` (a Run predating trend
 *  tracking, or simply not yet scanned) — never throws for ENOENT; a genuine parse failure propagates. */
export async function loadTrendsFile(path: string): Promise<LegacyTrendRecord[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err: unknown) {
    if (isEnoent(err)) return [];
    throw err;
  }
  return parseTrendsFile(JSON.parse(text));
}
