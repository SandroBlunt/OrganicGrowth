## ADDED Requirements

### Requirement: The plan groups each eligible Asset's MCP-eligible Channels by Zoho Social Brand, at the CSV export's own slot

`buildMcpSchedulePlan` (`src/schedule-batch/mcp-plan.ts`) SHALL, given a run's already-selected eligible
Assets (`selectEligibleAssets`'s `eligible` list), a Brand's configured Zoho Social Brands, and a start
date, derive one schedule slot per eligible Asset using the SAME deterministic Idea-order
(`src/schedule-batch/order.ts`'s `sortEligible`) and the SAME slot derivation
(`src/schedule-batch/schedule.ts`'s `deriveScheduleSlots`) the CSV Schedule Batch export
(`schedule-batch-export`) already uses for the same inputs — never a second, independently-computed
schedule. For each eligible Asset, the plan SHALL name one target group per Zoho Social Brand that has
at least one MCP-eligible Channel (the Zoho Social Brand's own `name` and `timezone`, plus that Channel
list), and that Asset's scheduled time both as one absolute UTC instant and, per group, that instant
rendered in the group's own configured clock (`src/schedule-batch/timezone.ts`'s
`formatZohoScheduleTime`) — matching exactly what the CSV export's own per-file clock rendering would
produce for the same Zoho Social Brand and instant. A Zoho Social Brand grouping left with no
MCP-eligible Channels SHALL contribute NO group to the plan — never a group with an empty `channels`
list.

#### Scenario: A Brand configured with MCP-eligible Channels gets a plan naming Channels and times

- **GIVEN** one eligible `news-carousel` Asset and a Brand configured with two Zoho Social Brands (one
  grouping `facebook`/`instagram`/`tiktok`, the other grouping `linkedin`/`x`)
- **WHEN** `buildMcpSchedulePlan` is called with a start date and an explicit `nowMs` well before the
  derived slot
- **THEN** the result is `{ ok: true }` with exactly one `McpAssetSchedule` for that Asset
- **AND** it carries one group for the first Zoho Social Brand naming `facebook`/`instagram`/`tiktok`
  and one group for the second naming `linkedin` only (never `x`)
- **AND** each group's `scheduledAtLocal` equals `formatZohoScheduleTime` called directly with the same
  UTC instant and that group's own `timezone`

#### Scenario: The derived slot matches exactly what deriveScheduleSlots + sortEligible produce directly

- **GIVEN** three eligible Assets out of Idea-number order and a start date
- **WHEN** `buildMcpSchedulePlan` is called
- **THEN** each returned Asset's `scheduledAtUtc` equals the corresponding slot `deriveScheduleSlots`
  returns for the SAME `(startDate, count)`, indexed against the SAME order `sortEligible` returns for
  the SAME input

#### Scenario: An X-only Zoho Social Brand grouping contributes no group at all

- **GIVEN** one eligible Asset and a Brand whose ONLY configured Zoho Social Brand groups `x` alone
- **WHEN** `buildMcpSchedulePlan` is called
- **THEN** the result is `{ ok: true }` and that Asset's `groups` list is empty — never a group with an
  empty `channels` array

### Requirement: X is never routed to the MCP path, regardless of Brand configuration

`buildMcpSchedulePlan` SHALL exclude the `x` platform from every target group it returns, unconditionally
— this exclusion SHALL NOT depend on any Brand configuration value and SHALL NOT be overridable by any
input. This mirrors ADR-0020: Zoho's own MCP tool guidance warns that posting to X this way risks the
connected account being flagged as a bot and terminated, so X stays on the CSV/manual path always.

#### Scenario: A mixed Zoho Social Brand grouping never surfaces X in its MCP group

- **GIVEN** one eligible Asset and a Zoho Social Brand grouping `linkedin` and `x` together
- **WHEN** `buildMcpSchedulePlan` is called
- **THEN** that Zoho Social Brand's returned group's `channels` contains `linkedin` and never contains
  `x`

### Requirement: The plan is scoped to News Carousel Assets only

`buildMcpSchedulePlan` SHALL only ever schedule an eligible entry whose `asset.recipe` is
`"news-carousel"` (`src/schedule-batch/eligibility.ts`'s `SUPPORTED_RECIPE`) — any other Recipe's entry
present in its input (e.g. a Character Explainer with Cast Asset) SHALL be excluded from the returned
plan, defensively, never scheduled and never causing a throw. The Character Explainer Recipe's possible
future use of the MCP path is out of scope for this decision layer.

#### Scenario: A non-news-carousel entry in the input is excluded from the plan, not scheduled

- **GIVEN** two eligible entries — one `news-carousel`, one `character-explainer-with-cast` — and a
  configured Brand
- **WHEN** `buildMcpSchedulePlan` is called
- **THEN** the result is `{ ok: true }` naming only the `news-carousel` Asset
- **AND** no `McpAssetSchedule` is returned for the `character-explainer-with-cast` entry

### Requirement: Every business-rule refusal is a returned, clearly-worded result — never a throw

`buildMcpSchedulePlan` SHALL return `{ ok: false, reason, message }` — never throw — for each of these
business-rule refusals: an empty (or, after excluding non-`news-carousel` entries, effectively empty)
run of eligible Assets (`reason: "empty-run"`); a Brand with no usable Zoho configuration, i.e. a
`ZohoConfigLookup` with `configured: false` for either its `"not_configured"` or `"malformed"` reason
(`reason: "zoho-not-configured"`, carrying that lookup's own `message` verbatim); and any derived
schedule slot landing inside the 1-hour lead window (`reason: "lead-window"`, naming every violating
Asset, never just the first). No file is written and no plan is returned for any of these three cases.

#### Scenario: An empty run of eligible Assets is refused clearly, never thrown

- **GIVEN** an empty `eligible` list
- **WHEN** `buildMcpSchedulePlan` is called
- **THEN** the result is `{ ok: false, reason: "empty-run" }` with a clear message
- **AND** no exception is thrown

#### Scenario: A Brand with no Zoho configuration is refused clearly, carrying that lookup's message

- **GIVEN** one eligible Asset and a `ZohoConfigLookup` with `configured: false`
- **WHEN** `buildMcpSchedulePlan` is called
- **THEN** the result is `{ ok: false, reason: "zoho-not-configured" }` whose `message` equals the
  lookup's own `message`
- **AND** no exception is thrown

#### Scenario: A slot inside the 1-hour lead window is refused, naming the violation

- **GIVEN** one eligible Asset, a configured Brand, and a start date/`nowMs` pair whose derived slot is
  less than 1 hour after `nowMs`
- **WHEN** `buildMcpSchedulePlan` is called
- **THEN** the result is `{ ok: false, reason: "lead-window" }` whose message names that Asset's Idea id
- **AND** no exception is thrown

### Requirement: The plan is pure — no clock read, no I/O, deterministic

`buildMcpSchedulePlan` SHALL read the current time only from its own explicit `nowMs` argument — it
SHALL NOT call `Date.now()` or otherwise read the system clock internally — and SHALL perform no I/O and
no live network/MCP call of any kind. Calling it twice with the same inputs SHALL return deep-equal
output.

#### Scenario: Calling the plan twice with the same inputs returns deep-equal output

- **GIVEN** a fixed set of eligible Assets, a configured Brand, a start date, and a fixed `nowMs`
- **WHEN** `buildMcpSchedulePlan` is called twice with the exact same arguments
- **THEN** both results are deep-equal
