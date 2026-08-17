/**
 * Zoho Schedule port — the ONLY seam between the MCP scheduling orchestration and Zoho's own MCP tools
 * (issue #163, ADR-0020).
 *
 * Mirrors two existing seams so the build stays hermetic: `src/space-driver/port.ts` (the Magnific
 * seam, `SpaceMcpPort`) and `src/media-host/port.ts` (the S3 seam, `MediaHostPort`). The build is
 * hermetic: no live Zoho MCP call, no network, no credits (CLAUDE.md build pipeline) — tests ALWAYS
 * inject a FAKE implementing this interface (`fixtures/fake-zoho-schedule-port.ts`).
 *
 * Unlike the S3 seam, there is deliberately NO live TS adapter for this port. S3 is a real,
 * Node-callable AWS API; Zoho's MCP tools are only reachable from INSIDE the attended `producer`
 * agent's own tool-calling loop (real tool names — `ZohoSocial_uploadSocialMediaFromUrl`,
 * `ZohoSocial_validateSocialPost`, `ZohoSocial_createSocialSchedule` — documented in
 * `.claude/agents/producer.md`). The "real implementation" of this port is the agent itself, acting out
 * each method by calling the matching live MCP tool with the request this module built — exactly the
 * same relationship `src/space-driver/driver.ts`'s Fallback Protocol has to the live Space: a documented
 * procedure the agent follows, never a literal subprocess call from this codebase.
 *
 * Four operations, matching ADR-0020's own ordered sequence (upload from the already-S3-hosted URL,
 * validate, THEN schedule — never a different order) plus one read-only reconciliation operation (issue
 * #209):
 *
 *   - `uploadMediaFromUrl` — upload one already-hosted (S3) media URL into Zoho's own media library,
 *     returning the media id `validatePost`/`createSchedule` reference.
 *   - `validatePost` — Zoho's own pre-flight check for one platform/channel's post content + media,
 *     BEFORE anything is actually scheduled.
 *   - `createSchedule` — schedule the already-validated post.
 *   - `listSchedules` — read-only: every schedule Zoho currently holds for one Channel target. This is
 *     the reconciliation seam the Schedule Outbox (`src/schedule-outbox/`, issue #209) drives when it
 *     resumes a `'reserved'`-but-unconfirmed entry after a crash — it asks Zoho what actually happened
 *     rather than guessing (never "assume it failed and retry", which double-posts; never "assume it
 *     succeeded", which silently drops a post). Maps to the real, already-granted
 *     `ZohoSocial_listSocialSchedules` MCP tool (`.claude/agents/producer.md`'s own tool list;
 *     `docs/zoho-mcp-server-setup.md`) — granted from the start, simply unused by this port until now.
 *
 * `ZohoPostRequest` carries NO `isApprovalNeeded` field, and this module has no method resembling
 * `ZohoSocial_updateSocialPostApprovalStatus` — ADR-0020: Zoho's own Approval workflow is never used, on
 * any Channel (live-tested: it only dead-ends at a plain draft that still needs manual scheduling). This
 * is a structural guarantee (the shape has no such field to set), not a runtime check.
 */

import type { ZohoScheduleReference } from "../asset/asset.ts";

/** What a successful `uploadMediaFromUrl` returns: Zoho's own media identifier for the uploaded file. */
export interface ZohoUploadedMedia {
  readonly mediaId: string;
}

/** One target `validatePost`/`createSchedule` act against — a single platform/channel, identified by
 *  Zoho's own EXACT channel label (never the OrganicGrowth platform slug alone — Zoho matches accounts
 *  by label, `ZohoChannelMapping.label`, `src/production-spec/brand-profile.ts`). */
export interface ZohoScheduleTarget {
  readonly zohoBrandName: string;
  readonly platform: string;
  readonly label: string;
}

/**
 * One post's already-resolved content + target — everything `validatePost`/`createSchedule` need, no
 * further lookup required. Carries NO `isApprovalNeeded` field (ADR-0020) — Zoho's Approval workflow can
 * never be reached through this shape.
 */
export interface ZohoPostRequest {
  readonly target: ZohoScheduleTarget;
  /** Every uploaded slide's Zoho media id, in slide order — shared across every Channel this Asset
   *  schedules to (the SAME media, one post per platform). */
  readonly mediaIds: readonly string[];
  /** The full post body: caption + hashtags already combined (`csv.ts`'s `zohoCaptionField` — the SAME
   *  combination the CSV path's own Post Content field uses, minus its CSV-specific `\n`-literal line
   *  encoding, which only exists for the CSV dialect). */
  readonly content: string;
  /** Zoho's own `MM/DD/YYYY HH:mm` dialect, already rendered in THIS target's Zoho Social Brand's own
   *  clock (`timezone.ts`'s `formatZohoScheduleTime` — the SAME rendering `mcp-plan.ts`'s
   *  `McpTargetGroup.scheduledAtLocal` already carries). */
  readonly scheduledAtLocal: string;
}

/** Zoho's own validation verdict for one `ZohoPostRequest`, BEFORE it is scheduled. */
export interface ZohoValidateResult {
  readonly ok: boolean;
  /** Present only when `ok === false` — every problem Zoho's own validator reported, never just the
   *  first one. */
  readonly problems?: readonly string[];
}

/** What a successful `createSchedule` returns for ONE channel's scheduled post. */
export interface ZohoCreateScheduleResult {
  /** Whatever reference Zoho's own tool returns — string or array of strings, stored VERBATIM (mirrors
   *  `LedgerAssetRecord.zoho_schedule_reference`'s own never-reshaped contract, issue #161). */
  readonly reference: ZohoScheduleReference;
}

/** One schedule Zoho currently reports for a given Channel target (issue #209's reconciliation seam) —
 *  just enough to match it back against a `ZohoPostRequest` this codebase itself generated
 *  (`src/schedule-outbox/reconcile.ts`'s `matchesRequest`): its own reference, the exact post content,
 *  and the exact local schedule time. Never more than this port's own `ZohoPostRequest` already carries
 *  — reconciliation compares like against like. */
export interface ZohoScheduleRecord {
  readonly reference: ZohoScheduleReference;
  readonly content: string;
  readonly scheduledAtLocal: string;
}

/**
 * The narrow port the MCP scheduling orchestration (`src/schedule-batch/mcp-schedule.ts`) drives. A
 * FAKE implements this in tests (`fixtures/fake-zoho-schedule-port.ts`); at runtime, the attended
 * `producer` agent itself plays this role by calling the matching real MCP tool for each method (see
 * the module doc above — there is no live TS adapter). Callers make NO call outside this interface.
 */
export interface ZohoSchedulePort {
  uploadMediaFromUrl(url: string): Promise<ZohoUploadedMedia>;
  validatePost(request: ZohoPostRequest): Promise<ZohoValidateResult>;
  createSchedule(request: ZohoPostRequest): Promise<ZohoCreateScheduleResult>;
  /** Read-only: every schedule Zoho currently holds for `target` (issue #209's reconciliation seam). */
  listSchedules(target: ZohoScheduleTarget): Promise<readonly ZohoScheduleRecord[]>;
}
