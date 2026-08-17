/**
 * Fixture-seeding helpers for the Library's own test suites (issue #210) — NOT a `*.test.ts` file
 * itself (excluded from `npm test`'s glob), but its path contains "test" by the same established
 * convention `src/db/test-support.ts` and `src/db/fixtures/seed-chain.ts` already use, which is what
 * exempts it from BOTH the `node:fs` boundary guard and the store-write boundary guard (`isTestPath`,
 * `path.includes("test")`, in both `src/fs-boundary/scan.ts` and `src/store-write-boundary/scan.ts`) —
 * this file calls several stores' real WRITE functions freely (it IS the fixture that populates them
 * for a test), which would otherwise trip the second guard outside `src/command-surface/`.
 *
 * Richer than `src/db/fixtures/seed-chain.ts` (which this module does not replace or duplicate — it
 * seeds a DIFFERENT shape: several Ideas/Assets/Posts with deliberately varied Hook Type, Theme,
 * Recipe, Format, and Performance Score data, which is what the Library's own read-model/render tests
 * need to prove filtering, sorting, and "tied vs missing score" rendering).
 */

import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { createBrand } from "../brand/store.ts";
import { createChannel } from "../channel/store.ts";
import { createFormat } from "../format/store.ts";
import { createRun } from "../run/store.ts";
import { createIdea, type IdeaInput } from "../idea/store.ts";
import { writeAsset, addAssetMediaBatch, loadIdeaAssets, type DbAssetRecord, type DbAssetPatch } from "../asset/store.ts";
import { recordPost } from "../post/store.ts";
import { recordMetricSnapshot, recordChannelBaseline, recordPerformanceScore } from "../performance/store.ts";
import { upsertCopyVariant } from "../copy/store.ts";
import { createJob, claimJob, releaseJob, type JobStatus, type ReleaseStatus } from "../production-queue/job-store.ts";
import type { HookType } from "../vocabulary/hook-type.ts";
import type { Theme } from "../vocabulary/theme.ts";
import type { KnownPlatform } from "../copy/platform-shape.ts";
import type { AssetStatus } from "../asset/asset.ts";

/** A whole small Brand: one Brand, one primary Facebook Channel, one Format, one Run — the world every
 *  seeded Idea/Asset in a test sits inside. */
export interface SeededWorld {
  readonly db: DatabaseSync;
  readonly brandId: string;
  readonly brandSlug: string;
  readonly channelId: string;
  readonly formatId: string;
  readonly formatSlug: string;
  readonly runId: string;
}

let worldCounter = 0;

/** Seeds one Brand -> Channel -> Format -> Run chain, each call's Brand slug made unique so a test can
 *  seed more than one World in the SAME database (e.g. to prove a cross-Brand/cross-Format filter). */
export function seedWorld(db: DatabaseSync, overrides: { readonly brandSlug?: string; readonly formatSlug?: string } = {}): SeededWorld {
  worldCounter += 1;
  const brandSlug = overrides.brandSlug ?? `test-brand-${worldCounter}`;
  const formatSlug = overrides.formatSlug ?? "unhypped-news";
  const brandId = createBrand(db, { slug: brandSlug, name: "Test Brand", timezone: "UTC", mediaRoot: `data/brands/${brandSlug}` });
  const channelId = createChannel(db, { brandId, platform: "facebook", isPrimary: true });
  const formatId = createFormat(db, { brandId, slug: formatSlug, name: "Unhypped News", voice: "plain" });
  const runId = createRun(db, { brandId, formatId, runKey: "2026-W33", cadence: "weekly", startedAt: "2026-08-10T00:00:00.000Z" });
  return { db, brandId, brandSlug, channelId, formatId, formatSlug, runId };
}

export interface SeedIdeaOptions {
  readonly title?: string;
  readonly hookType?: HookType;
  readonly theme?: Theme;
  readonly fitScore?: number;
}

/** Seeds one Idea inside `world`, `accepted`-equivalent by construction (createIdea always writes
 *  `suggested`, matching every other caller of this store — tests that need `accepted` call
 *  `acceptIdea` themselves; the Library's read-model does not care about Idea status). */
export function seedLibraryIdea(world: SeededWorld, options: SeedIdeaOptions = {}): string {
  const input: IdeaInput = {
    runId: world.runId,
    brandId: world.brandId,
    formatId: world.formatId,
    title: options.title ?? "Test Idea",
    brief: "A brief.",
    hookType: options.hookType ?? "reframe",
    theme: options.theme ?? "product_or_tool",
    ...(options.fitScore !== undefined ? { fitScore: options.fitScore } : {}),
  };
  return createIdea(world.db, input);
}

export interface SeedAssetOptions {
  readonly status?: AssetStatus;
  readonly pendingGate?: string;
  readonly spec?: Record<string, unknown>;
  readonly producedAt?: string;
  readonly mediaCount?: number;
}

/** Seeds one Recipe's Asset for `ideaId`, returning its generated id. */
export async function seedLibraryAsset(
  world: SeededWorld,
  ideaId: string,
  recipe: string,
  options: SeedAssetOptions = {},
): Promise<string> {
  const patch: DbAssetPatch = {
    status: options.status ?? "produced",
    ...(options.pendingGate !== undefined ? { pending_gate: options.pendingGate } : {}),
    ...(options.spec !== undefined ? { spec: options.spec } : {}),
    ...(options.producedAt !== undefined ? { produced_at: options.producedAt } : {}),
  };
  await writeAsset(ideaId, recipe, patch, { db: world.db });
  const assets = (await loadIdeaAssets(ideaId, { db: world.db })) as readonly DbAssetRecord[];
  const assetId = assets.find((a) => a.recipe === recipe)!.id;

  const mediaCount = options.mediaCount ?? 0;
  if (mediaCount > 0) {
    addAssetMediaBatch(
      world.db,
      assetId,
      Array.from({ length: mediaCount }, (_, i) => ({
        ordinal: i,
        kind: "image" as const,
        storageKey: `${world.brandSlug}/${assetId}/${i}.jpg`,
        mime: "image/jpeg",
        bytes: 1000 + i,
        checksum: `checksum-${i}`,
      })),
    );
  }
  return assetId;
}

export interface SeedPostOptions {
  readonly postUrl?: string;
  readonly postedAt?: string;
  readonly platform?: KnownPlatform;
  /** When given, records ONE metric snapshot + ONE Performance Score for this Post (a zero-baseline
   *  Channel + zero metrics yields exactly 0.5 via `computePerformanceScore`'s own documented neutral
   *  rule — mirroring the real 7 straw-motion Posts' true current state: zero engagement, a brand-new
   *  Page). Omit entirely to leave the Post genuinely UNSCORED — the other real state this ticket's
   *  brief calls out ("a score is missing entirely"). */
  readonly score?: number;
}

/** Seeds one Post for `assetId`, optionally with a recorded Performance Score. */
export function seedLibraryPost(world: SeededWorld, assetId: string, options: SeedPostOptions = {}): string {
  const postId = recordPost(world.db, {
    assetId,
    channelId: world.channelId,
    postUrl: options.postUrl ?? `https://facebook.com/p/${randomUUID()}`,
    postedAt: options.postedAt ?? "2026-08-14T10:00:00.000Z",
  });
  if (options.score !== undefined) {
    recordMetricSnapshot(world.db, { postId, capturedAt: "2026-08-15T10:00:00.000Z", reactions: 0, comments: 0, shares: 0, views: 0, source: "apify" });
    const baselineId = recordChannelBaseline(world.db, { channelId: world.channelId, medianReactions: 0, medianComments: 0, medianShares: 0, medianViews: 0, window: "recent" });
    recordPerformanceScore(world.db, { postId, baselineId, score: options.score, computedAt: "2026-08-15T10:00:00.000Z" });
  }
  return postId;
}

export function seedLibraryCopyVariant(world: SeededWorld, assetId: string, caption: string): void {
  upsertCopyVariant(world.db, { assetId, channelId: world.channelId, caption, hashtags: ["#ai"] });
}

/** Seeds one `job` for `assetId`, walking the SAME legal `enqueueJob -> claimJob -> releaseJob`
 *  transitions the real importer/worker use (mirrors `src/importer/execute.ts`'s `executeJob`) —
 *  never a raw SQL write. */
export function seedLibraryJob(
  world: SeededWorld,
  assetId: string,
  targetStatus: JobStatus,
  options: { readonly gate?: string; readonly enqueuedAt?: string } = {},
): string {
  const enqueuedAt = options.enqueuedAt ?? "2026-08-14T09:00:00.000Z";
  const jobId = createJob(world.db, { assetId, brandId: world.brandId, ...(options.gate !== undefined ? { gate: options.gate } : {}) }, () => enqueuedAt);
  if (targetStatus === "queued") return jobId;
  claimJob(world.db, jobId, "test-worker", 60_000, () => enqueuedAt);
  if (targetStatus === "running") return jobId;
  releaseJob(world.db, jobId, targetStatus as ReleaseStatus, () => enqueuedAt);
  return jobId;
}
