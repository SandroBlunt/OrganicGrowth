# brand-asset-store Specification

## Purpose
TBD - created by archiving change issue-82-brand-asset-store. Update Purpose after archive.
## Requirements
### Requirement: A typed BrandAssetStore reads and lists a Brand's reusable media, keyed by filename basename

The system SHALL define a typed store (`src/brand-asset/store.ts`) for a Brand's reusable media
(image/video/audio) committed under `data/brands/<slug>/assets/` (CONTEXT.md "Brand Asset";
ADR-0016). The set of Brand Assets IS the set of recognized-media files under that directory — there
SHALL be no separate manifest file that could drift. Each file's **key** SHALL be its filename's
basename with the extension stripped (the same key a Recipe's `BrandAssetMediaSlot.brandAssetKey`
names). Each file's **media kind** (`"image" | "video" | "audio"`) SHALL be inferred from its
extension by a pure, exported `mediaKindForFilename` function that returns `null` (never throws) for
an unrecognized or absent extension.

`listBrandAssets(brand, brandsRoot?)` SHALL enumerate the Brand's `assets/` directory and return every
recognized-media file as a `BrandAsset` (`{ key, media, path }`), sorted by key. Dotfiles and files
with an unrecognized extension SHALL be skipped. A directory entry that cannot be `stat`'d, or that is
itself a directory rather than a file, SHALL be skipped rather than crash the enumeration. Two files
sharing the same key across different extensions SHALL be deduplicated deterministically (the
alphabetically-first filename wins) rather than throwing or silently overwriting non-deterministically.

#### Scenario: Listing returns every recognized-media file, keyed by basename and media-type aware

- **GIVEN** a Brand's `assets/` directory containing `brand-logo.png`, `intro-jingle.mp3`, and
  `outro-clip.mp4`
- **WHEN** `listBrandAssets(brand, brandsRoot)` is called
- **THEN** it returns three `BrandAsset` entries keyed `"brand-logo"` (media `"image"`),
  `"intro-jingle"` (media `"audio"`), and `"outro-clip"` (media `"video"`), sorted by key

#### Scenario: Dotfiles and unrecognized extensions are excluded from the listing

- **GIVEN** the same `assets/` directory also containing `.gitkeep` and `README.md`
- **WHEN** `listBrandAssets(brand, brandsRoot)` is called
- **THEN** neither `.gitkeep` nor `README.md` appears in the result

#### Scenario: A directory entry with a recognized-media extension is skipped, not crashed on

- **GIVEN** an `assets/` directory containing a sub-DIRECTORY literally named `video.mp4` alongside a
  real `brand-logo.png` file
- **WHEN** `listBrandAssets(brand, brandsRoot)` is called
- **THEN** it returns only `brand-logo`, and no exception is thrown

#### Scenario: Duplicate keys across extensions are deduplicated deterministically

- **GIVEN** an `assets/` directory containing both `brand-logo.png` and `brand-logo.svg`
- **WHEN** `listBrandAssets(brand, brandsRoot)` is called
- **THEN** it returns exactly one `"brand-logo"` entry, resolved to the alphabetically-first filename
  (`brand-logo.png`), without throwing

### Requirement: getBrandAsset returns a typed found/not-found result — never a crash

`getBrandAsset(brand, key, brandsRoot?)` SHALL look up one Brand Asset by key and return a typed
`BrandAssetLookup`: `{ found: true, asset }` when the key resolves to a listed `BrandAsset`, or
`{ found: false, key, message }` otherwise. This function SHALL NEVER throw for a missing key or a
missing `assets/` directory — a caller (the future Producer media-bind phase) always receives an
actionable value, never an exception, for those two cases. The `message` on a not-found result SHALL
name the requested key and the Brand, and SHALL list the Brand's actually-available keys when at
least one Brand Asset is committed.

Only an invalid Brand **slug** SHALL still throw (the pre-existing tenancy boundary
`resolveBrand`/`brandAssetsRoot` already enforce for every store in this repo) — a different concern
from "this key isn't available."

Deciding to STOP a production run when a REQUIRED canvas media slot's Brand Asset is missing is
explicitly OUT of scope for this store (ADR-0016) — that behaviour lands with the Producer's
media-bind phase (a later slice); this store only ever *finds* and reports.

#### Scenario: A found key returns the matching Brand Asset

- **GIVEN** a Brand's `assets/` directory containing `brand-logo.png`
- **WHEN** `getBrandAsset(brand, "brand-logo", brandsRoot)` is called
- **THEN** it returns `{ found: true, asset }` where `asset.key === "brand-logo"`,
  `asset.media === "image"`, and `asset.path` points at the file on disk

#### Scenario: A missing key returns a typed not-found result, never a throw

- **GIVEN** a Brand's `assets/` directory that exists but does not contain a `"missing-key"` entry
- **WHEN** `getBrandAsset(brand, "missing-key", brandsRoot)` is called
- **THEN** it resolves to `{ found: false, key: "missing-key", message }` without throwing
- **AND** `message` names `"missing-key"`, the Brand, and lists the Brand's actually-available keys

#### Scenario: An invalid Brand slug still throws — a different concern than "not found"

- **GIVEN** an invalid Brand slug (e.g. `"../evil"`)
- **WHEN** `getBrandAsset(slug, "any-key", brandsRoot)` is called
- **THEN** it throws, naming the invalid slug (the tenancy boundary), rather than silently resolving

### Requirement: A Brand with no assets/ directory at all behaves as "no assets", not an error

A Brand that has never committed a `data/brands/<slug>/assets/` directory SHALL be treated identically
to a Brand with an empty one — never as an error condition (issue #82 AC2, data-handling rule 4).
`listBrandAssets` SHALL return `[]`; `getBrandAsset` SHALL return the same
`{ found: false, key, message }` shape it returns for any other missing key, with a message that
explains the Brand has no Brand Assets committed yet.

#### Scenario: listBrandAssets returns [] for a Brand with no assets/ directory

- **GIVEN** a Brand directory with no `assets/` subdirectory present
- **WHEN** `listBrandAssets(brand, brandsRoot)` is called
- **THEN** it returns `[]` without throwing

#### Scenario: getBrandAsset returns a typed not-found for a Brand with no assets/ directory

- **GIVEN** a Brand directory with no `assets/` subdirectory present
- **WHEN** `getBrandAsset(brand, "brand-logo", brandsRoot)` is called
- **THEN** it resolves to `{ found: false, key: "brand-logo", message }` without throwing, and
  `message` is a non-empty, actionable explanation

### Requirement: All reads of a Brand's assets directory go through the BrandAssetStore

No other module in the repo SHALL read a Brand's `assets/` directory directly (issue #82 AC3) — every
read SHALL go through `listBrandAssets`/`getBrandAsset`, so the underlying storage can later swap for a
database without touching any caller (ADR-0014's store-boundary discipline). This SHALL be provable by
a repo-wide scan: no source file outside `src/brand-asset/store.ts` (and the Brand resolver that
defines the `assetsRoot` path itself) references `BrandPaths.assetsRoot`.

#### Scenario: No source file outside the store reads assetsRoot directly

- **GIVEN** every `.ts` file under `src/`
- **WHEN** the repository is scanned for direct references to `.assetsRoot`
- **THEN** the only matches are `src/brand/resolver.ts` (which defines the field),
  `src/brand/resolver.test.ts` (which tests it), and `src/brand-asset/store.ts` (the store itself, plus
  its own test file)

