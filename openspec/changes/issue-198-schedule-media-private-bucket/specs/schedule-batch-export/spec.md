## MODIFIED Requirements

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
happens strictly AFTER the preflight pass succeeds), and no Asset's `scheduled_at` stamped. A batch whose
derived schedule includes ANY slot inside the 1-hour lead window, OR — since issue #198 (QA Round 1
Defect #1) — ANY slot whose signed media link cannot survive to reach its own post time (beyond AWS's own
~7-day presign ceiling, `src/schedule-batch/media-expiry.ts`'s `validateWithinPresignWindow`), SHALL
likewise refuse the WHOLE export the SAME way (before any I/O, naming every violating Asset), never ship
a schedule containing either kind of doomed slot. Every original slide file (PNG) SHALL remain
byte-for-byte unchanged. A freshly-written manifest entry SHALL NEVER itself carry `cleaned_at` — that
field is written ONLY by cleanup, never by this export.

**The run folder's shape is cadence-aware (ADR-0023, issue #185).** WHEN `options.ideasRoot` is NOT
given, `runFolder` SHALL be computed via `runIdeasDirFor(brand, format, run, cadence, options.
brandsRoot)` (`src/format/run-id.ts`), where `cadence` is the invoked Format's OWN `cadence` field
(`(await loadFormat(brand, format, options.brandsRoot)).cadence`) — a `"daily"`-cadence Format's run
folder SHALL nest under its ISO week + weekday-DD-month leaf; a `"weekly"`-cadence Format's run folder
SHALL stay flat, byte-identical to its pre-ADR-0023 shape. WHEN `options.ideasRoot` IS given (the
existing testing seam pointing straight at a fixture run's Format-parent folder), `runFolder` SHALL
stay `join(options.ideasRoot, run)` — flat, UNCHANGED, bypassing the Format lookup entirely, exactly
as before this Requirement.

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
- **THEN** the returned message REFUSES the WHOLE export
- **AND** no CSV, manifest, or `scheduled_at` write occurs

#### Scenario: A schedule time beyond AWS's presign ceiling refuses the WHOLE export, hosting nothing (issue #198)

- **GIVEN** an eligible Asset whose derived schedule slot's signed media link cannot reach that slot's
  own scheduled time (beyond AWS's ~7-day presign ceiling from `now`)
- **WHEN** `exportScheduleCommand` is called
- **THEN** the returned message REFUSES the WHOLE export, naming that Asset's Idea id
- **AND** no CSV, manifest, or `scheduled_at` write occurs, and the injected Media Host records zero
  `convertToJpg`/`upload` calls

#### Scenario: A schedule time exactly AT AWS's presign ceiling is NOT refused (boundary is inclusive)

- **GIVEN** an eligible Asset whose derived schedule slot's signed media link reaches EXACTLY its own
  scheduled time (exactly AWS's ~7-day presign ceiling from `now`, no further)
- **WHEN** `exportScheduleCommand` is called
- **THEN** the export proceeds normally — a schedule that is merely capped by AWS's ceiling but still
  reaches its own post time is not a violation

#### Scenario: A real (non-override) daily-cadence Format's export nests under its ISO week + weekday-DD-month leaf (issue #185 AC1)

- **GIVEN** a real Format file on disk with `cadence: daily`, run `2026-08-12` (a Wednesday, ISO week
  `2026-W33`), and one eligible news-carousel Asset whose output bundle already lives at the
  correspondingly-nested directory
- **WHEN** `exportScheduleCommand` is called WITHOUT an `options.ideasRoot` override
- **THEN** the CSVs and manifest are written under `ideas/<format>/2026-W33/wednesday-12-august/`
- **AND** nothing at all is written to the OLD flat `ideas/<format>/2026-08-12/` shape

#### Scenario: A real (non-override) weekly-cadence Format's export stays flat, byte-identical to before ADR-0023

- **GIVEN** a real Format file on disk with `cadence: weekly` (or no `cadence` key at all), run
  `2026-W32`, and one eligible news-carousel Asset
- **WHEN** `exportScheduleCommand` is called WITHOUT an `options.ideasRoot` override
- **THEN** the CSVs and manifest are written under the flat `ideas/<format>/2026-W32/` directory,
  exactly as before this Requirement existed
