## ADDED Requirements

### Requirement: /track-performance refreshes each tracked Asset's output-bundle post.json

`trackPerformanceCommand` SHALL call `refreshOutputBundle(brand, ideaId, asset.recipe, { ledgerPath })`
(`src/asset/output-bundle.ts`) for every Asset it writes `metrics`/`performance_score`/`tracked_at`/
`status` onto — keyed to that SAME `(idea, recipe)` Asset, right after its own `AssetStore.writeAsset`
call — so that Asset's `post.json`, if it has a known local bundle directory, reflects the
freshly-measured metrics and score immediately. This SHALL happen independently per Asset (an Idea with
two tracked Recipes gets two independent `post.json` refreshes, one per Recipe's OWN bundle directory)
and SHALL never alter the per-Asset report line `trackPerformanceCommand` already returns. An Asset that
is SKIPPED (unresolvable platform, no actor configured, no data, a scrape error, or unparseable
`posted_at`) SHALL NOT have its `post.json` touched — refreshing only ever follows an actual successful
`writeAsset` for that Asset, mirroring the existing "never fabricate" posture.

#### Scenario: A tracked Post's post.json gains its metrics and score

- **GIVEN** a `posted` Asset whose `asset_paths` point into a known local bundle directory
- **WHEN** `trackPerformanceCommand` successfully scrapes and scores it
- **THEN** that directory's `post.json` now carries the written `metrics`, `performance_score`, and
  `tracked_at`

#### Scenario: Two tracked Assets on one Idea each refresh their OWN post.json independently

- **GIVEN** one Idea with a `posted` Asset for each of two Recipes, each with its own bundle directory
  and its own `post_url`
- **WHEN** `trackPerformanceCommand` runs and scores both
- **THEN** each Recipe's OWN `post.json` reflects that Recipe's OWN metrics/score — neither is
  overwritten with the other's numbers

#### Scenario: A skipped Asset's post.json (if any) is left untouched

- **GIVEN** an Asset whose scrape is SKIPPED (e.g. the actor returns no data)
- **WHEN** `trackPerformanceCommand` runs
- **THEN** that Asset's `post.json`, if one already exists, is not rewritten by this run
