/**
 * Shared test fixture — NOT a `*.test.ts` file (excluded from `npm test`'s glob), imported by
 * `job-store.test.ts`, `gate-request-store.test.ts`, and `claim-concurrency.test.ts` so the
 * brand -> format -> run -> idea -> asset seed chain a `job` row needs is written once, not
 * hand-copied three times. Mirrors `src/asset/db-store.test.ts`'s own `seedIdea` convention.
 */

import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { createBrand } from "../../brand/store.ts";
import { createFormat } from "../../format/store.ts";
import { HOOK_TYPES } from "../../vocabulary/hook-type.ts";
import { THEMES } from "../../vocabulary/theme.ts";
import { writeAsset, loadIdeaAssets, type DbAssetRecord } from "../../asset/store.ts";

const VALID_HOOK_TYPE = HOOK_TYPES[0]!.value;
const VALID_THEME = THEMES[0]!.value;

/** The one Recipe slug every fixture Asset in this module is produced through. */
export const FIXTURE_RECIPE = "character-explainer-with-cast";

/** Seeds brand -> format -> run -> idea -> asset, returning the ids a `job` row needs. */
export async function seedAsset(
  db: DatabaseSync,
): Promise<{ readonly brandId: string; readonly ideaId: string; readonly assetId: string }> {
  const brandId = createBrand(db, {
    slug: `straw-motion-${randomUUID()}`,
    name: "Straw Motion",
    timezone: "UTC",
    mediaRoot: "data/brands/straw-motion",
  });
  const formatId = createFormat(db, { brandId, slug: "unhypped-news", name: "Unhypped News", voice: "plain" });
  const runId = randomUUID();
  const ideaId = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO run (id, brand_id, format_id, run_key, cadence, started_at, created_at, updated_at)
     VALUES (?, ?, ?, '2026-W33', 'weekly', ?, ?, ?)`,
  ).run(runId, brandId, formatId, now, now, now);
  db.prepare(
    `INSERT INTO idea (id, run_id, brand_id, format_id, title, brief, status, hook_type, theme, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Test Idea', 'A brief.', 'accepted', ?, ?, ?, ?)`,
  ).run(ideaId, runId, brandId, formatId, VALID_HOOK_TYPE, VALID_THEME, now, now);
  await writeAsset(ideaId, FIXTURE_RECIPE, { status: "queued" }, { db });
  const assets = (await loadIdeaAssets(ideaId, { db })) as readonly DbAssetRecord[];
  return { brandId, ideaId, assetId: assets[0]!.id };
}
