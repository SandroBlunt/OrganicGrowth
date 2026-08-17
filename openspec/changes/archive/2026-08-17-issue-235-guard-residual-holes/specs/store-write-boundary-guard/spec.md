## ADDED Requirements

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

#### Scenario: an audited, allow-listed file-backed-write orchestration shell is not flagged

- **GIVEN** `src/production-spec/compose.ts`'s own real import of `saveSpec`, present in
  `STORE_WRITE_BOUNDARY_ALLOW_LIST` with a stated reason (it is the write-gate for the file-backed
  Production Spec, not a caller reaching around one; tracked for migration by issue #238)
- **WHEN** the guard runs
- **THEN** it does not fail — the found triple exactly matches the allow-listed one

### Requirement: a namespace import of a tracked store module is resolved as importing every one of that store's write functions

`src/store-write-boundary/scan.ts` SHALL match a namespace import (`import * as alias from "specifier"`,
including a type-only `import type * as alias from "specifier"`, matching the existing named-import
pattern's own choice to still match a type-only import) in addition to a named import. When the resolved
specifier points at a tracked store module, EVERY write function named for that store in
`STORE_WRITE_FUNCTIONS` SHALL be reported as imported by that site — not only the ones a caller is later
observed to invoke through the alias — because a namespace import genuinely binds every export of the
module it names, and a regex-based, non-AST detector cannot safely determine which properties of a
namespace object are actually invoked without reopening the same class of evasion (an aliased function
reference, e.g. `const fn = alias.createIdea`) this extension exists to close.

#### Scenario: a namespace import of a tracked store module, followed by a call through the alias, is caught

- **GIVEN** a hypothetical module, outside `src/command-surface/` and not on the allow-list, containing
  `import * as store from "../idea/store.ts";` followed by a call to `store.createIdea(...)`
- **WHEN** the guard runs
- **THEN** it fails, naming the module, `src/idea/store.ts`, and ALL FOUR of that store's write functions
  (`createIdea`, `acceptIdea`, `rejectIdea`, `selectIdeaRecipes`) — not only `createIdea`

#### Scenario: a namespace import of a module that does not resolve to a tracked store is not flagged

- **GIVEN** a module containing `import * as readline from "node:readline";`
- **WHEN** the guard runs
- **THEN** it does not flag this import, because the specifier does not resolve to any module named in
  `STORE_WRITE_FUNCTIONS`

#### Scenario: a bare doc-comment mention describing a namespace-import shape, with no real import statement, is not a match

- **GIVEN** a file whose content only describes a namespace-import bypass in prose, with no real
  `import * as alias from "..."` statement anywhere in the file
- **WHEN** the detector is run against that content
- **THEN** it reports no match for that file

#### Scenario: the command surface and test-path exemptions apply to a namespace-import site the same way they apply to a named-import site

- **GIVEN** a file under `src/command-surface/` (or a `*.test.ts`-named file) containing a namespace
  import of a tracked store module
- **WHEN** the guard runs
- **THEN** it does not flag this import, for the same path-based reason a named-import site under either
  path is already excluded
