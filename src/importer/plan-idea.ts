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
 * An Asset whose `post_url` cannot be resolved to a SPECIFIC Channel (issue #243's `resolvePostChannel`
 * refusing) is ALSO not a refusal, as of issue #243 round 2 (QA round 1's Defect 1): it is reported on
 * `PlannedAsset.unresolvedPost`, surfaced up onto the plan's own `unresolvedPosts` report (see
 * `plan.ts`), and named on the final reconciliation — never silently dropped — but the Idea, its other
 * Assets, and the rest of the plan still import normally, just without that one `post` row. This mirrors
 * `planAssetMedia`'s own dead-media-path discipline exactly: "name the record and defer" is not the same
 * as "abort the whole import" over one ambiguous Post (see this ticket's own `handoff.md` for the
 * reasoning). A missing `posted_at` on an Asset that DOES carry a `post_url`, by contrast, stays a
 * blocking `problem` — that is a genuine source-ledger data-quality defect (a Post state that should
 * never exist), not a Channel-configuration ambiguity the Operator can fix without touching the ledger.
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
import { resolvePostChannel, type ChannelIdentity } from "./resolve-post-channel.ts";

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
  /** THIS Brand's FULL Channel list, in the SAME order `src/importer/execute.ts`'s `executeChannels`
   *  creates the real `channel` rows in (`src/importer/plan.ts`'s own `planBrand`, reading
   *  `brand-profile.yaml`'s `channel` list via `loadChannels`) — issue #240, specific-resolution-aware
   *  since issue #243. An Asset's `post_url` resolves to a SPECIFIC Channel via `resolvePostChannel`:
   *  unambiguous when only one Channel exists for the resolved platform, identifier-matched (or refused)
   *  when more than one does — never assumed, never a silent "whichever was created last". */
  readonly brandChannels: readonly ChannelIdentity[];
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
  /** The four fields present ONLY when the source Asset carried a `post_url` AND it resolved to a
   *  SPECIFIC Channel (issue #240, extended by issue #243) — an Asset with none of them produces no
   *  `post` row at execute time (AC3), whether because it never carried a `post_url` at all, OR because
   *  it did but could not be resolved (see `unresolvedPost` below). `postPlatform` is the platform
   *  `postUrl` resolved to; `postChannelIndex` is the SPECIFIC Channel it resolved to — an index into
   *  `PlanIdeaDeps.brandChannels` / `BrandPlanItem.channels` (the SAME order Channel rows are created
   *  in), never merely "a Channel for that platform". Both are already resolved+validated by
   *  `resolvePostChannel` — `executeImport` trusts them rather than re-resolving. */
  readonly postUrl?: string;
  readonly postedAt?: string;
  readonly postPlatform?: KnownPlatform;
  readonly postChannelIndex?: number;
  /** Present ONLY when the source Asset carried a `post_url` that `resolvePostChannel` refused to
   *  resolve to a SPECIFIC Channel (issue #243 round 2 — QA round 1's Defect 1). This does NOT block the
   *  Idea/plan (see this module's own top-of-file doc comment) — it is instead reported, by name, on the
   *  plan's own `unresolvedPosts` (`plan.ts`) and on the final reconciliation, so it is never silently
   *  dropped even though it is also never blocking. */
  readonly unresolvedPost?: { readonly postUrl: string; readonly reason: string };
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
 * Resolves an Asset's `post_url`/`posted_at` into the four `PlannedAsset` Post fields (issue #240,
 * extended by issue #243's SPECIFIC Channel resolution), a named BLOCKING problem, or a named
 * NON-blocking `unresolved` report — never a silent drop either way. Returns `{}` (no problem, no
 * unresolved report) for an Asset carrying no `post_url` at all — AC3's "no Post row" case.
 *
 * THREE distinct failure shapes, deliberately not all the same (issue #243 round 2 — QA round 1's
 * Defect 1):
 *   - No `posted_at` on an Asset that DOES carry a `post_url` is a BLOCKING `problem` — a genuine
 *     source-ledger data-quality defect (never invent a timestamp), not something `brand-profile.yaml`
 *     configuration can fix.
 *   - `resolvePostChannel` refusing with `kind: "unknown-platform"` or `"no-configured-channel"` STAYS a
 *     BLOCKING `problem`, unchanged from #240's original behavior — a post_url naming no known platform
 *     at all, or a platform the Brand has literally no Channel for, is not the ambiguity this ticket's
 *     `alternate_urls` escape hatch exists to fix.
 *   - `resolvePostChannel` refusing with `kind: "ambiguous"` (2+ Channels on one platform, cannot pick a
 *     specific one) is a NON-blocking `unresolved` report — an Operator-fixable configuration gap (add
 *     `alternate_urls`, or accept the Post stays unattributed for now), never a reason to abort importing
 *     everything else this plan would otherwise write.
 */
function planAssetPost(
  asset: LedgerAssetRecord,
  ideaId: string,
  brandChannels: readonly ChannelIdentity[],
): {
  readonly fields: Pick<PlannedAsset, "postUrl" | "postedAt" | "postPlatform" | "postChannelIndex">;
  readonly problem?: string;
  readonly unresolved?: { readonly postUrl: string; readonly reason: string };
} {
  if (asset.post_url === undefined) return { fields: {} };

  const label = `Idea "${ideaId}" Asset "${asset.recipe}"`;
  if (asset.posted_at === undefined) {
    return { fields: {}, problem: `${label}: has post_url ("${asset.post_url}") but no posted_at — cannot create a Post row without a real timestamp` };
  }

  const resolved = resolvePostChannel(asset.post_url, brandChannels);
  if (!resolved.ok) {
    if (resolved.kind === "ambiguous") {
      return { fields: {}, unresolved: { postUrl: asset.post_url, reason: resolved.reason } };
    }
    return { fields: {}, problem: `${label}: ${resolved.reason}` };
  }

  return {
    fields: { postUrl: asset.post_url, postedAt: asset.posted_at, postPlatform: resolved.platform, postChannelIndex: resolved.channelIndex },
  };
}

async function planOneAsset(asset: LedgerAssetRecord, ideaId: string, deps: PlanIdeaDeps): Promise<PlanOneAssetResult> {
  const mediaResult = await planAssetMedia(asset.asset_paths ?? [], deps.legacyAbsolutePrefix, deps.checkoutRoot, deps.mediaFileOps);
  const spec = asset.spec_path !== undefined ? await deps.loadSpec(asset.spec_path) : null;
  const postResult = planAssetPost(asset, ideaId, deps.brandChannels);
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
    ...(postResult.unresolved !== undefined ? { unresolvedPost: postResult.unresolved } : {}),
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
