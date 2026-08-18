## MODIFIED Requirements

### Requirement: a tracked store's file-backed write function, when it exists under its own distinct export name, is named and audited too

A tracked SQL-backed domain store's file-backed write function SHALL be named in `STORE_WRITE_FUNCTIONS`, alongside its SQL-backed write functions, whenever it exists under its own distinct export name (not an ambiguous single name serving two overloads, the way `AssetStore.writeAsset` does). Its real importers SHALL be audited by the same rule as any SQL-backed write function: removed (moved onto `src/command-surface/`) or added to `STORE_WRITE_BOUNDARY_ALLOW_LIST` with a stated reason.

#### Scenario: a store's file-backed write function is tracked alongside its SQL-backed one

- **GIVEN** `src/production-spec/store.ts`, which exports both the SQL-backed `saveProductionSpec` and the
  file-backed `saveSpec`
- **WHEN** `STORE_WRITE_FUNCTIONS["src/production-spec/store.ts"]` is read
- **THEN** it names both `saveProductionSpec` and `saveSpec`

#### Scenario: a real import site of a store's file-backed write function is detected the same way a SQL-backed one is

- **GIVEN** a hypothetical module, outside `src/command-surface/` and not on the allow-list, that imports
  `saveSpec` directly from `src/production-spec/store.ts`
- **WHEN** the detector resolves that import
- **THEN** it is reported as a `(path, "src/production-spec/store.ts", ["saveSpec"])` triple, identically
  in shape to how a SQL-backed write import is reported

#### Scenario: a hypothetical audited, allow-listed file-backed-write orchestration shell would not be flagged

- **GIVEN** a hypothetical module, allow-listed with a stated reason as a file-backed write's own
  orchestration shell (the same category `STORE_WRITE_BOUNDARY_ALLOW_LIST`'s doc-comment names for issue
  #235, currently holding no live example — issue #238 retired its one instance,
  `src/production-spec/compose.ts`, once ADR-0031/#264 moved the Production Spec's real persistence path
  onto `src/command-surface/`, which this guard exempts by path instead)
- **WHEN** the guard runs against that hypothetical entry
- **THEN** it does not fail — a correctly-paired (importing file, store, function) triple present in both
  the real disk-walk and the allow-list is never flagged, regardless of which specific module currently
  occupies this category
