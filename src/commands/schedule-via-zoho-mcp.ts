/**
 * `scheduleViaZohoMcpCommand` — the attended orchestration shell for ADR-0020's MCP-primary Schedule
 * Batch path (issue #163). The `producer` agent calls this once the Operator has approved, in the same
 * conversation, every one of a Run's produced outputs and captions (the SAME checkpoint issue #148
 * added) — it resolves what to schedule, hosts media, drives the Zoho MCP calls through the injected
 * `ZohoSchedulePort` (the real MCP tools at runtime, a FAKE in every test — hermetic build), and records
 * every receipt on the ledger.
 *
 * Thin: resolve the Brand's paths, load the run's Ideas scoped to `(format, run)`
 * (`src/schedule-batch/select.ts`), decide which Assets are eligible (`src/schedule-batch/eligibility.ts`
 * — the SAME `news-carousel`/`produced`/not-yet-`scheduled_at` rule the CSV path uses), load the Brand's
 * Zoho Social Brand config (`loadZohoConfig`, issue #143), decide WHICH Channels/WHEN via
 * `buildMcpSchedulePlan` (`src/schedule-batch/mcp-plan.ts`, issue #160 — including `options.postsPerDay`,
 * issue #171, passed straight through to the SAME shared `deriveScheduleSlots` the CSV path uses), run
 * the SAME preflight validation the CSV path runs (`validateAssetsForExport`, defense in depth — never
 * trusted blindly), host each planned Asset's slides via the injected `MediaHostPort` (issue #144 —
 * unchanged infrastructure, the SAME Media Host the CSV export already uses, now under an unguessable
 * key with a signed, expiring link derived from that Asset's own scheduled time — issue #198), then
 * drive `runMcpSchedule`
 * (`src/schedule-batch/mcp-schedule.ts`) — which itself enforces AC1 (no Zoho write-tool before
 * approval) and AC2 (upload, then validate, then schedule). Every successfully-scheduled Asset's
 * `scheduled_at` + `zoho_schedule_reference` (issue #161) is stamped via `AssetStore.writeAsset`
 * (ledger-as-source-of-truth) — its `status` stays `"produced"` (ADR-0011's lifecycle is unchanged; the
 * confirmed-live check, `src/schedule-batch/confirmed-live.ts`, issue #162, is what later moves it to
 * `"posted"`, once Zoho reports it live).
 *
 * **AC1, enforced at the very top of this shell too:** an unapproved call (`options.approved !== true`)
 * refuses before ANY step runs — no eligibility read, no hosting, no port call.
 *
 * **AC4, the explicit CSV/S3 fallback:** `options.port === undefined` means Zoho MCP is unavailable —
 * this shell immediately returns `mcpUnavailableFallbackMessage` and does NOTHING else (no ledger read,
 * no hosting). There is no silent, automatic switch — the caller (the `producer` agent, per its own
 * documented instructions) is the one who decides to offer `/export-schedule` instead.
 *
 * Every business-rule refusal (not approved, MCP unavailable, an empty run, a Brand not configured, a
 * preflight problem, a schedule time inside the 1-hour lead window) is a RETURNED, clearly-worded
 * string — never a throw — mirroring `src/commands/export-schedule.ts`'s own posture exactly.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveBrand } from "../brand/resolver.ts";
import { briefShortName } from "../production-spec/store.ts";
import { loadZohoConfig } from "../production-spec/brand-profile.ts";
import { writeAsset } from "../asset/store.ts";

import { loadScheduleBatchIdeas } from "../schedule-batch/select.ts";
import { selectEligibleAssets, describeSkippedAssets } from "../schedule-batch/eligibility.ts";
import { buildMcpSchedulePlan } from "../schedule-batch/mcp-plan.ts";
import { validateAssetsForExport } from "../schedule-batch/plan.ts";
import { slideBaseName, scheduleMediaKey } from "../schedule-batch/media-key.ts";
import { computeMediaExpiry } from "../schedule-batch/media-expiry.ts";
import {
  runMcpSchedule,
  mcpUnavailableFallbackMessage,
  type McpScheduleAssetInput,
} from "../schedule-batch/mcp-schedule.ts";
import type { ZohoSchedulePort } from "../schedule-batch/mcp-schedule-port.ts";
import type { MediaHostPort } from "../media-host/port.ts";
import { randomMediaKeyToken } from "../media-host/token.ts";

// ---------------------------------------------------------------------------
// Default Media Host (deferred live wiring — mirrors export-schedule.ts's own DEFAULT_MEDIA_HOST)
// ---------------------------------------------------------------------------

function noMediaHostConfigured(): never {
  throw new Error(
    "schedule-via-zoho-mcp: no Media Host is configured. Pass options.mediaHost explicitly (e.g. " +
      "`new LiveMediaHost({ config: { bucket, region } })`, src/media-host/live/adapter.ts) — this " +
      "command's default has no live wiring, mirroring export-schedule's own deferred default. Tests " +
      "always inject FakeMediaHost.",
  );
}

/** Runtime placeholder: THROWS rather than silently no-op'ing (a Media Host that does nothing would
 *  produce a Zoho post with a broken image link). NEVER exercised in tests. */
const DEFAULT_MEDIA_HOST: MediaHostPort = {
  convertToJpg: () => noMediaHostConfigured(),
  upload: () => noMediaHostConfigured(),
  delete: () => noMediaHostConfigured(),
};

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ScheduleViaZohoMcpOptions {
  readonly brandsRoot?: string;
  readonly ledgerPath?: string;
  readonly brandProfilePath?: string;
  /** Injected clock — the "now" the 1-hour-future lead-window guard runs against. Defaults to the real
   *  clock. */
  readonly now?: () => string;
  /** The Media Host port (fake in tests; the deferred default at runtime). */
  readonly mediaHost?: MediaHostPort;
  /** Where converted-to-JPG staging files are written before upload. Defaults to a fresh, self-cleaning
   *  temp directory; primarily for testing. */
  readonly tempDir?: string;
  /** The Zoho MCP port. ABSENT means Zoho MCP is unavailable — the whole call short-circuits to the
   *  explicit CSV/S3 fallback offer (AC4), before anything else runs. */
  readonly port?: ZohoSchedulePort;
  /** REQUIRED, explicit: the Operator's in-conversation approval of this Run's outputs and captions
   *  (ADR-0020). There is no default — an omitted or `false` value refuses (AC1), before any Zoho call. */
  readonly approved: boolean;
  /** How many eligible Assets share one calendar day before the schedule advances to the next (issue
   *  #171 — the Unhypped Daily Format's ~6 Assets/day volume), passed straight through to the SAME
   *  shared derivation the CSV/S3 fallback path uses (`buildMcpSchedulePlan` -> `deriveScheduleSlots`).
   *  Defaults to 1 (one Asset per day), reproducing every existing (weekly) Format's schedule
   *  byte-for-byte. */
  readonly postsPerDay?: number;
}

// ---------------------------------------------------------------------------
// scheduleViaZohoMcpCommand
// ---------------------------------------------------------------------------

export async function scheduleViaZohoMcpCommand(
  brand: string,
  format: string,
  run: string,
  startDate: string,
  options: ScheduleViaZohoMcpOptions,
): Promise<string> {
  // --- AC4: Zoho MCP unavailable -> the explicit fallback offer, nothing else runs ------------------
  if (options.port === undefined) {
    return mcpUnavailableFallbackMessage(brand, format, run, startDate);
  }

  // --- AC1: no Zoho write-tool before the Operator's in-conversation approval ------------------------
  if (!options.approved) {
    return (
      `Zoho MCP scheduling for Brand: ${brand}, Format: ${format}, Run: ${run} — refused: the Operator ` +
      "has not yet approved this Run's outputs and captions in this conversation. No Zoho write-tool " +
      "was called."
    );
  }

  const brandPaths = resolveBrand(brand, options.brandsRoot);
  const ledgerPath = options.ledgerPath ?? brandPaths.ledger;
  const brandProfilePath = options.brandProfilePath ?? brandPaths.brandProfile;
  const now = (options.now ?? (() => new Date().toISOString()))();
  const mediaHost = options.mediaHost ?? DEFAULT_MEDIA_HOST;

  const header = `Scheduling via Zoho MCP for Brand: ${brand}, Format: ${format}, Run: ${run}.`;

  // --- 1. Load this run's Ideas, decide eligibility (SAME rule the CSV path uses) --------------------

  const ideas = await loadScheduleBatchIdeas(ledgerPath, brand, format, run);
  const { eligible, skipped } = selectEligibleAssets(ideas);

  if (eligible.length === 0) {
    return `${header}\nNo eligible Assets to schedule — nothing done.${describeSkippedAssets(skipped)}`;
  }

  // --- 2. This Brand's Zoho Social Brand config (issue #143) -----------------------------------------

  const zohoConfig = await loadZohoConfig(brandProfilePath, brand);
  if (!zohoConfig.configured) {
    return `${header}\n${zohoConfig.message}\nNothing scheduled.`;
  }

  // --- 3. Decide WHICH Channels/WHEN (issue #160) — refuses on empty-run/lead-window too -------------

  const nowMs = Date.parse(now);
  const postsPerDay = options.postsPerDay ?? 1;
  const plan = buildMcpSchedulePlan({ eligible, run, zohoConfig, startDate, nowMs, postsPerDay });
  if (!plan.ok) {
    return `${header}\n${plan.message}`;
  }

  // --- 4. Preflight validation — the SAME check the CSV path runs, defense in depth ------------------

  const problems = validateAssetsForExport(eligible, zohoConfig.zohoBrands);
  if (problems.length > 0) {
    const lines = problems.map((p) => `  - ${p.message}`);
    return (
      `${header}\nSCHEDULING REFUSED — ${problems.length} problem(s) found (fix these first; nothing ` +
      `was scheduled):\n${lines.join("\n")}`
    );
  }

  // --- 5. Host every planned Asset's slides once, matching the plan's own order ----------------------

  const byIdeaId = new Map(eligible.map((e) => [e.ideaId, e]));
  const ownsTempDir = options.tempDir === undefined;
  const stagingDir = options.tempDir ?? (await mkdtemp(join(tmpdir(), "og-zoho-mcp-")));
  let assetsInput: McpScheduleAssetInput[];
  try {
    assetsInput = [];
    for (const planned of plan.assets) {
      const source = byIdeaId.get(planned.ideaId);
      if (source === undefined) continue; // defensive — plan.assets is always drawn from `eligible`
      const ideaShortName = briefShortName(planned.ideaId, run);
      // The link's expiry is derived from THIS Asset's own scheduled time (issue #198) — never a fixed
      // default. In practice Zoho's own `uploadMediaFromUrl` fetches this SAME link moments later, in
      // this same call (`runMcpSchedule`, step 6 below) — but the expiry still tracks `scheduledAtUtc`
      // exactly like the CSV/S3 fallback path, so both paths derive expiry the same way.
      const { expiresInSeconds, cappedByAwsLimit, expiresAt } = computeMediaExpiry(planned.scheduledAtUtc, now);
      // Unreachable in practice — `buildMcpSchedulePlan`'s own presign-window preflight (`mcp-plan.ts`,
      // issue #198 QA Round 1 Defect #1) already refused the WHOLE plan if any Asset's link would land
      // before its own scheduled time, so `plan.assets` never carries one that would trip this. Kept as
      // an explicit, named internal-error guard (never a silent drift) rather than trusting that check
      // blindly, mirroring `buildSchedulePlan`'s own "no Copy variant" contract-violation throw.
      if (cappedByAwsLimit && Date.parse(expiresAt) < Date.parse(planned.scheduledAtUtc)) {
        throw new Error(
          `schedule-via-zoho-mcp: internal error — "${planned.ideaId}" produced a media link (expiring ` +
            `${expiresAt}) that cannot reach its own scheduled time (${planned.scheduledAtUtc}) despite ` +
            "already passing buildMcpSchedulePlan's presign-window preflight — this should be unreachable.",
        );
      }
      const urls: string[] = [];
      for (const slidePath of source.asset.asset_paths ?? []) {
        const base = slideBaseName(slidePath);
        const key = scheduleMediaKey(brand, run, ideaShortName, base, randomMediaKeyToken());
        const destPath = join(stagingDir, `${ideaShortName}-${base}.jpg`);
        await mediaHost.convertToJpg(slidePath, destPath);
        const { url } = await mediaHost.upload(destPath, key, { expiresInSeconds });
        urls.push(url);
      }
      assetsInput.push({
        ideaId: planned.ideaId,
        recipe: planned.recipe,
        scheduledAtUtc: planned.scheduledAtUtc,
        groups: planned.groups,
        copy: source.asset.copy!, // guaranteed present — validateAssetsForExport already confirmed it
        mediaUrls: urls,
      });
    }
  } finally {
    if (ownsTempDir) {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => {
        /* best-effort cleanup; never let a cleanup failure mask the real result */
      });
    }
  }

  // --- 6. Drive the actual Zoho MCP calls (AC1/AC2/AC3 enforced inside runMcpSchedule) ---------------

  const result = await runMcpSchedule({ assets: assetsInput, approved: true, port: options.port });
  if (!result.ok) {
    // Unreachable in practice (already checked options.approved above) — handled for completeness.
    return `${header}\n${result.message}`;
  }

  // --- 7. Record every receipt: scheduled_at + zoho_schedule_reference, status unchanged (ADR-0011) --

  for (const outcome of result.scheduled) {
    await writeAsset(
      outcome.ideaId,
      outcome.recipe,
      { status: "produced", scheduled_at: outcome.scheduledAt, zoho_schedule_reference: outcome.reference },
      { ledgerPath },
    );
  }

  // --- 8. Report ---------------------------------------------------------------------------------

  const lines = [header];
  if (result.scheduled.length > 0) {
    lines.push(
      "Scheduled:",
      ...result.scheduled.map((o) => `  - ${o.ideaId}: ${o.scheduledPlatforms.join(", ")} at ${o.scheduledAt}`),
    );
  }
  if (result.failures.length > 0) {
    lines.push("Failures:", ...result.failures.map((f) => `  - ${f.message}`));
  }
  if (result.scheduled.length === 0 && result.failures.length === 0) {
    lines.push(
      "Nothing to schedule via MCP (every configured Zoho Social Brand is X-only for this run's " +
        "eligible Assets).",
    );
  }
  const skipSuffix = describeSkippedAssets(skipped);
  if (skipSuffix.length > 0) lines.push(skipSuffix);
  return lines.join("\n");
}
