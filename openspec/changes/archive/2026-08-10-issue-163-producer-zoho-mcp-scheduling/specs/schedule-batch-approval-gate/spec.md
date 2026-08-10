## MODIFIED Requirements

### Requirement: The producer offers the Schedule Batch export only after full in-conversation approval, never unprompted

`.claude/agents/producer.md` SHALL document a "Schedule Batch offer" step: once every Idea produced this
Run has at least one Asset at `produced` (today: any *News Carousel* Asset — the Zoho bulk path is
images-only), the producer OFFERS the **Schedule Batch**, and SHALL run it only after the Operator
approves — in the SAME conversation — every one of that Run's generated outputs and composed Copy
variants. A partial approval, or silence, SHALL NOT be treated as approval. Scheduling SHALL NEVER be
triggered unprompted. Once approved, the documented step SHALL schedule via Zoho's MCP tools as the
PRIMARY mechanism for every MCP-eligible Channel (Facebook, Instagram, TikTok, LinkedIn — never X), in
this exact order: upload each hosted slide (`ZohoSocial_uploadSocialMediaFromUrl`), THEN validate
(`ZohoSocial_validateSocialPost`), THEN, only on a pass, schedule (`ZohoSocial_createSocialSchedule`) —
and SHALL name the real code this sequence mirrors (`scheduleViaZohoMcpCommand`,
`src/commands/schedule-via-zoho-mcp.ts`; `runMcpSchedule`, `src/schedule-batch/mcp-schedule.ts`;
`buildMcpSchedulePlan`, `src/schedule-batch/mcp-plan.ts`). No Zoho write-tool SHALL ever be called before
this approval. When Zoho MCP is unavailable, the documented step SHALL offer the CSV/S3 export
EXPLICITLY instead, naming the real code it runs (`exportScheduleCommand`,
`src/commands/export-schedule.ts`) and the automatic cleanup it also runs first (`runScheduleCleanup`,
issue #147) — never a silent, automatic switch between the two paths. X (Twitter) SHALL always stay on
the CSV/manual path, regardless of Brand configuration or MCP availability.

#### Scenario: producer.md documents offering Schedule Batch only once eligible Assets are produced

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it states the offer happens once a Run's eligible Assets are `produced`
- **AND** it states scheduling is never triggered unprompted

#### Scenario: producer.md documents waiting for approval of ALL outputs and captions before proceeding

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it states the producer waits for the Operator's explicit approval of every produced Asset and
  every composed Copy variant before doing anything else
- **AND** it states a partial approval or silence is not approval

#### Scenario: producer.md documents the MCP-primary sequence, real tool names, in the documented order (issue #163 AC1/AC2)

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it names `ZohoSocial_uploadSocialMediaFromUrl`, `ZohoSocial_validateSocialPost`, and
  `ZohoSocial_createSocialSchedule`
- **AND** `ZohoSocial_validateSocialPost` is documented BEFORE `ZohoSocial_createSocialSchedule`
- **AND** it names the real code this sequence mirrors: `scheduleViaZohoMcpCommand`,
  `src/commands/schedule-via-zoho-mcp.ts`, `runMcpSchedule`, and `buildMcpSchedulePlan`

#### Scenario: producer.md states no Zoho write-tool is ever called before the Operator's approval (issue #163 AC1)

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it states no Zoho write-tool is ever called before the Operator's in-conversation approval

#### Scenario: producer.md names the real CSV/S3 fallback code, offered explicitly when MCP is unavailable, and states X always stays CSV/manual (issue #163 AC4)

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it names `exportScheduleCommand` (`src/commands/export-schedule.ts`) and `runScheduleCleanup`
  as the fallback, offered explicitly when Zoho MCP is unavailable
- **AND** it states there is no silent, automatic switch between the MCP and CSV/S3 paths
- **AND** it states X (Twitter) always stays CSV/manual, never MCP

### Requirement: The approval is conversational only — no ledger trace, ADR-0011's lifecycle unchanged

`.claude/agents/producer.md` SHALL state that the Schedule Batch approval step is conversational only:
nothing is written to `ledger.json` for the approval itself — no new status, no new field.
`scheduled_at` SHALL remain a new ledger field the Schedule Batch introduces (issue #141), and the
documented step SHALL state it is written ONLY by scheduling (MCP or the fallback export), never by the
approval. No documented prose anywhere in this capability's covered files SHALL introduce a new
`AssetStatus` value (e.g. `"approved"`, `"scheduled"`) — the six-stage vocabulary
(`queued`/`in_production`/`produced`/`posted`/`tracking`/`scored`) SHALL remain exactly what it was.

#### Scenario: producer.md states the approval writes nothing to the ledger

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it states the approval step is conversational only and that nothing is written to
  `ledger.json` for it — no new status, no new field

#### Scenario: CLAUDE.md states the Schedule Batch approval is not one of the three formal gates and writes nothing to the ledger

- **GIVEN** `CLAUDE.md`'s pipeline section as shipped in this repository
- **WHEN** it is read
- **THEN** it documents a Schedule Batch approval step that is explicitly NOT one of the three formal
  gates (Review, each Recipe's pick-gate(s), Publish)
- **AND** it states that step is conversational only and writes nothing to the ledger

#### Scenario: No new AssetStatus is introduced anywhere in this slice — a real code cross-check

- **GIVEN** `src/asset/asset.ts`'s exported `isAssetStatus` type guard
- **WHEN** it is called with `"approved"` and with `"scheduled"`
- **THEN** both calls return `false`
- **AND** it still returns `true` for each of the six documented stages
  (`queued`/`in_production`/`produced`/`posted`/`tracking`/`scored`)

### Requirement: The Publish gate still follows the approval, as a second, distinct human step (ADR-0002)

The pipeline docs SHALL each state that hosting media and writing CSVs is NOT publishing (ADR-0002), and
that the Publish gate — the Operator uploading the exported CSVs to Zoho Social and reviewing the queued
posts there before they go live (or, for a non-Schedule-Batch Asset, publishing directly to the
Channel) — is a SECOND, distinct human step from the Schedule Batch approval, always following it, never
the reverse and never merged into one step. This SHALL hold in all four of `CLAUDE.md`,
`.claude/commands/run-pipeline.md`, `.claude/agents/producer.md`, and
`.claude/commands/export-schedule.md`. For an MCP-scheduled Asset, `.claude/agents/producer.md` SHALL
additionally state that Zoho itself publishes automatically at the scheduled time once the pre-schedule
approval authorized it — there is no separate manual publish click for that path; the confirmed-live
check (`confirmZohoPostLive`, issue #162) is what closes the loop by auto-logging the Post once Zoho
reports it live.

#### Scenario: CLAUDE.md's Gate 3 distinguishes the Zoho-upload path from direct publish, citing ADR-0002

- **GIVEN** `CLAUDE.md`'s Gate 3 — Publish step as shipped in this repository
- **WHEN** it is read
- **THEN** it states a Schedule Batch Asset is published by the Operator uploading the exported CSVs to
  Zoho Social and reviewing the queue there, while any other Asset is published directly to the Channel
- **AND** it cites ADR-0002 and states this is a second, distinct human step from the Schedule Batch
  approval

#### Scenario: run-pipeline.md documents the identical ordering in its own gate-by-gate walkthrough

- **GIVEN** `.claude/commands/run-pipeline.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it documents the Schedule Batch approval as an in-conversation checkpoint before Gate 3,
  explicitly not one of the three formal gates, writing nothing to the ledger
- **AND** its own Gate 3 text distinguishes the Zoho-upload path from direct publish the same way
  CLAUDE.md's does, citing ADR-0002

#### Scenario: producer.md states the Publish gate still follows, still human, for the CSV/S3 fallback and X — and states Zoho auto-publishes for an MCP-scheduled Asset (issue #163)

- **GIVEN** `.claude/agents/producer.md`'s Schedule Batch offer section as shipped in this repository
- **WHEN** it is read
- **THEN** it states the Publish gate still follows, still human, citing ADR-0002
- **AND** it states approval and Publish are two distinct human steps, in that order
- **AND** it states that for an MCP-scheduled Asset, Zoho itself publishes automatically at the scheduled
  time once the pre-schedule approval authorized it

#### Scenario: export-schedule.md documents itself as normally producer-offered, behind the same approval

- **GIVEN** `.claude/commands/export-schedule.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it states the producer normally offers this export and runs it only after the Operator
  approves, in the same conversation, that approval being conversational only and never written to the
  ledger
- **AND** it states the command remains directly runnable on its own, as a granular power-tool

## ADDED Requirements

### Requirement: Zoho's own Approval workflow is never used, on any Channel (ADR-0020)

`.claude/agents/producer.md` SHALL explicitly forbid calling `ZohoSocial_updateSocialPostApprovalStatus`
and forbid ever setting `isApprovalNeeded` on a `ZohoSocial_createSocialSchedule` call, for ANY Channel,
MCP or fallback. The producer agent's own `tools:` frontmatter SHALL grant every MCP tool the documented
sequence actually calls and SHALL NOT grant `ZohoSocial_publishSocialPost` (instant-publish — the
producer schedules, it never publishes directly) or `ZohoSocial_updateSocialPostApprovalStatus` — a
structural guard on top of the documented rule.

#### Scenario: producer.md explicitly forbids the Approval-workflow tool and isApprovalNeeded

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it states `ZohoSocial_updateSocialPostApprovalStatus` is never called
- **AND** it states `isApprovalNeeded` is never set
- **AND** it states Zoho's own Approval workflow is never used

#### Scenario: the agent's own tools frontmatter withholds the publish and Approval-workflow tools

- **GIVEN** `.claude/agents/producer.md`'s frontmatter `tools:` line as shipped in this repository
- **WHEN** it is read
- **THEN** it grants `ZohoSocial_createSocialSchedule` and `ZohoSocial_validateSocialPost`
- **AND** it does NOT grant `ZohoSocial_publishSocialPost`
- **AND** it does NOT grant `ZohoSocial_updateSocialPostApprovalStatus`
