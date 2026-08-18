## ADDED Requirements

### Requirement: saveAssetSpec and refreshSpecFile expose the Production Spec's SQL write and its generated file view

`src/command-surface/production-spec.ts` SHALL expose `saveAssetSpec(db, assetId, spec, now?)` — a thin
wrapper over `src/production-spec/store.ts`'s SQL-backed `saveProductionSpec`, giving that function its
first production caller — and `refreshSpecFile(db, assetId, path)`, which reads the Spec back off SQL
via `loadProductionSpec` and writes it to `path` via the file-backed `saveSpec`, so the on-disk per-Idea
Spec file is always a GENERATED VIEW of the SQL row, never a second, independently-authored copy
(mirroring `post.json`'s own relationship to the ledger's Asset, ADR-0028). Both functions live inside
`src/command-surface/`, taking an already-open, already-migrated `DatabaseSync` as their first argument,
matching this surface's existing convention — no store write function is imported directly by any caller
outside this directory.

#### Scenario: saveAssetSpec persists a Spec onto the Asset's SQL row

- **GIVEN** a committed Asset row with no Spec yet
- **WHEN** `saveAssetSpec(db, assetId, spec)` is called
- **THEN** `loadProductionSpec(db, assetId)` returns a value deep-equal to `spec`

#### Scenario: refreshSpecFile writes the file view from the SQL row, never from a separately-held value

- **GIVEN** an Asset row whose Spec was just saved via `saveAssetSpec`
- **WHEN** `refreshSpecFile(db, assetId, path)` is called
- **THEN** the file at `path` contains the SAME Spec `loadProductionSpec(db, assetId)` returns at that
  moment — reading it back from SQL, never writing a value the caller held in memory
