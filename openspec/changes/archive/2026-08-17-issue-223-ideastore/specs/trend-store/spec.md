## ADDED Requirements

### Requirement: TrendStore is a minimal, genuinely new typed SQL boundary for the trend table

`src/trend/store.ts`'s `createTrend`/`getTrend`/`listTrendsForRun`/`listBriefableTrends` SHALL be the
typed read/write boundary for the `trend` table, taking an already-open, already-migrated `DatabaseSync`
as a plain positional argument (`{ db }`-only, mirroring the genuinely-new stores issue #222 shipped —
no pre-existing `{ ledgerPath }`-taking "Trend store" to bridge). `createTrend` SHALL default
`sourceUrls` to `[]` and `isPaywalled` to `false` when omitted, and SHALL leave `momentum`/`platform`
absent (never a fabricated value) when omitted.

#### Scenario: createTrend with only the required fields defaults the optional ones

- **GIVEN** a `TrendInput` carrying only `runId` and `label`
- **WHEN** `createTrend` is called, then the row is read back by `getTrend`
- **THEN** `sourceUrls` is `[]`, `isPaywalled` is `false`, and `momentum`/`platform` are absent

#### Scenario: createTrend stores every optional field when given

- **GIVEN** a `TrendInput` carrying `momentum`, `sourceUrls`, `platform`, and `isPaywalled: true`
- **WHEN** `createTrend` is called, then the row is read back by `getTrend`
- **THEN** every one of those fields round-trips verbatim

#### Scenario: an unknown runId is rejected

- **GIVEN** a `TrendInput` naming a `runId` with no committed Run
- **WHEN** `createTrend` is called
- **THEN** it throws a foreign-key error, and no `trend` row is created

#### Scenario: getTrend returns null for an unknown id

- **GIVEN** an empty database
- **WHEN** `getTrend` is called with any id
- **THEN** it returns `null`

### Requirement: listTrendsForRun orders by momentum, scoped to one Run

`listTrendsForRun` SHALL return every Trend committed for one Run, ordered by `momentum DESCENDING`
(a Trend with no recorded `momentum` sorts LAST, after every Trend that has one — SQLite's own
NULL-sorts-first-in-ASC rule, reversed by DESC), and SHALL return `[]` for a Run with none (or an
unknown Run). It SHALL NOT return Trends belonging to a different Run.

#### Scenario: Trends are ordered by momentum, highest first

- **GIVEN** a Run with three Trends committed with `momentum` `0.5`, `0.9`, and `0.7`
- **WHEN** `listTrendsForRun` is called
- **THEN** the returned array is ordered `[0.9, 0.7, 0.5]`

#### Scenario: a momentum-less Trend sorts last

- **GIVEN** a Run with one Trend at `momentum: 0.5` and one Trend with `momentum` omitted
- **WHEN** `listTrendsForRun` is called
- **THEN** the momentum-less Trend is the LAST entry in the returned array

#### Scenario: listTrendsForRun is scoped to its own Run

- **GIVEN** two Runs, each with one Trend committed
- **WHEN** `listTrendsForRun` is called with the first Run's id
- **THEN** the returned array contains only the first Run's Trend, never the second Run's

### Requirement: listBriefableTrends makes an unbriefable (paywalled-only) Trend visible by data, not by prose

`listBriefableTrends` SHALL return only the Trends for one Run where `isPaywalled` is `false` — the
openly-readable-source Operator rule (2026-08-11: "a story may take momentum signals from paywalled
feeds, but it needs an openly readable source before it can be briefed", today recorded only as prose in
`.claude/agents/trend-scout.md`/`idea-strategist.md`) made queryable, so a caller selects the briefable
subset by a WHERE clause instead of re-deriving the rule from memory. It SHALL NOT modify the agents'
own prose, and SHALL NOT itself refuse/block anything — it is a read, not an enforcement gate.

#### Scenario: listBriefableTrends excludes paywalled-only Trends

- **GIVEN** a Run with one Trend at `isPaywalled: false` and one Trend at `isPaywalled: true`
- **WHEN** `listBriefableTrends` is called
- **THEN** the returned array contains only the `isPaywalled: false` Trend

#### Scenario: listBriefableTrends returns [] when every Trend for a Run is paywalled

- **GIVEN** a Run where every committed Trend has `isPaywalled: true`
- **WHEN** `listBriefableTrends` is called
- **THEN** it returns `[]`
