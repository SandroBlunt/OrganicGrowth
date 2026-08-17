## ADDED Requirements

### Requirement: A SQL-backed sibling persists the Production Spec on asset.spec_json

`src/production-spec/store.ts` SHALL expose `saveProductionSpec(db, assetId, spec)` and `loadProductionSpec(db, assetId)` as an ADDITIVE, `{ db }`-only sibling to the existing
`specPathFor`/`saveSpec`/`briefShortName` file-based functions (unchanged by this Requirement) — the
Production Spec has no table of its own; it lives inline as `asset.spec_json`, the SAME column
`AssetStore`'s `{ db }`-backed `writeAsset`/`DbAssetPatch.spec` also writes. `saveProductionSpec` SHALL
throw a clear, actionable error naming the id when `assetId` does not exist — a genuinely missing Asset
id is a caller bug, distinct from `loadProductionSpec`, which SHALL return `null` (never throw) both
when the Asset does not exist and when it exists but carries no Spec yet, since from a caller's point of
view both mean "no Spec available".

#### Scenario: loadProductionSpec returns null before any Spec is saved

- **GIVEN** a real, migrated database with a valid Asset that has never had a Spec saved
- **WHEN** `loadProductionSpec` is called
- **THEN** it returns `null`

#### Scenario: saveProductionSpec/loadProductionSpec round-trip a Spec verbatim, and a second save overwrites the first

- **GIVEN** a real, migrated database with a valid Asset
- **WHEN** `saveProductionSpec` is called with a Spec object, then called AGAIN with a different Spec
  object, then `loadProductionSpec` is called
- **THEN** the second Spec is returned, unchanged in shape, and the first is gone

#### Scenario: saveProductionSpec throws for an unknown Asset id

- **GIVEN** an `assetId` with no committed Asset row
- **WHEN** `saveProductionSpec` is called with that id
- **THEN** it throws an error naming the id

#### Scenario: loadProductionSpec returns null, not a throw, for an unknown Asset id

- **GIVEN** an `assetId` with no committed Asset row
- **WHEN** `loadProductionSpec` is called with that id
- **THEN** it returns `null`
