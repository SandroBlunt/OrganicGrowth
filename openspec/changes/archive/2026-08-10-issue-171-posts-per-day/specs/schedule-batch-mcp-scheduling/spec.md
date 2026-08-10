## MODIFIED Requirements

### Requirement: scheduleViaZohoMcpCommand reuses the SAME eligibility/plan/preflight the CSV path uses

`scheduleViaZohoMcpCommand` SHALL decide eligibility via the SAME `selectEligibleAssets`
(`src/schedule-batch/eligibility.ts`) the CSV export uses, decide WHICH Channels/WHEN via the already-
merged `buildMcpSchedulePlan` (`src/schedule-batch/mcp-plan.ts`, issue #160) — never a second,
independently-computed decision — and run the SAME preflight `validateAssetsForExport`
(`src/schedule-batch/plan.ts`) as defense in depth, refusing the WHOLE run (zero port/Media-Host calls,
zero ledger writes) on any preflight problem, an empty eligible set, a Brand with no usable Zoho
configuration, or a derived schedule slot inside the 1-hour lead window. Every such refusal SHALL be a
RETURNED, clearly-worded message — never a throw. `scheduleViaZohoMcpCommand` SHALL accept an OPTIONAL
`options.postsPerDay` (issue #171 — the Unhypped Daily Format's ~6 Assets/day volume), defaulting to `1`,
passed straight through to `buildMcpSchedulePlan` with no reimplementation — an omitted value reproduces
the exact pre-#171 one-Asset-per-day schedule byte-for-byte, and this is the SAME `postsPerDay` value the
CSV/S3 fallback path (`exportScheduleCommand`) accepts, so a Run's schedule is identical regardless of
which of ADR-0020's two mechanisms ends up scheduling it.

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

#### Scenario: postsPerDay schedules several eligible Assets to the SAME calendar day (issue #171)

- **GIVEN** 3 eligible Assets, in Idea-number order, and `options.postsPerDay: 6`
- **WHEN** `scheduleViaZohoMcpCommand` is called with `approved: true` and an injected port
- **THEN** each Asset's stamped `scheduled_at`, re-read through the ledger store, equals exactly the
  corresponding slot `deriveScheduleSlots(startDate, 3, 6)` returns for the SAME index
- **AND** all 3 stamped `scheduled_at` values fall on the SAME calendar day
