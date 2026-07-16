## ADDED Requirements

### Requirement: A Format is defined by a per-Brand YAML file, not the Brand Profile

A **Format** (a Brand's editorial line — ADR-0009) SHALL be defined by its own YAML file at
`data/brands/<slug>/formats/<formatSlug>.yaml`, holding `name`, `niche`, `voice`, `media_focus`,
`sources` (`mode`, `seed_pages`, `curated_sources`, `keywords`, `lookback_days`,
`overperformance_only`), `ideas_per_run`, and `default_recipes`. `voice`, the trend `sources`, and
the peer-vs-curated `mode` SHALL be read from the Format, never from `brand-profile.yaml` or
`seeds.yaml` (ADR-0013). `media_focus` (the media SHAPE a Format favors when scanning trend sources,
e.g. `"reel"`) is the renamed `format_focus` — it is deliberately NOT spelled `format_focus` inside a
Format's own file, because "format" means ONLY the editorial line now (ADR-0009); `media_focus` is a
trend-quality filter, not the editorial Format.

#### Scenario: A fully-populated Format file parses to the typed shape verbatim

- **GIVEN** a Format file with `name`, `niche`, `voice`, `media_focus`, a `sources` block
  (`mode: curated`, `curated_sources`, `keywords`, `lookback_days`, `overperformance_only`),
  `ideas_per_run`, and `default_recipes`
- **WHEN** `parseFormatFile(raw, slug)` parses it
- **THEN** every field is carried through verbatim onto the typed `FormatFile`

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
to `10` and `7` respectively for a non-positive or non-numeric value.

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

### Requirement: FormatStore path resolution respects the tenancy boundary

The system SHALL expose `formatFilePath(brand, formatSlug, brandsRoot?)` and
`formatIdeasRoot(brand, formatSlug, brandsRoot?)`, both delegating Brand-slug validation to
`resolveBrand` and validating the Format slug against the SAME safe-slug shape as a Brand slug
(1–64 lowercase alphanumeric/hyphen characters) before joining it into a path — a Format slug is
untrusted input (a raw `/run-trends <brand> <format>` CLI argument) that must not be allowed to
escape the Brand's `formats/` directory via path traversal.

#### Scenario: formatFilePath resolves under the Brand's formats/ directory

- **GIVEN** Brand `"mundotip"` and Format slug `"life-hacks"`
- **WHEN** `formatFilePath("mundotip", "life-hacks", "data/brands")` is called
- **THEN** it returns `"data/brands/mundotip/formats/life-hacks.yaml"`

#### Scenario: A path-traversal Format slug is rejected before any I/O

- **GIVEN** a Format slug of `"../evil"`
- **WHEN** `formatFilePath` or `formatIdeasRoot` is called with it
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
this is not validated against it).

#### Scenario: Both real Brands' Format files load through the FormatStore

- **GIVEN** the repo's real `data/brands/mundotip/formats/life-hacks.yaml` and
  `data/brands/straw-motion/formats/unhypped-news.yaml`
- **WHEN** `loadFormat("mundotip", "life-hacks")` and `loadFormat("straw-motion", "unhypped-news")`
  are called
- **THEN** each returns a `FormatFile` whose `sources.mode` matches that Brand's original mode
  (`"peer"` for mundotip, `"curated"` for straw-motion) and whose `voice`/`niche` match the
  pre-migration `brand-profile.yaml` content

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
absent SHALL the system reconstruct candidates: the Format-namespaced path
`data/brands/<slug>/ideas/<format>/<run>/idea-NN.md` first (when `format` is a valid slug), then the
legacy Brand-level path `data/brands/<slug>/ideas/<run>/idea-NN.md`. `/review-ideas` SHALL use this
resolver instead of hand-building the Brief path itself.

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

- **GIVEN** an Idea record with no `brief_path` and `format: "life-hacks"`
- **WHEN** `resolveBriefPathCandidates` is called for it
- **THEN** it returns `[<Format-namespaced path>, <legacy Brand-level path>]`, in that order

#### Scenario: A garbled format value never crashes the resolver

- **GIVEN** an Idea record with no `brief_path` and a `format` value that is not a valid Format slug
  (e.g. contains a path-traversal sequence)
- **WHEN** `resolveBriefPathCandidates` is called for it
- **THEN** it does not throw — it degrades to the legacy Brand-level path candidate
