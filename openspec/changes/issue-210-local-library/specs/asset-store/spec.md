## ADDED Requirements

### Requirement: listAllAssets returns every Asset in the database, across every Idea/Brand/Format

`src/asset/store.ts`'s `listAllAssets(db)` SHALL return every `asset` row in the database, in creation
order, regardless of which Idea, Brand, or Format it belongs to — `[]` for an empty database. This is
the whole-table read the local read-only Library's own Library screen needs (AC2: "lists every Asset"),
mirroring `IdeaStore.listAllIdeas`'s identical shape and purpose.

#### Scenario: An empty database returns an empty list

- **GIVEN** a freshly migrated database with no `asset` row
- **WHEN** `listAllAssets(db)` is called
- **THEN** it returns `[]`

#### Scenario: Every Asset across every Idea is returned, including more than one Recipe on the same Idea

- **GIVEN** one Idea with two Assets (two different Recipes)
- **WHEN** `listAllAssets(db)` is called
- **THEN** it returns both Assets

### Requirement: getAssetMediaById looks up one asset_media row by its own stable id

`src/asset/store.ts`'s `getAssetMediaById(db, id)` SHALL return the `AssetMediaRecord` for `id`, or
`null` for an unknown id — never throws. This is the lookup the local read-only Library's `/media/:id`
byte-serving route resolves a media item by, since a URL path segment carries only the media row's own
id, never its owning Asset's id.

#### Scenario: A known media id resolves to its full record

- **GIVEN** an `asset_media` row added via `addAssetMedia`
- **WHEN** `getAssetMediaById(db, id)` is called with that row's own id
- **THEN** it returns the full record, including `storageKey` and `mime`

#### Scenario: An unknown media id returns null, never throws

- **GIVEN** an id that names no `asset_media` row
- **WHEN** `getAssetMediaById(db, id)` is called
- **THEN** it returns `null`
