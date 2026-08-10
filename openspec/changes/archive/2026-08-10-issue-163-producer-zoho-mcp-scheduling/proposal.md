## Why

ADR-0020 (accepted 2026-08-10) makes Zoho's MCP tools the primary way a Run's produced News Carousel
Assets get scheduled, with the existing CSV/S3 export (`schedule-batch-export`) retained only as a
fallback. Issues #160 (the MCP schedule PLAN — which Channels, when), #161 (the ledger's
`zoho_schedule_reference` field), and #162 (the confirmed-live auto-log, given a report) are already
merged; they decide WHAT to schedule and how a later live report gets attributed. This slice is the
missing middle: actually DOING the scheduling — driving the Zoho MCP calls, attended, only after the
Operator's SAME in-conversation approval issue #148 already introduced, with Zoho's own Approval
workflow never used and X permanently excluded — and updating the producer agent's own instructions and
the two `schedule-batch-*` capabilities that describe this flow to match.

## What Changes

- **Add `src/schedule-batch/mcp-schedule-port.ts`** — `ZohoSchedulePort`, the narrow seam between this
  orchestration and Zoho's MCP tools (`uploadMediaFromUrl`, `validatePost`, `createSchedule`). Mirrors
  `src/space-driver/port.ts`/`src/media-host/port.ts`'s own hermetic-seam pattern. `ZohoPostRequest`
  carries NO `isApprovalNeeded` field — Zoho's Approval workflow is structurally unreachable through this
  shape, not merely a documented rule. There is deliberately no live TS adapter for this port (unlike
  S3's `LiveMediaHost`): Zoho's MCP tools are only reachable from inside the attended `producer` agent's
  own tool-calling loop, so the "real implementation" is the agent itself, calling the matching real
  `ZohoSocial_*` tool per `.claude/agents/producer.md`'s own documented sequence — exactly the same
  relationship the Space driver's Fallback Protocol has to the live Space.
- **Add `src/schedule-batch/fixtures/fake-zoho-schedule-port.ts`** — `FakeZohoSchedulePort`, the ONLY
  Zoho-MCP stand-in used in this whole diff's tests (hermetic build; mirrors `FakeMediaHost`).
- **Add `src/schedule-batch/mcp-schedule.ts`** — `runMcpSchedule` (the orchestration deep module):
  checks `input.approved === true` BEFORE any `port` call (AC1, zero calls on refusal); per Asset,
  uploads every hosted slide URL ONCE, then per Channel (every group's every channel, `x` defensively
  re-excluded) runs `validatePost` THEN, only on a pass, `createSchedule` (AC2) — a failing Channel is
  recorded and skipped without blocking its Asset's other Channels or a sibling Asset. Also
  `combineZohoScheduleReferences` (flattens one Asset's successfully-scheduled Channels' own references
  into the single value `LedgerAssetRecord.zoho_schedule_reference` accepts) and
  `mcpUnavailableFallbackMessage` (the explicit AC4 fallback-offer text, naming `/export-schedule` and
  stating the whole remaining step reverts to the Operator by hand).
- **Add `src/commands/schedule-via-zoho-mcp.ts`** — `scheduleViaZohoMcpCommand`, the attended
  orchestration shell the `producer` agent calls once the Operator has approved: resolves the Brand's
  paths, reuses the SAME eligibility rule (`selectEligibleAssets`) and the SAME preflight
  (`validateAssetsForExport`, defense in depth) the CSV path already uses, decides WHICH
  Channels/WHEN via the already-merged `buildMcpSchedulePlan` (#160), hosts each planned Asset's slides
  via the injected `MediaHostPort` (#144, unchanged infrastructure), drives `runMcpSchedule`, and records
  every successfully-scheduled Asset's `scheduled_at` + `zoho_schedule_reference` (#161) via
  `AssetStore.writeAsset` — status stays `"produced"` (ADR-0011 unchanged). `options.port === undefined`
  (MCP unavailable) short-circuits to the fallback message before ANY other step (AC4); an unapproved
  call refuses before ANY step too (AC1, defense in depth on top of `runMcpSchedule`'s own check).
- **Extract `describeSkippedAssets`** from `src/commands/export-schedule.ts` into
  `src/schedule-batch/eligibility.ts` (a small, behavior-preserving DRY refactor — its own pre-existing
  test suite is unchanged and stays green) so both orchestration shells report a skipped Asset the SAME
  way.
- **`.claude/agents/producer.md`** — rewrites the "Schedule Batch offer" section to describe the
  MCP-primary sequence (real tool names, in the documented upload -> validate -> schedule order),
  explicitly forbids `ZohoSocial_updateSocialPostApprovalStatus`/`isApprovalNeeded` on any Channel, names
  the CSV/S3 fallback offered explicitly when MCP is unavailable, and states X always stays CSV/manual.
  The agent's own `tools:` frontmatter grants the 10 MCP tools the documented sequence actually calls and
  deliberately WITHHOLDS `ZohoSocial_publishSocialPost` (instant-publish) and
  `ZohoSocial_updateSocialPostApprovalStatus` (Approval workflow) — a structural guard, not just prose.
  A light, additive edit to the "Hard boundary" section reflects the same. Verified: every PRE-EXISTING
  docs-conformance assertion in `src/schedule-batch/approval-gate.docs-test.ts` (issue #148) still passes
  against the rewritten prose, unmodified.
- **`.claude/commands/export-schedule.md`** — documents itself as the explicit CSV/S3 FALLBACK path
  (ADR-0020): Zoho MCP is primary for Facebook/Instagram/TikTok/LinkedIn; this command is retained for
  when MCP is unavailable, and always for X. One wrapped sentence was reflowed (no wording removed) so an
  existing pinned regex keeps matching after the line-wrap point shifted.
- **`CONTEXT.md`**'s **Schedule Batch** glossary entry is rewritten (ADR-0020's own "Consequences") to
  describe both mechanisms — MCP primary, CSV/S3 fallback — rather than only the CSV path. Verified:
  every pre-existing `CONTEXT.md`-pinned assertion in `approval-gate.docs-test.ts` still passes.
- **Add `docs/zoho-mcp-server-setup.md`** — the one-time server-registration note (AC6): register the
  Zoho MCP server at LOCAL scope only, never `project` scope or a committed config (the server URL is
  effectively a bearer token); adding new tools to an already-authenticated server needs a session
  restart PLUS a fresh `claude mcp login` — a stale token fails with a misleading `401 INVALID_OAUTHSCOPE`
  rather than a clear "missing scope" message.
- **Add `src/schedule-batch/mcp-schedule.docs-test.ts`** — pins this slice's own new prose (the MCP tool
  names/order in `producer.md`, the Approval-workflow prohibition, the fallback statements, the new setup
  doc's key facts).

## Non-Goals (explicitly deferred)

- **Any live Zoho MCP call, or any live Magnific call.** Hermetic throughout: every test drives
  `FakeZohoSchedulePort`/`FakeMediaHost`; there is no live TS adapter for `ZohoSchedulePort` (see above).
- **A literal, attended demo scheduling a real Asset into Zoho Social.** The `developer` build agent has
  no Zoho/Magnific MCP tools and makes no live calls (hermetic build pipeline). This slice leaves
  everything wired so the content `producer` agent can perform that demo attended, in the Operator's own
  session, after merge — deferred verification, recorded explicitly in `handoff.md`.
- **The Character Explainer Recipe riding the MCP path** — explicitly out of scope per the ADR (a Reel
  is video; today's MCP-eligible flow here is scoped to `news-carousel` only, mirroring #160's own
  `SUPPORTED_RECIPE` scoping).
- **The one-time Straw Motion 2026-W32 heuristic-matching closeout** — the ADR's own separate, one-time
  exception, not part of this general-purpose slice.
- **CLAUDE.md / `.claude/commands/run-pipeline.md`** — left unchanged in this slice (their Schedule Batch
  approval / Gate 3 prose still describes the CSV-only shape). This is a known limitation, recorded in
  `handoff.md`, deliberately scoped out to keep this slice to the docs the issue explicitly names
  (`producer.md` + the two `schedule-batch-*` capabilities + the server-setup note).

## Capabilities

### Modified Capabilities

- `schedule-batch-approval-gate`: the producer's Schedule Batch offer requirement is restated to
  describe MCP-primary scheduling (no Zoho write-tool before approval, upload -> validate -> schedule)
  with the CSV/S3 export as the explicit fallback — replacing the prior CSV-only framing.

### Added Capabilities

- `schedule-batch-mcp-scheduling`: the orchestration layer that actually drives the Zoho MCP calls —
  `ZohoSchedulePort`, `runMcpSchedule` (AC1/AC2), the structural Approval-workflow exclusion (AC3),
  `scheduleViaZohoMcpCommand` (the shell, records receipts on the ledger), and the explicit MCP-
  unavailable fallback offer (AC4).

### Added Requirements, by capability

- `schedule-batch-export`: this capability is now documented as the explicit CSV/S3 FALLBACK path
  (ADR-0020) — used when Zoho MCP is unavailable, and always for X — never the primary mechanism it was
  before this slice; an Asset it exports never carries `zoho_schedule_reference` (that field is
  MCP-only).

## Impact

- **New code:** `src/schedule-batch/mcp-schedule-port.ts`, `src/schedule-batch/mcp-schedule.ts`
  (+ `.test.ts`), `src/schedule-batch/fixtures/fake-zoho-schedule-port.ts` (+ `.test.ts`),
  `src/commands/schedule-via-zoho-mcp.ts` (+ `.test.ts`), `src/schedule-batch/mcp-schedule.docs-test.ts`,
  `docs/zoho-mcp-server-setup.md`.
- **Modified code:** `src/schedule-batch/eligibility.ts` (adds `describeSkippedAssets`, exported),
  `src/commands/export-schedule.ts` (imports the extracted helper instead of its own private copy — no
  behavior change, its own pre-existing test suite is unchanged and stays green).
- **Modified docs:** `.claude/agents/producer.md`, `.claude/commands/export-schedule.md`, `CONTEXT.md`.
- **Not touched:** `src/schedule-batch/mcp-plan.ts`, `src/schedule-batch/confirmed-live.ts`,
  `src/asset/**`, `src/production-spec/**`, `src/media-host/**` (all read-only, already merged),
  `CLAUDE.md`, `.claude/commands/run-pipeline.md`, any live Brand's `ledger.json`.
- **Hermetic:** no live `spaces_*`/`creations_*`/Zoho MCP call anywhere in the new test suite — every
  test drives `FakeZohoSchedulePort`/`FakeMediaHost`, in-memory, deterministic; `runMcpSchedule` is
  proven pure-ish (I/O only via the injected port) with call-order/call-count assertions.
- **Always-rules upheld:** generate-never-publish (scheduling is not publishing; the Operator's approval,
  BEFORE any Zoho write-tool call, is the human decision that stands in for the old CSV-upload act,
  ADR-0020; the agent's own tool grant structurally withholds instant-publish and the Approval workflow);
  public-metrics-only (N/A — no metrics here); relative-not-absolute (N/A — no scoring here);
  explicit-attribution (each scheduled Asset's receipt is keyed to its own `(ideaId, recipe)`, written
  via the SAME `AssetStore.writeAsset` boundary every other Asset write uses — never inferred);
  ledger-as-source-of-truth (every successfully-scheduled Asset's `scheduled_at`/`zoho_schedule_reference`
  is written there, and only there).
