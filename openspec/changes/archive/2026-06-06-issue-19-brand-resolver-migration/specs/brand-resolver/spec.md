## ADDED Requirements

### Requirement: The Brand resolver owns the on-disk layout for a Brand's state

A `Brand` is a top-level tenant in OrganicGrowth (CONTEXT.md). All of a Brand's per-run state SHALL
live under a single Brand directory: `<brandsRoot>/<slug>/`. The set of Brands IS the set of
directories under the brands root — there SHALL be no separate registry file that could drift. A single
deep module (`src/brand/resolver.ts`) SHALL be the only place the path layout is defined. Adding a new
Brand is scaffolded from `templates/brand-skeleton/`, which holds the canonical empty shape.

#### Scenario: slug→paths resolution returns all per-Brand paths for a given slug

- **GIVEN** a valid Brand slug (e.g. `mundotip`) and a brands root (e.g. `data/brands`)
- **WHEN** `resolveBrand(slug, brandsRoot)` is called
- **THEN** it returns paths for `ledger`, `brandProfile`, `seeds`, `ideasRoot`, `yourData`, each
  under `<brandsRoot>/<slug>/`
- **AND** the `queuePath` it returns equals the global constant `data/queue.json`, NOT a path
  derived from the slug

#### Scenario: listBrands returns exactly the Brand directories under the brands root

- **GIVEN** a brands root directory containing Brand directories (e.g. `mundotip`, `otherbrand`)
  plus dotfiles and possibly non-directory entries
- **WHEN** `listBrands(brandsRoot)` is called
- **THEN** it returns a sorted array of slugs that correspond exactly to the Brand directories
- **AND** dotfiles and non-directory entries are NOT included
- **AND** a missing brands root returns an empty array without throwing

#### Scenario: brandExists returns true only when the Brand directory exists

- **GIVEN** a brands root containing a directory for slug `mundotip` and no directory for slug `unknown`
- **WHEN** `brandExists("mundotip")` is called → **THEN** it returns `true`
- **WHEN** `brandExists("unknown")` is called → **THEN** it returns `false`

#### Scenario: slugify yields a filesystem-safe, lowercase slug

- **GIVEN** a Brand name with uppercase, spaces, and special characters (e.g. `"MundoTip Pro!"`)
- **WHEN** `slugify` is called on it
- **THEN** the result is lowercase, uses only alphanumerics and hyphens, has no leading/trailing
  hyphens, and collapses consecutive hyphens to one

### Requirement: The global Production Queue path is never brand-scoped

The resolver SHALL expose `DEFAULT_QUEUE_PATH` as an exported constant whose value is `data/queue.json`.
The Production Queue is the shared bottleneck across all Brands (ADR-0004, ADR-0006); this value SHALL
NOT be derived from any Brand slug. All `BrandPaths` objects returned by `resolveBrand` SHALL carry
this same constant as their `queuePath` field, regardless of which slug was resolved.

#### Scenario: The global-queue path is constant across all Brand slugs

- **GIVEN** two different Brand slugs (e.g. `mundotip` and `acme`)
- **WHEN** `resolveBrand` is called for each
- **THEN** both returned `queuePath` values equal `data/queue.json` (the same constant)
- **AND** neither `queuePath` contains the slug string

#### Scenario: DEFAULT_QUEUE_PATH equals data/queue.json

- **GIVEN** the exported `DEFAULT_QUEUE_PATH` constant from `src/brand/resolver.ts`
- **WHEN** its value is read
- **THEN** it equals `"data/queue.json"` exactly

### Requirement: Defensive parsing — a malformed Brand directory never crashes resolution

The Brand resolver SHALL degrade gracefully on any filesystem irregularity rather than crashing. A
missing brands root, a dotfile under it, a file (not a directory) with a slug-like name, or any
other unexpected entry SHALL be silently skipped. `listBrands` SHALL return what it can and return `[]`
for a missing or empty directory. `brandExists` SHALL return `false` rather than throw for a non-existent
or unreadable path.

#### Scenario: listBrands skips non-directory entries without crashing

- **GIVEN** a brands root containing a file (not a directory) with a valid name alongside a real Brand directory
- **WHEN** `listBrands` is called
- **THEN** the file is excluded from the result
- **AND** the real Brand directory slug is still returned
- **AND** no exception is thrown

#### Scenario: listBrands on a missing directory returns an empty array

- **GIVEN** a brands root path that does not exist on disk
- **WHEN** `listBrands(brandsRoot)` is called
- **THEN** it returns `[]` without throwing

### Requirement: MundoTip state is migrated under data/brands/mundotip/ with nothing lost

All pre-migration MundoTip state (brand-profile, seeds, ledger, your-data, 2026-W22 ideas) SHALL
reside under `data/brands/mundotip/` after the migration. The ledger entries and Idea briefs/specs
SHALL round-trip unchanged (byte-for-byte identical content). `data/queue.json` SHALL remain at its
current path (global queue — not brand-scoped).

#### Scenario: listBrands over the migrated repo returns exactly ['mundotip']

- **GIVEN** the migrated repo with only MundoTip state moved into `data/brands/mundotip/`
- **WHEN** `listBrands()` is called with the default brands root
- **THEN** it returns `["mundotip"]` exactly

#### Scenario: The existing pipeline defaults to the mundotip Brand

- **GIVEN** the updated `DEFAULT_LEDGER_PATH` and `DEFAULT_BRAND_PROFILE_PATH` constants pointing to
  `data/brands/mundotip/ledger.json` and `data/brands/mundotip/brand-profile.yaml`
- **WHEN** `/report` or `/queue` is run without an explicit path argument
- **THEN** it reads MundoTip's migrated state and produces the same output as before the migration
