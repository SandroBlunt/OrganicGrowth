## MODIFIED Requirements

### Requirement: A Format is defined by a per-Brand YAML file, not the Brand Profile

A **Format** (a Brand's editorial line — ADR-0009) SHALL be defined by its own YAML file at
`data/brands/<slug>/formats/<formatSlug>.yaml`, holding `name`, `niche`, `voice`, `media_focus`,
`sources` (`mode`, `seed_pages`, `curated_sources`, `keywords`, `lookback_days`,
`overperformance_only`), `ideas_per_run`, `default_recipes`, and `baseline_prompts` (ADR-0015). `voice`,
the trend `sources`, and the peer-vs-curated `mode` SHALL be read from the Format, never from
`brand-profile.yaml` or `seeds.yaml` (ADR-0013). `media_focus` (the media SHAPE a Format favors when
scanning trend sources, e.g. `"reel"`) is the renamed `format_focus` — it is deliberately NOT spelled
`format_focus` inside a Format's own file, because "format" means ONLY the editorial line now
(ADR-0009); `media_focus` is a trend-quality filter, not the editorial Format. `baseline_prompts` is a
per-Recipe map of recipe slug -> a relative filename pointing at that Recipe's Baseline Prompt document
(CONTEXT.md "Baseline Prompt"; ADR-0015) — NEVER the document's content inline; a Format that declares
none is a normal, expected shape.

#### Scenario: A fully-populated Format file parses to the typed shape verbatim

- **GIVEN** a Format file with `name`, `niche`, `voice`, `media_focus`, a `sources` block
  (`mode: curated`, `curated_sources`, `keywords`, `lookback_days`, `overperformance_only`),
  `ideas_per_run`, `default_recipes`, and `baseline_prompts` (e.g.
  `{ "news-carousel": "news-carousel.md" }`)
- **WHEN** `parseFormatFile(raw, slug)` parses it
- **THEN** every field is carried through verbatim onto the typed `FormatFile`, including
  `baselinePrompts` equal to `{ "news-carousel": "news-carousel.md" }`

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
