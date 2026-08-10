## MODIFIED Requirements

### Requirement: The plan groups each eligible Asset's MCP-eligible Channels by Zoho Social Brand, at the CSV export's own slot

`buildMcpSchedulePlan` (`src/schedule-batch/mcp-plan.ts`) SHALL, given a run's already-selected eligible
Assets (`selectEligibleAssets`'s `eligible` list), a Brand's configured Zoho Social Brands, and a start
date, derive one schedule slot per eligible Asset using the SAME deterministic Idea-order
(`src/schedule-batch/order.ts`'s `sortEligible`) and the SAME slot derivation
(`src/schedule-batch/schedule.ts`'s `deriveScheduleSlots`) the CSV Schedule Batch export
(`schedule-batch-export`) already uses for the same inputs — never a second, independently-computed
schedule. `buildMcpSchedulePlan` SHALL accept an OPTIONAL `postsPerDay` input (issue #171 — the Unhypped
Daily Format's ~6 Assets/day volume), defaulting to `1`, passed straight through to
`deriveScheduleSlots` with no reimplementation of its day-spacing logic — an omitted value reproduces the
exact pre-#171 one-Asset-per-day schedule byte-for-byte. For each eligible Asset, the plan SHALL name one
target group per Zoho Social Brand that has at least one MCP-eligible Channel (the Zoho Social Brand's
own `name` and `timezone`, plus that Channel list), and that Asset's scheduled time both as one absolute
UTC instant and, per group, that instant rendered in the group's own configured clock
(`src/schedule-batch/timezone.ts`'s `formatZohoScheduleTime`) — matching exactly what the CSV export's
own per-file clock rendering would produce for the same Zoho Social Brand and instant. A Zoho Social
Brand grouping left with no MCP-eligible Channels SHALL contribute NO group to the plan — never a group
with an empty `channels` list.

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

#### Scenario: postsPerDay is passed straight through to the shared derivation (issue #171)

- **GIVEN** three eligible Assets, in Idea-number order, and `postsPerDay: 6`
- **WHEN** `buildMcpSchedulePlan` is called
- **THEN** each returned Asset's `scheduledAtUtc` equals the corresponding slot
  `deriveScheduleSlots(startDate, 3, 6)` returns for the SAME index
- **AND** all 3 returned `scheduledAtUtc` values fall on the SAME calendar day (well under the
  `postsPerDay: 6` capacity) — distinguishing it from the default (1/day) behavior, which would spread
  them over 3 days

#### Scenario: Omitting postsPerDay defaults to 1, byte-identical to the pre-#171 behavior (issue #171)

- **GIVEN** the same eligible Assets, Zoho configuration, start date, and `nowMs`, called once with no
  `postsPerDay` field and once with `postsPerDay: 1`
- **WHEN** `buildMcpSchedulePlan` is called both ways
- **THEN** the two results are deep-equal
