## MODIFIED Requirements

### Requirement: Schedule derivation is pure and deterministic; the 1-hour-future guard is load-bearing

`deriveScheduleSlots(startDate, count, postsPerDay?)` (`src/schedule-batch/schedule.ts`) SHALL derive
exactly `count` schedule slots starting at `startDate`, with each slot's hour/minute drawn from a FIXED
rotation spanning the 7:00-22:00 US-Eastern targeting window, always off the round minute (never `:00`).
`postsPerDay` (issue #171 — the Unhypped Daily Format's ~6 Assets/day volume) is OPTIONAL and SHALL
default to `1`: it controls how many CONSECUTIVE slots (by overall position) share one calendar day
before the schedule advances to the next — the day offset for slot `i` SHALL be `Math.floor(i /
postsPerDay)`. Each slot's rotation entry SHALL STILL be selected by the slot's OVERALL position `i`
(`i % ` the rotation's own length) regardless of `postsPerDay` — raising `postsPerDay` SHALL change ONLY
which calendar day a slot lands on, NEVER which `(hour, minute)` it uses. Omitting `postsPerDay` (or
passing `1`) SHALL reproduce the exact pre-#171 one-Asset-per-day behavior byte-for-byte — every existing
(weekly) Format's derived schedule is unaffected. A `postsPerDay` that is not a positive integer SHALL
throw a clear, `postsPerDay`-naming error — never silently guessing a different value. It SHALL contain
no clock read and no randomness — the same `(startDate, count, postsPerDay)` SHALL always return the
same slots. `validateSlotsFuture(slots, nowMs)` SHALL pass only when every slot is at least `MIN_LEAD_MS`
(1 hour) after `nowMs`, and SHALL otherwise fail, naming EVERY violating slot (never just the first) —
this guard is UNCHANGED by `postsPerDay`, since it operates on the already-derived `slots` list
regardless of how those slots were spaced across days. `nowMs` SHALL always be the caller's explicit
argument — this function SHALL NOT read the system clock itself.

#### Scenario: deriveScheduleSlots schedules one Asset per day, strictly increasing from the start date

- **GIVEN** a start date and a count of 4
- **WHEN** `deriveScheduleSlots` is called
- **THEN** the 4 slots' Eastern-local calendar dates are 4 strictly consecutive days starting at the
  given start date

#### Scenario: Every derived slot's Eastern-local time is within the targeting window, off the round minute

- **GIVEN** a start date and a count of 20 (exceeding the fixed rotation's own length)
- **WHEN** `deriveScheduleSlots` is called
- **THEN** every slot's Eastern-local hour is within 7-21 and its minute is never exactly `:00`

#### Scenario: A schedule time less than 1 hour in the future fails validation, naming the violation

- **GIVEN** one derived slot 30 minutes after `nowMs`
- **WHEN** `validateSlotsFuture` is called with that `nowMs`
- **THEN** the result is `{ ok: false }` naming that slot's index

#### Scenario: A schedule time at least 1 hour in the future passes validation

- **GIVEN** one derived slot exactly `MIN_LEAD_MS` after `nowMs`
- **WHEN** `validateSlotsFuture` is called with that `nowMs`
- **THEN** the result is `{ ok: true }`

#### Scenario: Omitting postsPerDay is byte-identical to passing 1 explicitly (issue #171)

- **GIVEN** a start date and a count of 5
- **WHEN** `deriveScheduleSlots(startDate, 5)` and `deriveScheduleSlots(startDate, 5, 1)` are both called
- **THEN** the two results are deep-equal

#### Scenario: postsPerDay = 6 places up to 6 consecutive slots on the SAME calendar day (issue #171)

- **GIVEN** a start date and a count of 6, with `postsPerDay: 6`
- **WHEN** `deriveScheduleSlots` is called
- **THEN** all 6 slots' Eastern-local calendar dates are the SAME single day (the given start date)

#### Scenario: postsPerDay = 6 rolls over to the next calendar day on the 7th slot (issue #171)

- **GIVEN** a start date and a count of 7, with `postsPerDay: 6`
- **WHEN** `deriveScheduleSlots` is called
- **THEN** the first 6 slots share the start date's calendar day and the 7th slot lands on the NEXT
  calendar day

#### Scenario: N=7 Assets at postsPerDay=6 span exactly ceil(7/6)=2 distinct calendar days (issue #171)

- **GIVEN** a start date, a count of 7, and `postsPerDay: 6`
- **WHEN** `deriveScheduleSlots` is called
- **THEN** the 7 slots' Eastern-local calendar dates span exactly 2 distinct days

#### Scenario: Same-day slots preserve the HOUR_MINUTE_ROTATION's own order (issue #171)

- **GIVEN** a start date and a count of 6, called once with `postsPerDay: 1` (spreading the 6 slots
  across 6 separate days) and once with `postsPerDay: 6` (placing all 6 on one day)
- **WHEN** each slot's Eastern-local `(hour, minute)` pair is read back for both calls, in order
- **THEN** the two sequences of `(hour, minute)` pairs are identical — raising `postsPerDay` only moves
  slots across days, it never re-orders or re-picks which rotation entry each position uses

#### Scenario: A non-positive or non-integer postsPerDay throws a clear, naming error (issue #171)

- **GIVEN** a start date and a count of 3
- **WHEN** `deriveScheduleSlots` is called with `postsPerDay: 0`, `postsPerDay: -1`, or `postsPerDay: 1.5`
- **THEN** it throws an error whose message names `postsPerDay` — never silently guessing a different
  value or a different day-per-slot rule

### Requirement: The command writes CSVs + a manifest, and stamps scheduled_at without changing status

`exportScheduleCommand` (`src/commands/export-schedule.ts`) SHALL, BEFORE doing anything else, run the
Brand's manifest-driven cleanup (`runScheduleCleanup`, `src/schedule-batch/cleanup-runner.ts`) across the
WHOLE Brand's Schedule Batch manifest tree (every Run, every Format — not just the one being exported),
using the SAME injected `MediaHostPort` and clock this export uses for its own hosting. It SHALL then
write one CSV file per configured Zoho Social Brand grouping plus one `zoho-manifest.json`, all into the
run folder (the same directory the produced Assets' output bundles already live in), and SHALL stamp
`scheduled_at` (ISO-8601) onto each exported Asset via `AssetStore.writeAsset`, WITHOUT changing that
Asset's `status` (it stays `"produced"` — ADR-0011's lifecycle is unchanged). `exportScheduleCommand`
SHALL accept an OPTIONAL `options.postsPerDay` (issue #171), defaulting to `1`, threaded straight through
to `deriveScheduleSlots` with no reimplementation — an omitted value reproduces the exact pre-#171
schedule byte-for-byte. An empty eligibility result SHALL stop with a clear message and write NO file
(the automatic cleanup step still runs regardless). A Brand with no configured Zoho Social Brand config
SHALL refuse with a clear message and write NO file. A batch that fails `validateAssetsForExport`'s
preflight — for ANY of its documented failure modes, alone or in combination across several Assets in
the same run — SHALL refuse the WHOLE export, naming every problem found, and SHALL leave NO partial
state behind: no CSV or manifest file written, no call recorded on the injected Media Host (media hosting
happens strictly AFTER the preflight pass succeeds), and no Asset's `scheduled_at` stamped. Every
original slide file (PNG) SHALL remain byte-for-byte unchanged. A freshly-written manifest entry SHALL
NEVER itself carry `cleaned_at` — that field is written ONLY by cleanup, never by this export.

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

#### Scenario: A preflight validation failure refuses the WHOLE export, leaving no partial state, across all four documented failure modes together (issue #146)

- **GIVEN** a run with four eligible Assets, each failing exactly one of the four documented preflight
  failure modes: a missing slide, no composed Copy at all, a missing platform Copy variant, and an X
  variant over the combined 280-char cap
- **WHEN** `exportScheduleCommand` is called
- **THEN** the returned message states the export was refused and names all four Ideas alongside their
  own specific problem
- **AND** the run folder contains no new file (only the pre-existing per-Asset output bundles)
- **AND** the injected Media Host records zero `convertToJpg`/`upload` calls
- **AND** none of the four Assets' `scheduled_at` is stamped, re-read through the ledger store

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

#### Scenario: 7 eligible Assets at postsPerDay=6 schedule across ceil(7/6)=2 days, rotation order preserved (issue #171)

- **GIVEN** a run with 7 eligible news-carousel Assets, in Idea-number order, and `options.postsPerDay: 6`
- **WHEN** `exportScheduleCommand` is called
- **THEN** each exported Asset's stamped `scheduled_at`, re-read through the ledger store, equals exactly
  the corresponding slot `deriveScheduleSlots(startDate, 7, 6)` returns for the SAME index
- **AND** the 7 stamped `scheduled_at` values span exactly 2 distinct calendar days

#### Scenario: Omitting postsPerDay reproduces the exact pre-#171 default schedule (issue #171)

- **GIVEN** one eligible Asset and no `options.postsPerDay` at all
- **WHEN** `exportScheduleCommand` is called
- **THEN** the written CSV's schedule time is byte-for-byte identical to what this same command produced
  before `postsPerDay` existed (one Asset per calendar day, the first rotation entry)
