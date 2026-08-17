# format-store Specification

## Purpose
TBD - created by archiving change issue-53-format-files-formatstore. Update Purpose after archive.
## Requirements
### Requirement: A Format is defined by a per-Brand YAML file, not the Brand Profile

A **Format** (a Brand's editorial line — ADR-0009) SHALL be defined by its own YAML file at
`data/brands/<slug>/formats/<formatSlug>.yaml`, holding `name`, `niche`, `voice`, `media_focus`,
`sources` (`mode`, `seed_pages`, `curated_sources`, `keywords`, `lookback_days`,
`overperformance_only`), `ideas_per_run`, `cadence` (ADR-0022), `default_recipes`, and
`baseline_prompts` (ADR-0015). `voice`, the trend `sources`, and the peer-vs-curated `mode` SHALL be
read from the Format, never from `brand-profile.yaml` or `seeds.yaml` (ADR-0013). `media_focus` (the
media SHAPE a Format favors when scanning trend sources, e.g. `"reel"`) is the renamed `format_focus` —
it is deliberately NOT spelled `format_focus` inside a Format's own file, because "format" means ONLY
the editorial line now (ADR-0009); `media_focus` is a trend-quality filter, not the editorial Format.
`baseline_prompts` is a per-Recipe map of recipe slug -> a relative filename pointing at that Recipe's
Baseline Prompt document (CONTEXT.md "Baseline Prompt"; ADR-0015) — NEVER the document's content
inline; a Format that declares none is a normal, expected shape. `cadence` (`"weekly"` or `"daily"`,
ADR-0022, `docs/adr/0022-cadence-is-a-format-property.md`) is how often a Run of this Format is
launched — see the "A Format's cadence" Requirement below for its default/parsing rules.

#### Scenario: A fully-populated Format file parses to the typed shape verbatim

- **GIVEN** a Format file with `name`, `niche`, `voice`, `media_focus`, a `sources` block
  (`mode: curated`, `curated_sources`, `keywords`, `lookback_days`, `overperformance_only`),
  `ideas_per_run`, `cadence: "daily"`, `default_recipes`, and `baseline_prompts` (e.g.
  `{ "news-carousel": "news-carousel.md" }`)
- **WHEN** `parseFormatFile(raw, slug)` parses it
- **THEN** every field is carried through verbatim onto the typed `FormatFile`, including
  `baselinePrompts` equal to `{ "news-carousel": "news-carousel.md" }` and `cadence` equal to
  `"daily"`

#### Scenario: Off-niche seed pages normalize via the shared readiness helper

- **GIVEN** a Format file's `sources.seed_pages` containing a plain URL string and a structured
  `{ url, off_niche: true }` entry
- **WHEN** the Format is parsed
- **THEN** `sources.seedPages` reuses `normalizeSeeds` (from `readiness/check-config.ts`) so both
  entries normalize to `{ url, offNiche }` — the SAME off-niche rule used for the Brand's legacy
  seed list, not a second, divergent implementation

### Requirement: FormatStore parsing is pure and defensive — it never crashes on garbled input

`parseFormatFile` SHALL be a pure function (no I/O) that degrades missing or malformed fields to
sensible defaults rather than throwing: `name`/`niche`/`voice` default to `""`; `media_focus`
defaults to `"reel"`; `sources.mode` is derived by `deriveSourceMode` (an explicit `mode: peer` or
`mode: curated` wins; otherwise `curated` is inferred when `sources.curated_sources` has at least one
usable entry, mirroring `trend-scout.md`'s documented tie-break; otherwise `peer`); array fields drop
non-string/garbled entries instead of crashing; `ideas_per_run` and `sources.lookback_days` default
to `10` and `7` respectively for a non-positive or non-numeric value; `baseline_prompts` defaults to
`{}` when absent or non-object, dropping any entry whose key or value is not a non-empty (after
trimming) string, via a new pure `strRecord` helper.

#### Scenario: parseFormatFile never throws on garbled input

- **GIVEN** `null`, a bare string, a number, or `undefined` as the raw parsed value
- **WHEN** `parseFormatFile(raw, slug)` is called
- **THEN** it returns a fully-defaulted `FormatFile` rather than throwing

#### Scenario: deriveSourceMode infers curated only when curated_sources is actually populated

- **GIVEN** a `sources` object with no explicit `mode` and a non-empty `curated_sources` list
- **WHEN** `deriveSourceMode` is called
- **THEN** it returns `"curated"`
- **GIVEN** a `sources` object with neither `mode` nor `curated_sources` set
- **WHEN** `deriveSourceMode` is called
- **THEN** it returns `"peer"` (the default)

#### Scenario: baseline_prompts yields {} — a clear "none", never an error — when absent or garbled

- **GIVEN** a Format file with no `baseline_prompts` key at all
- **WHEN** `parseFormatFile` parses it
- **THEN** `baselinePrompts` equals `{}`
- **GIVEN** a `baseline_prompts` value that is a bare string, an array, or `null` instead of a map
- **WHEN** `parseFormatFile` parses it
- **THEN** `baselinePrompts` equals `{}` without throwing

#### Scenario: baseline_prompts drops a malformed entry instead of crashing

- **GIVEN** a `baseline_prompts` map containing one entry with a non-string value (e.g. `42`), one
  with an empty-after-trim key, and one with an empty-after-trim value, alongside one well-formed
  entry
- **WHEN** `parseFormatFile` parses it
- **THEN** only the well-formed entry survives in `baselinePrompts`; the malformed entries are
  silently dropped, not thrown

### Requirement: FormatStore path resolution respects the tenancy boundary

The system SHALL expose `formatFilePath(brand, formatSlug, brandsRoot?)`,
`formatIdeasRoot(brand, formatSlug, brandsRoot?)`, and
`formatBaselinePromptsRoot(brand, formatSlug, brandsRoot?)`, all delegating Brand-slug validation to
`resolveBrand` and validating the Format slug against the SAME safe-slug shape as a Brand slug
(1–64 lowercase alphanumeric/hyphen characters) before joining it into a path — a Format slug is
untrusted input (a raw `/run-trends <brand> <format>` CLI argument) that must not be allowed to
escape the Brand's `formats/` (or `baseline-prompts/`) directory via path traversal.

#### Scenario: formatFilePath resolves under the Brand's formats/ directory

- **GIVEN** Brand `"mundotip"` and Format slug `"life-hacks"`
- **WHEN** `formatFilePath("mundotip", "life-hacks", "data/brands")` is called
- **THEN** it returns `"data/brands/mundotip/formats/life-hacks.yaml"`

#### Scenario: formatBaselinePromptsRoot resolves the Format-namespaced Baseline Prompt root

- **GIVEN** Brand `"straw-motion"` and Format slug `"unhypped-news"`
- **WHEN** `formatBaselinePromptsRoot("straw-motion", "unhypped-news", "data/brands")` is called
- **THEN** it returns `"data/brands/straw-motion/baseline-prompts/unhypped-news"`

#### Scenario: A path-traversal Format slug is rejected before any I/O

- **GIVEN** a Format slug of `"../evil"`
- **WHEN** `formatFilePath`, `formatIdeasRoot`, or `formatBaselinePromptsRoot` is called with it
- **THEN** it throws an error naming the invalid slug, before touching the filesystem

### Requirement: listFormatSlugs enumerates a Brand's Format files by directory listing

The system SHALL expose `listFormatSlugs(brand, brandsRoot?)`, returning the sorted list of `.yaml`
basenames under `<brandsRoot>/<brand>/formats/` — the set of Formats IS the set of files there (same
convention as `listBrands`'s "the set of Brands is the set of directories"). A missing or unreadable
`formats/` directory SHALL return `[]` rather than throw; dotfiles and non-`.yaml` entries SHALL be
excluded.

#### Scenario: listFormatSlugs returns exactly the .yaml basenames, sorted

- **GIVEN** a Brand's `formats/` directory containing `life-hacks.yaml`, `unhypped-news.yaml`,
  a `.gitkeep`, and a `README.md`
- **WHEN** `listFormatSlugs` is called
- **THEN** it returns `["life-hacks", "unhypped-news"]` — the dotfile and the non-yaml file excluded

#### Scenario: listFormatSlugs on a Brand with no formats/ directory returns []

- **GIVEN** a Brand directory with no `formats/` subdirectory yet
- **WHEN** `listFormatSlugs` is called
- **THEN** it returns `[]` without throwing

### Requirement: loadFormat surfaces a clear, actionable error for an unknown Format

`loadFormat(brand, formatSlug, brandsRoot?)` SHALL throw a clear `Error` — naming the Brand and the
Format slug and listing the Brand's actually-available Format slugs (via `listFormatSlugs`) — when
the Format file does not exist. It SHALL NOT silently fall back to an empty/defaulted Format, because
that would let a Run silently research zero sources. A Format file that exists but fails to parse as
YAML SHALL throw an error naming the file path (mirrors `readJsonFile`'s parse-guard philosophy).
Once read, content is parsed by the defensive `parseFormatFile` (Requirement above).

#### Scenario: loadFormat throws naming the Brand, the missing Format, and the real alternatives

- **GIVEN** Brand `"mundotip"` has a Format file `life-hacks.yaml` but NOT `does-not-exist.yaml`
- **WHEN** `loadFormat("mundotip", "does-not-exist")` is called
- **THEN** it rejects with an error mentioning `"does-not-exist"`, `"mundotip"`, and `"life-hacks"`
  (the actually-available Format)

#### Scenario: loadFormat throws a clear parse error naming the path for malformed YAML

- **GIVEN** a Format file whose content is not valid YAML
- **WHEN** `loadFormat` is called for it
- **THEN** it rejects with an error that names the file's path and does not crash with a bare parser
  exception

### Requirement: mundotip and straw-motion are migrated to their own Format files

MundoTip and Straw Motion SHALL each have their current editorial line (niche, voice, trend
sources, peer-vs-curated mode, `ideas_per_run`) captured, unchanged in substance, in its own Format
file: `data/brands/mundotip/formats/life-hacks.yaml` (peer-scrape mode, its existing `seed_pages`)
and `data/brands/straw-motion/formats/unhypped-news.yaml` (curated mode, its existing
`curated_sources`). Both SHALL carry `default_recipes: [character-explainer-with-cast]` — the only
wired Recipe today, as a free-text slug (the in-repo Recipe registry, issue #54, is not wired yet, so
this is not validated against it). Straw Motion's `unhypped-news.yaml` SHALL ALSO carry a real
`baseline_prompts` pointer for the `news-carousel` Recipe (`news-carousel.md`, ADR-0015, issue #83).

#### Scenario: Both real Brands' Format files load through the FormatStore

- **GIVEN** the repo's real `data/brands/mundotip/formats/life-hacks.yaml` and
  `data/brands/straw-motion/formats/unhypped-news.yaml`
- **WHEN** `loadFormat("mundotip", "life-hacks")` and `loadFormat("straw-motion", "unhypped-news")`
  are called
- **THEN** each returns a `FormatFile` whose `sources.mode` matches that Brand's original mode
  (`"peer"` for mundotip, `"curated"` for straw-motion) and whose `voice`/`niche` match the
  pre-migration `brand-profile.yaml` content

#### Scenario: Straw Motion's real Format declares the news-carousel Baseline Prompt pointer

- **GIVEN** the repo's real `data/brands/straw-motion/formats/unhypped-news.yaml`
- **WHEN** `loadFormat("straw-motion", "unhypped-news")` is called
- **THEN** the returned `FormatFile.baselinePrompts["news-carousel"]` equals `"news-carousel.md"`

### Requirement: Pre-existing per-Idea format values are migrated off the retired media-sense

Straw Motion's already-`status: suggested`, pre-slice ledger Ideas SHALL have their per-Idea
`format` field migrated from the retired media-sense value (`"reel"`) to the real Format slug they
actually belong to (`"unhypped-news"`) — the per-Idea `format` field SHALL NOT be left holding the
media-sense meaning on any ledger record this slice touches (acceptance criterion #2). This is a
data-only migration: each Idea's `brief_path`, `id`, `run`, and every other field are unchanged, and
`resolveBriefPathCandidates` resolves these Ideas via their recorded `brief_path` regardless of this
migration (the Requirement above), so the migration is safe — it never changes which file an
Operator's `/review-ideas` loads.

#### Scenario: straw-motion's real pending Ideas carry the real Format slug, not the media-sense value

- **GIVEN** the real `data/brands/straw-motion/ledger.json`
- **WHEN** its `status: suggested` Ideas (`idea-01`..`idea-07`, run `2026-W29`) are read
- **THEN** every one's `format` field equals `"unhypped-news"`, never `"reel"`

### Requirement: The media-sense of "format" is retired from brand-profile.yaml

The system SHALL remove `brand-profile.yaml`'s `formats: [reel]` field (the old MEDIA sense of
"format" — a media-type list, unrelated to the editorial Format): from the YAML schema
(`BrandProfileContent` in `src/brand/scaffolder.ts`, `buildBrandProfile`'s output), from
`templates/brand-skeleton/brand-profile.yaml`, and from both real Brands' `brand-profile.yaml`
files. `readiness/check-config.ts`'s `BrandProfile` type SHALL drop the corresponding (unused)
`formats?` field.

#### Scenario: A freshly scaffolded Brand's profile carries no formats field

- **GIVEN** a Brand scaffolded via `scaffoldBrand` from the current skeleton template
- **WHEN** its `brand-profile.yaml` is parsed
- **THEN** it has no `formats` key at all

### Requirement: A suggested Idea's Brief path is resolved by trusting the ledger's own brief_path first

The system SHALL provide `resolveBriefPathCandidates(idea, brand, brandsRoot?)`
(`src/format/brief-path.ts`), returning an ORDERED list of candidate Brief paths for a
`status: suggested` ledger Idea. When the Idea record carries a non-empty `brief_path`, that value
SHALL be returned VERBATIM as the ONLY candidate (ledger-as-source-of-truth, always-rules #7) — it
SHALL NOT be second-guessed or overridden by reconstructing a path from the Idea's `format`/`run`,
because a record's `format` field is not a reliable indicator of where its Brief physically lives
(pre-existing records may carry the retired media-sense value, or even a genuinely correct Format
slug, while their Brief still sits at the pre-Format-namespacing path). Only when `brief_path` is
absent SHALL the system reconstruct candidates. When `format` is a valid slug AND `idea.run` is
SHAPED like a daily Run id (a genuine `YYYY-MM-DD` calendar date — `isDailyRunIdShape`,
`src/format/run-id.ts`, ADR-0023), the FIRST candidate SHALL be the nested week+weekday path
(`runIdeasDirFor(brand, format, run, "daily", brandsRoot)`/`idea-NN.md`) — the current convention
going forward for any Run this shape actually belongs to. Next comes the flat Format-namespaced path
`data/brands/<slug>/ideas/<format>/<run>/idea-NN.md`, then the legacy Brand-level path
`data/brands/<slug>/ideas/<run>/idea-NN.md`. A weekly-SHAPED `run` (e.g. `2026-W32`) NEVER matches the
daily-shape check, so a weekly Format's candidate list is completely unaffected by this Requirement —
still exactly `[flat, legacy]`. `/review-ideas` SHALL use this resolver instead of hand-building the
Brief path itself.

#### Scenario: A recorded brief_path is trusted exclusively, even when the Idea's format is stale or wrong

- **GIVEN** a ledger Idea record with `brief_path: "data/brands/straw-motion/ideas/2026-W29/idea-01.md"`
  and `format: "reel"` (the retired media-sense value)
- **WHEN** `resolveBriefPathCandidates` is called for it
- **THEN** it returns exactly `["data/brands/straw-motion/ideas/2026-W29/idea-01.md"]` — the
  recorded path, verbatim, and nothing else

#### Scenario: The real, currently-pending straw-motion Ideas resolve to their actual Brief files

- **GIVEN** the real `data/brands/straw-motion/ledger.json`'s 7 `status: suggested` Ideas (run
  `2026-W29`), each carrying a real `brief_path`
- **WHEN** `resolveBriefPathCandidates` is called for each
- **THEN** every returned candidate path exists on disk (proven against the real files, not a
  synthetic fixture)

#### Scenario: A record with no brief_path falls back to the Format-namespaced path, then the legacy path

- **GIVEN** an Idea record with no `brief_path` and `format: "life-hacks"`, `run: "2026-W30"` (a
  weekly-shaped run)
- **WHEN** `resolveBriefPathCandidates` is called for it
- **THEN** it returns `[<Format-namespaced path>, <legacy Brand-level path>]`, in that order — exactly
  two candidates, unaffected by the nested-daily candidate below

#### Scenario: A garbled format value never crashes the resolver

- **GIVEN** an Idea record with no `brief_path` and a `format` value that is not a valid Format slug
  (e.g. contains a path-traversal sequence)
- **WHEN** `resolveBriefPathCandidates` is called for it
- **THEN** it does not throw — it degrades to the legacy Brand-level path candidate

#### Scenario: A daily-shaped run with no brief_path gains a nested-daily candidate FIRST (ADR-0023)

- **GIVEN** an Idea record with no `brief_path`, `format: "unhypped-daily"`, and `run: "2026-08-12"`
  (a genuine `YYYY-MM-DD` calendar date)
- **WHEN** `resolveBriefPathCandidates` is called for it, for Brand `straw-motion`
- **THEN** it returns exactly three candidates, in this order:
  `["data/brands/straw-motion/ideas/unhypped-daily/2026-W33/wednesday-12-august/idea-01.md",
  "data/brands/straw-motion/ideas/unhypped-daily/2026-08-12/idea-01.md",
  "data/brands/straw-motion/ideas/2026-08-12/idea-01.md"]`

#### Scenario: The real 2026-08-11 launch run's recorded brief_path still wins exclusively

- **GIVEN** an Idea record with `format: "unhypped-daily"`, `run: "2026-08-11"` (daily-shaped), AND a
  recorded `brief_path: "data/brands/straw-motion/ideas/unhypped-daily/2026-08-11/idea-01.md"` (the
  OLD flat shape, left in place — ADR-0023's Non-Goal)
- **WHEN** `resolveBriefPathCandidates` is called for it
- **THEN** it returns exactly `["data/brands/straw-motion/ideas/unhypped-daily/2026-08-11/idea-01.md"]`
  — the recorded flat path, verbatim, never the nested reconstruction

#### Scenario: A syntactically date-shaped but calendar-invalid run never gains a nested candidate

- **GIVEN** an Idea record with no `brief_path`, `format: "unhypped-daily"`, and `run: "2026-02-30"`
  (matches `YYYY-MM-DD` syntactically but is not a real calendar date)
- **WHEN** `resolveBriefPathCandidates` is called for it
- **THEN** it returns exactly `[<Format-namespaced flat path>, <legacy path>]` — no nested candidate

### Requirement: A Format's cadence defaults to weekly — every existing Format is unchanged (ADR-0022)

`FormatFile.cadence` SHALL be `"weekly"` or `"daily"` (`FormatCadence`, `src/format/store.ts`), parsed
by a pure `parseCadence` function: the exact string `"daily"` (trimmed, case-insensitive) selects the
daily cadence; a missing `cadence` key, or any other value (including a garbled non-string type),
SHALL default to `"weekly"`. This makes the field additive and fully backward compatible — no existing
Format file needs to change, and none does in this slice: both real Formats
(`data/brands/mundotip/formats/life-hacks.yaml`, `data/brands/straw-motion/formats/unhypped-news.yaml`)
carry no `cadence` key and both parse to `cadence: "weekly"`, byte-identical to their pre-ADR-0022
behavior in every other field.

#### Scenario: A Format file with no cadence key parses to weekly

- **GIVEN** a Format file (or an empty object) with no `cadence` key at all
- **WHEN** `parseFormatFile` parses it
- **THEN** `cadence` equals `"weekly"`

#### Scenario: cadence: daily is recognized case-insensitively and trimmed

- **GIVEN** a raw `cadence` value of `"daily"`, `"Daily"`, `"  daily  "`, or `"DAILY"`
- **WHEN** `parseCadence` parses each
- **THEN** every one returns `"daily"`

#### Scenario: A garbled or unrecognized cadence value falls back to weekly, never throwing

- **GIVEN** a raw `cadence` value of `"monthly"`, `""`, `null`, `42`, or `["daily"]`
- **WHEN** `parseCadence` parses each
- **THEN** every one returns `"weekly"` without throwing

#### Scenario: Both real Brands' Formats parse to weekly, unedited (issue #172 AC1)

- **GIVEN** the repo's real `data/brands/mundotip/formats/life-hacks.yaml` and
  `data/brands/straw-motion/formats/unhypped-news.yaml`
- **WHEN** `loadFormat` loads each
- **THEN** both return `cadence: "weekly"`

### Requirement: A Run id is validated as a safe path segment before being joined into any path

The system SHALL expose `RUN_ID_PATTERN` / `isValidRunId(run)` / `assertValidRunId(run)`
(`src/format/run-id.ts`), mirroring `BRAND_SLUG_PATTERN`/`assertValidBrandSlug`
(`src/brand/resolver.ts`) and `FORMAT_SLUG_PATTERN`/`assertValidFormatSlug` (`src/format/store.ts`): a
Run id is untrusted input (a raw `/run-trends <brand> <format> [<run-id>]` or
`/export-schedule <brand> <format> <run> <start-date>` CLI argument) that gets joined into a
filesystem path by several deep modules, so it SHALL be validated against a safe-slug shape — 1–64
characters of letters, digits, underscores, and hyphens (wider than the Brand/Format slug patterns,
which are lowercase-only, because a real weekly Run id carries an uppercase `W`, e.g. `2026-W32`) —
BEFORE any of those callers touch the filesystem. Every function that joins a Run id into a path for
WRITING SHALL call `assertValidRunId` as its first statement: `specPathFor`
(`src/production-spec/store.ts`), `outputDirFor` (`src/asset/output-bundle.ts`),
`castCandidatesDirFor` (`src/asset/cast-candidates.ts`), and `exportScheduleCommand`
(`src/commands/export-schedule.ts`). The one pure, READ-only resolver documented to NEVER throw
(`resolveBriefPathCandidates`, `src/format/brief-path.ts`) SHALL instead DEGRADE an invalid `run` to
`[]` (no reconstructed candidate) rather than throwing, preserving its existing no-throw contract
while never returning a dangerous path.

#### Scenario: A path-traversal Run id is rejected before any path join

- **GIVEN** a Run id of `"../.."` or a value containing `/` or `\`
- **WHEN** `specPathFor`, `outputDirFor`, `castCandidatesDirFor`, or `exportScheduleCommand` is called
  with it
- **THEN** it throws an error naming the offending Run id, before touching the filesystem

#### Scenario: A real weekly or daily Run id is accepted

- **GIVEN** a Run id of `"2026-W32"` (weekly) or `"2026-08-11"` (daily)
- **WHEN** `assertValidRunId` is called with it
- **THEN** it does not throw

#### Scenario: resolveBriefPathCandidates degrades an invalid run to no candidates, never throwing

- **GIVEN** a ledger Idea record with no `brief_path`, a valid `format`, and a path-traversal `run`
  (e.g. `"../../evil"`)
- **WHEN** `resolveBriefPathCandidates` is called for it
- **THEN** it returns `[]` without throwing — no candidate is built from the unsafe `run`

### Requirement: A daily-cadence Format's Run ideas directory nests under its ISO week + a weekday-named leaf (ADR-0023)

`src/format/run-id.ts` SHALL export `runPathSegments(runId, cadence)` and `runIdeasDirFor(brand,
formatSlug, runId, cadence, brandsRoot?)` — the ONE deep function every module that reconstructs
`ideas/<format>/<run>/...` routes through (directly, or via its shared `runPathSegments` helper).
`runPathSegments` SHALL return `[runId]` for `"weekly"` cadence, UNCHANGED from every shape this
codebase used before this Requirement existed — a weekly Format's ideas directory stays
BYTE-IDENTICAL. For `"daily"` cadence it SHALL return TWO segments: the ISO week containing the Run
id's own date, then a weekday-day-month leaf — weekday and month spelled out in lowercase English, the
day zero-padded (e.g. `["2026-W33", "wednesday-12-august"]`) — computed from the Run id's OWN date.
This is the ONE function ADR-0023 authorizes to parse date semantics out of an otherwise-opaque Run
id, for path derivation only; every other reader of a Run id in this codebase keeps treating it as a
fully opaque, exact-match label. A `"daily"`-cadence Run id that does NOT parse as a real calendar
date (a hand-typed, non-standard id) SHALL degrade to the flat `[runId]` shape rather than throwing or
guessing (data-handling rule 4). `runIdeasDirFor` SHALL validate `runId` (`assertValidRunId`) before
joining it into any path, and SHALL return `join(formatIdeasRoot(brand, formatSlug, brandsRoot),
...runPathSegments(runId, cadence))`.

A companion pure predicate, `isDailyRunIdShape(runId)`, SHALL return whether `runId` is shaped like a
genuine `YYYY-MM-DD` calendar date (the ONLY shape `isoDateString`/`defaultRunId` ever produce for a
daily Run) — for use by modules (`resolveBriefPathCandidates`) that need to recognize a daily-shaped
Run id structurally, without loading the owning Format's `cadence`.

#### Scenario: A weekly Format's ideas directory is byte-identical to the pre-ADR-0023 flat shape

- **GIVEN** `brand: "straw-motion"`, `formatSlug: "unhypped-news"`, `runId: "2026-W32"`,
  `cadence: "weekly"`
- **WHEN** `runIdeasDirFor(brand, formatSlug, runId, cadence, "data/brands")` is called
- **THEN** it returns `"data/brands/straw-motion/ideas/unhypped-news/2026-W32"` — identical to
  `join(formatIdeasRoot(...), runId)`

#### Scenario: A daily Format's ideas directory nests under ISO week + weekday-DD-month (issue #185 AC1)

- **GIVEN** `brand: "straw-motion"`, `formatSlug: "unhypped-daily"`, `runId: "2026-08-12"`,
  `cadence: "daily"`
- **WHEN** `runIdeasDirFor(brand, formatSlug, runId, cadence, "data/brands")` is called
- **THEN** it returns `"data/brands/straw-motion/ideas/unhypped-daily/2026-W33/wednesday-12-august"`

#### Scenario: The ADR-0023 worked example for 2026-08-11 matches exactly

- **GIVEN** `runId: "2026-08-11"`, `cadence: "daily"`
- **WHEN** `runPathSegments(runId, cadence)` is called
- **THEN** it returns `["2026-W33", "tuesday-11-august"]`

#### Scenario: A daily-cadence Run id that isn't a real calendar date degrades to the flat shape

- **GIVEN** `runId: "smoke-test"`, `cadence: "daily"`
- **WHEN** `runPathSegments(runId, cadence)` is called
- **THEN** it returns `["smoke-test"]` without throwing

#### Scenario: A path-traversal Run id is rejected before any path join

- **GIVEN** `runId: "../../evil"`, `cadence: "daily"`
- **WHEN** `runIdeasDirFor` is called with it
- **THEN** it throws an error naming the offending Run id, before touching the filesystem

#### Scenario: isDailyRunIdShape recognizes a genuine calendar date and rejects everything else

- **GIVEN** the run ids `"2026-08-11"` (daily), `"2026-W32"` (weekly), `"2026-02-30"`
  (syntactically-shaped but calendar-invalid), and `"smoke-test"` (garbled)
- **WHEN** `isDailyRunIdShape` is called on each
- **THEN** only `"2026-08-11"` returns `true`

### Requirement: A { db }-backed CRUD layer is additive to the existing YAML-file reader

`src/format/store.ts` SHALL expose `createFormat`/`getFormatBySlug`/`getFormatById`/`listFormatsForBrand`/`updateFormat` as a `{ db }`-only, ADDITIVE CRUD layer over the `format` SQL table — the existing
`loadFormat`/`listFormatSlugs`/`parseFormatFile` YAML-file-reading functions (and their own test suite)
SHALL be unaffected: a Format's YAML file stays the Operator-authored document (ADR-0029), and this new
layer does not read or write it. `format` is a real, REFERENCED SQL table — `run.format_id`,
`idea.format_id`, and `baseline_prompt.format_id` all foreign-key into it — so a `format` row is
required plumbing for the rest of the schema to be usable at all, not an optional convenience.
`createFormat` SHALL default `cadence` to `"weekly"`, `ideasPerRun` to `10`, `sourceMode` to `"peer"`,
and `defaultRecipes` to `[]` when omitted, mirroring the YAML reader's own established defaults.

#### Scenario: createFormat with defaults matches the YAML reader's own established defaults

- **GIVEN** a `FormatDbInput` carrying only `brandId`, `slug`, `name`, and `voice`
- **WHEN** `createFormat` is called
- **THEN** the returned row's `cadence` is `"weekly"`, `ideasPerRun` is `10`, `sourceMode` is `"peer"`,
  and `defaultRecipes` is `[]`

#### Scenario: A duplicate (brandId, slug) pair is rejected

- **GIVEN** a Format already committed for a Brand with slug `"unhypped-news"`
- **WHEN** `createFormat` is called again for the SAME Brand with the SAME slug
- **THEN** it throws a uniqueness error

#### Scenario: An unknown brandId is rejected

- **GIVEN** no committed Brand for a given id
- **WHEN** `createFormat` is called with that id as `brandId`
- **THEN** it throws a foreign-key error

#### Scenario: getFormatBySlug/listFormatsForBrand are scoped to their Brand

- **GIVEN** two Brands, each with a Format of the same slug
- **WHEN** `getFormatBySlug(db, brandA, slug)` is called
- **THEN** it returns Brand A's Format, never Brand B's

#### Scenario: updateFormat merges a patch and throws a clear error for an unknown Format

- **GIVEN** an existing Format
- **WHEN** `updateFormat` is called with a patch touching only one field
- **THEN** that field is updated and every other field is unchanged; calling it with an unknown id
  throws an error naming the id

