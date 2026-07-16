## ADDED Requirements

### Requirement: /run-trends requires an explicit Format argument, scoped to one Format per Run

`/run-trends` SHALL require BOTH `<brand>` and `<format>` as positional arguments
(`/run-trends <brand> <format> [<run-id>]`). Omitting `<format>` SHALL be an error, never a silent
default — a Brand may run several Formats and there is no "the" default one (ADR-0013). Running the
whole Brand SHALL be a loop over its Formats (one `/run-trends` invocation per Format), not a single
Brand-wide invocation. When the named `<format>` has no file at
`data/brands/<slug>/formats/<format>.yaml`, the command SHALL stop and list the Brand's actually
available Format slugs (never fall back to a different Format or invent one).

#### Scenario: The documented usage requires both Brand and Format

- **GIVEN** the `/run-trends` command documentation
- **WHEN** its usage line is read
- **THEN** it reads `/run-trends <brand> <format> [<run-id>]` and states both are required

### Requirement: A Run's output path is namespaced by Format

A Trend Research Run's output SHALL be written under the Format-namespaced Ideas directory
`data/brands/<slug>/ideas/<format>/<run>/` (via `formatIdeasRoot`, `src/format/store.ts`) — NOT the
Brand-level `data/brands/<slug>/ideas/<run>/` used before this slice. This keeps two Formats' same-week
Runs (e.g. `2026-W30`) from colliding in one directory.

#### Scenario: trend-scout and idea-strategist write to the Format-namespaced path

- **GIVEN** a Run for Brand `mundotip`, Format `life-hacks`, run id `2026-W30`
- **WHEN** trend-scout and idea-strategist run
- **THEN** `trends.json`/`trends.md` and every `idea-NN.md` are written under
  `data/brands/mundotip/ideas/life-hacks/2026-W30/`

### Requirement: ideas_per_run is read per-Format, not from the Brand

The number of Idea briefs suggested per Run SHALL be read from the invoked Format's own
`ideas_per_run` (its Format file), never from the Brand's `seeds.yaml` — different Formats of the
same Brand MAY suggest different counts per Run.

#### Scenario: The documented behavior sources ideas_per_run from the Format file

- **GIVEN** the `/run-trends` and `idea-strategist` documentation
- **WHEN** the `ideas_per_run` source is described
- **THEN** both name the Format file as the source, explicitly noting it is NOT the Brand's
  `seeds.yaml`

### Requirement: trend-scout reads its peer-vs-curated mode and sources from the Format file

`trend-scout` SHALL determine its peer-vs-curated mode and its actual sources
(`seed_pages`/`curated_sources`/`keywords`/`lookback_days`/`overperformance_only`) from the invoked
Format's file (`data/brands/<slug>/formats/<format>.yaml`), never from the Brand's `seeds.yaml`. The
ONE exception is the Apify actor slug mapping (`apify.<platform>.trends_actor`), which SHALL
continue to be read from `seeds.yaml` (data-handling rule 2 pins actor configuration to that file
regardless of the multi-format reshape).

#### Scenario: trend-scout's documented Inputs name the Format file as the source of sources/mode

- **GIVEN** the `trend-scout` agent documentation
- **WHEN** its Inputs section is read
- **THEN** it names `data/brands/<slug>/formats/<format>.yaml` as the source of `sources.mode` and
  the actual sources, and explicitly states these are NOT read from the Brand's `seeds.yaml`
- **AND** it still names `seeds.yaml` as the source of the Apify actor slugs

### Requirement: idea-strategist tags every suggested Idea with its Format

`idea-strategist` SHALL record the invoked Format's slug on every Idea it suggests: in the brief's
front-matter (`format: <formatSlug>`) AND in the ledger record appended for that Idea
(`data/brands/<slug>/ledger.json`, field `format`). It SHALL read the Format's `voice` (from the
Format file) to guide the brief's angle/hook/talking points — never the Brand Profile's legacy
`voice` copy.

#### Scenario: idea-strategist's documented process tags every Idea with its Format

- **GIVEN** the `idea-strategist` agent documentation
- **WHEN** its Process section is read
- **THEN** it states every brief and every ledger record it writes carries a `format` field naming
  the invoked Format, with an explicit "never omit it" instruction

#### Scenario: idea-strategist reads voice from the Format, not the Brand

- **GIVEN** the `idea-strategist` agent documentation
- **WHEN** its Guardrails are read
- **THEN** it states `voice` is read from the Format file, never from `brand-profile.yaml`'s legacy
  copy

### Requirement: The media-sense "Format:" heading is retired from Idea briefs

An Idea brief's body SHALL label its production/media plan as **"Suggested Recipe:"** (or
equivalent media wording), never **"Format:"** — the bare word "Format" in a brief is reserved for
the editorial line (front-matter `format:`), matching the CONTEXT.md/ADR-0009 retirement of the
media sense of "format".

#### Scenario: idea-strategist's documented brief shape uses Suggested Recipe, not a media Format heading

- **GIVEN** the `idea-strategist` agent documentation describing the brief body
- **WHEN** the production/media plan's label is read
- **THEN** it is "Suggested Recipe:" and the doc explicitly forbids a "Format:" heading for it
