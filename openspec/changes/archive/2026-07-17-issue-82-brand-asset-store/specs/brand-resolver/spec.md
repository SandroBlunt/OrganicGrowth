## MODIFIED Requirements

### Requirement: The Brand resolver owns the on-disk layout for a Brand's state

A `Brand` is a top-level tenant in OrganicGrowth (CONTEXT.md). All of a Brand's per-run state SHALL
live under a single Brand directory: `<brandsRoot>/<slug>/`. The set of Brands IS the set of
directories under the brands root — there SHALL be no separate registry file that could drift. A single
deep module (`src/brand/resolver.ts`) SHALL be the only place the path layout is defined. Adding a new
Brand is scaffolded from `templates/brand-skeleton/`, which holds the canonical empty shape — including
a `formats/` directory (ADR-0009/0013) for the Brand's per-Format YAML files and an `assets/` directory
(ADR-0016) for the Brand's reusable media, read through the typed `BrandAssetStore`
(`src/brand-asset/store.ts`).

#### Scenario: slug→paths resolution returns all per-Brand paths for a given slug

- **GIVEN** a valid Brand slug (e.g. `mundotip`) and a brands root (e.g. `data/brands`)
- **WHEN** `resolveBrand(slug, brandsRoot)` is called
- **THEN** it returns paths for `ledger`, `brandProfile`, `seeds`, `ideasRoot`, `yourData`,
  `formatsRoot`, and `assetsRoot`, each under `<brandsRoot>/<slug>/`
- **AND** `formatsRoot` equals `<brandsRoot>/<slug>/formats` — the root the typed `FormatStore`
  (`src/format/store.ts`) reads a Brand's Format files from
- **AND** `assetsRoot` equals `<brandsRoot>/<slug>/assets` — the root the typed `BrandAssetStore`
  (`src/brand-asset/store.ts`) reads a Brand's reusable media from
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

### Requirement: scaffoldBrand materialises a Brand directory from the skeleton template

The system SHALL expose a `scaffoldBrand(slug, content, options)` thin write shell that:

1. Verifies the Brand directory does not already exist; throws with a clear message if it does.
2. Copies the directory structure from `templates/brand-skeleton/` (recursively) — including its
   `formats/` and `assets/` subdirectories.
3. Writes the Operator-supplied `brand-profile.yaml`, `seeds.yaml`, and `ledger.json` over the
   template files.
4. Creates any subdirectories required by the skeleton (e.g. `ideas/`, `your-data/`, `assets/`).

After `scaffoldBrand` completes, the new Brand SHALL appear in `listBrands(brandsRoot)`.

`scaffoldBrand` is the thin write shell — it contains no business logic; all content decisions
are made by the pure builders before it is called.

#### Scenario: scaffoldBrand creates the expected directory structure

- **GIVEN** a `slug` not present in `brandsRoot` and a valid `content` object (built by the pure builders)
- **WHEN** `scaffoldBrand(slug, content, options)` is called with a temp brandsRoot and templatePath
- **THEN** `data/brands/<slug>/brand-profile.yaml` exists and contains the profile content
- **AND** `data/brands/<slug>/seeds.yaml` exists and contains the seeds content
- **AND** `data/brands/<slug>/ledger.json` exists and contains the ledger content
- **AND** `data/brands/<slug>/ideas/` directory exists
- **AND** `data/brands/<slug>/your-data/` directory exists
- **AND** `data/brands/<slug>/assets/` directory exists (BrandAssetStore home, ADR-0016)

#### Scenario: After scaffolding, the Brand appears in listBrands

- **GIVEN** an empty brandsRoot
- **WHEN** `scaffoldBrand` is called for slug `"newbrand"`
- **THEN** `listBrands(brandsRoot)` returns an array that includes `"newbrand"`

#### Scenario: scaffoldBrand throws when the Brand directory already exists

- **GIVEN** a Brand directory for slug `"existingbrand"` already exists in `brandsRoot`
- **WHEN** `scaffoldBrand("existingbrand", content, options)` is called
- **THEN** it throws an error with a message that names the slug
- **AND** the existing directory is not modified
