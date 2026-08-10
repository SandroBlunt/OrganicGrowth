## MODIFIED Requirements

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

## ADDED Requirements

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
