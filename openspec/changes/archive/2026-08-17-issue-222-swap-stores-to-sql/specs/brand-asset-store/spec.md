## ADDED Requirements

### Requirement: A { db }-backed CRUD layer is additive to the existing directory listing, superseding insertBrandAsset as the typed store

`src/brand-asset/store.ts`'s `createBrandAsset`/`getBrandAssetByKey`/`listBrandAssetsForBrand` SHALL be
a `{ db }`-only, ADDITIVE CRUD layer over the `brand_asset` SQL table — the existing
`listBrandAssets`/`getBrandAsset` directory-listing functions (and their own test suite) SHALL be
unaffected: a Brand Asset FILE (`data/brands/<slug>/assets/<key>.<ext>`) stays how the Operator commits
one (ADR-0029). `createBrandAsset` SHALL delegate to `src/db/media-ref.ts`'s `insertBrandAsset` — the
typed `BrandAssetStore` that module's own doc comment named this ticket as the one to build — rather
than re-implementing the `assertRootRelativeStorageKey` guard a second time, so an
absolute/home-shorthand/traversal `storageKey` is rejected BEFORE any row is written.

#### Scenario: createBrandAsset rejects an absolute storage key before writing any row

- **GIVEN** a real, migrated database with a valid Brand
- **WHEN** `createBrandAsset` is called with an absolute `storageKey`
- **THEN** it throws `StorageKeyError`, and `getBrandAssetByKey` for that key returns `null`

#### Scenario: A duplicate (brandId, key) pair is rejected

- **GIVEN** a Brand Asset already committed for a Brand with key `"brand-logo"`
- **WHEN** `createBrandAsset` is called again for the SAME Brand with the SAME key
- **THEN** it throws a uniqueness error

#### Scenario: listBrandAssetsForBrand is scoped to its Brand, sorted by key

- **GIVEN** two Brands, each with committed Brand Assets
- **WHEN** `listBrandAssetsForBrand` is called for one Brand
- **THEN** it returns only that Brand's assets, sorted by key

#### Scenario: getBrandAssetByKey returns null for an unknown key

- **GIVEN** a Brand with no Brand Asset for a given key
- **WHEN** `getBrandAssetByKey` is called with that key
- **THEN** it returns `null`
