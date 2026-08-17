## ADDED Requirements

### Requirement: every non-test production module importing node:fs is audited and given one of three verdicts

Every non-test module under `src/` that imports `node:fs`/`node:fs/promises` SHALL be individually
audited and given exactly one of three verdicts: **moved behind a store**, **moved behind an existing
port** (`SpaceMcpPort`/`PerformanceScrapePort`/`MediaHostPort`/the Zoho MCP schedule port), or
**legitimately direct, with a stated reason**. "Imports" means a real ES import site or an equivalent
`require` call — never a bare substring match on the module specifier's text; "non-test" means the
module's path does not contain the substring `"test"`. The full audit, with its per-module reasoning,
SHALL be posted on issue #205 (`gh issue comment`).

#### Scenario: a module moved behind a store no longer imports node:fs at all

- **GIVEN** `src/commands/run-pipeline.ts`, audited and verdicted "moved behind a store"
  (`ledger.ts`'s own `loadBaseline`)
- **WHEN** its `node:fs`/`node:fs/promises` import is removed and its baseline read is swapped to
  `loadBaseline`
- **THEN** the module's own test suite (`run-pipeline.test.ts`) still passes unchanged, and the module no
  longer appears in `NODE_FS_ALLOW_LIST`

#### Scenario: a legitimately-direct module is named in the allow-list with its category

- **GIVEN** `src/fs/safe-io.ts`, audited and verdicted "legitimately direct" (the shared low-level I/O
  primitive every file-backed store is built on)
- **WHEN** the audit and `src/fs-boundary/allow-list.ts` are read
- **THEN** the module is present in `NODE_FS_ALLOW_LIST`, grouped under its stated reason category

### Requirement: an automated guard fails the build when a new, un-audited import appears, or a stale entry no longer needs the carve-out

`src/fs-boundary/node-fs-guard.test.ts`, run as part of `npm test`, SHALL walk every `.ts` file under
`src/`, compute the set of non-test files whose content imports `node:fs`/`node:fs/promises` (via the
pure `src/fs-boundary/scan.ts`), and assert that set is EXACTLY `NODE_FS_ALLOW_LIST` — in both
directions: every found file SHALL already be allow-listed (a new, un-audited import fails the test),
and every allow-listed path SHALL still actually import `node:fs` (a stale entry that no longer needs
the carve-out also fails the test).

#### Scenario: a brand-new, un-audited node:fs import fails the guard

- **GIVEN** a hypothetical new production module (not in `NODE_FS_ALLOW_LIST`) that adds a
  `node:fs/promises` import
- **WHEN** `npm test` runs the node:fs boundary guard
- **THEN** the guard test fails, naming the new module as an un-audited violation

#### Scenario: an allow-list entry that no longer imports node:fs fails the guard

- **GIVEN** a hypothetical future refactor that removes `node:fs` usage from an allow-listed module,
  without removing its entry from `NODE_FS_ALLOW_LIST`
- **WHEN** `npm test` runs the node:fs boundary guard
- **THEN** the guard test fails, naming the stale entry

#### Scenario: the detector matches a real import site, never a bare textual mention

- **GIVEN** a file whose content mentions the string `node:fs` only in a doc comment (never a real
  import statement)
- **WHEN** the guard's detector (`src/fs-boundary/scan.ts`'s `importsNodeFs`) is run against that
  content
- **THEN** it returns `false` — the file is not treated as importing `node:fs`

### Requirement: the guard is landed as a ratchet — proven green against the real starting count before any sweep, then shrunk

The node:fs boundary guard's allow-list SHALL first be committed holding every real violator found by
the initial audit (proving the guard is green against the TRUE starting state, not a pre-solved one),
and the sweep of any genuine bypass SHALL land in a SEPARATE, later commit that both fixes the module and
shrinks the allow-list — so the guard is green throughout, no new violation can creep in mid-sweep, and
the remaining work is visible at every point as the allow-list's own shrinking size.

#### Scenario: the guard is green at the real starting count before any sweep commit

- **GIVEN** the audit's re-derived count of 33 non-test modules importing `node:fs`
- **WHEN** the guard is first landed, with `NODE_FS_ALLOW_LIST` holding all 33
- **THEN** `node-fs-guard.test.ts` passes, proving the ratchet starts from the real, current state

#### Scenario: the allow-list shrinks in the same change as the module it corresponds to is swept

- **GIVEN** the guard landed at 33/33, with `src/commands/run-pipeline.ts` still on the allow-list as a
  genuine bypass
- **WHEN** `run-pipeline.ts` is swept to use `loadBaseline` and its entry is removed from
  `NODE_FS_ALLOW_LIST` in the same commit
- **THEN** `node-fs-guard.test.ts` still passes, now against the smaller, 32-entry list
