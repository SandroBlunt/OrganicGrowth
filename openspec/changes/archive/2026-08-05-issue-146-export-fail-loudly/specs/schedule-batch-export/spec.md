## MODIFIED Requirements

### Requirement: A preflight pass refuses the whole export loudly before any I/O — never fabricates

`validateAssetsForExport(eligible, zohoBrands)` (`src/schedule-batch/plan.ts`) SHALL return one problem,
naming the Idea, for each of: an eligible Asset with no composed Copy at all; an eligible Asset whose
Copy has no variant for a platform any configured Zoho Social Brand targets; an eligible Asset whose
Copy variant for a platform declaring a combined caption+hashtags cap (today: X alone,
`platformCopyShapeFor(platform)?.capIncludesHashtags`, issue #142) exceeds that platform's own cap
(issue #146 — a **defense-in-depth** re-check of the SAME check `composeCopyForChannels` already
enforces at composition time, reusing `../copy/validate.ts`'s `checkCombinedCaptionHashtagsCap` rather
than a second, duplicated implementation); and an eligible Asset that does not have exactly the News
Carousel Recipe's fixed slide count of downloaded slides. This combined-cap re-check SHALL only run for
a platform whose Copy variant was actually FOUND — a missing variant SHALL continue to report only the
existing "no variant for this platform" problem, never an additional, confusing cap problem for a
variant that does not exist. It SHALL collect EVERY problem across EVERY eligible Asset, never stopping
at the first. The orchestration shell SHALL run this BEFORE hosting any media or writing any file, and
SHALL refuse the whole export (writing nothing) when it returns any problem.

#### Scenario: A fully well-formed eligible Asset has no problems

- **GIVEN** an eligible Asset with composed Copy carrying a variant for every configured platform and
  exactly 7 downloaded slides
- **WHEN** `validateAssetsForExport` is called
- **THEN** it returns an empty list

#### Scenario: An Asset with no composed Copy at all is flagged, naming the Idea

- **GIVEN** an eligible Asset with no `copy` field
- **WHEN** `validateAssetsForExport` is called
- **THEN** it returns a problem naming that Idea and stating no composed Copy exists

#### Scenario: A missing platform Copy variant is flagged, naming both the Idea and the platform

- **GIVEN** an eligible Asset whose Copy carries a variant for only one of several configured platforms
- **WHEN** `validateAssetsForExport` is called
- **THEN** it returns one problem per missing platform, each naming the Idea and that platform

#### Scenario: A wrong slide count is flagged, naming the Idea and the expected count

- **GIVEN** an eligible Asset with only 3 downloaded slides
- **WHEN** `validateAssetsForExport` is called
- **THEN** it returns a problem naming that Idea and the expected slide count (7)

#### Scenario: An X variant over the combined caption+hashtags 280-char cap is flagged, naming the Idea, the platform, and the overage (issue #146)

- **GIVEN** an eligible Asset whose Copy carries a variant for every configured platform, but whose `x`
  variant's `caption` plus `hashtags` combined exceeds 280 characters
- **WHEN** `validateAssetsForExport` is called
- **THEN** it returns exactly one problem for that Asset, naming the Idea, the platform (`x`), and 280

#### Scenario: A missing X variant never ALSO reports a combined-cap problem

- **GIVEN** an eligible Asset whose Copy has no variant at all for `x`
- **WHEN** `validateAssetsForExport` is called
- **THEN** it returns exactly one problem for `x` — the "no variant" problem — never a second,
  combined-cap problem for a variant that does not exist

### Requirement: The command writes CSVs + a manifest, and stamps scheduled_at without changing status

`exportScheduleCommand` (`src/commands/export-schedule.ts`) SHALL write one CSV file per configured
Zoho Social Brand grouping plus one `zoho-manifest.json`, all into the run folder (the same directory
the produced Assets' output bundles already live in), and SHALL stamp `scheduled_at` (ISO-8601) onto
each exported Asset via `AssetStore.writeAsset`, WITHOUT changing that Asset's `status` (it stays
`"produced"` — ADR-0011's lifecycle is unchanged). An empty eligibility result SHALL stop with a clear
message and write NO file. A Brand with no configured Zoho Social Brand config SHALL refuse with a clear
message and write NO file. A batch that fails `validateAssetsForExport`'s preflight — for ANY of its
documented failure modes, alone or in combination across several Assets in the same run — SHALL refuse
the WHOLE export, naming every problem found, and SHALL leave NO partial state behind: no CSV or
manifest file written, no call recorded on the injected Media Host (media hosting happens strictly
AFTER the preflight pass succeeds), and no Asset's `scheduled_at` stamped. Every original slide file
(PNG) SHALL remain byte-for-byte unchanged.

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
