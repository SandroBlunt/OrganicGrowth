## MODIFIED Requirements

### Requirement: The Brand resolver owns the on-disk layout for a Brand's state

A `Brand` is a top-level tenant in OrganicGrowth (CONTEXT.md). All of a Brand's per-run state SHALL
live under a single Brand directory: `<brandsRoot>/<slug>/`. The set of Brands IS the set of
directories under the brands root — there SHALL be no separate registry file that could drift. A single
deep module (`src/brand/resolver.ts`) SHALL be the only place the path layout is defined. Adding a new
Brand is scaffolded from `templates/brand-skeleton/`, which holds the canonical empty shape — including
a `formats/` directory (ADR-0009/0013) for the Brand's per-Format YAML files and an `assets/` directory
(ADR-0016) for the Brand's reusable media, read through the typed `BrandAssetStore`
(`src/brand-asset/store.ts`). `resolveBrand` also exposes a `baselinePromptsRoot` path
(`<brandsRoot>/<slug>/baseline-prompts`, ADR-0015) — the root under which a Format's per-Recipe
Baseline Prompt documents live, one level down per Format, read through the typed loader
`loadBaselinePrompt` (`src/format/baseline-prompt.ts`).

#### Scenario: slug→paths resolution returns all per-Brand paths for a given slug

- **GIVEN** a valid Brand slug (e.g. `mundotip`) and a brands root (e.g. `data/brands`)
- **WHEN** `resolveBrand(slug, brandsRoot)` is called
- **THEN** it returns paths for `ledger`, `brandProfile`, `seeds`, `ideasRoot`, `yourData`,
  `formatsRoot`, `assetsRoot`, and `baselinePromptsRoot`, each under `<brandsRoot>/<slug>/`
- **AND** `formatsRoot` equals `<brandsRoot>/<slug>/formats` — the root the typed `FormatStore`
  (`src/format/store.ts`) reads a Brand's Format files from
- **AND** `assetsRoot` equals `<brandsRoot>/<slug>/assets` — the root the typed `BrandAssetStore`
  (`src/brand-asset/store.ts`) reads a Brand's reusable media from
- **AND** `baselinePromptsRoot` equals `<brandsRoot>/<slug>/baseline-prompts` — the root a Format's
  per-Recipe Baseline Prompt documents live under (`src/format/baseline-prompt.ts`)
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
