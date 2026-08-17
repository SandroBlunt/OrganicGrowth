# store-write-boundary-guard Specification

## Purpose
TBD - created by archiving change issue-233-command-surface-write-guard. Update Purpose after archive.
## Requirements
### Requirement: every SQL-backed domain store's write functions are named, and their real importers are audited

Every SQL-backed (`db: DatabaseSync` first-argument) domain store SHALL have its write-function exports
named in `src/store-write-boundary/scan.ts`'s `STORE_WRITE_FUNCTIONS`, distinct from its read functions
(scope: writes only — see the "reads vs writes" requirement below). Every real import of a named write
function, anywhere under `src/` outside `src/command-surface/**` and test paths (any path containing the
substring `"test"`), SHALL be individually audited and either removed (moved onto
`src/command-surface/**`) or added to `src/store-write-boundary/allow-list.ts`'s
`STORE_WRITE_BOUNDARY_ALLOW_LIST` with a stated reason. "Imports" means a real named ES import site,
resolved against the importing file's own path to the store module it actually points at — never a bare
substring or bare function-name search, which would false-positive both on prose mentioning a write
function's name and on an unrelated function in a different module that happens to share the same bare
name.

#### Scenario: a real import site is detected regardless of how the store module is reached

- **GIVEN** `src/db/fixtures/seed-chain.ts`, which imports `createBrand` from `"../../brand/store.ts"`
- **WHEN** the detector resolves that relative specifier against the importing file's own path
- **THEN** it identifies the import as targeting `src/brand/store.ts`'s `createBrand`, matching
  `STORE_WRITE_FUNCTIONS`'s entry for that store

#### Scenario: a bare name collision across two unrelated modules is not mistaken for a store import

- **GIVEN** `src/brand/resolver.ts`'s own `listBrands` (a file-scanning function, unrelated to
  `src/brand/store.ts`'s SQL-backed `listBrands`) and a hypothetical caller importing
  `src/brand/resolver.ts`'s version
- **WHEN** the detector resolves that caller's import specifier
- **THEN** it does not match `src/brand/store.ts`'s entry, because the specifier resolves to a different
  module than `src/brand/store.ts`

#### Scenario: a doc-comment mention of a write function's name is not a match

- **GIVEN** a file whose content mentions `createBrand` only in a doc comment, with no real import
  statement naming it
- **WHEN** the detector is run against that content
- **THEN** it reports no match for that file

### Requirement: reads are explicitly out of this guard's scope, by a recorded decision

This guard SHALL cover only each SQL-backed domain store's write-function exports, never its read
functions. This is a stated scope decision, not an oversight: a read bypass carries no data-corruption or
lost-write risk the way a write bypass does, and `src/command-surface/`'s own read operations (e.g.
`listTrends`) already document that reads are exposed there for consistency, not because reading a store
directly is unsafe.

#### Scenario: a direct import of a store's read function is not flagged

- **GIVEN** `src/idea/store.ts`'s existing import of `getTrend` from `src/trend/store.ts` (a read
  function, store-to-store composition)
- **WHEN** the guard runs
- **THEN** it does not flag this import, because `getTrend` is not in `STORE_WRITE_FUNCTIONS`'s list for
  `src/trend/store.ts`

### Requirement: an automated guard fails the build when a new, un-audited store-write import appears, or a stale allow-list entry no longer needs the carve-out

`src/store-write-boundary/store-write-guard.test.ts`, run as part of `npm test`, SHALL walk every `.ts`
file under `src/`, compute the set of (importing file, store module, write function) triples any non-test,
non-`command-surface` file imports (via the pure `src/store-write-boundary/scan.ts`), and assert that set
is EXACTLY `STORE_WRITE_BOUNDARY_ALLOW_LIST` — in both directions: every found triple SHALL already be
allow-listed (a new, un-audited direct store-write import fails the test), and every allow-listed triple
SHALL still actually be imported that way (a stale entry that no longer imports that write function also
fails the test, so the allow-list can never silently over-claim what still needs the carve-out).

#### Scenario: a brand-new, un-audited direct store-write import fails the guard

- **GIVEN** a hypothetical new module (not in `STORE_WRITE_BOUNDARY_ALLOW_LIST`, not under
  `src/command-surface/`) that imports `createTrend` directly from `src/trend/store.ts`
- **WHEN** `npm test` runs the store-write boundary guard
- **THEN** the guard test fails, naming the new module, the store, and the write function as an
  un-audited violation

#### Scenario: an allow-list entry that no longer imports that write function fails the guard

- **GIVEN** a hypothetical future refactor that removes an allow-listed file's import of its listed write
  function, without removing the corresponding entry from `STORE_WRITE_BOUNDARY_ALLOW_LIST`
- **WHEN** `npm test` runs the store-write boundary guard
- **THEN** the guard test fails, naming the stale entry

#### Scenario: the command surface itself is never flagged

- **GIVEN** `src/command-surface/ideas.ts`'s own import of `createIdea` from `src/idea/store.ts`
- **WHEN** the guard runs
- **THEN** it does not flag this import, because the importing file's own path is under
  `src/command-surface/`

#### Scenario: a documented, allow-listed fixture is never flagged

- **GIVEN** `src/production-queue/fixtures/claim-worker.ts`'s import of `claimJob` from
  `src/production-queue/job-store.ts`, present in `STORE_WRITE_BOUNDARY_ALLOW_LIST` with a stated reason
  (a concurrency-test fixture spawned as its own OS process)
- **WHEN** the guard runs
- **THEN** it does not fail — the found triple exactly matches an allow-listed one

### Requirement: the guard is landed as a ratchet, proven green against the real, audited starting state

`STORE_WRITE_BOUNDARY_ALLOW_LIST` SHALL first be committed holding every real, legitimate exception found
by the audit — proving the guard is green against the TRUE starting state — and any genuine bypass a
future audit finds SHALL be swept in a commit that both fixes the module and shrinks the allow-list,
mirroring `src/fs-boundary/`'s own sequencing.

#### Scenario: the guard is green at the real starting state before any future sweep

- **GIVEN** the audit's finding that every current direct store-write import outside
  `src/command-surface/**` and test paths is either `src/db/fixtures/seed-chain.ts`,
  `src/production-queue/fixtures/claim-worker.ts`, or one of five pre-#205 live callers of
  `AssetStore.writeAsset`'s file-backed overload
- **WHEN** the guard is first landed, with all of these present in
  `STORE_WRITE_BOUNDARY_ALLOW_LIST`
- **THEN** `store-write-guard.test.ts` passes, proving the ratchet starts from the real, current state

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

