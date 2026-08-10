/**
 * MCP schedule plan — the pure decision layer for ADR-0020's MCP-first routing (issue #160, parent
 * ADR-0020).
 *
 * ADR-0020 makes Zoho's MCP tools the primary way a run's produced News Carousel Assets get scheduled,
 * with the existing CSV/S3 export (`schedule-batch-export`) retained only as a fallback. This module
 * decides, given a run's already-selected eligible Assets (`src/schedule-batch/eligibility.ts`'s
 * `selectEligibleAssets` output — `news-carousel`, `status: "produced"`, no `scheduled_at` yet), a
 * Brand's Zoho Social Brand configuration (`src/production-spec/brand-profile.ts`'s `loadZohoConfig`),
 * and a start date: which Channels each Asset schedules to over the MCP path — grouped exactly the way
 * the Brand's Zoho Social Brands group their Channels — and at which time.
 *
 * Reuses, never forks, the CSV export's own machinery: the SAME deterministic Idea-number scheduling
 * order (`./order.ts`'s `sortEligible`), the SAME slot derivation and 1-hour lead-time guard
 * (`./schedule.ts`'s `deriveScheduleSlots`/`validateSlotsFuture`), and the SAME per-zone time rendering
 * (`./timezone.ts`'s `formatZohoScheduleTime`) — so an Asset's MCP slot and its CSV-fallback slot are
 * always the same instant, never two independently-computed schedules for the same batch.
 *
 * `X` (Twitter) is excluded from every returned group, unconditionally (ADR-0020: Zoho's own MCP tool
 * guidance warns that posting to X this way risks the connected account being flagged as a bot and
 * terminated) — this is a hardcoded exclusion, never a Brand setting, mirroring `./plan.ts`'s own
 * `X_PLATFORM` constant (exported from there so both modules read the same literal). A Zoho Social
 * Brand grouping left with no MCP-eligible Channels contributes NO group to the plan.
 *
 * Scoped to `news-carousel` Assets only (`eligibility.ts`'s `SUPPORTED_RECIPE`) — any other Recipe's
 * entry present in `eligible` (e.g. a Character Explainer Asset) is defensively excluded, never
 * scheduled. The Character Explainer Recipe's possible future ride on this path is explicitly out of
 * scope here (flagged in ADR-0020 for a later conversation).
 *
 * Pure throughout: `nowMs` (the 1-hour-lead check) is always the caller's explicit argument — this
 * module never reads the system clock, performs no I/O, and makes no live Zoho/Magnific call of any
 * kind. Every business-rule refusal (an empty run, a Brand with no usable Zoho configuration, a slot
 * inside the lead window) is a RETURNED, clearly-worded discriminated result — never a throw, mirroring
 * `src/commands/export-schedule.ts`'s own refusal style.
 */

import type { EligibleAsset } from "./eligibility.ts";
import { SUPPORTED_RECIPE } from "./eligibility.ts";
import type { ZohoChannelMapping, ZohoConfigLookup, ZohoSocialBrand } from "../production-spec/brand-profile.ts";
import { deriveScheduleSlots, validateSlotsFuture } from "./schedule.ts";
import { formatZohoScheduleTime } from "./timezone.ts";
import { sortEligible } from "./order.ts";
import { X_PLATFORM } from "./plan.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One Zoho Social Brand's MCP-eligible Channel group for one Asset — X already excluded, an
 *  empty-channel group never fabricated. */
export interface McpTargetGroup {
  readonly zohoBrandName: string;
  readonly timezone: string;
  /** X already excluded — never present here. Never empty (an empty group is dropped entirely, not
   *  returned). */
  readonly channels: readonly ZohoChannelMapping[];
  /** This Asset's scheduled time, rendered in THIS Zoho Social Brand's own configured clock (Zoho's
   *  `MM/DD/YYYY HH:mm` dialect via `formatZohoScheduleTime`) — the SAME rendering the CSV export's own
   *  file for this Zoho Social Brand would use for the same instant. */
  readonly scheduledAtLocal: string;
}

/** One eligible Asset's full MCP schedule: its target Channel groups and the absolute instant every
 *  group's `scheduledAtLocal` renders. */
export interface McpAssetSchedule {
  readonly ideaId: string;
  readonly recipe: string;
  readonly title: string;
  /** ISO-8601 UTC — the SAME instant every group's `scheduledAtLocal` renders in its own clock. */
  readonly scheduledAtUtc: string;
  /** Grouped per Zoho Social Brand, X already excluded, empty-channel groups already dropped. May be
   *  empty when every configured Zoho Social Brand is X-only for this Brand. */
  readonly groups: readonly McpTargetGroup[];
}

/** Why a plan could not be built. `"empty-run"` covers a truly-empty `eligible` list AND a list that
 *  becomes empty once non-`news-carousel` entries are excluded — the SAME "nothing to schedule" outcome
 *  either way. `"zoho-not-configured"` covers BOTH of `ZohoConfigLookup`'s own `"not_configured"` and
 *  `"malformed"` reasons — either way, there is no usable Zoho configuration to plan against.
 *  `"lead-window"` is the load-bearing `>= 1 hour in the future` guard, mirroring the CSV export's own. */
export type McpSchedulePlanRefusalReason = "empty-run" | "zoho-not-configured" | "lead-window";

export type McpSchedulePlanResult =
  | { readonly ok: true; readonly assets: readonly McpAssetSchedule[] }
  | { readonly ok: false; readonly reason: McpSchedulePlanRefusalReason; readonly message: string };

export interface BuildMcpSchedulePlanInput {
  /** A run's already-selected eligible Assets (`selectEligibleAssets`'s `eligible` list). */
  readonly eligible: readonly EligibleAsset[];
  /** The run identifier `sortEligible`'s Idea-order parsing needs (same as the CSV export's own `run`). */
  readonly run: string;
  readonly zohoConfig: ZohoConfigLookup;
  /** `YYYY-MM-DD` — the first slot's calendar date, passed straight through to `deriveScheduleSlots`. */
  readonly startDate: string;
  /** Explicit "now", ms since epoch — never read internally (pure). */
  readonly nowMs: number;
}

// ---------------------------------------------------------------------------
// buildMcpSchedulePlan
// ---------------------------------------------------------------------------

/** This Zoho Social Brand's Channels with `X_PLATFORM` excluded — never mutates `zohoBrand`. */
function mcpEligibleChannels(zohoBrand: ZohoSocialBrand): readonly ZohoChannelMapping[] {
  return zohoBrand.channels.filter((c) => c.platform !== X_PLATFORM);
}

/** This Asset's target groups at `utcMs`: one per Zoho Social Brand with at least one MCP-eligible
 *  Channel, in the SAME order as `zohoBrands`; a Zoho Social Brand left with zero MCP-eligible Channels
 *  (e.g. configured for X alone) contributes nothing. */
function groupsFor(zohoBrands: readonly ZohoSocialBrand[], utcMs: number): readonly McpTargetGroup[] {
  const groups: McpTargetGroup[] = [];
  for (const zohoBrand of zohoBrands) {
    const channels = mcpEligibleChannels(zohoBrand);
    if (channels.length === 0) continue;
    groups.push({
      zohoBrandName: zohoBrand.name,
      timezone: zohoBrand.timezone,
      channels,
      scheduledAtLocal: formatZohoScheduleTime(utcMs, zohoBrand.timezone),
    });
  }
  return groups;
}

function emptyRunRefusal(): McpSchedulePlanResult {
  return {
    ok: false,
    reason: "empty-run",
    message: "No eligible Assets to schedule via Zoho MCP — nothing to plan.",
  };
}

/**
 * Build the MCP schedule plan for a run's eligible Assets. PURE: no I/O, no clock read (`nowMs` is
 * always the caller's explicit argument), no live Zoho/Magnific call. See the module doc for the full
 * routing rules and refusal shapes.
 */
export function buildMcpSchedulePlan(input: BuildMcpSchedulePlanInput): McpSchedulePlanResult {
  const { eligible, run, zohoConfig, startDate, nowMs } = input;

  // Scoped to news-carousel only (defense in depth — the caller's own selectEligibleAssets already
  // enforces this, but this module never trusts that blindly): any other Recipe's entry is dropped.
  const newsCarouselOnly = eligible.filter((e) => e.asset.recipe === SUPPORTED_RECIPE);
  if (newsCarouselOnly.length === 0) {
    return emptyRunRefusal();
  }

  if (!zohoConfig.configured) {
    return { ok: false, reason: "zoho-not-configured", message: zohoConfig.message };
  }

  const sorted = sortEligible(newsCarouselOnly, run);
  const slots = deriveScheduleSlots(startDate, sorted.length);
  const futureCheck = validateSlotsFuture(slots, nowMs);
  if (!futureCheck.ok) {
    const lines = futureCheck.violations.map((v) => {
      const target = sorted[v.index]!;
      return (
        `  - ${target.ideaId}: scheduled ${new Date(v.utcMs).toISOString()} is less than 1 hour from ` +
        `now — Zoho would refuse or silently reject this slot.`
      );
    });
    return {
      ok: false,
      reason: "lead-window",
      message:
        "MCP schedule plan refused — every schedule time must be at least 1 hour in the future " +
        `(nothing planned):\n${lines.join("\n")}`,
    };
  }

  const assets: McpAssetSchedule[] = sorted.map(({ ideaId, title, asset }, i) => {
    const slot = slots[i]!;
    return {
      ideaId,
      recipe: asset.recipe,
      title,
      scheduledAtUtc: new Date(slot.utcMs).toISOString(),
      groups: groupsFor(zohoConfig.zohoBrands, slot.utcMs),
    };
  });

  return { ok: true, assets };
}
