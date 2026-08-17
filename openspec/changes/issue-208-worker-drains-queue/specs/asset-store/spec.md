## ADDED Requirements

### Requirement: getAssetById looks up one Asset by its own stable id

`src/asset/store.ts`'s `getAssetById(db, id)` SHALL return the SQL-backed `DbAssetRecord` for `id`, or
`null` for an unknown id — never throws. This is the lookup a `job` row's own `asset_id` needs: a `job`
row carries only `asset_id`, never `(idea_id, recipe_slug)` directly, so a caller holding a job's claimed
record cannot reach its Asset's Production Spec/status through `loadIdeaAssets` (which is keyed by Idea)
without first resolving the Asset by id.

#### Scenario: A known Asset id resolves to its full record, including its saved Spec

- **GIVEN** an Asset saved with `status: 'queued'` and a Production Spec
- **WHEN** `getAssetById(db, assetId)` is called
- **THEN** it returns the Asset's full record, including `spec`

#### Scenario: An unknown Asset id returns null, never throws

- **GIVEN** an id that names no `asset` row
- **WHEN** `getAssetById(db, id)` is called
- **THEN** it returns `null`
