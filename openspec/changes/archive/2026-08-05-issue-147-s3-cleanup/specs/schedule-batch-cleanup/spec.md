## ADDED Requirements

### Requirement: Cleanup deletes late, never early — strictly more than 1 day past scheduled_at

`isDueForCleanup(scheduledAt, nowMs)` (`src/schedule-batch/cleanup.ts`) SHALL return `true` if and only
if `nowMs` is STRICTLY more than `CLEANUP_AFTER_MS` (1 day, 24 hours) after `scheduledAt`. An entry
scheduled less than or exactly 1 day ago, or still in the future, SHALL return `false`. A `scheduledAt`
that does not parse to a valid instant SHALL also return `false` — never fabricating a due decision from
garbled input. This function SHALL be PURE: it SHALL NOT read the system clock; `nowMs` is always the
caller's explicit argument.

#### Scenario: An entry scheduled more than 1 day in the past is due

- **GIVEN** a `scheduledAt` slightly more than 1 day (`CLEANUP_AFTER_MS`) before `nowMs`
- **WHEN** `isDueForCleanup` is called
- **THEN** it returns `true`

#### Scenario: An entry scheduled exactly 1 day in the past is NOT due (boundary)

- **GIVEN** a `scheduledAt` exactly `CLEANUP_AFTER_MS` before `nowMs`
- **WHEN** `isDueForCleanup` is called
- **THEN** it returns `false`

#### Scenario: An entry scheduled less than 1 day in the past is NOT due

- **GIVEN** a `scheduledAt` less than `CLEANUP_AFTER_MS` before `nowMs`
- **WHEN** `isDueForCleanup` is called
- **THEN** it returns `false`

#### Scenario: An entry scheduled in the future is NOT due

- **GIVEN** a `scheduledAt` after `nowMs`
- **WHEN** `isDueForCleanup` is called
- **THEN** it returns `false`

#### Scenario: A garbled, unparseable scheduled_at is NOT due — never fabricated

- **GIVEN** a `scheduledAt` that is not a valid date string
- **WHEN** `isDueForCleanup` is called
- **THEN** it returns `false`

### Requirement: planManifestCleanup decides across manifests, purely, skipping already-cleaned entries

`planManifestCleanup(targets, nowMs)` (`src/schedule-batch/cleanup.ts`) SHALL return exactly the Asset
entries, across every given manifest target, that are due (`isDueForCleanup`) AND not already recorded
as cleaned (`alreadyCleaned`). An already-cleaned entry SHALL never be re-planned, even when it would
otherwise read as due — this is what makes a re-run of cleanup safe (never double-deletes). Each
manifest target SHALL be judged independently; an empty input SHALL return an empty list. This function
SHALL be PURE: no I/O, no clock read.

#### Scenario: Returns exactly the due, not-yet-cleaned entries across mixed inputs

- **GIVEN** one manifest target with entries scheduled more-than-1-day-past, less-than-1-day-past, and
  in the future
- **WHEN** `planManifestCleanup` is called
- **THEN** only the more-than-1-day-past entry appears in the result

#### Scenario: An already-cleaned entry is never re-planned, even if it would otherwise be due

- **GIVEN** an entry scheduled many days in the past but already carrying `alreadyCleaned: true`
- **WHEN** `planManifestCleanup` is called
- **THEN** the result is empty

#### Scenario: Every manifest target is judged independently across multiple manifests

- **GIVEN** two manifest targets, each with one due entry
- **WHEN** `planManifestCleanup` is called
- **THEN** the result contains one action per manifest, correctly attributed to its own `manifestPath`

### Requirement: The cleanup runner scans a Brand's whole manifest tree, deletes, and records the removal

`runScheduleCleanup(brand, options)` (`src/schedule-batch/cleanup-runner.ts`) SHALL recursively find
every `zoho-manifest.json` under the Brand's ideas root (covering both Format-namespaced runs and any
legacy pre-Format run), extract each manifest's cleanup-relevant Asset entries, decide what is due via
`planManifestCleanup`, and — for each due entry — delete every one of its hosted keys through the
injected `MediaHostPort`, then record the removal by patching ONLY that entry's `cleaned_at`
(ISO-8601) field inside its own manifest file, leaving every other field and every other manifest
byte-for-byte untouched. A missing, garbled, or otherwise unreadable manifest file SHALL be skipped
(contributing no entries) rather than throwing and aborting the whole scan; a missing ideas root SHALL
yield zero manifests scanned, not an error. This function SHALL NOT write to the Brand's `ledger.json` —
hosted-media cleanup is infrastructure housekeeping about S3 objects and the manifest, entirely separate
from an Asset's `status` lifecycle (ADR-0011).

#### Scenario: Deletes exactly the more-than-1-day-past objects and leaves the rest untouched

- **GIVEN** a manifest with entries scheduled more-than-1-day-past, exactly-1-day-past, less-than-1-day-
  past, and in the future
- **WHEN** `runScheduleCleanup` is called with a `FakeMediaHost`
- **THEN** only the more-than-1-day-past entry's hosted keys are deleted
- **AND** only that entry's manifest record gains `cleaned_at`

#### Scenario: A re-run never re-deletes an already-cleaned entry (idempotent)

- **GIVEN** a due entry already cleaned by a prior `runScheduleCleanup` call
- **WHEN** `runScheduleCleanup` is called again
- **THEN** no additional delete call is made for that entry

#### Scenario: Scans recursively across both Format-namespaced and legacy run folders

- **GIVEN** one manifest at `<ideas>/<format>/<run>/zoho-manifest.json` and one at
  `<ideas>/<run>/zoho-manifest.json` (legacy, un-namespaced), both with a due entry
- **WHEN** `runScheduleCleanup` is called
- **THEN** both manifests are scanned and both due entries' hosted keys are deleted

#### Scenario: A garbled manifest file never crashes the whole scan

- **GIVEN** one well-formed manifest with a due entry and one manifest file containing invalid JSON
- **WHEN** `runScheduleCleanup` is called
- **THEN** the well-formed manifest's due entry is still cleaned
- **AND** no error is thrown

#### Scenario: The Brand's ledger is never written by cleanup

- **GIVEN** any `runScheduleCleanup` call that deletes at least one object
- **WHEN** the call completes
- **THEN** no write occurs to the Brand's `ledger.json` — only the manifest file(s) are patched

### Requirement: The standalone /cleanup-schedule-media command reports what was scanned and removed

`cleanupScheduleMediaCommand` (`src/commands/cleanup-schedule-media.ts`) SHALL run `runScheduleCleanup`
for the named Brand (`/cleanup-schedule-media <brand>`) and return a report naming: how many manifests
were scanned; per removed Asset, its Idea id, Recipe, scheduled time, and the count of objects removed.
A Brand with zero manifests SHALL report that clearly (never a silent no-op). A scan that finds
manifests but nothing due SHALL report that nothing was removed. `<brand>` is a required first argument;
its absence at the CLI entry SHALL produce a usage error (stderr + non-zero exit code), never a silent
default.

#### Scenario: Reports the removed Assets by Idea, Recipe, scheduled time, and object count

- **GIVEN** a manifest with one due entry (2 hosted keys) and one not-due entry
- **WHEN** `cleanupScheduleMediaCommand` is called
- **THEN** the report names the due entry's Idea id and states 2 object(s) removed
- **AND** the report does NOT name the not-due entry's Idea id

#### Scenario: Reports "nothing to clean" when manifests exist but nothing is due

- **GIVEN** a Brand with manifests but no entry more than 1 day past its scheduled time
- **WHEN** `cleanupScheduleMediaCommand` is called
- **THEN** the report states nothing was removed

#### Scenario: Reports no manifests found for a Brand with none at all

- **GIVEN** a Brand with an empty (or non-existent) ideas tree
- **WHEN** `cleanupScheduleMediaCommand` is called
- **THEN** the report states no Schedule Batch manifests were found

#### Scenario: The CLI entry requires an explicit Brand

- **GIVEN** the `/cleanup-schedule-media` CLI entry invoked with no arguments
- **WHEN** `main()` runs
- **THEN** it writes a usage message to stderr and sets a non-zero exit code
- **AND** it does not fall back to any default Brand
