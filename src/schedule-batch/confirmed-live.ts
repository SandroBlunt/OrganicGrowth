/**
 * Confirmed-live check — the decision + write layer for ADR-0020's auto-log path (issue #162).
 *
 * ADR-0020: for a News Carousel Asset scheduled through Zoho's MCP path, attribution logs
 * automatically — but only once a post is confirmed live, checked by the EXACT reference Zoho returned
 * at schedule-time (`LedgerAssetRecord.zoho_schedule_reference`, issue #161) — never guessed from timing
 * or inference (always-rules #5). This module owns that decision (`planConfirmedLiveLog`, PURE) and the
 * apply step that writes the confirmed live Post onto the ledger, reusing the exact same attribution
 * write `/log-post` performs (`src/asset/attribution.ts`'s `writeAttributedPost`) — there is only ever
 * one produced -> posted transition in the codebase.
 *
 * `ZohoScheduleReport` is the small input shape representing what the Producer fetches from Zoho's MCP
 * tools AT RUNTIME (issue #163's job — building the live fetch) and injects here as plain data; this
 * module never calls Zoho, Magnific, or the network itself, and is fully covered by tests using
 * hand-built fixtures. Its `reference` field must echo back the exact reference the report is FOR —
 * `planConfirmedLiveLog` checks it against the Asset's own stored reference and refuses rather than
 * trusting a report for the wrong reference. `statuses` carries one entry per targeted Channel platform
 * (Zoho's own report may cover several Channels for one scheduled reference); this slice writes ONLY the
 * Brand's PRIMARY Channel's live Post URL onto the ledger — tracking for the other Channels stays
 * deferred (ADR-0019's own scope note, mirrored by `mcp-plan.ts`'s per-Channel grouping).
 *
 * An Asset with no stored `zoho_schedule_reference` at all (e.g. one scheduled via the CSV/S3 fallback)
 * is NEVER auto-logged — it stays on the Operator's manual `/log-post`, exactly as ADR-0020 requires.
 * Every business-rule refusal (unresolved Idea/Recipe, no stored reference, no configured primary
 * Channel, a report for a different reference, no report yet, or a report that is not yet live) is a
 * RETURNED, clearly-worded result — never a throw, mirroring `src/commands/log-post.ts`'s own posture.
 */

import { loadIdeas, findIdea, type LedgerIdea } from "../ledger/ledger.ts";
import {
  findAsset,
  describeAssetList,
  type AssetStatus,
  type LedgerAssetRecord,
  type ZohoScheduleReference,
} from "../asset/asset.ts";
import { writeAttributedPost, nextAttributedStatus } from "../asset/attribution.ts";
import { resolveBrand } from "../brand/resolver.ts";
import { loadPrimaryChannel, type Channel } from "../production-spec/brand-profile.ts";

// ---------------------------------------------------------------------------
// The injected input: Zoho's own current report for one stored reference
// ---------------------------------------------------------------------------

/** Zoho's own reported status for one Channel platform's post under a scheduled reference. */
export type ZohoPostLiveStatus = "pending" | "live" | "failed";

/** One Channel platform's entry within Zoho's report for a scheduled reference. */
export interface ZohoPlatformStatus {
  readonly platform: string;
  readonly status: ZohoPostLiveStatus;
  /** The live, publicly-viewable Post URL. Present only once `status === "live"`. */
  readonly liveUrl?: string;
  /** ISO-8601 — when Zoho reports the post actually went live. Present only once `status === "live"`. */
  readonly liveAt?: string;
}

/**
 * Zoho's current report for ONE stored `zoho_schedule_reference` value, fetched by the Producer at
 * runtime (#163) and injected here as plain data. `reference` MUST equal the Asset's own stored
 * reference EXACTLY (same shape, same value(s), same order) for this report to be trusted at all —
 * `planConfirmedLiveLog` never matches by timing, ordering, or "the only report supplied".
 */
export interface ZohoScheduleReport {
  readonly reference: ZohoScheduleReference;
  readonly statuses: readonly ZohoPlatformStatus[];
}

// ---------------------------------------------------------------------------
// planConfirmedLiveLog — the pure decision
// ---------------------------------------------------------------------------

/** Why a confirmed-live auto-log attempt was refused. */
export type ConfirmedLiveRefusalReason =
  | "unknown-idea"
  | "unknown-recipe"
  | "not-yet-produced"
  | "no-stored-reference"
  | "no-primary-channel"
  | "reference-mismatch"
  | "no-report"
  | "pending";

/** The pure decision the confirmed-live check makes, given an Idea's own recorded Assets, Zoho's report,
 *  and the Brand's primary Channel. Never infers. */
export type ConfirmedLiveLogPlan =
  | {
      readonly ok: true;
      readonly asset: LedgerAssetRecord;
      readonly nextStatus: AssetStatus;
      readonly postUrl: string;
      readonly postedAt: string;
      readonly platform: string;
    }
  | { readonly ok: false; readonly reason: "unknown-idea" }
  | { readonly ok: false; readonly reason: "unknown-recipe"; readonly assets: readonly LedgerAssetRecord[] }
  | { readonly ok: false; readonly reason: "not-yet-produced"; readonly asset: LedgerAssetRecord }
  | { readonly ok: false; readonly reason: "no-stored-reference"; readonly asset: LedgerAssetRecord }
  | { readonly ok: false; readonly reason: "no-primary-channel"; readonly asset: LedgerAssetRecord }
  | { readonly ok: false; readonly reason: "reference-mismatch"; readonly asset: LedgerAssetRecord }
  | { readonly ok: false; readonly reason: "no-report"; readonly asset: LedgerAssetRecord }
  | { readonly ok: false; readonly reason: "pending"; readonly asset: LedgerAssetRecord; readonly status: ZohoPostLiveStatus };

/**
 * True when `a` and `b` are the SAME `ZohoScheduleReference` — same shape (string vs array), same
 * value(s), same order. A string never matches an array even carrying the identical single value, and
 * an array only matches another array of the exact same length with every entry equal at the same
 * index — never reordered, never collapsed. This is the whole of "keys only on the stored reference,
 * never on timing or inference" (always-rules #5, AC2): identity, not resemblance.
 */
function referencesMatch(a: ZohoScheduleReference, b: ZohoScheduleReference): boolean {
  if (typeof a === "string" && typeof b === "string") return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }
  return false;
}

/**
 * Decide what the confirmed-live auto-log check should do for one `(Idea, Recipe)` Asset, given Zoho's
 * report for the Asset's stored reference and the Brand's primary Channel. PURE: no I/O, no clock.
 *
 * @param idea           the Idea to confirm-and-log against, or `null` if unknown
 * @param recipe         the Recipe slug naming WHICH Asset the report is for (required, explicit)
 * @param report         Zoho's current report for the reference the caller believes this Asset was
 *                        scheduled under — checked, never trusted blindly
 * @param primaryChannel the Brand's ONE primary Channel (`primaryChannelFrom`/`loadPrimaryChannel`), or
 *                        `null` if not configured
 */
export function planConfirmedLiveLog(
  idea: LedgerIdea | null,
  recipe: string,
  report: ZohoScheduleReport,
  primaryChannel: Channel | null,
): ConfirmedLiveLogPlan {
  if (idea === null) return { ok: false, reason: "unknown-idea" };

  const assets = idea.assets ?? [];
  const asset = findAsset(assets, recipe);
  if (asset === null) return { ok: false, reason: "unknown-recipe", assets };

  if (asset.status === "queued" || asset.status === "in_production") {
    // No live Post to confirm yet — nothing was ever scheduled to check.
    return { ok: false, reason: "not-yet-produced", asset };
  }

  const storedReference = asset.zoho_schedule_reference;
  if (storedReference === undefined) {
    // No MCP schedule-time reference recorded (e.g. it went out via the CSV/S3 fallback) — this Asset
    // is NEVER auto-logged; it stays on the Operator's manual /log-post (ADR-0020, AC4).
    return { ok: false, reason: "no-stored-reference", asset };
  }

  if (primaryChannel === null) {
    return { ok: false, reason: "no-primary-channel", asset };
  }

  if (!referencesMatch(report.reference, storedReference)) {
    // The supplied report is not FOR this Asset's stored reference — refuse rather than trust it
    // (explicit attribution, always-rules #5; AC2: never keyed on timing or inference).
    return { ok: false, reason: "reference-mismatch", asset };
  }

  const primaryStatus = report.statuses.find((s) => s.platform === primaryChannel.platform);
  if (primaryStatus === undefined) {
    return { ok: false, reason: "no-report", asset };
  }

  if (primaryStatus.status !== "live") {
    return { ok: false, reason: "pending", asset, status: primaryStatus.status };
  }

  const { liveUrl, liveAt } = primaryStatus;
  if (liveUrl === undefined || liveUrl.trim().length === 0 || liveAt === undefined || liveAt.trim().length === 0) {
    // Reported "live" but the data needed to log it is incomplete — never half-fabricate a Post URL/time.
    return { ok: false, reason: "pending", asset, status: primaryStatus.status };
  }

  return {
    ok: true,
    asset,
    nextStatus: nextAttributedStatus(asset.status),
    postUrl: liveUrl,
    postedAt: liveAt,
    platform: primaryChannel.platform,
  };
}

// ---------------------------------------------------------------------------
// confirmZohoPostLive — the orchestration shell
// ---------------------------------------------------------------------------

/** Options for `confirmZohoPostLive` (injected paths keep the shell testable without ambient I/O). */
export interface ConfirmZohoPostLiveOptions {
  readonly ledgerPath?: string;
  readonly brandProfilePath?: string;
  /** Optional override for the brands root directory; defaults to `data/brands` (primarily testing). */
  readonly brandsRoot?: string;
}

/**
 * Run the confirmed-live check for one `(Idea, Recipe)` Asset: load the Idea's Assets and the Brand's
 * primary Channel, apply `planConfirmedLiveLog`, and — on success — write the confirmed live Post via
 * the SAME `writeAttributedPost` `/log-post` uses. Called by the Producer (issue #163) once it has
 * fetched Zoho's report for an Asset's stored reference; never calls Zoho/Magnific itself.
 *
 * @param brand    The Brand slug (e.g. `"straw-motion"`). Required.
 * @param ideaId   The Idea's ledger id.
 * @param recipe   The Recipe slug naming WHICH of the Idea's Assets this report is for.
 * @param report   Zoho's current report for the reference the caller believes this Asset was scheduled
 *                 under.
 * @param options  Optional path overrides for testing.
 */
export async function confirmZohoPostLive(
  brand: string,
  ideaId: string,
  recipe: string,
  report: ZohoScheduleReport,
  options: ConfirmZohoPostLiveOptions = {},
): Promise<string> {
  const brandPaths = resolveBrand(brand, options.brandsRoot);
  const ledgerPath = options.ledgerPath ?? brandPaths.ledger;
  const brandProfilePath = options.brandProfilePath ?? brandPaths.brandProfile;

  const [idea, primaryChannel] = await Promise.all([
    loadIdeas(ledgerPath, brand).then((ideas) => findIdea(ideas, ideaId)),
    loadPrimaryChannel(brandProfilePath),
  ]);

  const plan = planConfirmedLiveLog(idea, recipe, report, primaryChannel);

  if (!plan.ok) {
    switch (plan.reason) {
      case "unknown-idea":
        return `Zoho confirmed-live check: unknown Idea ${ideaId} — no Post logged. [Brand: ${brand}]`;
      case "unknown-recipe":
        return `Zoho confirmed-live check ${ideaId}: recipe "${recipe}" is not one of this Idea's Assets — refusing rather than guessing which Post it belongs to. ${describeAssetList(plan.assets)} [Brand: ${brand}]`;
      case "not-yet-produced":
        return `Zoho confirmed-live check ${ideaId}: the "${recipe}" Asset is not yet produced (status: ${plan.asset.status}) — nothing to confirm live. [Brand: ${brand}]`;
      case "no-stored-reference":
        return `Zoho confirmed-live check ${ideaId}: the "${recipe}" Asset has no stored Zoho schedule reference — it was not scheduled via the MCP path (e.g. it went out via the CSV/S3 fallback), so it is never auto-logged. Use /log-post once it is confirmed live. [Brand: ${brand}]`;
      case "no-primary-channel":
        return `Zoho confirmed-live check ${ideaId}: Brand "${brand}" has no configured primary Channel — cannot determine which live Post URL to log. [Brand: ${brand}]`;
      case "reference-mismatch":
        return `Zoho confirmed-live check ${ideaId}: the supplied report is for a different Zoho reference than the "${recipe}" Asset's stored one — refusing rather than trusting it. Nothing logged. [Brand: ${brand}]`;
      case "no-report":
        return `Zoho confirmed-live check ${ideaId}: no report yet for the "${recipe}" Asset's primary Channel — still pending, nothing logged. [Brand: ${brand}]`;
      case "pending":
        return `Zoho confirmed-live check ${ideaId}: the "${recipe}" Asset's primary-Channel post is not yet live (Zoho status: ${plan.status}) — still pending, nothing logged; check again later. [Brand: ${brand}]`;
    }
  }

  await writeAttributedPost(
    brand,
    { ideaId, recipe, nextStatus: plan.nextStatus, postUrl: plan.postUrl, postedAt: plan.postedAt },
    { ledgerPath },
  );

  return `Zoho confirmed-live check ${ideaId}: confirmed live on ${plan.platform} — linked Post ◀ Recipe "${recipe}" for Brand ${brand}. Run /track-performance ${brand} once engagement has accrued.`;
}
