## MODIFIED Requirements

### Requirement: The command writes CSVs + a manifest, and stamps scheduled_at without changing status

`exportScheduleCommand` (`src/commands/export-schedule.ts`) SHALL, BEFORE doing anything else, run the
Brand's manifest-driven cleanup (`runScheduleCleanup`, `src/schedule-batch/cleanup-runner.ts`) across the
WHOLE Brand's Schedule Batch manifest tree (every Run, every Format — not just the one being exported),
using the SAME injected `MediaHostPort` and clock this export uses for its own hosting. It SHALL then
write one CSV file per configured Zoho Social Brand grouping plus one `zoho-manifest.json`, all into the
run folder (the same directory the produced Assets' output bundles already live in), and SHALL stamp
`scheduled_at` (ISO-8601) onto each exported Asset via `AssetStore.writeAsset`, WITHOUT changing that
Asset's `status` (it stays `"produced"` — ADR-0011's lifecycle is unchanged). An empty eligibility result
SHALL stop with a clear message and write NO file (the automatic cleanup step still runs regardless). A
Brand with no configured Zoho Social Brand config SHALL refuse with a clear message and write NO file.
Every original slide file (PNG) SHALL remain byte-for-byte unchanged. A freshly-written manifest entry
SHALL NEVER itself carry `cleaned_at` — that field is written ONLY by cleanup, never by this export.

#### Scenario: A happy-path run writes both CSVs, the manifest, and a readable scheduled_at

- **GIVEN** a fixture run folder with one eligible news-carousel Asset and a configured Zoho Social
  Brand with two groupings
- **WHEN** `exportScheduleCommand` is called with a `FakeMediaHost` and a start date safely in the future
- **THEN** both CSV files and the manifest exist in the run folder
- **AND** re-reading the Asset through the ledger store shows a well-formed ISO-8601 `scheduled_at`
- **AND** the Asset's `status` is still `"produced"`
- **AND** the original slide PNGs on disk are byte-for-byte unchanged

#### Scenario: An empty run stops with a clear message and writes no files

- **GIVEN** a run folder with no eligible Assets (an empty ledger)
- **WHEN** `exportScheduleCommand` is called
- **THEN** the returned message names "No eligible Assets"
- **AND** the run folder contains no new file
- **AND** the injected Media Host records zero calls

#### Scenario: A Brand with no Zoho Social Brand config refuses and writes nothing

- **GIVEN** a Brand Profile with no `zoho` config, and at least one eligible Asset
- **WHEN** `exportScheduleCommand` is called
- **THEN** the returned message states the Brand is not configured
- **AND** no CSV or manifest file is written

#### Scenario: A schedule time inside the 1-hour lead window refuses the WHOLE export

- **GIVEN** an eligible Asset and a `now` within 1 hour of the derived schedule slot
- **WHEN** `exportScheduleCommand` is called
- **THEN** the returned message states the export was refused, naming the "at least 1 hour" requirement
- **AND** no CSV or manifest file is written
- **AND** the Asset's `scheduled_at` remains unset

#### Scenario: Re-running the export after a successful one schedules nothing twice

- **GIVEN** a run whose one eligible Asset was already successfully exported once
- **WHEN** `exportScheduleCommand` is called again with the same arguments
- **THEN** the second run reports no eligible Assets
- **AND** the already-written CSV file's content is unchanged
- **AND** the Asset's `scheduled_at` is unchanged
- **AND** the injected Media Host records no additional calls

#### Scenario: The export runs the Brand's manifest cleanup first, automatically, before touching this run

- **GIVEN** a stale PRIOR run's manifest, elsewhere under the SAME Brand's ideas tree, with an entry
  scheduled more than 1 day before `now`
- **WHEN** `exportScheduleCommand` is called for a DIFFERENT run (with the SAME injected Media Host)
- **THEN** the stale entry's hosted keys are deleted through the injected Media Host BEFORE this run's
  own export logic runs
- **AND** the stale manifest's entry is recorded with `cleaned_at`
- **AND** this run's own export result is unaffected (an empty run still reports "No eligible Assets" as
  normal)

#### Scenario: The automatic cleanup step never touches a prior run's entry that isn't due

- **GIVEN** a prior run's manifest entry scheduled less than or exactly 1 day before `now`, or in the
  future
- **WHEN** `exportScheduleCommand` is called for a different run
- **THEN** that entry's hosted keys are never deleted, and it never gains `cleaned_at`
