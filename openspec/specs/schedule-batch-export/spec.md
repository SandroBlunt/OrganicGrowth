# schedule-batch-export Specification

## Purpose
TBD - created by archiving change issue-145-export-schedule. Update Purpose after archive.
## Requirements
### Requirement: Only produced, not-yet-posted, not-yet-scheduled news-carousel Assets are eligible

`selectEligibleAssets` (`src/schedule-batch/eligibility.ts`) SHALL include an Asset in a Schedule Batch
export if and only if its `recipe` is `"news-carousel"`, it does NOT carry `has_video_slide: true`
(ADR-0024, issue #188), its `status` is `"produced"`, and it carries no `scheduled_at` yet. A
non-`"news-carousel"` Asset (e.g. the wired *Character Explainer with Cast* Reel) SHALL be excluded
with a `"video"`-reasoned note naming the Idea and the Recipe — Zoho's bulk scheduler CSV path is
images-only. A `"news-carousel"` Asset that DOES carry `has_video_slide: true` (a real video composited
into one of its 7 slides) SHALL ALSO be excluded with a `"video"`-reasoned note — the SAME reason and
skip mechanism as a non-`"news-carousel"` Asset, checked before any status/scheduled_at check runs. An
Asset whose `status` is not `"produced"` (still `queued`/`in_production`, or already
`posted`/`tracking`/`scored`) SHALL be excluded with a `"not-produced"`-reasoned note. An Asset that
already carries `scheduled_at` SHALL be excluded with an `"already-scheduled"`-reasoned note — this is
what makes re-running the export after a successful one schedule nothing twice. Each Asset of an Idea
SHALL be judged independently.

#### Scenario: A produced, un-posted, un-scheduled news-carousel Asset is eligible

- **GIVEN** an Idea with one Asset: `recipe: "news-carousel"`, `status: "produced"`, no `scheduled_at`
- **WHEN** `selectEligibleAssets` is called
- **THEN** that Asset appears in `eligible`, and `skipped` is empty

#### Scenario: A non-news-carousel (video) Asset is skipped with a note naming the Idea and Recipe

- **GIVEN** an Idea with one Asset: `recipe: "character-explainer-with-cast"`, `status: "produced"`
- **WHEN** `selectEligibleAssets` is called
- **THEN** that Asset appears in `skipped` with `reason: "video"`
- **AND** its note names both the Idea id and the Recipe slug

#### Scenario: A news-carousel Asset carrying a video slide is skipped with reason "video", the SAME mechanism as any other video Asset (ADR-0024, issue #188)

- **GIVEN** an Idea with one Asset: `recipe: "news-carousel"`, `status: "produced"`, no `scheduled_at`,
  `has_video_slide: true`
- **WHEN** `selectEligibleAssets` is called
- **THEN** that Asset appears in `skipped` with `reason: "video"`, `recipe: "news-carousel"`, and its
  note names the Idea id and mentions the video slide

#### Scenario: A news-carousel Asset with has_video_slide false or absent is judged as normal, not skipped for that reason (issue #188)

- **GIVEN** an Idea with two produced, un-scheduled `"news-carousel"` Assets — one carrying
  `has_video_slide: false`, one carrying no `has_video_slide` field at all
- **WHEN** `selectEligibleAssets` is called
- **THEN** both Assets appear in `eligible`, and `skipped` is empty

#### Scenario: An already-scheduled Asset is skipped, making a re-run schedule nothing twice

- **GIVEN** an Idea with one `news-carousel` Asset at `status: "produced"` carrying `scheduled_at`
- **WHEN** `selectEligibleAssets` is called
- **THEN** that Asset appears in `skipped` with `reason: "already-scheduled"`, not in `eligible`

#### Scenario: An empty run (no Ideas at all) yields an empty eligibility result

- **GIVEN** no Ideas
- **WHEN** `selectEligibleAssets` is called
- **THEN** both `eligible` and `skipped` are empty

### Requirement: The command scopes to one Brand, Format, and Run, reading Ideas off the raw ledger

`loadScheduleBatchIdeas` (`src/schedule-batch/select.ts`) SHALL read a Brand's ledger and return only
Idea records whose `format` and `run` fields exactly match the given arguments, each carrying its own
`id`, `title` (falling back to `id` when absent), `run`, `format`, and Asset-grain-normalized `assets`. A
record with no string `id` SHALL be skipped, never invented. A missing ledger file SHALL throw an error
naming the unknown Brand; a ledger with no `ideas` array SHALL return an empty list, never throw.

#### Scenario: Only Ideas matching BOTH the given format and run are returned

- **GIVEN** a ledger with three Ideas — one matching format+run, one matching only format, one matching
  only run
- **WHEN** `loadScheduleBatchIdeas` is called with that exact format+run
- **THEN** only the fully-matching Idea is returned

#### Scenario: A missing ledger file throws a clear, Brand-naming error

- **GIVEN** a ledger path that does not exist
- **WHEN** `loadScheduleBatchIdeas` is called
- **THEN** it rejects with an error naming the unknown Brand

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

### Requirement: The exported CSVs match the live-verified Zoho bulk-scheduler dialect exactly

`csv.ts` SHALL render each CSV file with NO header row, in this fixed column order: bare (unquoted)
`MM/DD/YYYY HH:mm` Schedule Time; quoted Channels; quoted Post Content (a real newline encoded as the
literal two-character `\n`); an always-empty Link field; one bare UNQUOTED field per media URL (in
narrative slide order — never a single quoted, comma-joined media cell); an always-empty GMB Button
field; an always-empty GMB Link field. A file SHALL throw, naming the row count, if it would exceed 350
rows. `zohoCsvFileName(index, platforms)` SHALL name the first (`index === 0`) Zoho Social Brand grouping
`"zoho-main.csv"` and every other grouping by its own platform slugs, sorted and hyphen-joined — derived
from configuration, never a hardcoded per-Brand literal.

#### Scenario: A 7-slide carousel row matches the live-verified dialect byte-for-byte

- **GIVEN** a schedule time, a Channel label, a multi-paragraph caption with hashtags, and 7 media URLs
- **WHEN** `buildZohoCsvRow` is called
- **THEN** the resulting row is byte-for-byte: bare schedule time, comma, quoted Channel, comma, quoted
  Post Content with `\n\n` between paragraphs and before the hashtag line, comma, an empty Link field,
  comma, each media URL bare and unquoted (comma-separated), comma, two trailing empty fields

#### Scenario: An X row is ragged — only 4 bare media fields, never a quoted comma-joined cell

- **GIVEN** the same inputs but only 4 media URLs (X's own slice)
- **WHEN** `buildZohoCsvRow` is called
- **THEN** the row has exactly 4 bare media fields, and no single field contains more than one URL

#### Scenario: A CSV file exceeding 350 rows throws, naming the actual row count

- **GIVEN** 351 already-built rows
- **WHEN** `buildZohoCsvFile` is called
- **THEN** it throws, and the error message names both 351 and the 350 cap

#### Scenario: The first Zoho Social Brand grouping is always named zoho-main.csv

- **GIVEN** index 0 and any platform list
- **WHEN** `zohoCsvFileName` is called
- **THEN** it returns `"zoho-main.csv"`

#### Scenario: A second grouping is named by its own sorted platform slugs

- **GIVEN** index 1 and platforms `["x", "linkedin"]`
- **WHEN** `zohoCsvFileName` is called
- **THEN** it returns `"zoho-linkedin-x.csv"`, regardless of the input platform order

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

### Requirement: Carousel-capable platforms carry all 7 slides; X carries only the first 4

`buildSchedulePlan` (`src/schedule-batch/plan.ts`) SHALL write every configured platform's row with all
of an Asset's hosted slide URLs, in narrative order, EXCEPT the platform `"x"`, whose row SHALL carry
only the first 4.

#### Scenario: A carousel-capable platform's row carries all 7 slide URLs in order

- **GIVEN** an eligible Asset with 7 hosted slide URLs and a Zoho Social Brand targeting `"facebook"`
- **WHEN** `buildSchedulePlan` is called
- **THEN** that platform's CSV row contains all 7 URLs, in the same order as the hosted media

#### Scenario: An X row carries only the first 4 slide URLs

- **GIVEN** the same eligible Asset and a Zoho Social Brand targeting `"x"`
- **WHEN** `buildSchedulePlan` is called
- **THEN** that platform's CSV row contains exactly the first 4 URLs and none of the remaining 3

### Requirement: Each row carries that platform's own composed Copy; the LinkedIn mentions note never leaks into a caption

`buildSchedulePlan` SHALL render each platform's CSV row from that platform's OWN `CopyVariant` (never a
different platform's variant, never the primary/fallback caption). A `CopyVariant`'s
`unresolvedMentions` (the bracketed "unresolved LinkedIn mentions" reviewer note) SHALL NEVER appear
inside an exported caption; it SHALL instead appear, per Asset, in the manifest's `stripped_notes` and
in the returned summary text.

#### Scenario: A LinkedIn row's caption never contains the unresolved-mentions note

- **GIVEN** an eligible Asset whose LinkedIn `CopyVariant` carries `unresolvedMentions`
- **WHEN** `buildSchedulePlan` is called
- **THEN** the LinkedIn CSV row's Post Content field does not contain the word "Unresolved"

#### Scenario: The stripped note appears in both the manifest and the summary

- **GIVEN** the same eligible Asset
- **WHEN** `buildSchedulePlan` is called
- **THEN** the manifest's per-Asset `stripped_notes` AND the top-level `stripped_notes` both name the
  unresolved company/product names
- **AND** the returned `summary` text also names them

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

### Requirement: This capability is the explicit CSV/S3 FALLBACK path, used when Zoho MCP is unavailable, and always for X (ADR-0020)

`.claude/commands/export-schedule.md` SHALL document this capability as the FALLBACK mechanism: Zoho's
MCP tools (`schedule-batch-mcp-scheduling`'s `scheduleViaZohoMcpCommand`,
`src/commands/schedule-via-zoho-mcp.ts`) are the PRIMARY way a Run's produced News Carousel Assets get
scheduled for Facebook/Instagram/TikTok/LinkedIn; `exportScheduleCommand` is retained for when Zoho MCP
is unavailable, and always for X (Twitter), which the MCP path never schedules. `exportScheduleCommand`
SHALL NEVER write a `zoho_schedule_reference` onto any Asset it exports — that field is MCP-only (issue
#161); an Asset scheduled via this fallback path is confirmed live the ordinary way, via the Operator's
own `/log-post`, never by `src/schedule-batch/confirmed-live.ts`'s auto-log (which requires that stored
reference and refuses without it).

#### Scenario: export-schedule.md states Zoho MCP is the primary path and this command is the fallback

- **GIVEN** `.claude/commands/export-schedule.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it states this command is the FALLBACK path (ADR-0020)
- **AND** it states Zoho MCP is the PRIMARY way Assets get scheduled
- **AND** it names `schedule-via-zoho-mcp.ts` as the primary path's own code

#### Scenario: An Asset exported via exportScheduleCommand never carries zoho_schedule_reference

- **GIVEN** an eligible news-carousel Asset exported successfully via `exportScheduleCommand`
- **WHEN** that Asset's ledger record is re-read through the `AssetStore`
- **THEN** its `zoho_schedule_reference` field is `undefined`
- **AND** its `scheduled_at` field is a well-formed ISO-8601 timestamp, exactly as before this slice

