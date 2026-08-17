/**
 * `runOneJob` — the worker's per-job orchestration (issue #208), composing the existing deep modules —
 * never new production logic. See this change's `proposal.md`/`handoff.md` for the full reasoning.
 *
 * The sequence, for one claimed job:
 *
 *   1. Claim (`job-store.ts`'s `claimJob` — the SAME atomic primitive issue #203 proved).
 *   2. Load the Asset/Brand/Recipe/Idea (reads only).
 *   3. Refuse a Space-less Recipe (ADR-0021) — out of this ticket's scope.
 *   4. Decide the LEG (`worker/plan-leg.ts`'s `planLeg`, fed by `listGateRequestsForAsset` — a READ).
 *   5. FIRST leg only: self-audit the `author` Phase Contract (`auditAuthorPhase`) against the
 *      already-authored, saved Production Spec.
 *   6. A leg about to render (`targetGate === null`): resolve + bind media slots
 *      (`worker/resolve-media-slots.ts` + `producer/bind-media.ts`'s `bindMediaSlots`), self-audit the
 *      `bind-media` Phase Contract, then actually bind each brand-asset slot into the canvas
 *      (`space-driver/driver.ts`'s `bindMediaAsset`) — an idea-pick slot needs no separate bind call,
 *      `driveToNextGate`'s own resumed-leg branch pins it.
 *   7. Drive exactly one leg (`driveToNextGate`).
 *   8. PAUSED: raise a `gate_request`, release the job to `awaiting_pick`.
 *   9. FINISHED: download the rendered creation, compose + self-audit Copy (`auditCopyPhase`), save the
 *      Asset `produced`, attach its media, save its Copy Variant (against the Brand's primary Channel,
 *      when one exists), release the job `done`.
 *
 * Any phase-audit failure or drive failure routes through ONE shared retry/terminal-failure path
 * (`finishFail`): release `failed`, then `requeueJob` while `attempt < maxAttempts` — never past it.
 *
 * Every store WRITE this composes (`claimJob`/`releaseJob`/`requeueJob`, `raiseGateRequest`,
 * `saveAsset`/`attachAssetMedia`, `saveCopyVariant`) is already registered in
 * `src/store-write-boundary/scan.ts`'s `STORE_WRITE_FUNCTIONS` from earlier tickets — because every one
 * of those writes happens INSIDE `src/command-surface/`, the guard needs no new entries here.
 *
 * KNOWN LIMIT: step 9's tail (`attachAssetMedia` -> `saveCopyVariant` -> `releaseJob(done)`) is not an
 * outbox — a process crash strictly between `attachAssetMedia` succeeding and `releaseJob(done)` landing
 * would leave the job `running` (its lease eventually expires and it becomes reclaimable), and a retry
 * would re-drive the SAME finished leg and call `attachAssetMedia` again, hitting the `asset_media`
 * table's own `UNIQUE (asset_id, ordinal)` constraint rather than reconciling gracefully. This is the
 * SAME class of problem issue #209's Schedule Outbox (`reserve -> call -> confirm`) solves for Zoho
 * scheduling; the render/save tail has no equivalent reserve-first step yet — flagged here rather than
 * silently narrowed, see this change's `handoff.md`.
 */

import { join } from "node:path";

import type { DatabaseSync } from "node:sqlite";

import { claimJob, releaseJob, requeueJob, type JobRecord } from "../production-queue/job-store.ts";
import { listGateRequestsForAsset } from "../production-queue/gate-request-store.ts";
import { getAssetById } from "../asset/store.ts";
import { getBrandById, type BrandRecord } from "../brand/store.ts";
import { getIdea } from "../idea/store.ts";
import { getPrimaryChannel } from "../channel/store.ts";
import { getRecipe, type Recipe } from "../recipe/registry.ts";
import { usesSpace } from "../producer/uses-space.ts";
import { auditAuthorPhase, auditBindMediaPhase, auditCopyPhase } from "../recipe/phase-contract.ts";
import { bindMediaSlots } from "../producer/bind-media.ts";
import { resolveMediaSlotResolutions } from "../worker/resolve-media-slots.ts";
import { planLeg, type PriorGateDecision } from "../worker/plan-leg.ts";
import { mediaKindFromContentType, extensionFromUrl } from "../worker/media-kind.ts";
import {
  driveToNextGate,
  bindMediaAsset,
  type DriveLegInput,
  type PollOptions,
} from "../space-driver/driver.ts";
import type { SpaceMcpPort } from "../space-driver/port.ts";
import { downloadAssetFiles } from "../asset/download.ts";
import { digestBuffer } from "../media-backup/checksum.ts";
import { skillDraftCopy, type CopyDrafter } from "../copy/draft.ts";
import { injectRequiredParts } from "../copy/inject.ts";
import { validateCopy } from "../copy/validate.ts";
import type { BrandCopyRules } from "../production-spec/brand-profile.ts";

import { raiseGateRequest } from "./gates.ts";
import { saveAsset, attachAssetMedia } from "./assets.ts";
import { saveCopyVariant } from "./copy.ts";

/** Default lease held while a job is `running` (ms). Generous — a live Space op can take minutes. */
export const DEFAULT_LEASE_MS = 15 * 60_000;

/** Default cap on total attempts before a failing job is left terminally `failed`. */
export const DEFAULT_MAX_ATTEMPTS = 3;

export interface RunOneJobOptions {
  /** Identifies this worker to `claimJob`'s lease. Defaults to a fresh id per call. */
  readonly ownerId?: string;
  readonly leaseMs?: number;
  readonly maxAttempts?: number;
  /** Passed straight through to `driveToNextGate`/`bindMediaAsset` — tests inject a no-op sleep. */
  readonly poll?: PollOptions;
  /** Injected so tests never hit the network — defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
  /** Stands in for the `write-social-copy` Skill's LLM job — defaults to its deterministic stand-in. */
  readonly drafter?: CopyDrafter;
  readonly now?: () => string;
}

export type RunOneJobOutcome =
  | { readonly status: "not-claimed" }
  | { readonly status: "parked"; readonly gate: string; readonly gateRequestId: string }
  | { readonly status: "done"; readonly assetId: string }
  | { readonly status: "failed"; readonly terminal: boolean; readonly reason: string };

interface ResolvedOptions {
  readonly ownerId: string;
  readonly leaseMs: number;
  readonly maxAttempts: number;
  readonly poll: PollOptions;
  readonly fetchImpl: typeof fetch;
  readonly drafter: CopyDrafter;
  readonly now: () => string;
}

function resolveOptions(options: RunOneJobOptions): ResolvedOptions {
  return {
    ownerId: options.ownerId ?? `worker-${Math.random().toString(36).slice(2)}`,
    leaseMs: options.leaseMs ?? DEFAULT_LEASE_MS,
    maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    poll: options.poll ?? {},
    fetchImpl: options.fetchImpl ?? fetch,
    drafter: options.drafter ?? skillDraftCopy,
    now: options.now ?? (() => new Date().toISOString()),
  };
}

/** Release `claimed` to `failed`, then `requeueJob` while it has attempts left — never past
 *  `maxAttempts`. Shared by every failure path below, so retry/terminal-failure bookkeeping lives in
 *  exactly one place. */
function finishFail(
  db: DatabaseSync,
  claimed: JobRecord,
  maxAttempts: number,
  now: () => string,
  reason: string,
): RunOneJobOutcome {
  releaseJob(db, claimed.id, "failed", now);
  if (claimed.attempt < maxAttempts) {
    requeueJob(db, claimed.id, now);
    return { status: "failed", terminal: false, reason };
  }
  return { status: "failed", terminal: true, reason };
}

/** The latest DECIDED gate request raised by an earlier job for `assetId`, or `null` when none exists
 *  yet — the fact `planLeg` needs to tell a FIRST leg from a RESUMED one. */
function latestDecidedPriorGate(db: DatabaseSync, assetId: string): PriorGateDecision | null {
  const decided = listGateRequestsForAsset(db, assetId).filter((g) => g.decidedAt !== undefined);
  const latest = decided.at(-1);
  return latest ? { gateName: latest.gateName, choice: latest.choice! } : null;
}

function buildCopyRules(brand: BrandRecord): BrandCopyRules {
  return {
    requiredCta: brand.requiredCta ?? null,
    requiredHashtags: brand.requiredHashtags,
    bannedWords: brand.bannedWords,
  };
}

/**
 * Run ONE claimed job to a terminal-for-this-attempt outcome: `not-claimed` (lost the race, or the job
 * is not eligible), `parked` (paused at a gate — the Space is free for the next queued job), `done`
 * (the Asset is produced), or `failed` (retried, or terminal — see `finishFail`). Never throws for an
 * expected failure — every phase-audit or drive failure is reported as `{ status: "failed" }`.
 */
export async function runOneJob(
  db: DatabaseSync,
  port: SpaceMcpPort,
  jobId: string,
  options: RunOneJobOptions = {},
): Promise<RunOneJobOutcome> {
  const { ownerId, leaseMs, maxAttempts, poll, fetchImpl, drafter, now } = resolveOptions(options);

  const claimed = claimJob(db, jobId, ownerId, leaseMs, now);
  if (claimed === null) {
    return { status: "not-claimed" };
  }

  const asset = getAssetById(db, claimed.assetId);
  const brand = getBrandById(db, claimed.brandId);
  const recipe: Recipe | null = asset ? getRecipe(asset.recipe) : null;

  if (asset === null || brand === null || recipe === null) {
    return finishFail(db, claimed, maxAttempts, now, "the job's Asset, Brand, or Recipe could not be resolved");
  }

  if (!usesSpace(recipe)) {
    return finishFail(
      db,
      claimed,
      maxAttempts,
      now,
      `recipe "${recipe.slug}" is Space-less (ADR-0021) — the worker does not yet drive Space-less Recipes`,
    );
  }

  const priorDecision = latestDecidedPriorGate(db, asset.id);
  const legPlan = planLeg(recipe, priorDecision);

  // --- author phase (FIRST leg only — a RESUMED leg's Spec was already audited on its first leg) -----
  if (legPlan.kind === "first") {
    if (asset.spec === undefined) {
      return finishFail(db, claimed, maxAttempts, now, "the Asset has no authored Production Spec yet");
    }
    const authorAudit = auditAuthorPhase(recipe, { candidateSpec: asset.spec, bannedWords: brand.bannedWords });
    if (!authorAudit.ok) {
      const detail = authorAudit.items.filter((i) => i.ok === false).map((i) => i.detail ?? i.description).join("; ");
      return finishFail(db, claimed, maxAttempts, now, `author phase failed: ${detail}`);
    }
  }

  // --- bind-media phase (only on a leg about to render — see this module's own doc comment) ----------
  if (legPlan.targetGate === null) {
    const pick = legPlan.kind === "resumed" ? legPlan.pick : undefined;
    const resolutions = resolveMediaSlotResolutions(db, claimed.brandId, recipe, pick);
    const bindResult = bindMediaSlots(recipe, resolutions);
    if (!bindResult.ok) {
      return finishFail(db, claimed, maxAttempts, now, `bind-media phase failed: ${bindResult.message}`);
    }
    const bindAudit = auditBindMediaPhase(recipe, { boundSlotNames: bindResult.boundSlotNames });
    if (!bindAudit.ok) {
      return finishFail(db, claimed, maxAttempts, now, "bind-media phase audit failed");
    }
    for (const bound of bindResult.bound) {
      if (bound.resolution.kind !== "brand-asset") continue; // an idea-pick slot is pinned inside driveToNextGate
      const boundResult = await bindMediaAsset(port, bound.resolution.path, bound.slot.media, bound.name, poll);
      if (!boundResult.ok) {
        return finishFail(db, claimed, maxAttempts, now, `media bind failed: ${boundResult.error.message}`);
      }
    }
  }

  // --- drive one leg -------------------------------------------------------------------------------
  const spaceState = await port.readState();
  const driveInput: DriveLegInput =
    legPlan.kind === "first"
      ? { kind: "first", targetGate: legPlan.targetGate, spec: asset.spec!, promptNode: recipe.canvasInputs!.promptNode }
      : {
          kind: "resumed",
          targetGate: legPlan.targetGate,
          pick: legPlan.pick,
          pinnedReferenceNodeName: recipe.space!.nodes.pinnedReference!,
        };

  const driveResult = await driveToNextGate(port, spaceState, driveInput, poll);
  if (!driveResult.ok) {
    return finishFail(db, claimed, maxAttempts, now, `drive failed: ${driveResult.error.code} — ${driveResult.error.message}`);
  }

  // --- paused: raise a gate request, park the job — the Space is free for the next queued job --------
  if (driveResult.outcome.kind === "paused") {
    releaseJob(db, claimed.id, "awaiting_pick", now);
    const gateRequestId = raiseGateRequest(
      db,
      { jobId: claimed.id, gateName: driveResult.outcome.gate, candidates: driveResult.outcome.candidates },
      now,
    );
    await saveAsset(db, asset.ideaId, recipe.slug, {
      status: "in_production",
      pending_gate: driveResult.outcome.gate,
    });
    return { status: "parked", gate: driveResult.outcome.gate, gateRequestId };
  }

  // --- finished: download the rendered media, compose Copy, save the Asset, release done --------------
  const rendered = driveResult.outcome.asset;
  const idea = getIdea(db, asset.ideaId);
  if (idea === null) {
    return finishFail(db, claimed, maxAttempts, now, "the Asset's Idea could not be resolved");
  }

  const destDir = join(brand.mediaRoot, "produced", asset.ideaId, recipe.slug);
  const filename = `asset${extensionFromUrl(rendered.assetUrl)}`;
  let downloaded;
  try {
    [downloaded] = await downloadAssetFiles(destDir, [{ url: rendered.assetUrl, filename }], fetchImpl);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return finishFail(db, claimed, maxAttempts, now, `downloading the rendered Asset failed: ${detail}`);
  }
  const storageKey = join("produced", asset.ideaId, recipe.slug, filename);
  const digest = digestBuffer(downloaded!.bytes);

  const copyRules = buildCopyRules(brand);
  const draft = drafter({ title: idea.title }, recipe.copyShape);
  const injected = injectRequiredParts(draft, copyRules);
  const copyValidation = validateCopy(injected, recipe.copyShape, copyRules);
  if (!copyValidation.ok) {
    const detail = copyValidation.errors.map((e) => e.message).join("; ");
    return finishFail(db, claimed, maxAttempts, now, `copy phase failed: ${detail}`);
  }
  const copyAudit = auditCopyPhase(recipe, { candidateCopy: injected, rules: copyRules });
  if (!copyAudit.ok) {
    return finishFail(db, claimed, maxAttempts, now, "copy phase audit failed");
  }

  const timestamp = now();
  await saveAsset(db, asset.ideaId, recipe.slug, { status: "produced", produced_at: timestamp });
  attachAssetMedia(db, asset.id, [
    {
      ordinal: 0,
      kind: mediaKindFromContentType(downloaded!.contentType),
      storageKey,
      mime: downloaded!.contentType ?? "application/octet-stream",
      bytes: digest.sizeBytes,
      checksum: digest.sha256,
      magnificCreationId: rendered.assetId,
    },
  ]);

  const primaryChannel = getPrimaryChannel(db, claimed.brandId);
  if (primaryChannel !== null) {
    saveCopyVariant(db, {
      assetId: asset.id,
      channelId: primaryChannel.id,
      caption: injected.caption,
      hashtags: injected.hashtags,
      ...(injected.title !== undefined ? { title: injected.title } : {}),
    });
  }

  releaseJob(db, claimed.id, "done", now);
  return { status: "done", assetId: asset.id };
}
