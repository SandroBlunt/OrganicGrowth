/**
 * `planIdea` — plans one loader-normalized ledger Idea (`FullLedgerIdea`, `src/ledger/ledger.ts`'s
 * importer-facing projection) into everything the executor needs to create its `idea`/`idea_recipe`/
 * `asset`/`asset_media` rows (issue #204).
 *
 * Composes the importer's smaller pure/injectable modules into one per-Idea decision:
 * `resolveIdeaStatus` (the SQL `idea.status` value, including Straw Motion's third shape),
 * `extractSourceUrls` (the Brief's real citations), and `planAssetMedia` (per-Asset media rows) — plus
 * this module's own new logic: recipe-selection shaping and Spec-file loading.
 *
 * A missing Brief is the ONE thing this module treats as an outright refusal (AC2: "anything it cannot
 * parse causes a refusal... never a silent drop") — every real Idea has a Brief; one that cannot be
 * found names every candidate path tried. A missing/dead Spec file, by contrast, is NOT a refusal: it
 * degrades to `spec: undefined` on that Asset (the `asset.spec_json` column is nullable — there is
 * nothing structurally invalid about an Asset whose Spec was never saved, e.g. one still `queued`), so
 * this module never blocks an otherwise-good Idea over a Recipe leg that never got that far.
 *
 * Neither I/O dependency is hardcoded: `mediaFileOps`/`loadSpec` are both injected (`PlanIdeaDeps`),
 * defaulting to real `node:fs` behaviour in `src/importer/plan.ts`, the orchestrator — this module
 * itself never imports `node:fs` directly, keeping it fast and deterministic to test.
 */

import type { FullLedgerIdea, FullLedgerDeclinedRecipe } from "../ledger/ledger.ts";
import type { AssetStatus, ZohoScheduleReference, LedgerAssetRecord } from "../asset/asset.ts";
import type { KnownPlatform } from "../copy/platform-shape.ts";
import { extractSourceUrls } from "./source-urls.ts";
import { resolveIdeaStatus, type CanonicalIdeaStatus } from "./idea-status.ts";
import { planAssetMedia, type AssetMediaFileOps, type PlannedAssetMediaItem, type DeadAssetMediaPath } from "./plan-asset-media.ts";
import { resolvePostPlatform } from "./resolve-post-platform.ts";

export type { CanonicalIdeaStatus };

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** The Brief-load outcome, matching `src/importer/load-brief.ts`'s `BriefLoadResult` shape exactly —
 *  kept as a plain structural type here so this module has no import-time dependency on that one
 *  (the orchestrator resolves the Brief and hands the RESULT in, never the loading itself). */
export type BriefInput = { readonly ok: true; readonly content: string } | { readonly ok: false; readonly candidates: readonly string[] };

export interface PlanIdeaInput {
  readonly idea: FullLedgerIdea;
  readonly brief: BriefInput;
}

export interface PlanIdeaDeps {
  /** The FIXED historical absolute path prefix baked into legacy `asset_paths` entries — see
   *  `plan-asset-media.ts`'s own doc comment for why this is distinct from `checkoutRoot`. */
  readonly legacyAbsolutePrefix: string;
  /** Where THIS run actually reads media files from (the real checkout, or a rehearsal's copy). */
  readonly checkoutRoot: string;
  readonly mediaFileOps: AssetMediaFileOps;
  /** Reads one Asset's Spec file, returning its parsed JSON body, or `null` when the path is missing/
   *  unreadable (never a refusal — see this module's own doc comment). */
  readonly loadSpec: (specPath: string) => Promise<Record<string, unknown> | null>;
  /** The platforms THIS Brand actually has a configured Channel for (`src/importer/plan.ts`'s own
   *  `planBrand`, reading `brand-profile.yaml`'s `channel` list via `loadChannels`) — issue #240. An
   *  Asset's `post_url` resolves to a platform purely from its own hostname
   *  (`resolvePostPlatform`); that resolved platform is then checked against THIS set, never assumed. */
  readonly brandChannelPlatforms: ReadonlySet<KnownPlatform>;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface PlannedRecipeSelection {
  readonly recipe: string;
  readonly chosen: boolean;
  readonly declineReason?: string;
}

export interface PlannedAsset {
  readonly recipe: string;
  readonly status: AssetStatus;
  readonly pendingGate?: string;
  readonly spec?: Record<string, unknown>;
  readonly producedAt?: string;
  readonly scheduledAt?: string;
  readonly cameraHubUploadedAt?: string;
  readonly zohoScheduleReference?: ZohoScheduleReference;
  /** The three fields present ONLY when the source Asset carried a `post_url` (issue #240) — an Asset
   *  with none of them produces no `post` row at execute time (AC3). `postPlatform` is the Channel
   *  platform `postUrl` resolved to (`resolvePostPlatform`), already checked against the Brand's own
   *  configured Channels — `executeImport` trusts it rather than re-resolving. */
  readonly postUrl?: string;
  readonly postedAt?: string;
  readonly postPlatform?: KnownPlatform;
  readonly media: readonly PlannedAssetMediaItem[];
  readonly deadMedia: readonly DeadAssetMediaPath[];
}

export interface PlannedIdea {
  readonly legacyId: string;
  readonly title: string;
  readonly brief: string;
  readonly status: CanonicalIdeaStatus;
  readonly rejectionReason?: string;
  readonly trendLegacyId?: string;
  readonly fitScore?: number;
  readonly sourceUrls: readonly string[];
  readonly recipeSelections: readonly PlannedRecipeSelection[];
  readonly assets: readonly PlannedAsset[];
  readonly createdAt?: string;
}

export interface PlanIdeaResult {
  readonly idea?: PlannedIdea;
  readonly problems: readonly string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function planRecipeSelections(
  recipes: readonly string[] | undefined,
  declinedRecipes: readonly FullLedgerDeclinedRecipe[] | undefined,
): PlannedRecipeSelection[] {
  const out: PlannedRecipeSelection[] = [];
  for (const recipe of recipes ?? []) {
    out.push({ recipe, chosen: true });
  }
  for (const declined of declinedRecipes ?? []) {
    out.push({ recipe: declined.recipe, chosen: false, declineReason: declined.reason });
  }
  return out;
}

interface PlanOneAssetResult {
  readonly asset: PlannedAsset;
  readonly problems: readonly string[];
}

/**
 * Resolves an Asset's `post_url`/`posted_at` into the three `PlannedAsset` Post fields (issue #240), or
 * a named problem — never a silent drop, mirroring `planAssetMedia`'s own refusal discipline. Returns
 * `{}` (no problem) for an Asset carrying no `post_url` at all — AC3's "no Post row" case.
 */
function planAssetPost(
  asset: LedgerAssetRecord,
  ideaId: string,
  brandChannelPlatforms: ReadonlySet<KnownPlatform>,
): { readonly fields: Pick<PlannedAsset, "postUrl" | "postedAt" | "postPlatform">; readonly problem?: string } {
  if (asset.post_url === undefined) return { fields: {} };

  const label = `Idea "${ideaId}" Asset "${asset.recipe}"`;
  if (asset.posted_at === undefined) {
    return { fields: {}, problem: `${label}: has post_url ("${asset.post_url}") but no posted_at — cannot create a Post row without a real timestamp` };
  }

  const platform = resolvePostPlatform(asset.post_url);
  if (platform === null) {
    return { fields: {}, problem: `${label}: post_url "${asset.post_url}" does not resolve to any known platform` };
  }
  if (!brandChannelPlatforms.has(platform)) {
    const configured = [...brandChannelPlatforms].join(", ") || "none";
    return {
      fields: {},
      problem: `${label}: post_url "${asset.post_url}" resolves to platform "${platform}", which this Brand has no configured Channel for (configured: ${configured})`,
    };
  }

  return { fields: { postUrl: asset.post_url, postedAt: asset.posted_at, postPlatform: platform } };
}

async function planOneAsset(asset: LedgerAssetRecord, ideaId: string, deps: PlanIdeaDeps): Promise<PlanOneAssetResult> {
  const mediaResult = await planAssetMedia(asset.asset_paths ?? [], deps.legacyAbsolutePrefix, deps.checkoutRoot, deps.mediaFileOps);
  const spec = asset.spec_path !== undefined ? await deps.loadSpec(asset.spec_path) : null;
  const postResult = planAssetPost(asset, ideaId, deps.brandChannelPlatforms);
  const planned: PlannedAsset = {
    recipe: asset.recipe,
    status: asset.status,
    ...(asset.pending_gate !== undefined ? { pendingGate: asset.pending_gate } : {}),
    ...(spec !== null ? { spec } : {}),
    ...(asset.produced_at !== undefined ? { producedAt: asset.produced_at } : {}),
    ...(asset.scheduled_at !== undefined ? { scheduledAt: asset.scheduled_at } : {}),
    ...(asset.camera_hub_uploaded_at !== undefined ? { cameraHubUploadedAt: asset.camera_hub_uploaded_at } : {}),
    ...(asset.zoho_schedule_reference !== undefined ? { zohoScheduleReference: asset.zoho_schedule_reference } : {}),
    ...postResult.fields,
    media: mediaResult.media,
    deadMedia: mediaResult.dead,
  };
  const problems = mediaResult.problems.map((p) => `Idea "${ideaId}" Asset "${asset.recipe}": ${p}`);
  if (postResult.problem !== undefined) problems.push(postResult.problem);
  return { asset: planned, problems };
}

// ---------------------------------------------------------------------------
// planIdea
// ---------------------------------------------------------------------------

/**
 * Plans one Idea. Returns `{ idea: undefined, problems: [...] }` (a refusal) when the Brief could not be
 * found; otherwise returns the full `PlannedIdea` plus any per-Asset media problems bubbled up from
 * `planAssetMedia` (a path this ticket cannot safely convert, or an existing file with an unrecognized
 * extension — both refusal-worthy per this module's own doc comment).
 */
export async function planIdea(input: PlanIdeaInput, deps: PlanIdeaDeps): Promise<PlanIdeaResult> {
  const { idea, brief } = input;

  if (!brief.ok) {
    return {
      problems: [
        `Idea "${idea.id}": no Brief found. Tried: ${brief.candidates.length > 0 ? brief.candidates.join(", ") : "(no candidate paths could be derived)"}`,
      ],
    };
  }

  const status = resolveIdeaStatus(idea.status, idea.assets.length);
  const sourceUrls = extractSourceUrls(brief.content);
  const recipeSelections = status === "accepted" ? planRecipeSelections(idea.recipes, idea.declinedRecipes) : [];

  const problems: string[] = [];
  // rejectIdea (src/idea/store.ts) requires a non-blank rejectionReason and throws otherwise — verified
  // true of every real rejected Idea in both ledgers today, but caught HERE (a planning-time refusal)
  // rather than surfacing as a raw execution-time exception mid-import.
  if (status === "rejected" && idea.rejectionReason === undefined) {
    problems.push(`Idea "${idea.id}" is rejected but carries no rejection_reason`);
  }
  const assets: PlannedAsset[] = [];
  for (const asset of idea.assets) {
    const { asset: planned, problems: assetProblems } = await planOneAsset(asset, idea.id, deps);
    problems.push(...assetProblems);
    assets.push(planned);
  }

  if (problems.length > 0) {
    return { problems };
  }

  const plannedIdea: PlannedIdea = {
    legacyId: idea.id,
    title: idea.title ?? idea.id,
    brief: brief.content,
    status,
    ...(idea.rejectionReason !== undefined ? { rejectionReason: idea.rejectionReason } : {}),
    ...(idea.trendId !== undefined ? { trendLegacyId: idea.trendId } : {}),
    ...(idea.fitScore !== undefined ? { fitScore: idea.fitScore } : {}),
    sourceUrls,
    recipeSelections,
    assets,
    ...(idea.createdAt !== undefined ? { createdAt: idea.createdAt } : {}),
  };

  return { idea: plannedIdea, problems: [] };
}
