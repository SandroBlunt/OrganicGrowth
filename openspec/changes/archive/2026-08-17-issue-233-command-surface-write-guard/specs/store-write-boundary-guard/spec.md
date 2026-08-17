## ADDED Requirements

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
