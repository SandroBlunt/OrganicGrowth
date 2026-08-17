/**
 * Shared test fixture — NOT a `*.test.ts` file (excluded from `npm test`'s glob), imported by
 * `src/production-queue/job-store.test.ts`, `src/production-queue/gate-request-store.test.ts`,
 * `src/production-queue/claim-concurrency.test.ts`, `src/post/store.test.ts`, and
 * `src/performance/store.test.ts` so the brand -> format -> run -> idea -> asset (-> channel) seed
 * chain these SQL-backed stores need is written once, not hand-copied five times. Mirrors
 * `src/asset/db-store.test.ts`'s own `seedIdea` convention. Lives under `src/db/fixtures/` (not any one
 * of its callers' own directories) because it is genuinely cross-cutting — issue #203's own JobStore,
 * GateRequestStore, PostStore, and the Performance time-series stores all sit on top of the SAME
 * brand/format/run/idea/asset chain.
 */

import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { createBrand } from "../../brand/store.ts";
import { createChannel } from "../../channel/store.ts";
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

/** `seedAsset` plus one Facebook Channel on the SAME Brand — what `post`/`metric_snapshot`/
 *  `channel_baseline`/`performance_score` fixtures need on top of an Asset. */
export async function seedAssetAndChannel(
  db: DatabaseSync,
): Promise<{ readonly brandId: string; readonly ideaId: string; readonly assetId: string; readonly channelId: string }> {
  const seeded = await seedAsset(db);
  const channelId = createChannel(db, { brandId: seeded.brandId, platform: "facebook", isPrimary: true });
  return { ...seeded, channelId };
}
