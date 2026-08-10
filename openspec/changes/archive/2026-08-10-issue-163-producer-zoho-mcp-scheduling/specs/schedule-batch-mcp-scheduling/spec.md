## ADDED Requirements

### Requirement: No Zoho write-tool is ever called before the Operator's explicit approval

`runMcpSchedule` (`src/schedule-batch/mcp-schedule.ts`) SHALL check `input.approved === true` BEFORE
calling `input.port` at all. When `input.approved` is `false`, it SHALL return
`{ ok: false, reason: "not-approved", message }` and SHALL make ZERO calls to `input.port` — never a
throw. `scheduleViaZohoMcpCommand` (`src/commands/schedule-via-zoho-mcp.ts`) SHALL independently refuse,
BEFORE reading the Brand's ledger, the Zoho config, or hosting any media, whenever `options.approved` is
not `true` — a defense-in-depth check on top of `runMcpSchedule`'s own.

#### Scenario: runMcpSchedule with approved: false makes ZERO port calls and refuses clearly

- **GIVEN** at least one Asset ready to schedule and a `FakeZohoSchedulePort`
- **WHEN** `runMcpSchedule` is called with `approved: false`
- **THEN** the result is `{ ok: false, reason: "not-approved" }`
- **AND** the port recorded zero calls

#### Scenario: scheduleViaZohoMcpCommand with approved: false refuses before any I/O

- **GIVEN** a fixture Brand with one eligible news-carousel Asset, a configured Zoho Social Brand, an
  injected `FakeMediaHost`, and an injected `FakeZohoSchedulePort`
- **WHEN** `scheduleViaZohoMcpCommand` is called with `approved: false`
- **THEN** the returned message states the Operator has not yet approved
- **AND** the Zoho port recorded zero calls
- **AND** the Media Host recorded zero calls
- **AND** the Asset's `scheduled_at` remains unset, re-read through the ledger store

### Requirement: The sequence is upload, then validate, then schedule, per Channel independently

`runMcpSchedule` SHALL, per Asset, upload every hosted slide URL EXACTLY ONCE via
`port.uploadMediaFromUrl` (shared across every Channel that Asset schedules to), BEFORE any
`validatePost`/`createSchedule` call for that Asset. THEN, per Channel (every target group's every
Channel), it SHALL call `port.validatePost` BEFORE `port.createSchedule`, and SHALL call
`port.createSchedule` ONLY when `validatePost` returned `{ ok: true }` — never the reverse, never
skipping the validate call. A Channel whose `validatePost` call returns `{ ok: false }` SHALL be
recorded as a failure (`reason: "validation-failed"`) and skipped — it SHALL NOT block scheduling that
SAME Asset's other Channels, nor a sibling Asset's Channels. A Channel with no composed Copy variant for
its platform SHALL be recorded as a failure (`reason: "no-copy-variant"`) and skipped, never crash.

#### Scenario: every slide is uploaded once per Asset, before any validate/schedule call

- **GIVEN** one Asset with 2 hosted slide URLs and one target group of 2 Channels
- **WHEN** `runMcpSchedule` is called with `approved: true`
- **THEN** the port's recorded call kinds are, in order: upload, upload, validate, schedule, validate,
  schedule
- **AND** every validate/schedule request's `mediaIds` equals the uploaded media ids, in upload order

#### Scenario: a failing validate is never followed by a schedule call for that SAME Channel

- **GIVEN** one Asset targeting two Channels, where the injected port's `validate` refuses ONE of them
- **WHEN** `runMcpSchedule` is called with `approved: true`
- **THEN** `createSchedule` is called for the passing Channel only
- **AND** the result's `failures` names the refused Channel with `reason: "validation-failed"`

#### Scenario: one Asset's failed Channel does not block that SAME Asset's other Channels, or a sibling Asset

- **GIVEN** two Assets, where one Channel of the first Asset fails validation
- **WHEN** `runMcpSchedule` is called with `approved: true`
- **THEN** the first Asset's OTHER Channel is still scheduled
- **AND** the second Asset's Channel is scheduled, unaffected

#### Scenario: a Channel with no composed Copy variant is recorded as a failure, never scheduled, never crashes

- **GIVEN** an Asset whose Copy has no variant for one of its target Channels' platforms
- **WHEN** `runMcpSchedule` is called with `approved: true`
- **THEN** that Channel is recorded as a failure with `reason: "no-copy-variant"`
- **AND** the Asset's OTHER Channels (with a Copy variant) are still scheduled

#### Scenario: an Asset with no MCP-eligible Channels at all is silently skipped

- **GIVEN** an Asset whose `groups` list is empty
- **WHEN** `runMcpSchedule` is called with `approved: true`
- **THEN** the port recorded zero calls for that Asset
- **AND** that Asset appears in neither `scheduled` nor `failures`

### Requirement: A fully-scheduled Asset's outcome carries its combined reference and every scheduled platform

`runMcpSchedule` SHALL, for an Asset with at least one successfully-scheduled Channel, return one
`McpScheduleAssetOutcome` naming `scheduledAt` (the SAME instant the input's `scheduledAtUtc` carried)
and `scheduledPlatforms` (every Channel platform actually scheduled, in the order scheduled).
`combineZohoScheduleReferences` (PURE) SHALL flatten every successfully-scheduled Channel's own
reference (a string kept as-is, an array's own entries spread in) and return a bare string when the
flattened result has exactly one entry, or the full array otherwise — mirroring the shape
`LedgerAssetRecord.zoho_schedule_reference` already accepts (issue #161).

#### Scenario: combineZohoScheduleReferences returns a bare string for exactly one reference

- **GIVEN** one successfully-scheduled Channel's reference, a single string
- **WHEN** `combineZohoScheduleReferences` is called with that one-element list
- **THEN** it returns that string, bare (not wrapped in an array)

#### Scenario: combineZohoScheduleReferences flattens multiple references, in order

- **GIVEN** three successfully-scheduled Channels' own string references
- **WHEN** `combineZohoScheduleReferences` is called
- **THEN** it returns an array of all three, in the same order

#### Scenario: combineZohoScheduleReferences flattens an array-shaped reference's own entries in

- **GIVEN** a list containing one array-shaped reference and one plain string reference
- **WHEN** `combineZohoScheduleReferences` is called
- **THEN** the array's own entries appear individually in the combined result, never nested

### Requirement: Zoho's own Approval workflow is structurally unreachable through this orchestration

`ZohoPostRequest` (`src/schedule-batch/mcp-schedule-port.ts`) SHALL carry NO `isApprovalNeeded` field, and
`ZohoSchedulePort` SHALL expose no method resembling `ZohoSocial_updateSocialPostApprovalStatus` — this is
a structural guarantee (the shape has no such field or method to call), not merely a runtime check.

#### Scenario: no request built by runMcpSchedule ever carries an approval-related field

- **GIVEN** an Asset scheduled successfully across multiple Channels
- **WHEN** `runMcpSchedule` is called with `approved: true`
- **THEN** every recorded `validatePost`/`createSchedule` request's own keys are exactly
  `target`/`mediaIds`/`content`/`scheduledAtLocal` — nothing else
- **AND** none of those requests' serialized form matches `/approval/i`

### Requirement: scheduleViaZohoMcpCommand reuses the SAME eligibility/plan/preflight the CSV path uses

`scheduleViaZohoMcpCommand` SHALL decide eligibility via the SAME `selectEligibleAssets`
(`src/schedule-batch/eligibility.ts`) the CSV export uses, decide WHICH Channels/WHEN via the already-
merged `buildMcpSchedulePlan` (`src/schedule-batch/mcp-plan.ts`, issue #160) — never a second,
independently-computed decision — and run the SAME preflight `validateAssetsForExport`
(`src/schedule-batch/plan.ts`) as defense in depth, refusing the WHOLE run (zero port/Media-Host calls,
zero ledger writes) on any preflight problem, an empty eligible set, a Brand with no usable Zoho
configuration, or a derived schedule slot inside the 1-hour lead window. Every such refusal SHALL be a
RETURNED, clearly-worded message — never a throw.

#### Scenario: an empty run reports nothing eligible, zero port calls

- **GIVEN** a Brand with no Ideas at all for the given run
- **WHEN** `scheduleViaZohoMcpCommand` is called with `approved: true` and an injected port
- **THEN** the returned message states no eligible Assets were found
- **AND** the port recorded zero calls

#### Scenario: a Brand with no Zoho config refuses clearly, zero Media Host or port calls

- **GIVEN** a Brand Profile with no `zoho` config, and at least one eligible Asset
- **WHEN** `scheduleViaZohoMcpCommand` is called with `approved: true` and an injected port
- **THEN** the returned message states the Brand is not configured
- **AND** the port and the Media Host both recorded zero calls

#### Scenario: a preflight problem refuses the whole run, zero port/Media Host calls, no ledger write

- **GIVEN** an eligible Asset whose composed Copy has no variant for a platform any configured Zoho
  Social Brand targets
- **WHEN** `scheduleViaZohoMcpCommand` is called with `approved: true` and an injected port
- **THEN** the returned message states scheduling was refused, naming the problem
- **AND** the port and the Media Host both recorded zero calls
- **AND** the Asset's `scheduled_at` remains unset, re-read through the ledger store

#### Scenario: a schedule time inside the 1-hour lead window refuses, zero port calls

- **GIVEN** an eligible Asset and a `now` within 1 hour of the derived schedule slot
- **WHEN** `scheduleViaZohoMcpCommand` is called with `approved: true` and an injected port
- **THEN** the returned message names the lead-window refusal
- **AND** the port recorded zero calls

#### Scenario: a re-run against an already-scheduled Asset finds nothing eligible — never double-schedules

- **GIVEN** an Asset that already carries `scheduled_at`
- **WHEN** `scheduleViaZohoMcpCommand` is called again with `approved: true` and an injected port
- **THEN** the returned message states no eligible Assets were found
- **AND** the port recorded zero calls

### Requirement: A successfully-scheduled Asset's receipt is recorded on the ledger; status stays unchanged

`scheduleViaZohoMcpCommand` SHALL, for every Asset `runMcpSchedule` reports as scheduled, write
`scheduled_at` (the SAME instant the plan derived) and `zoho_schedule_reference` (the combined receipt)
onto that exact `(ideaId, recipe)` Asset via `AssetStore.writeAsset`, WITHOUT changing that Asset's
`status` — it stays `"produced"` (ADR-0011's lifecycle is unchanged). Media SHALL be hosted via the
injected `MediaHostPort` (issue #144), matching the SAME per-slide `convertToJpg` then `upload` sequence
the CSV export already uses, ONCE per Asset (shared across every Channel that Asset schedules to). `x`
SHALL never be passed to the Zoho port, even indirectly, matching `buildMcpSchedulePlan`'s own permanent
exclusion.

#### Scenario: a happy-path run schedules every eligible Asset's non-X Channels and stamps the ledger

- **GIVEN** a fixture run folder with one eligible news-carousel Asset (7 slides, composed Copy for every
  configured platform) and a Zoho Social Brand config spanning facebook/instagram/tiktok/linkedin/x
- **WHEN** `scheduleViaZohoMcpCommand` is called with `approved: true`, a `FakeMediaHost`, and a
  `FakeZohoSchedulePort`
- **THEN** the Media Host recorded exactly 7 `convertToJpg` + 7 `upload` calls (once, shared)
- **AND** no Zoho port call's `target.platform` is `"x"`
- **AND** re-reading the Asset through the ledger store shows a well-formed `scheduled_at` and a
  `zoho_schedule_reference` naming every scheduled platform's own reference
- **AND** the Asset's `status` is still `"produced"`

### Requirement: Zoho MCP unavailable offers the explicit CSV/S3 fallback — never a silent switch

`mcpUnavailableFallbackMessage` (`src/schedule-batch/mcp-schedule.ts`) SHALL name the real CSV/S3 export
command (`npm run export-schedule ...`, `exportScheduleCommand`, `src/commands/export-schedule.ts`),
state that the WHOLE remaining step reverts to the Operator, by hand, and state that X (Twitter) always
uses the CSV/manual path regardless of MCP availability. `scheduleViaZohoMcpCommand` SHALL return this
EXACT message, and SHALL perform NO OTHER step (no ledger read, no Zoho/Media-Host call) whenever
`options.port` is `undefined` — the caller (the `producer` agent) decides MCP is unavailable; this shell
never silently substitutes the fallback on its own initiative for any OTHER reason (a Zoho refusal mid-
run is reported per-Channel via `failures`, never treated as "MCP unavailable").

#### Scenario: mcpUnavailableFallbackMessage names the export command and states the whole step is manual

- **GIVEN** a Brand, Format, Run, and start date
- **WHEN** `mcpUnavailableFallbackMessage` is called
- **THEN** the message names `npm run export-schedule <brand> <format> <run> <start-date>` and
  `exportScheduleCommand`
- **AND** it states the WHOLE remaining step is the Operator's own, by hand
- **AND** it states there is no silent, automatic switch
- **AND** it states X always uses the CSV/manual path, MCP available or not

#### Scenario: scheduleViaZohoMcpCommand with no injected port returns the fallback message, before ANY other step

- **GIVEN** a fixture Brand with one eligible Asset, a `FakeMediaHost`, and NO injected `ZohoSchedulePort`
- **WHEN** `scheduleViaZohoMcpCommand` is called with `approved: true` and no `port` option
- **THEN** the returned message is the MCP-unavailable fallback message
- **AND** the Media Host recorded zero calls
