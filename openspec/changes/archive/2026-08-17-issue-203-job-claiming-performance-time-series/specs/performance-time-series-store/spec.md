## ADDED Requirements

### Requirement: metric_snapshot stores dated captures per Post, with source and raw payload; history is never overwritten

`src/performance/store.ts`'s `recordMetricSnapshot` SHALL ALWAYS insert a fresh row — there SHALL be no
update or delete path for `metric_snapshot` anywhere in this store, so a second capture for the same
Post can never overwrite an earlier one. Each row SHALL carry its own `postId`, `capturedAt`, `source`,
the four public metrics (`reactions`/`comments`/`shares`/`views`), and an optional raw payload (`raw`,
stored as JSON). A metric the source did not resolve SHALL be OMITTED from the record, never fabricated
as `0` (rule 8).

#### Scenario: A second capture for the same Post is a second row, not an overwrite

- **GIVEN** a Post with one metric snapshot already recorded
- **WHEN** `recordMetricSnapshot` is called again for the SAME Post with a later `capturedAt`
- **THEN** the Post now has TWO metric snapshot rows, the first one's own reading unchanged

#### Scenario: listMetricSnapshotsForPost is ordered oldest-first by captured_at

- **GIVEN** two metric snapshots recorded for a Post out of chronological insertion order
- **WHEN** `listMetricSnapshotsForPost` is called
- **THEN** the results are ordered by `capturedAt` ascending, not insertion order

#### Scenario: latestMetricSnapshotForPost returns the most recently captured reading, or null

- **GIVEN** a Post with no metric snapshots
- **WHEN** `latestMetricSnapshotForPost` is called
- **THEN** it returns `null`
- **AND** once two snapshots exist, it returns the one with the LATEST `capturedAt`, regardless of
  insertion order

#### Scenario: An unknown postId is rejected

- **GIVEN** a `postId` that does not exist
- **WHEN** `recordMetricSnapshot` is called
- **THEN** it throws a foreign-key constraint error and no row is written

### Requirement: channel_baseline is a new row per recompute, never an overwrite of the previous one

`recordChannelBaseline` SHALL ALWAYS insert a fresh row (`channelId` plus the four medians —
`medianReactions`/`medianComments`/`medianShares`/`medianViews` — and an optional `window`) rather than
updating a prior one — a later recompute SHALL NOT alter or delete an earlier baseline row, so a
`performance_score` computed against an earlier baseline keeps a valid `baseline_id` to reference even
after the Channel's baseline has since moved on.
`getLatestChannelBaseline(db, channelId)` SHALL return the MOST RECENTLY recorded baseline (by
`created_at`), or `null` when none has ever been recorded.

#### Scenario: A recompute is a new row; the prior baseline is untouched

- **GIVEN** a Channel with one baseline already recorded
- **WHEN** `recordChannelBaseline` is called again for the SAME Channel with different medians
- **THEN** a SECOND, independent baseline row exists, and the FIRST row's own medians are unchanged

#### Scenario: getLatestChannelBaseline returns the most recently recorded baseline

- **GIVEN** two baselines recorded for a Channel at different times
- **WHEN** `getLatestChannelBaseline` is called
- **THEN** it returns the one with the LATEST `created_at`

#### Scenario: An unknown channelId is rejected

- **GIVEN** a `channelId` that does not exist
- **WHEN** `recordChannelBaseline` is called
- **THEN** it throws a foreign-key constraint error and no row is written

### Requirement: performance_score is computed per Post against a channel_baseline and stored with the time it was computed, so a re-score never loses history

`recordPerformanceScore(db, { postId, baselineId?, score, computedAt }, now)` SHALL ALWAYS insert a
fresh row, stamped with the CALLER-SUPPLIED `computedAt` (the time the score was actually computed,
never defaulted to write time) — a Post can be re-scored later WITHOUT losing what came before, because
every prior `performance_score` row for that Post is left completely untouched.
`latestPerformanceScoreForPost(db, postId)` SHALL return the most recently COMPUTED score (by
`computedAt`), or `null` when the Post has never been scored.

#### Scenario: A re-score is a new row; the earlier score is untouched

- **GIVEN** a Post already scored once
- **WHEN** `recordPerformanceScore` is called again for the SAME Post with a later `computedAt`
- **THEN** the Post now has TWO performance-score rows, the earlier one's own `score` unchanged

#### Scenario: latestPerformanceScoreForPost returns the most recently computed score, or null

- **GIVEN** a Post with no scores yet, then two scores computed at different times
- **WHEN** `latestPerformanceScoreForPost` is called before and after
- **THEN** it returns `null` first, then the score with the LATEST `computedAt`

#### Scenario: A score with no established baseline omits baselineId, never fabricates one

- **GIVEN** a Post scored before any Channel baseline has ever been recorded
- **WHEN** `recordPerformanceScore` is called without a `baselineId`
- **THEN** the stored record carries no `baselineId` — it is never defaulted or guessed

#### Scenario: An unknown postId is rejected

- **GIVEN** a `postId` that does not exist
- **WHEN** `recordPerformanceScore` is called
- **THEN** it throws a foreign-key constraint error and no row is written

### Requirement: The measurement loop's real scores and baselines round-trip through these tables unchanged

This store SHALL round-trip, byte-identical, the real values `src/performance/score.ts`'s
`computePerformanceScore` and `src/performance/metrics.ts`'s `recomputeBaseline` actually produce
(issue #200's own measurement-loop functions) — proving the SHAPES `recordChannelBaseline`/
`recordPerformanceScore` accept match what the real computation layer produces, independent of whether
any live production data has been imported yet (it has not — issue #204's job).

#### Scenario: A real computed score and real computed medians survive a write + read unchanged

- **GIVEN** `recomputeBaseline` run against a batch of real `AssetMetrics` readings, and
  `computePerformanceScore` run against a fresh reading and those SAME medians
- **WHEN** the resulting medians and score are written via `recordChannelBaseline`/
  `recordPerformanceScore` and read back
- **THEN** every median value and the score value read back are EXACTLY equal to what the real functions
  produced — no rounding, truncation, or reshaping in either direction
