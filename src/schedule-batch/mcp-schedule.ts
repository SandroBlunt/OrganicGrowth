/**
 * MCP schedule run — the orchestration layer that actually DOES what `mcp-plan.ts` decides (issue #163,
 * ADR-0020). `buildMcpSchedulePlan` (`./mcp-plan.ts`) decides WHICH Channels each Asset schedules to and
 * AT WHICH time; this module drives the Zoho MCP calls that make it happen, through the narrow
 * `ZohoSchedulePort` (`./mcp-schedule-port.ts`) — a FAKE in every test (hermetic build), the attended
 * `producer` agent itself at runtime.
 *
 * **AC1 — no Zoho write-tool before approval.** `runMcpSchedule` checks `input.approved === true` FIRST,
 * before touching `input.port` at all. A refused (`approved: false`) call makes ZERO port calls.
 *
 * **AC2 — upload, then validate, then schedule, in that exact order.** PER Asset: every hosted slide URL
 * is uploaded ONCE (`port.uploadMediaFromUrl`, shared across every Channel that Asset schedules to — the
 * SAME media, one post per platform). THEN, per Channel (every group's every channel): `validatePost`
 * runs BEFORE `createSchedule`, and `createSchedule` is only ever called on a passing validation. A
 * failing Channel is recorded and skipped; its Asset's OTHER Channels still proceed independently — one
 * bad Channel never blocks a whole Asset, and one bad Asset never blocks another.
 *
 * **AC3 — Zoho's Approval workflow is never used.** `ZohoPostRequest` (`./mcp-schedule-port.ts`) has no
 * `isApprovalNeeded` field at all — structurally impossible to set through this module.
 *
 * **X is defensively excluded a second time here** (`./plan.ts`'s `X_PLATFORM`), mirroring
 * `mcp-plan.ts`'s own "never trust blindly" posture — even if a caller somehow handed this module a
 * group whose `channels` still carried `x` (it shouldn't, `buildMcpSchedulePlan` already excludes it),
 * this loop drops it too rather than ever calling a Zoho write-tool for X.
 *
 * Every business-rule outcome (not approved, a Channel's failed validation, a missing Copy variant) is a
 * RETURNED, clearly-worded result — never a throw, mirroring every other Schedule Batch module's own
 * posture (`./plan.ts`'s `validateAssetsForExport`, `./mcp-plan.ts`'s refusals).
 */

import type { Copy } from "../copy/contract.ts";
import type { ZohoScheduleReference } from "../asset/asset.ts";
import { findCopyVariant, X_PLATFORM } from "./plan.ts";
import { zohoCaptionField } from "./csv.ts";
import type { McpTargetGroup } from "./mcp-plan.ts";
import type { ZohoPostRequest, ZohoSchedulePort } from "./mcp-schedule-port.ts";

// ---------------------------------------------------------------------------
// combineZohoScheduleReferences
// ---------------------------------------------------------------------------

/**
 * Combine one Asset's own successfully-scheduled Channels' references into ONE
 * `zoho_schedule_reference` value: flattens every entry (a string kept as-is, an array's own entries
 * spread in), then returns a bare string when the flattened result has exactly one entry, or the full
 * array otherwise — mirroring the shape `LedgerAssetRecord.zoho_schedule_reference` already accepts
 * (`src/asset/asset.ts`, issue #161). PURE.
 */
export function combineZohoScheduleReferences(
  references: readonly ZohoScheduleReference[],
): ZohoScheduleReference {
  const flat: string[] = [];
  for (const ref of references) {
    if (typeof ref === "string") flat.push(ref);
    else flat.push(...ref);
  }
  return flat.length === 1 ? flat[0]! : flat;
}

// ---------------------------------------------------------------------------
// runMcpSchedule
// ---------------------------------------------------------------------------

/** One eligible Asset's already-resolved MCP schedule input: `mcp-plan.ts`'s own decision
 *  (`scheduledAtUtc`/`groups`) plus what only the caller has — the Asset's composed Copy and its
 *  already-S3-hosted slide URLs (unchanged infrastructure, the SAME Media Host every hosted slide
 *  already uses). */
export interface McpScheduleAssetInput {
  readonly ideaId: string;
  readonly recipe: string;
  /** ISO-8601 UTC — the same instant every group's `scheduledAtLocal` (below) renders in its own clock. */
  readonly scheduledAtUtc: string;
  readonly groups: readonly McpTargetGroup[];
  readonly copy: Copy;
  /** Already-S3-hosted slide URLs, in slide order — shared across every Channel/platform this Asset
   *  schedules to. */
  readonly mediaUrls: readonly string[];
}

export interface RunMcpScheduleInput {
  readonly assets: readonly McpScheduleAssetInput[];
  /** The Operator's in-conversation approval of this Run's outputs and captions (ADR-0020) — REQUIRED
   *  and explicit; never defaults to `true`. Checked BEFORE any `port` call (AC1). */
  readonly approved: boolean;
  readonly port: ZohoSchedulePort;
}

/** Why one Channel was skipped rather than scheduled. `"no-copy-variant"` means the Asset's composed
 *  Copy has no variant for that platform at all (should already be caught by the CSV path's own
 *  preflight, `validateAssetsForExport`, run by the caller before this module — this is defense in
 *  depth, never trusted blindly). `"validation-failed"` means Zoho's own `validatePost` refused it. */
export type McpScheduleChannelFailureReason = "no-copy-variant" | "validation-failed";

/** One Channel that did NOT get scheduled, and why — named so the Operator sees exactly what happened,
 *  never a silent drop. */
export interface McpScheduleChannelFailure {
  readonly ideaId: string;
  readonly recipe: string;
  readonly platform: string;
  readonly label: string;
  readonly reason: McpScheduleChannelFailureReason;
  readonly message: string;
}

/** One Asset that got scheduled on at least one Channel — its combined reference and exactly which
 *  platforms actually went through (a subset of what was attempted, when some Channels failed). */
export interface McpScheduleAssetOutcome {
  readonly ideaId: string;
  readonly recipe: string;
  /** ISO-8601 — the same instant `McpScheduleAssetInput.scheduledAtUtc` carried; this is what the
   *  caller stamps onto the ledger's `scheduled_at`. */
  readonly scheduledAt: string;
  /** Every Channel platform actually scheduled for this Asset, in the order they were scheduled. */
  readonly scheduledPlatforms: readonly string[];
  readonly reference: ZohoScheduleReference;
}

export type RunMcpScheduleResult =
  | { readonly ok: false; readonly reason: "not-approved"; readonly message: string }
  | {
      readonly ok: true;
      readonly scheduled: readonly McpScheduleAssetOutcome[];
      readonly failures: readonly McpScheduleChannelFailure[];
    };

/** One Asset's flattened `{ group, channel }` pairs, X defensively excluded a second time (see module
 *  doc). */
function targetChannels(
  groups: readonly McpTargetGroup[],
): readonly { readonly group: McpTargetGroup; readonly channel: McpTargetGroup["channels"][number] }[] {
  return groups.flatMap((group) =>
    group.channels.filter((c) => c.platform !== X_PLATFORM).map((channel) => ({ group, channel })),
  );
}

/**
 * Run the MCP scheduling sequence for every given Asset. See the module doc for the full AC1-AC3
 * contract. Never throws for a business-rule outcome (not approved, a failed validation, a missing Copy
 * variant) — always a returned, clearly-worded result.
 */
export async function runMcpSchedule(input: RunMcpScheduleInput): Promise<RunMcpScheduleResult> {
  if (!input.approved) {
    return {
      ok: false,
      reason: "not-approved",
      message:
        "Zoho MCP scheduling refused: the Operator has not yet approved this Run's outputs and " +
        "captions in this conversation. No Zoho write-tool was called.",
    };
  }

  const scheduled: McpScheduleAssetOutcome[] = [];
  const failures: McpScheduleChannelFailure[] = [];

  for (const asset of input.assets) {
    const channels = targetChannels(asset.groups);
    if (channels.length === 0) continue; // nothing to upload or schedule for this Asset

    const mediaIds: string[] = [];
    for (const url of asset.mediaUrls) {
      const uploaded = await input.port.uploadMediaFromUrl(url);
      mediaIds.push(uploaded.mediaId);
    }

    const references: ZohoScheduleReference[] = [];
    const scheduledPlatforms: string[] = [];

    for (const { group, channel } of channels) {
      const variant = findCopyVariant(asset.copy, channel.platform);
      if (variant === null) {
        failures.push({
          ideaId: asset.ideaId,
          recipe: asset.recipe,
          platform: channel.platform,
          label: channel.label,
          reason: "no-copy-variant",
          message:
            `${asset.ideaId}: no composed Copy variant for platform "${channel.platform}" — skipped, ` +
            "nothing scheduled for this Channel.",
        });
        continue;
      }

      const request: ZohoPostRequest = {
        target: { zohoBrandName: group.zohoBrandName, platform: channel.platform, label: channel.label },
        mediaIds,
        content: zohoCaptionField(variant.caption, variant.hashtags),
        scheduledAtLocal: group.scheduledAtLocal,
      };

      const validated = await input.port.validatePost(request);
      if (!validated.ok) {
        const problems = (validated.problems ?? []).join("; ") || "no reason given";
        failures.push({
          ideaId: asset.ideaId,
          recipe: asset.recipe,
          platform: channel.platform,
          label: channel.label,
          reason: "validation-failed",
          message:
            `${asset.ideaId}: Zoho refused "${channel.platform}" (${channel.label}) at validation — ` +
            `${problems}.`,
        });
        continue;
      }

      const result = await input.port.createSchedule(request);
      references.push(result.reference);
      scheduledPlatforms.push(channel.platform);
    }

    if (scheduledPlatforms.length > 0) {
      scheduled.push({
        ideaId: asset.ideaId,
        recipe: asset.recipe,
        scheduledAt: asset.scheduledAtUtc,
        scheduledPlatforms,
        reference: combineZohoScheduleReferences(references),
      });
    }
  }

  return { ok: true, scheduled, failures };
}

// ---------------------------------------------------------------------------
// mcpUnavailableFallbackMessage
// ---------------------------------------------------------------------------

/**
 * The explicit fallback-offer message for when Zoho MCP is unavailable (ADR-0020, AC4): the WHOLE
 * remaining step reverts to the Operator doing it by hand — there is no silent, automatic switch. Names
 * the real CSV/S3 export command and states X (Twitter) always uses that path regardless of MCP
 * availability.
 */
export function mcpUnavailableFallbackMessage(
  brand: string,
  format: string,
  run: string,
  startDate: string,
): string {
  return (
    `Zoho MCP is unavailable for Brand "${brand}" — offering the CSV/S3 export fallback instead: ` +
    `run \`npm run export-schedule ${brand} ${format} ${run} ${startDate}\` (or call ` +
    "`exportScheduleCommand`, `src/commands/export-schedule.ts`, directly). From here, the WHOLE " +
    "remaining step is the Operator's own, by hand: upload the exported CSVs to Zoho Social, review " +
    "the queued posts there, and log each Post URL with /log-post once it is live. There is no silent, " +
    "automatic switch. X (Twitter) always uses this CSV/manual path, MCP available or not."
  );
}
