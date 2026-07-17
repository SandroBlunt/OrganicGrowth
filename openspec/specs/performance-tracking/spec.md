# performance-tracking Specification

## Purpose
TBD - created by archiving change issue-84-performance-tracker-per-asset. Update Purpose after archive.
## Requirements
### Requirement: /track-performance selects one (Idea, Recipe) Asset at a time, never a whole Idea

`selectTrackableAssets(ideas, options)` (`src/performance/selection.ts`) SHALL select Assets at the
`(Idea, Recipe)` grain — never rolling several of an Idea's Recipes into one selection. By default it
SHALL select every Asset, across every Idea, whose `post_url` is a non-empty string AND whose `status`
is `"posted"` or `"tracking"` — a `"scored"` Asset is settled and SHALL NOT be re-selected by default.
When `options.ideaId` is given it SHALL select ONLY that one Idea's Assets, and SHALL include one at
ANY status (including an already-`scored` Asset) as long as it has a `post_url` — this is the forced
re-pull path. An Asset with no `post_url` SHALL NEVER be selected, regardless of status or forcing
(always-rules #5 — only score what has been explicitly attributed to a Post). The function SHALL be
pure: no I/O, and it SHALL NOT mutate its `ideas` input.

#### Scenario: An Idea with two Recipes' Assets yields two independent selections

- **GIVEN** one Idea with a `posted` Asset for Recipe `"character-explainer-with-cast"` and a
  `tracking` Asset for Recipe `"carousel"`, each with its own `post_url`
- **WHEN** `selectTrackableAssets` is called with no `ideaId`
- **THEN** it returns two picks, one per Recipe, each carrying that Recipe's own Asset

#### Scenario: A scored Asset is not selected by default

- **GIVEN** an Asset with `status: "scored"` and a `post_url`
- **WHEN** `selectTrackableAssets` is called with no `ideaId`
- **THEN** that Asset is NOT among the returned picks

#### Scenario: An explicit idea-id forces re-selection of an already-scored Asset

- **GIVEN** one Idea whose only Asset is `status: "scored"` with a `post_url`
- **WHEN** `selectTrackableAssets` is called with `options.ideaId` set to that Idea's id
- **THEN** that Asset IS among the returned picks

#### Scenario: An Asset with no post_url is never selected, even when forced

- **GIVEN** an Idea's Asset with `status: "produced"` and no `post_url`
- **WHEN** `selectTrackableAssets` is called with that Idea's `ideaId`
- **THEN** that Asset is NOT selected

### Requirement: Performance Score is computed relative to the Channel baseline, never absolute

`computePerformanceScore(metrics, baseline)` (`src/performance/score.ts`) SHALL implement the ADR-0001
formula: `norm(metric) = clip(metric / baseline_median(metric), 0, 2) / 2`, `score = 0.35*norm(shares) +
0.25*norm(comments) + 0.20*norm(reactions) + 0.20*norm(views)`. A metric whose baseline median is `null`
(no baseline established yet) SHALL score NEUTRAL (`norm = 0.5`) rather than fabricate a ratio against
nothing. A metric whose baseline median is exactly `0` SHALL score NEUTRAL for a `0` reading (never
divide by zero) and the MAXIMUM (`1`) for any positive reading (unambiguously above an all-zero recent
history). The result SHALL always fall within `[0, 1]`.

#### Scenario: A reading exactly at baseline on every metric scores the neutral midpoint, 0.5

- **GIVEN** `metrics` equal to `baseline` on every field
- **WHEN** `computePerformanceScore` is called
- **THEN** it returns `0.5`

#### Scenario: A reading at 2x baseline on every metric scores the maximum, 1.0

- **GIVEN** `metrics` exactly double `baseline` on every field
- **WHEN** `computePerformanceScore` is called
- **THEN** it returns `1`

#### Scenario: A viral outlier beyond 2x baseline is clipped to the maximum, never higher

- **GIVEN** `metrics` 100x `baseline` on every field
- **WHEN** `computePerformanceScore` is called
- **THEN** it returns `1`, not a larger number

#### Scenario: A null baseline median scores that metric neutral, not a fabricated ratio

- **GIVEN** a `baseline` with every median `null` (nothing established yet)
- **WHEN** `computePerformanceScore` is called with any `metrics`
- **THEN** it returns `0.5` (every metric neutral)

### Requirement: Per-Asset status transitions from tracking to scored by that Asset's OWN post age

`assetMaturityStatus(postedAt, now)` (`src/performance/maturity.ts`) SHALL return `"tracking"` when the
Post is younger than 7 days (by `postedAt`), `"scored"` once it is 7 days old or older, and `null` — the
caller MUST skip, never guess — when either timestamp is unparseable. This decision SHALL be made from
THAT ONE Asset's OWN `posted_at` — never a Brand-wide or Idea-wide clock, and never inferred from a
sibling Recipe's Asset on the same Idea.

#### Scenario: A Post younger than 7 days is tracking

- **GIVEN** a `posted_at` 2 days before `now`
- **WHEN** `assetMaturityStatus` is called
- **THEN** it returns `"tracking"`

#### Scenario: A Post 7 or more days old is scored

- **GIVEN** a `posted_at` exactly 7 days before `now`
- **WHEN** `assetMaturityStatus` is called
- **THEN** it returns `"scored"`

#### Scenario: An unparseable posted_at returns null rather than a guess

- **GIVEN** a `posted_at` that does not parse as a date
- **WHEN** `assetMaturityStatus` is called
- **THEN** it returns `null`

### Requirement: /track-performance writes exactly one (Idea, Recipe) Asset per tracked Post, never a sibling

`trackPerformanceCommand` (`src/commands/track-performance.ts`) SHALL, for each selected Asset, write
`metrics`, `performance_score`, `tracked_at` (ISO-8601), and `status` (per the maturity rule) onto THAT
ONE Asset via `AssetStore.writeAsset`, keyed `(ideaId, recipe)`. A sibling Asset for a DIFFERENT Recipe
on the SAME Idea SHALL be left byte-for-byte untouched by that write. An Idea with two posted Assets
(one per Recipe) SHALL therefore end up with two INDEPENDENT `performance_score` values, never a single
merged number.

#### Scenario: An Idea with two posted Assets ends up with two independent scores

- **GIVEN** one Idea with a `posted` Asset for each of two Recipes, each with its own `post_url` and
  distinct engagement, and an established Channel baseline
- **WHEN** `trackPerformanceCommand` runs
- **THEN** each Recipe's Asset carries its OWN `performance_score`, `metrics`, and `tracked_at`
- **AND** the two scores differ when the two Posts' engagement differs

#### Scenario: Writing one Recipe's Asset never touches a sibling Recipe's Asset

- **GIVEN** one Idea with a `posted` Asset for Recipe A (with a `post_url`) and a `produced` Asset for
  Recipe B (not yet posted, no `post_url`)
- **WHEN** `trackPerformanceCommand` runs
- **THEN** Recipe A's Asset is updated
- **AND** Recipe B's Asset is completely unchanged (`status` still `"produced"`, no `metrics`/
  `performance_score`)

### Requirement: /track-performance never fabricates a score — every unresolvable Asset is skipped and reported

`trackPerformanceCommand` SHALL skip an Asset — writing nothing for it, and reporting the reason —
whenever: its `post_url`'s platform cannot be detected; that platform has no `post_actor` configured
(still the `"..."` placeholder); the injected `PerformanceScrapePort` returns `null` (no data) or
throws; or the Asset's `posted_at` is missing or unparseable. None of these cases SHALL ever write a
fabricated `performance_score`, `metrics`, or `status` for that Asset.

#### Scenario: An unresolvable platform is skipped, not scored

- **GIVEN** an Asset whose `post_url` does not parse as a URL with a recognized platform host
- **WHEN** `trackPerformanceCommand` runs
- **THEN** that Asset is reported as skipped and its ledger record is unchanged

#### Scenario: A scrape returning no data is skipped, not scored

- **GIVEN** an Asset whose platform/actor resolve correctly but whose injected port returns `null`
- **WHEN** `trackPerformanceCommand` runs
- **THEN** that Asset is reported as skipped ("no data") and its ledger record is unchanged

#### Scenario: A thrown scrape error is skipped, not scored, and never crashes the run

- **GIVEN** an Asset whose injected port throws
- **WHEN** `trackPerformanceCommand` runs
- **THEN** that Asset is reported as skipped ("scrape failed"), its ledger record is unchanged, and the
  run continues to process any remaining selected Assets

### Requirement: The Channel's ONE baseline is recomputed from measured Asset metrics, never per-Recipe

After processing its selected Assets, `trackPerformanceCommand` SHALL recompute the Brand's ONE Channel
baseline (`LedgerBaseline`, `src/ledger/ledger.ts`) as the per-metric median (`recomputeBaseline`,
`src/performance/metrics.ts`) across every currently-`scored` Asset's `metrics` in the WHOLE ledger
(across every Recipe) — falling back to whatever Assets carry `metrics` at all when none is `scored`
yet (seeding the baseline before anything has matured). There SHALL be exactly one Channel baseline per
Brand — never one per Recipe. When NOTHING in the ledger has ever been measured, the baseline SHALL NOT
be written (never overwritten with an all-null value for a no-op run).

#### Scenario: The baseline seeds from this batch's medians on the very first run

- **GIVEN** a ledger with no established baseline (`updated_at: null`) and one freshly-tracked Asset
- **WHEN** `trackPerformanceCommand` runs
- **THEN** the ledger's baseline is written with medians derived from that Asset's `metrics` and a
  fresh `updated_at`

#### Scenario: Once scored Assets exist, the baseline prefers them over still-tracking ones

- **GIVEN** a ledger with one `scored` Asset carrying `metrics`, and one freshly-`posted` Asset that
  becomes `tracking` this run
- **WHEN** `trackPerformanceCommand` runs
- **THEN** the recomputed baseline reflects only the `scored` Asset's `metrics`, not the still-tracking
  one's

### Requirement: The build is hermetic — every test drives Apify through a fake port, never the live API

Every test in `src/performance/**` and `src/commands/track-performance*.test.ts` SHALL inject a fake
implementation of `PerformanceScrapePort` (`src/commands/track-performance-port.ts`) — no test SHALL
make a network call, spend Apify credits, or depend on `APIFY_API_TOKEN`. The default runtime port
(`DEFAULT_PERFORMANCE_SCRAPE_PORT`) SHALL always return `null` and SHALL NEVER be exercised by a test —
the live Apify HTTP adapter is deferred to a future slice, mirroring `run-pipeline-ports.ts`'s existing
`DEFAULT_APIFY_PORT`/`DEFAULT_MAGNIFIC_PORT` placeholders.

#### Scenario: The full test suite passes with zero live Apify calls

- **GIVEN** the full `npm test` run
- **THEN** every `trackPerformanceCommand` invocation in the suite is given an explicit fake
  `PerformanceScrapePort`
- **AND** no test reads `APIFY_API_TOKEN` or performs a network request

