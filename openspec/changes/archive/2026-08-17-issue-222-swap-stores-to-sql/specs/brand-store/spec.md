## ADDED Requirements

### Requirement: BrandStore is the typed SQL boundary for the brand table

`src/brand/store.ts`'s `createBrand`/`getBrandById`/`getBrandBySlug`/`listBrands`/`updateBrand` SHALL be
the typed read/write boundary for the `brand` table, taking an already-open, already-migrated
`DatabaseSync` (`{ db }`) — genuinely new: unlike the other six stores this ticket touches, there was no
pre-existing `{ ledgerPath }`-taking "Brand store" to port, since `brand-profile.yaml` was read ad hoc.
`createBrand` SHALL generate the row's `id`, default `bannedWords`/`requiredHashtags` to `[]` when
omitted, and leave `requiredCta`/`watermarkHandle` absent (never an empty string) when omitted.

#### Scenario: createBrand with only the required fields defaults the optional ones

- **GIVEN** a `BrandInput` carrying only `slug`, `name`, `timezone`, and `mediaRoot`
- **WHEN** `createBrand` is called
- **THEN** the returned row's `bannedWords` and `requiredHashtags` are `[]`, and `requiredCta`/
  `watermarkHandle` are absent

#### Scenario: createBrand stores every optional field when given

- **GIVEN** a `BrandInput` carrying `bannedWords`, `requiredCta`, `requiredHashtags`, and
  `watermarkHandle`
- **WHEN** `createBrand` is called, then the row is read back by `getBrandById`
- **THEN** every one of those fields round-trips verbatim

### Requirement: brand.slug is unique — a duplicate is rejected, never silently overwritten

`createBrand` SHALL rely on the schema's own `UNIQUE (slug)` constraint on `brand` — inserting a second
Brand with an already-committed slug SHALL throw, never silently overwrite the first Brand's row.

#### Scenario: A duplicate slug is rejected

- **GIVEN** a Brand already committed with slug `"straw-motion"`
- **WHEN** `createBrand` is called again with the same slug
- **THEN** it throws a uniqueness error, and the original Brand's row is unchanged

### Requirement: Brand lookups are null-for-unknown, never a throw

`getBrandById`/`getBrandBySlug` SHALL return `null` for an id/slug with no committed Brand — never
throw. `listBrands` SHALL return every committed Brand sorted by slug, and `[]` for an empty database.

#### Scenario: getBrandById/getBrandBySlug return null for an unknown id/slug

- **GIVEN** an empty database
- **WHEN** `getBrandById`/`getBrandBySlug` are called with any id/slug
- **THEN** both return `null`

#### Scenario: listBrands is sorted by slug

- **GIVEN** two Brands committed in slug order `"straw-motion"` then `"mundotip"`
- **WHEN** `listBrands` is called
- **THEN** the returned array is ordered `["mundotip", "straw-motion"]`

### Requirement: updateBrand merges a patch and throws a clear error for an unknown Brand

`updateBrand` SHALL merge only the given `BrandPatch` fields onto the existing row, leaving every other
field — including `created_at` — unchanged, and SHALL always bump `updated_at`. For an unknown `id` it
SHALL throw a clear, actionable error naming the id, rather than silently doing nothing — a Brand row is
a required FK anchor for `channel`/`format`/`run`/`idea`, so a caller must be able to trust that an
`updateBrand` call either landed or loudly failed.

#### Scenario: updateBrand merges a patch, leaving untouched fields and created_at unchanged

- **GIVEN** an existing Brand
- **WHEN** `updateBrand` is called with a patch touching only one field
- **THEN** that field is updated, every other field (including `created_at`) is unchanged, and
  `updated_at` reflects the call time

#### Scenario: updateBrand throws for an unknown Brand id

- **GIVEN** an id with no committed Brand
- **WHEN** `updateBrand` is called with that id
- **THEN** it throws an error naming the id
