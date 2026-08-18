/**
 * `planImport` — the one-shot importer's deep planning module (issue #204).
 *
 * Reads through the existing loaders (`src/ledger/ledger.ts`'s `loadFullIdeas`, `src/format/store.ts`'s
 * `listFormatSlugs`/`loadFormat`, `src/production-spec/brand-profile.ts`'s `loadZohoConfig`/
 * `loadCopyRules`/`loadWatermarkHandle`, `src/production-queue/store.ts`'s `loadQueue` via
 * `loadQueueStrict`) plus this ticket's own new ones (`loadBrief`, `loadTrendsFile`/`resolveTrendInfo`)
 * and composes them, with `planIdea`, into ONE validated `ImportPlan` — never raw JSON, per this
 * ticket's own constraint.
 *
 * Two-phase design (this module IS phase one): planning NEVER writes to the database. It either
 * produces a complete, valid `ImportPlan` (`ok: true`), or a full list of every problem found across
 * BOTH Brands (`ok: false`) — never a partial write, never a first-problem-wins early exit that would
 * hide a second, unrelated problem from the Operator. `src/importer/execute.ts` (phase two) is the thin
 * orchestration shell that takes an already-validated plan and calls the command surface.
 *
 * A `problems`-worthy condition (AC2 — "anything it cannot parse causes a refusal... never a silent
 * drop") is distinct from the two REPORT-ONLY categories this ticket names explicitly: dead media paths
 * (AC6 — "reported... never silently nulled") and duplicate job identity keys (AC5 — "reported...
 * not resolved by the importer") are collected onto the PLAN itself, not the problem list, and do NOT
 * block a successful plan — they are Operator decisions, not import failures.
 */

import { join } from "node:path";
import { readFile } from "node:fs/promises";

import { loadFullIdeas, countRawIdeaRecords, type FullLedgerIdea } from "../ledger/ledger.ts";
import { resolveBrand } from "../brand/resolver.ts";
import { listFormatSlugs, loadFormat, type FormatCadence, type FormatSourceMode } from "../format/store.ts";
import { loadZohoConfig, loadCopyRules, loadWatermarkHandle, loadChannels } from "../production-spec/brand-profile.ts";
import { KNOWN_PLATFORMS, type KnownPlatform } from "../copy/platform-shape.ts";
import { deriveBrandDisplayFields } from "./brand-fields.ts";
import { loadBrief } from "./load-brief.ts";
import { loadQueueStrict } from "./load-queue-strict.ts";
import { resolveTrendInfo } from "./resolve-trend-info.ts";
import { planIdea, type PlannedIdea, type PlanIdeaDeps } from "./plan-idea.ts";
import { REAL_ASSET_MEDIA_FILE_OPS, type AssetMediaFileOps, type DeadAssetMediaPath } from "./plan-asset-media.ts";
import type { QueueJob } from "../production-queue/queue.ts";

// ---------------------------------------------------------------------------
// Plan shapes
// ---------------------------------------------------------------------------

export interface TrendPlanItem {
  readonly legacyId: string;
  readonly label: string;
  readonly momentum?: number;
  readonly sourceUrls: readonly string[];
}

export interface RunPlanItem {
  readonly runKey: string;
  readonly cadence: FormatCadence;
  readonly startedAt: string;
  readonly trends: readonly TrendPlanItem[];
  readonly ideas: readonly PlannedIdea[];
}

/** One entry on the Brand's `channel` list (`brand-profile.yaml`, ADR-0019), planned as a `channel` row
 *  (issue #240 — the importer never created any before this). `platform` is already validated against
 *  `KNOWN_PLATFORMS` at plan time (a `platform` outside that closed vocabulary is a problem, not a
 *  silently-skipped Channel). */
export interface ChannelPlanItem {
  readonly platform: KnownPlatform;
  readonly url: string;
  readonly isPrimary: boolean;
}

export interface FormatPlanItem {
  readonly slug: string;
  readonly name: string;
  readonly voice: string;
  readonly cadence: FormatCadence;
  readonly ideasPerRun: number;
  readonly sourceMode: FormatSourceMode;
  readonly defaultRecipes: readonly string[];
  readonly runs: readonly RunPlanItem[];
}

export interface BrandPlanItem {
  readonly slug: string;
  readonly name: string;
  readonly timezone: string;
  readonly mediaRoot: string;
  readonly bannedWords: readonly string[];
  readonly requiredCta?: string;
  readonly requiredHashtags: readonly string[];
  readonly watermarkHandle?: string;
  /** This Brand's Channel list (issue #240) — created before any of its Formats/Runs/Ideas/Assets, so
   *  a Post any of its Assets carries always has a real Channel row to key against. `[]` for a Brand
   *  with no `channel` list configured at all (never fabricated). */
  readonly channels: readonly ChannelPlanItem[];
  readonly formats: readonly FormatPlanItem[];
}

export type JobStatusPlan = "queued" | "running" | "awaiting_pick" | "done" | "failed";

export interface JobPlanItem {
  readonly brand: string;
  readonly ideaLegacyId: string;
  readonly recipe: string;
  readonly gate: string | null;
  readonly status: JobStatusPlan;
  readonly enqueuedAt: string;
  readonly pick?: string;
}

export interface DuplicateJobKeyReport {
  readonly brand: string;
  readonly ideaLegacyId: string;
  readonly recipe: string;
  readonly jobs: readonly { readonly gate: string | null; readonly status: string; readonly enqueuedAt: string; readonly pick?: string }[];
}

export interface DeadMediaPathReport {
  readonly brand: string;
  readonly ideaLegacyId: string;
  readonly recipe: string;
  readonly ordinal: number;
  readonly storageKey: string;
}

export interface ImportPlan {
  readonly brands: readonly BrandPlanItem[];
  readonly jobs: readonly JobPlanItem[];
  readonly deadMediaPaths: readonly DeadMediaPathReport[];
  readonly duplicateJobKeys: readonly DuplicateJobKeyReport[];
}

export type PlanResult = { readonly ok: true; readonly plan: ImportPlan } | { readonly ok: false; readonly problems: readonly string[] };

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface PlanImportOptions {
  readonly brandSlugs: readonly string[];
  /**
   * The FIXED historical absolute path prefix baked into legacy `asset_paths` entries (in this repo,
   * always `/Users/CaxtonTaylor/Developer/OrganicGrowth`) — used ONLY to recognize/strip it from an
   * absolute legacy path, never to locate a real file. Required explicitly (never hardcoded/defaulted)
   * so a rehearsal or a future checkout at a different path is never silently assumed.
   */
  readonly legacyAbsolutePrefix: string;
  /** Where THIS run actually reads `data/` from — the real checkout in production, or a rehearsal's
   *  copy. `brandsRoot`/`queuePath` default from this when not given explicitly. */
  readonly checkoutRoot: string;
  readonly brandsRoot?: string;
  readonly queuePath?: string;
  readonly mediaFileOps?: AssetMediaFileOps;
  readonly loadSpec?: (specPath: string) => Promise<Record<string, unknown> | null>;
  readonly now?: () => string;
}

function isEnoent(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ENOENT";
}

/** `spec_path` in the ledger is always root-relative (verified against both real ledgers) — read it
 *  joined against `checkoutRoot`, the SAME real-vs-rehearsal-copy distinction `checkoutRoot` exists for
 *  everywhere else in this module. */
function makeDefaultLoadSpec(checkoutRoot: string): (specPath: string) => Promise<Record<string, unknown> | null> {
  return async (specPath: string): Promise<Record<string, unknown> | null> => {
    try {
      const text = await readFile(join(checkoutRoot, specPath), "utf8");
      const parsed: unknown = JSON.parse(text);
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch (err: unknown) {
      if (isEnoent(err)) return null;
      throw err;
    }
  };
}

// ---------------------------------------------------------------------------
// Format resolution — MundoTip's pre-Format shape (AC4)
// ---------------------------------------------------------------------------

/**
 * Resolves the Format slug `idea` belongs to. When `idea.format` is set, it must match one of
 * `brandFormatSlugs` (a dangling reference is a problem). When absent (MundoTip's pre-Format shape —
 * the ONLY real case this happens in), the Brand's SOLE Format is used, since it is the only Format
 * that could possibly own the record — NOT a guess: a Brand's entire history is that one editorial
 * line. A Brand with zero or more than one Format and an Idea missing `format` is genuinely ambiguous
 * and becomes a problem.
 */
function resolveIdeaFormat(idea: FullLedgerIdea, brandFormatSlugs: readonly string[]): { readonly ok: true; readonly slug: string } | { readonly ok: false; readonly problem: string } {
  if (idea.format !== undefined) {
    if (!brandFormatSlugs.includes(idea.format)) {
      return { ok: false, problem: `Idea "${idea.id}" references unknown Format "${idea.format}" (available: ${brandFormatSlugs.join(", ") || "none"})` };
    }
    return { ok: true, slug: idea.format };
  }
  if (brandFormatSlugs.length === 1) {
    return { ok: true, slug: brandFormatSlugs[0]! };
  }
  return {
    ok: false,
    problem: `Idea "${idea.id}" carries no format and its Brand has ${brandFormatSlugs.length} Formats (${brandFormatSlugs.join(", ") || "none"}) — cannot resolve unambiguously`,
  };
}

/**
 * MundoTip's real ledger names exactly two rejected Ideas whose `trend` field is the literal string
 * `"PROSPECTIVE"` — a documented editorial sentinel (verbatim in both records' `fit_basis`: "PROSPECTIVE
 * / brand-fit-only — NO peer evidence"), never a real Trend id and never resolvable to one. Returns a
 * copy of `idea` with `trendId` (and any inline `trendLabel`) omitted when it is this exact sentinel —
 * everything else passes through unchanged.
 */
const PROSPECTIVE_TREND_SENTINEL = "PROSPECTIVE";

function stripProspectiveSentinel(idea: FullLedgerIdea): FullLedgerIdea {
  if (idea.trendId !== PROSPECTIVE_TREND_SENTINEL) return idea;
  const { trendId: _trendId, trendLabel: _trendLabel, ...rest } = idea;
  return rest;
}

// ---------------------------------------------------------------------------
// One Brand
// ---------------------------------------------------------------------------

interface PlanBrandOptions {
  readonly legacyAbsolutePrefix: string;
  readonly checkoutRoot: string;
  readonly brandsRoot: string;
  readonly mediaFileOps: AssetMediaFileOps;
  readonly loadSpec: (p: string) => Promise<Record<string, unknown> | null>;
  readonly now: () => string;
}

async function planBrand(
  slug: string,
  options: PlanBrandOptions,
): Promise<{ readonly brand?: BrandPlanItem; readonly deadMediaPaths: DeadMediaPathReport[]; readonly problems: string[]; readonly assetIndex: Set<string> }> {
  const problems: string[] = [];
  const deadMediaPaths: DeadMediaPathReport[] = [];
  const assetIndex = new Set<string>(); // "<legacyIdeaId>::<recipe>" for jobs to resolve against

  const paths = resolveBrand(slug, options.brandsRoot);
  const zohoLookup = await loadZohoConfig(paths.brandProfile, slug);
  const displayFields = deriveBrandDisplayFields(zohoLookup, slug);
  const copyRules = await loadCopyRules(paths.brandProfile);
  const watermarkHandle = await loadWatermarkHandle(paths.brandProfile);

  // This Brand's Channel list (issue #240) — resolved and validated BEFORE any Idea/Asset is planned, so
  // a later post_url can be resolved to a SPECIFIC configured Channel (issue #243's `resolvePostChannel`)
  // rather than assumed. A platform outside KNOWN_PLATFORMS is a problem, never a silently-skipped
  // Channel. `channelPlans` itself (not a derived per-platform set) is what a Post resolves against —
  // its ORDER is load-bearing: `executeChannels` creates one `channel` row per entry in this SAME order,
  // so a `postChannelIndex` resolved here stays a valid index at execute time.
  const rawChannels = await loadChannels(paths.brandProfile);
  const channelPlans: ChannelPlanItem[] = [];
  const knownPlatforms: readonly string[] = KNOWN_PLATFORMS;
  for (const channel of rawChannels) {
    if (!knownPlatforms.includes(channel.platform)) {
      problems.push(
        `Brand "${slug}": Channel platform "${channel.platform}" is not a known platform (expected one of ${KNOWN_PLATFORMS.join(", ")})`,
      );
      continue;
    }
    const platform = channel.platform as KnownPlatform;
    channelPlans.push({ platform, url: channel.url, isPrimary: channel.primary });
  }

  const formatSlugs = await listFormatSlugs(slug, options.brandsRoot);
  const fullIdeas = await loadFullIdeas(paths.ledger, slug);

  // QA round 1's Defect 2: loadFullIdeas silently skips a record with no string id (mirrors loadIdeas'
  // own convention) — with no problem raised, so a caller comparing "counts in" against "counts out"
  // could see the two silently agree on the wrong number. countRawIdeaRecords never parses record
  // content (just the raw array's length, via the SAME readLedgerJson loadFullIdeas itself uses), so
  // this check stays inside "read through the existing loader", not a second raw-JSON reader.
  const rawIdeaCount = await countRawIdeaRecords(paths.ledger, slug);
  if (rawIdeaCount !== fullIdeas.length) {
    problems.push(
      `Brand "${slug}": ledger.json's raw ideas array has ${rawIdeaCount} record(s) but loadFullIdeas ` +
        `only returned ${fullIdeas.length} — at least one record was silently dropped (most likely one ` +
        `with no string id) and must be fixed in the source ledger before this import can proceed.`,
    );
  }

  // Group Ideas by resolved Format slug.
  const ideasByFormat = new Map<string, FullLedgerIdea[]>();
  for (const idea of fullIdeas) {
    const resolved = resolveIdeaFormat(idea, formatSlugs);
    if (!resolved.ok) {
      problems.push(resolved.problem);
      continue;
    }
    const bucket = ideasByFormat.get(resolved.slug) ?? [];
    bucket.push(idea);
    ideasByFormat.set(resolved.slug, bucket);
  }

  const formatPlans: FormatPlanItem[] = [];
  for (const formatSlug of formatSlugs) {
    const format = await loadFormat(slug, formatSlug, options.brandsRoot);
    const ideasForFormat = ideasByFormat.get(formatSlug) ?? [];

    // Group by Run key.
    const ideasByRun = new Map<string, FullLedgerIdea[]>();
    for (const idea of ideasForFormat) {
      const runKey = idea.run;
      if (runKey === undefined) {
        problems.push(`Idea "${idea.id}" (Format "${formatSlug}") carries no run — cannot place it into a Run`);
        continue;
      }
      const bucket = ideasByRun.get(runKey) ?? [];
      bucket.push(idea);
      ideasByRun.set(runKey, bucket);
    }

    const runPlans: RunPlanItem[] = [];
    for (const [runKey, rawIdeasForRun] of ideasByRun) {
      // MundoTip records two real, rejected Ideas (idea-09/idea-10 of Run 2026-W22) whose `trend` field
      // is the literal sentinel "PROSPECTIVE" — the idea-strategist's own documented convention for "no
      // peer evidence, brand-fit-only, speculative" (verbatim in both records' own `fit_basis`: "PROSPECTIVE
      // / brand-fit-only — NO peer evidence"). This never names a real Trend and never will — stripped
      // here, at the one place both the Trend-resolution loop and planIdea read `trendId` from, so
      // neither treats it as a dangling reference to refuse over.
      const ideasForRun = rawIdeasForRun.map(stripProspectiveSentinel);

      // Resolve every referenced Trend, in order, before planning any Idea (order Trend creation
      // before Idea creation — a dangling trendId raises a raw FK error by design, issue #228).
      const trendPlans: TrendPlanItem[] = [];
      const seenTrendLegacyIds = new Set<string>();
      for (const idea of ideasForRun) {
        if (idea.trendId === undefined || seenTrendLegacyIds.has(idea.trendId)) continue;
        seenTrendLegacyIds.add(idea.trendId);
        const info = await resolveTrendInfo(idea, slug, options.brandsRoot);
        if (info === null) {
          problems.push(`Idea "${idea.id}" references Trend "${idea.trendId}", which could not be resolved to a label`);
          continue;
        }
        trendPlans.push({ legacyId: idea.trendId, label: info.label, ...(info.momentum !== undefined ? { momentum: info.momentum } : {}), sourceUrls: info.sourceUrls });
      }

      const ideaPlans: PlannedIdea[] = [];
      const deps: PlanIdeaDeps = {
        legacyAbsolutePrefix: options.legacyAbsolutePrefix,
        checkoutRoot: options.checkoutRoot,
        mediaFileOps: options.mediaFileOps,
        loadSpec: options.loadSpec,
        brandChannels: channelPlans,
      };
      for (const idea of ideasForRun) {
        const brief = await loadBrief({ id: idea.id, run: runKey, ...(idea.format !== undefined ? { format: idea.format } : {}), ...(idea.briefPath !== undefined ? { briefPath: idea.briefPath } : {}) }, slug, options.brandsRoot);
        const result = await planIdea({ idea, brief }, deps);
        if (result.idea === undefined) {
          problems.push(...result.problems);
          continue;
        }
        if (result.problems.length > 0) {
          problems.push(...result.problems);
          continue;
        }
        for (const asset of result.idea.assets) {
          assetIndex.add(`${idea.id}::${asset.recipe}`);
          for (const dead of asset.deadMedia as readonly DeadAssetMediaPath[]) {
            deadMediaPaths.push({ brand: slug, ideaLegacyId: idea.id, recipe: asset.recipe, ordinal: dead.ordinal, storageKey: dead.storageKey });
          }
        }
        ideaPlans.push(result.idea);
      }

      const startedAt = ideaPlans.find((i) => i.createdAt !== undefined)?.createdAt ?? options.now();
      runPlans.push({ runKey, cadence: format.cadence, startedAt, trends: trendPlans, ideas: ideaPlans });
    }

    formatPlans.push({
      slug: formatSlug,
      name: format.name,
      voice: format.voice,
      cadence: format.cadence,
      ideasPerRun: format.ideasPerRun,
      sourceMode: format.sources.mode,
      defaultRecipes: format.defaultRecipes,
      runs: runPlans,
    });
  }

  const brand: BrandPlanItem = {
    slug,
    name: displayFields.name,
    timezone: displayFields.timezone,
    mediaRoot: `data/brands/${slug}`,
    bannedWords: copyRules.bannedWords,
    ...(copyRules.requiredCta !== null ? { requiredCta: copyRules.requiredCta } : {}),
    requiredHashtags: copyRules.requiredHashtags,
    ...(watermarkHandle.length > 0 ? { watermarkHandle } : {}),
    channels: channelPlans,
    formats: formatPlans,
  };

  return { brand, deadMediaPaths, problems, assetIndex };
}

// ---------------------------------------------------------------------------
// Jobs (data/queue.json — brand-agnostic, global, issue #204 AC5)
// ---------------------------------------------------------------------------

function jobKey(brand: string, ideaId: string, recipe: string): string {
  return `${brand}::${ideaId}::${recipe}`;
}

function planJobs(
  queueJobs: readonly QueueJob[],
  assetIndexByBrand: ReadonlyMap<string, Set<string>>,
): { readonly jobs: JobPlanItem[]; readonly duplicateJobKeys: DuplicateJobKeyReport[]; readonly problems: string[] } {
  const problems: string[] = [];
  const jobs: JobPlanItem[] = [];
  const groups = new Map<string, QueueJob[]>();

  for (const job of queueJobs) {
    const assetIndex = assetIndexByBrand.get(job.brand);
    const resolvable = assetIndex !== undefined && assetIndex.has(`${job.idea_id}::${job.recipe}`);
    if (!resolvable) {
      problems.push(`Job (brand="${job.brand}", idea_id="${job.idea_id}", recipe="${job.recipe}") does not resolve to any planned Asset`);
      continue;
    }
    jobs.push({ brand: job.brand, ideaLegacyId: job.idea_id, recipe: job.recipe, gate: job.gate, status: job.status, enqueuedAt: job.enqueued_at, ...(job.pick !== undefined ? { pick: job.pick } : {}) });
    const key = jobKey(job.brand, job.idea_id, job.recipe);
    const group = groups.get(key) ?? [];
    group.push(job);
    groups.set(key, group);
  }

  const duplicateJobKeys: DuplicateJobKeyReport[] = [];
  for (const [, group] of groups) {
    if (group.length <= 1) continue;
    const first = group[0]!;
    duplicateJobKeys.push({
      brand: first.brand,
      ideaLegacyId: first.idea_id,
      recipe: first.recipe,
      jobs: group.map((j) => ({ gate: j.gate, status: j.status, enqueuedAt: j.enqueued_at, ...(j.pick !== undefined ? { pick: j.pick } : {}) })),
    });
  }

  return { jobs, duplicateJobKeys, problems };
}

// ---------------------------------------------------------------------------
// planImport — the top-level orchestrator
// ---------------------------------------------------------------------------

export async function planImport(options: PlanImportOptions): Promise<PlanResult> {
  const mediaFileOps = options.mediaFileOps ?? REAL_ASSET_MEDIA_FILE_OPS;
  const loadSpec = options.loadSpec ?? makeDefaultLoadSpec(options.checkoutRoot);
  const now = options.now ?? (() => new Date().toISOString());
  const brandsRoot = options.brandsRoot ?? join(options.checkoutRoot, "data", "brands");

  const problems: string[] = [];
  const brands: BrandPlanItem[] = [];
  const deadMediaPaths: DeadMediaPathReport[] = [];
  const assetIndexByBrand = new Map<string, Set<string>>();

  for (const slug of options.brandSlugs) {
    const result = await planBrand(slug, {
      legacyAbsolutePrefix: options.legacyAbsolutePrefix,
      checkoutRoot: options.checkoutRoot,
      brandsRoot,
      mediaFileOps,
      loadSpec,
      now,
    });
    problems.push(...result.problems);
    deadMediaPaths.push(...result.deadMediaPaths);
    assetIndexByBrand.set(slug, result.assetIndex);
    if (result.brand !== undefined) brands.push(result.brand);
  }

  const queuePath = options.queuePath ?? join(options.checkoutRoot, "data", "queue.json");
  const { state: queueState, warnings: queueWarnings } = await loadQueueStrict(queuePath);
  for (const warning of queueWarnings) {
    problems.push(`data/queue.json: dropped a malformed job — ${warning}`);
  }
  const { jobs, duplicateJobKeys, problems: jobProblems } = planJobs(queueState.jobs, assetIndexByBrand);
  problems.push(...jobProblems);

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return { ok: true, plan: { brands, jobs, deadMediaPaths, duplicateJobKeys } };
}
