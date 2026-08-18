/**
 * `executeImport` — the one-shot importer's phase-two orchestration shell (issue #204).
 *
 * Takes an ALREADY-VALIDATED `ImportPlan` (`src/importer/plan.ts`'s `planImport`, called first — this
 * module never validates anything itself) and writes it, in dependency order, entirely through the
 * typed command surface (`src/command-surface/`) — never a store directly. Order matters: Brand before
 * Format before Run before Trend before Idea (a dangling `trendId` raises a raw FK error by design,
 * issue #228) before Asset before its media; every queue Job is created last, once every Asset it could
 * possibly reference already has a real, resolvable id.
 *
 * A thin orchestration shell, not a deep module: it holds no decision logic of its own (every decision —
 * what status an Idea resolves to, which media survive, which jobs are duplicates — was already made by
 * `planImport`). Its only job is walking the plan and calling the right command-surface function with
 * the right arguments, in the right order, tracking the legacy-id -> real-id maps a later step needs
 * (a Trend's legacy id to resolve an Idea's `trendId`; a `(brand, legacyIdeaId, recipe)` triple to
 * resolve a Job's `assetId`).
 */

import type { DatabaseSync } from "node:sqlite";

import {
  createBrand,
  createFormat,
  createRun,
  createChannel,
  createTrend,
  createIdea,
  recordReviewDecision,
  saveAsset,
  attachAssetMedia,
  getAssetByRecipe,
  logPost,
  enqueueJob,
  claimJob,
  releaseJob,
  type ReleaseStatus,
  type DbAssetPatch,
} from "../command-surface/index.ts";
import type { ImportPlan, BrandPlanItem, FormatPlanItem, RunPlanItem, ChannelPlanItem, JobStatusPlan } from "./plan.ts";
import type { HookType } from "../vocabulary/hook-type.ts";
import type { Theme } from "../vocabulary/theme.ts";

/** Every imported Idea is classified `unclassified` for BOTH `hook_type` and `theme` (issue #219's own
 *  purpose, per this ticket's own decision recorded in `handoff.md`): the real Hook Type/Theme backfill
 *  over the 51 readable Briefs is issue #206's job, not this one's. `unclassified` stays a real, honest,
 *  queryable closed-vocabulary member — never a guess dressed up as a classification. */
const UNCLASSIFIED_HOOK_TYPE: HookType = "unclassified";
const UNCLASSIFIED_THEME: Theme = "unclassified";

/** How long an importer-owned job claim is leased for before it would become reclaimable — irrelevant
 *  in practice (the import finishes the claim/release pair synchronously, well inside this window), but
 *  `claimJob` requires a real value. */
const IMPORTER_JOB_LEASE_MS = 60_000;
const IMPORTER_JOB_OWNER = "importer";

export interface ExecuteCounts {
  readonly brands: number;
  readonly channels: number;
  readonly formats: number;
  readonly runs: number;
  readonly trends: number;
  readonly ideas: number;
  readonly assets: number;
  readonly assetMedia: number;
  readonly posts: number;
  readonly jobs: number;
}

function assetKey(brand: string, legacyIdeaId: string, recipe: string): string {
  return `${brand}::${legacyIdeaId}::${recipe}`;
}

/** Creates every Channel this Brand's Profile named (issue #240), BEFORE any Format/Run/Idea/Asset — so
 *  a later Asset's Post always has a real Channel row to key against. Returns the created `channel.id`s
 *  in the SAME order as `channelPlans` — a plain array, not a `platform -> id` map (issue #243: a map
 *  keyed by platform alone silently collapses two Channels on the same platform to whichever was
 *  created last; an Asset's `postChannelIndex` — resolved at plan time by `resolvePostChannel` — is an
 *  index into THIS array, so it always names the one specific Channel it resolved to). */
function executeChannels(db: DatabaseSync, brandId: string, channelPlans: readonly ChannelPlanItem[], now: () => string): readonly string[] {
  const channelIds: string[] = [];
  for (const channelPlan of channelPlans) {
    channelIds.push(createChannel(db, { brandId, platform: channelPlan.platform, url: channelPlan.url, isPrimary: channelPlan.isPrimary }, now));
  }
  return channelIds;
}

async function executeBrand(
  db: DatabaseSync,
  brandPlan: BrandPlanItem,
  now: () => string,
  assetIdByKey: Map<string, string>,
): Promise<{
  readonly brandId: string;
  readonly channels: number;
  readonly formats: number;
  readonly runs: number;
  readonly trends: number;
  readonly ideas: number;
  readonly assets: number;
  readonly assetMedia: number;
  readonly posts: number;
}> {
  const brandId = createBrand(
    db,
    {
      slug: brandPlan.slug,
      name: brandPlan.name,
      timezone: brandPlan.timezone,
      mediaRoot: brandPlan.mediaRoot,
      bannedWords: brandPlan.bannedWords,
      requiredHashtags: brandPlan.requiredHashtags,
      ...(brandPlan.requiredCta !== undefined ? { requiredCta: brandPlan.requiredCta } : {}),
      ...(brandPlan.watermarkHandle !== undefined ? { watermarkHandle: brandPlan.watermarkHandle } : {}),
    },
    now,
  );

  const channelIds = executeChannels(db, brandId, brandPlan.channels, now);

  let formats = 0;
  let runs = 0;
  let trends = 0;
  let ideas = 0;
  let assets = 0;
  let assetMedia = 0;
  let posts = 0;

  for (const formatPlan of brandPlan.formats) {
    const formatId = executeFormat(db, brandId, formatPlan, now);
    formats++;

    for (const runPlan of formatPlan.runs) {
      const runResult = await executeRun(db, brandId, formatId, brandPlan.slug, runPlan, now, assetIdByKey, channelIds);
      runs++;
      trends += runResult.trends;
      ideas += runResult.ideas;
      assets += runResult.assets;
      assetMedia += runResult.assetMedia;
      posts += runResult.posts;
    }
  }

  return { brandId, channels: brandPlan.channels.length, formats, runs, trends, ideas, assets, assetMedia, posts };
}

function executeFormat(db: DatabaseSync, brandId: string, formatPlan: FormatPlanItem, now: () => string): string {
  return createFormat(
    db,
    {
      brandId,
      slug: formatPlan.slug,
      name: formatPlan.name,
      voice: formatPlan.voice,
      cadence: formatPlan.cadence,
      ideasPerRun: formatPlan.ideasPerRun,
      sourceMode: formatPlan.sourceMode,
      defaultRecipes: formatPlan.defaultRecipes,
    },
    now,
  );
}

async function executeRun(
  db: DatabaseSync,
  brandId: string,
  formatId: string,
  brandSlug: string,
  runPlan: RunPlanItem,
  now: () => string,
  assetIdByKey: Map<string, string>,
  channelIds: readonly string[],
): Promise<{ readonly trends: number; readonly ideas: number; readonly assets: number; readonly assetMedia: number; readonly posts: number }> {
  const runId = createRun(db, { brandId, formatId, runKey: runPlan.runKey, cadence: runPlan.cadence, startedAt: runPlan.startedAt }, now);

  const trendIdByLegacyId = new Map<string, string>();
  for (const trendPlan of runPlan.trends) {
    const trendId = createTrend(
      db,
      { runId, label: trendPlan.label, sourceUrls: trendPlan.sourceUrls, ...(trendPlan.momentum !== undefined ? { momentum: trendPlan.momentum } : {}) },
      now,
    );
    trendIdByLegacyId.set(trendPlan.legacyId, trendId);
  }

  let assets = 0;
  let assetMedia = 0;
  let posts = 0;
  for (const ideaPlan of runPlan.ideas) {
    const ideaCreatedAt = ideaPlan.createdAt;
    const ideaNow = ideaCreatedAt !== undefined ? () => ideaCreatedAt : now;
    const trendId = ideaPlan.trendLegacyId !== undefined ? trendIdByLegacyId.get(ideaPlan.trendLegacyId) : undefined;

    const ideaId = createIdea(
      db,
      {
        runId,
        brandId,
        formatId,
        title: ideaPlan.title,
        brief: ideaPlan.brief,
        hookType: UNCLASSIFIED_HOOK_TYPE,
        theme: UNCLASSIFIED_THEME,
        sourceUrls: ideaPlan.sourceUrls,
        // The file ledger's own Idea id (issue #254, migration 5) — the real, per-Brand-unique identity
        // a LATER accept-flow re-sync (`src/production-queue/sql-sync.ts`) correlates this row back to,
        // instead of the earlier `(run_id, title)` natural key that could silently merge two distinct
        // Ideas sharing one title.
        legacyRef: ideaPlan.legacyId,
        ...(trendId !== undefined ? { trendId } : {}),
        ...(ideaPlan.fitScore !== undefined ? { fitScore: ideaPlan.fitScore } : {}),
      },
      ideaNow,
    );

    if (ideaPlan.status === "accepted") {
      recordReviewDecision(db, ideaId, { outcome: "accepted", recipes: ideaPlan.recipeSelections }, now);
    } else if (ideaPlan.status === "rejected") {
      // planIdea already refused any rejected Idea with no rejection_reason — this is always set here.
      recordReviewDecision(db, ideaId, { outcome: "rejected", rejectionReason: ideaPlan.rejectionReason! }, now);
    }

    for (const assetPlan of ideaPlan.assets) {
      const patch: DbAssetPatch = {
        status: assetPlan.status,
        ...(assetPlan.pendingGate !== undefined ? { pending_gate: assetPlan.pendingGate } : {}),
        ...(assetPlan.spec !== undefined ? { spec: assetPlan.spec } : {}),
        ...(assetPlan.producedAt !== undefined ? { produced_at: assetPlan.producedAt } : {}),
        ...(assetPlan.scheduledAt !== undefined ? { scheduled_at: assetPlan.scheduledAt } : {}),
        ...(assetPlan.cameraHubUploadedAt !== undefined ? { camera_hub_uploaded_at: assetPlan.cameraHubUploadedAt } : {}),
        ...(assetPlan.zohoScheduleReference !== undefined ? { zoho_schedule_reference: assetPlan.zohoScheduleReference } : {}),
      };
      await saveAsset(db, ideaId, assetPlan.recipe, patch);
      assets++;

      const saved = await getAssetByRecipe(db, ideaId, assetPlan.recipe);
      if (saved === null) {
        throw new Error(`Internal error: saveAsset for Idea "${ideaId}" Recipe "${assetPlan.recipe}" did not produce a readable Asset row.`);
      }
      assetIdByKey.set(assetKey(brandSlug, ideaPlan.legacyId, assetPlan.recipe), saved.id);

      if (assetPlan.media.length > 0) {
        attachAssetMedia(
          db,
          saved.id,
          assetPlan.media.map((m) => ({ ordinal: m.ordinal, kind: m.kind, storageKey: m.storageKey, mime: m.mime, bytes: m.bytes, checksum: m.checksum })),
          now,
        );
        assetMedia += assetPlan.media.length;
      }

      if (assetPlan.postUrl !== undefined) {
        // `postChannelIndex` names a SPECIFIC Channel (issue #243) — an index into `channelIds`, itself
        // built in the exact same order as `brandPlan.channels`/`channelPlans` (`executeChannels`'s own
        // doc comment). Never a `platform -> id` lookup: that shape is exactly what silently collapsed
        // two Channels on the same platform before this ticket.
        const channelId = assetPlan.postChannelIndex !== undefined ? channelIds[assetPlan.postChannelIndex] : undefined;
        if (channelId === undefined) {
          throw new Error(
            `Internal error: Idea "${ideaId}" Asset "${assetPlan.recipe}" resolved to Channel index ${assetPlan.postChannelIndex} (platform "${assetPlan.postPlatform}") but Brand "${brandSlug}" has no created Channel there — planImport should have refused this plan.`,
          );
        }
        logPost(db, { assetId: saved.id, channelId, postUrl: assetPlan.postUrl, postedAt: assetPlan.postedAt! }, now);
        posts++;
      }
    }
  }

  return { trends: trendIdByLegacyId.size, ideas: runPlan.ideas.length, assets, assetMedia, posts };
}

const RELEASE_STATUSES: ReadonlySet<JobStatusPlan> = new Set<JobStatusPlan>(["awaiting_pick", "done", "failed"]);

/**
 * Creates one `job` row at exactly `targetStatus`, by walking the SAME legal transitions a real
 * production run would (`enqueueJob` -> `claimJob` -> `releaseJob`) — never a raw SQL write. Verified
 * against real `data/queue.json`: every real job today is `queued` or `done`; `running`/`awaiting_pick`/
 * `failed` are handled for completeness (the schema allows them) but not exercised by real data.
 */
function executeJob(
  db: DatabaseSync,
  assetId: string,
  brandId: string,
  gate: string | null,
  targetStatus: JobStatusPlan,
  enqueuedAt: string,
  now: () => string,
): void {
  const enqueuedNow = (): string => enqueuedAt;
  const jobId = enqueueJob(db, { assetId, brandId, ...(gate !== null ? { gate } : {}) }, enqueuedNow);
  if (targetStatus === "queued") return;

  const claimed = claimJob(db, jobId, IMPORTER_JOB_OWNER, IMPORTER_JOB_LEASE_MS, now);
  if (claimed === null) {
    throw new Error(`Internal error: could not claim freshly-enqueued job "${jobId}" to advance it to "${targetStatus}".`);
  }
  if (targetStatus === "running") return;

  if (RELEASE_STATUSES.has(targetStatus)) {
    releaseJob(db, jobId, targetStatus as ReleaseStatus, now);
  }
}

/**
 * Writes an already-validated `ImportPlan` to `db`, entirely through the typed command surface, in
 * dependency order. Returns the counts of every entity actually written — the "counts out" half of this
 * ticket's own reconciliation (`src/importer/reconcile-report.ts` builds the full report).
 */
export async function executeImport(db: DatabaseSync, plan: ImportPlan, now: () => string = () => new Date().toISOString()): Promise<ExecuteCounts> {
  const assetIdByKey = new Map<string, string>();
  const brandIdBySlug = new Map<string, string>();

  let channels = 0;
  let formats = 0;
  let runs = 0;
  let trends = 0;
  let ideas = 0;
  let assets = 0;
  let assetMedia = 0;
  let posts = 0;

  for (const brandPlan of plan.brands) {
    const result = await executeBrand(db, brandPlan, now, assetIdByKey);
    brandIdBySlug.set(brandPlan.slug, result.brandId);
    channels += result.channels;
    formats += result.formats;
    runs += result.runs;
    trends += result.trends;
    ideas += result.ideas;
    assets += result.assets;
    assetMedia += result.assetMedia;
    posts += result.posts;
  }

  let jobs = 0;
  for (const jobPlan of plan.jobs) {
    const brandId = brandIdBySlug.get(jobPlan.brand);
    const assetId = assetIdByKey.get(assetKey(jobPlan.brand, jobPlan.ideaLegacyId, jobPlan.recipe));
    if (brandId === undefined || assetId === undefined) {
      throw new Error(
        `Internal error: job for (brand="${jobPlan.brand}", idea="${jobPlan.ideaLegacyId}", recipe="${jobPlan.recipe}") has no resolvable Brand/Asset — planImport should have refused this plan.`,
      );
    }
    executeJob(db, assetId, brandId, jobPlan.gate, jobPlan.status, jobPlan.enqueuedAt, now);
    jobs++;
  }

  return { brands: plan.brands.length, channels, formats, runs, trends, ideas, assets, assetMedia, posts, jobs };
}
