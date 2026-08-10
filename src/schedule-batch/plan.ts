/**
 * Plan — the pure deep module that assembles a whole Schedule Batch: the CSV files, the manifest, the
 * Operator-facing summary text, and the ledger `scheduled_at` stamps (issue #145, parent #140).
 *
 * Two entry points:
 *
 *   - `validateAssetsForExport` — the PREFLIGHT pass, run before any file is written or any media is
 *     hosted: an eligible Asset with no composed Copy, a Copy missing a variant for one of the
 *     configured Zoho Social Brands' platforms, a wrong slide count, or a targeted platform's own
 *     variant over its combined caption+hashtags cap (today: X's 280 chars — issue #146) all fail
 *     loudly, naming the Idea — never-fabricate (data-handling rule 4). The caller runs this BEFORE any
 *     I/O, so a malformed batch never partially writes. The combined-cap re-check reuses
 *     `../copy/validate.ts`'s `checkCombinedCaptionHashtagsCap` — the SAME check `composeCopyForChannels`
 *     already enforces at composition time (issue #142) — as **defense in depth**: composition should
 *     already have caught an over-cap X variant, but the export re-checks anyway rather than trusting
 *     upstream state blindly, exactly as the issue asks.
 *   - `buildSchedulePlan` — given already-resolved inputs (the eligible Assets in schedule order, their
 *     parallel `ScheduleSlot`s, and their already-hosted media URLs/keys), assembles the full plan.
 *     PURE: no disk, no clock (every timestamp comes from `slots`/`createdAt`, both caller-supplied).
 *
 * `X`'s 4-slide cap and every other platform's full 7 slides (PRD #140 stories 8-9) are applied HERE,
 * not in `csv.ts` — `csv.ts` only knows how to render a row it is GIVEN, never which platform gets how
 * many slides.
 */

import type { Copy, CopyVariant } from "../copy/contract.ts";
import { checkCombinedCaptionHashtagsCap } from "../copy/validate.ts";
import type { LedgerAssetRecord } from "../asset/asset.ts";
import type { ZohoSocialBrand } from "../production-spec/brand-profile.ts";
import { CAROUSEL_SLIDE_COUNT } from "../production-spec/news-carousel-contract.ts";
import type { EligibleAsset } from "./eligibility.ts";
import type { ScheduleSlot } from "./schedule.ts";
import { formatZohoScheduleTime } from "./timezone.ts";
import { buildZohoCsvRow, buildZohoCsvFile, zohoCsvFileName } from "./csv.ts";
import { buildManifest, type ScheduleManifest, type ScheduleManifestAssetEntry } from "./manifest.ts";

/** The platform whose rows carry only the first `X_SLIDE_LIMIT` slides (PRD #140 story 9). Every other
 *  platform carries all `CAROUSEL_SLIDE_COUNT` slides, in narrative order (story 8). Exported (issue
 *  #160) so the MCP schedule plan's own permanent X-exclusion (`src/schedule-batch/mcp-plan.ts`) reads
 *  the SAME literal rather than a second, independently-typed `"x"` string. */
export const X_PLATFORM = "x";
const X_SLIDE_LIMIT = 4;

/** Find `platform`'s own `CopyVariant` on a structured `Copy`, or `null` when there is none — either
 *  because `copy.variants` is absent entirely, or because no entry matches. Pure. */
export function findCopyVariant(copy: Copy, platform: string): CopyVariant | null {
  return copy.variants?.find((v) => v.platform === platform) ?? null;
}

/** The media URLs one row gets for `platform`: the first 4 for X, every slide (in order) otherwise. */
function mediaUrlsForPlatform(platform: string, urls: readonly string[]): readonly string[] {
  return platform === X_PLATFORM ? urls.slice(0, X_SLIDE_LIMIT) : urls;
}

// ---------------------------------------------------------------------------
// validateAssetsForExport — the preflight pass (never fabricate)
// ---------------------------------------------------------------------------

/** One problem found while validating an eligible Asset against the configured Zoho Social Brands. */
export interface EligibilityProblem {
  readonly ideaId: string;
  readonly message: string;
}

/** Every platform any configured Zoho Social Brand needs a Copy variant for, deduplicated. */
function everyConfiguredPlatform(zohoBrands: readonly ZohoSocialBrand[]): readonly string[] {
  const seen = new Set<string>();
  for (const zb of zohoBrands) {
    for (const channel of zb.channels) seen.add(channel.platform);
  }
  return [...seen];
}

/**
 * Validate every eligible Asset can actually be exported: it must carry a composed Copy, that Copy must
 * carry a variant for EVERY platform any configured Zoho Social Brand targets, every one of THOSE
 * variants must sit within that platform's own combined caption+hashtags cap where one applies (today:
 * X's 280 chars — issue #146's defense-in-depth re-check of issue #142's composition-time cap), and the
 * Asset must have exactly `CAROUSEL_SLIDE_COUNT` downloaded slides. Returns EVERY problem found across
 * EVERY Asset (never just the first) — the caller fails the whole export loudly, before touching the
 * Media Host or writing any file, when this returns a non-empty list. PURE: no I/O.
 */
export function validateAssetsForExport(
  eligible: readonly EligibleAsset[],
  zohoBrands: readonly ZohoSocialBrand[],
): readonly EligibilityProblem[] {
  const platforms = everyConfiguredPlatform(zohoBrands);
  const problems: EligibilityProblem[] = [];

  for (const { ideaId, asset } of eligible) {
    if (asset.copy === undefined) {
      problems.push({ ideaId, message: `${ideaId}: has no composed Copy at all — cannot export.` });
    } else {
      for (const platform of platforms) {
        const variant = findCopyVariant(asset.copy, platform);
        if (variant === null) {
          problems.push({
            ideaId,
            message: `${ideaId}: composed Copy has no variant for platform "${platform}" — cannot export.`,
          });
          continue;
        }
        // Defense in depth (issue #146): composition already enforces this (issue #142), but the
        // export re-checks rather than trusting upstream state — an over-cap X variant must never
        // reach Zoho, where it would otherwise be silently rejected only at upload time.
        const capError = checkCombinedCaptionHashtagsCap(variant, platform);
        if (capError !== null) {
          problems.push({ ideaId, message: `${ideaId}: ${capError.message}` });
        }
      }
    }

    const slideCount = asset.asset_paths?.length ?? 0;
    if (slideCount !== CAROUSEL_SLIDE_COUNT) {
      problems.push({
        ideaId,
        message:
          `${ideaId}: expected exactly ${CAROUSEL_SLIDE_COUNT} downloaded slides, found ${slideCount} ` +
          "— cannot export.",
      });
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------
// buildSchedulePlan
// ---------------------------------------------------------------------------

/** One eligible Asset's already-hosted media, in the SAME slide order as its own `asset_paths`. */
export interface AssetHostedMedia {
  readonly keys: readonly string[];
  readonly urls: readonly string[];
}

export interface BuildSchedulePlanInput {
  readonly brand: string;
  readonly format: string;
  readonly run: string;
  readonly zohoBrands: readonly ZohoSocialBrand[];
  /** The eligible Assets, already sorted into the order they are scheduled in. */
  readonly eligible: readonly EligibleAsset[];
  /** ONE slot per `eligible` entry, same order/length (`eligible[i]` schedules at `slots[i]`). */
  readonly slots: readonly ScheduleSlot[];
  /** ONE hosted-media entry per `eligible` entry, same order/length. */
  readonly hostedMedia: readonly AssetHostedMedia[];
  /** ISO-8601 — stamped onto the manifest's `created_at`. Always the caller's explicit clock. */
  readonly createdAt: string;
}

export interface SchedulePlanCsvFile {
  readonly fileName: string;
  readonly content: string;
  readonly rowCount: number;
}

/** One Asset's ledger stamp this plan calls for — the caller writes this via `AssetStore.writeAsset`. */
export interface SchedulePlanLedgerStamp {
  readonly ideaId: string;
  readonly recipe: string;
  /** ISO-8601 UTC. */
  readonly scheduledAt: string;
}

export interface SchedulePlan {
  readonly csvFiles: readonly SchedulePlanCsvFile[];
  readonly manifest: ScheduleManifest;
  /** Operator-facing summary text: per Asset, its day/timestamp (in every configured Zoho Social
   *  Brand's own clock), its platforms, and any stripped notes (issue #145 AC4). */
  readonly summary: string;
  readonly ledgerStamps: readonly SchedulePlanLedgerStamp[];
}

/** This Asset's own stripped LinkedIn-style unresolved-mentions notes, one per variant that carries
 *  any, mirroring `src/asset/output-bundle.ts`'s `unresolvedMentionsNote` wording (never embedded in an
 *  exported caption — surfaced here, in the manifest/summary, instead). */
function strippedMentionNotes(asset: LedgerAssetRecord): string[] {
  const variants = asset.copy?.variants ?? [];
  const notes: string[] = [];
  for (const variant of variants) {
    const unresolved = variant.unresolvedMentions;
    if (unresolved !== undefined && unresolved.length > 0) {
      notes.push(
        `[Unresolved ${variant.platform} mentions - no committed handle, review before publishing: ` +
          `${unresolved.join(", ")}]`,
      );
    }
  }
  return notes;
}

/**
 * Assemble the full Schedule Batch plan from already-resolved inputs. PURE: no disk, no clock read
 * (every timestamp traces back to `slots`/`createdAt`). Assumes `validateAssetsForExport` already
 * returned no problems for `eligible` against `zohoBrands` — a missing Copy variant here is an internal
 * error (the caller's contract), not a normal, reportable outcome.
 */
export function buildSchedulePlan(input: BuildSchedulePlanInput): SchedulePlan {
  const { eligible, slots, hostedMedia, zohoBrands } = input;
  if (eligible.length !== slots.length || eligible.length !== hostedMedia.length) {
    throw new Error(
      "schedule-batch: buildSchedulePlan given mismatched eligible/slots/hostedMedia lengths " +
        `(${eligible.length}/${slots.length}/${hostedMedia.length}) — internal error.`,
    );
  }

  // rowsByAsset[i][csvFileName] = the ordered Channel labels Asset i was written under in that file.
  const rowsByAsset: Record<string, string[]>[] = eligible.map(() => ({}));

  const csvFiles: SchedulePlanCsvFile[] = zohoBrands.map((zohoBrand, zohoBrandIndex) => {
    const platforms = zohoBrand.channels.map((c) => c.platform);
    const fileName = zohoCsvFileName(zohoBrandIndex, platforms);
    const rows: string[] = [];

    eligible.forEach(({ asset }, i) => {
      const slot = slots[i]!;
      const media = hostedMedia[i]!;
      const scheduleTime = formatZohoScheduleTime(slot.utcMs, zohoBrand.timezone);

      for (const channel of zohoBrand.channels) {
        const variant = findCopyVariant(asset.copy!, channel.platform);
        if (variant === null) {
          // Guaranteed absent by the caller's validateAssetsForExport preflight — this is a contract
          // violation, not a normal outcome, so it fails loudly rather than silently skipping a row.
          throw new Error(
            `schedule-batch: no Copy variant for platform "${channel.platform}" — call ` +
              "validateAssetsForExport first and refuse the export on any problem it reports.",
          );
        }
        rows.push(
          buildZohoCsvRow({
            scheduleTime,
            channelLabel: channel.label,
            caption: variant.caption,
            hashtags: variant.hashtags,
            mediaUrls: mediaUrlsForPlatform(channel.platform, media.urls),
          }),
        );
        rowsByAsset[i]![fileName] = [...(rowsByAsset[i]![fileName] ?? []), channel.label];
      }
    });

    return { fileName, content: buildZohoCsvFile(rows), rowCount: rows.length };
  });

  const manifestAssets: ScheduleManifestAssetEntry[] = eligible.map(({ ideaId, asset }, i) => ({
    idea: ideaId,
    recipe: asset.recipe,
    scheduled_at: new Date(slots[i]!.utcMs).toISOString(),
    s3_keys: hostedMedia[i]!.keys,
    urls: hostedMedia[i]!.urls,
    rows: rowsByAsset[i]!,
    stripped_notes: strippedMentionNotes(asset),
  }));

  const manifest = buildManifest({
    brand: input.brand,
    format: input.format,
    run: input.run,
    createdAt: input.createdAt,
    csvFiles: csvFiles.map((f) => f.fileName),
    assets: manifestAssets,
  });

  const ledgerStamps: SchedulePlanLedgerStamp[] = eligible.map(({ ideaId, asset }, i) => ({
    ideaId,
    recipe: asset.recipe,
    scheduledAt: manifestAssets[i]!.scheduled_at,
  }));

  const summaryLines = eligible.map(({ ideaId, title }, i) => {
    const perFile = zohoBrands
      .map((zb, zi) => `${csvFiles[zi]!.fileName}: ${formatZohoScheduleTime(slots[i]!.utcMs, zb.timezone)} (${zb.timezone})`)
      .join("; ");
    const platforms = [...new Set(Object.values(rowsByAsset[i]!).flat())].join(", ");
    const notes = manifestAssets[i]!.stripped_notes;
    const notesSuffix = notes.length > 0 ? ` — notes: ${notes.join(" | ")}` : "";
    return `${ideaId} "${title}": ${perFile} — platforms: ${platforms}${notesSuffix}`;
  });

  return { csvFiles, manifest, summary: summaryLines.join("\n"), ledgerStamps };
}
