# ci-pipeline Specification

## Purpose
TBD - created by archiving change issue-199-suites-green-ci-one-agent-tree. Update Purpose after archive.
## Requirements
### Requirement: npm test runs both the unit suite and the doc-conformance suite; npm run test:docs still runs the doc suite alone

`package.json`'s `test` script SHALL invoke `node --import tsx --test` against BOTH
`"src/**/*.test.ts"` AND `"src/**/*.docs-test.ts"` glob patterns, after `tsc -p tsconfig.json --noEmit`
runs first (unchanged ordering — a type error still fails the command before any test runs). The
`test:docs` script SHALL remain present and SHALL continue to invoke `node --import tsx --test` against
ONLY `"src/**/*.docs-test.ts"`, so a doc-only check can still be run standalone. The two globs SHALL
NEVER double-count or skip a file: because no filename can simultaneously end in the literal suffix
`.test.ts` and the literal suffix `.docs-test.ts` (the character immediately preceding `test.ts` is `.`
in the first suffix and `-` in the second), the two matched file sets SHALL be disjoint, and the merged
`npm test` run's total test/suite counts SHALL equal the sum of running each glob alone.

#### Scenario: npm test's combined count equals the disjoint sum of the two standalone suites

- **GIVEN** this repository's real `src/**/*.test.ts` files (2411 tests, 598 suites) and real
  `src/**/*.docs-test.ts` files (259 tests, 66 suites)
- **WHEN** `node --import tsx --test "src/**/*.test.ts" "src/**/*.docs-test.ts"` is run
- **THEN** it reports exactly 2670 tests, 664 suites, and 0 failures — the exact sum of the two
  standalone counts, proving no file was double-counted or skipped

#### Scenario: npm test still type-checks first

- **GIVEN** `package.json`'s `test` script
- **WHEN** it is read
- **THEN** it runs `tsc -p tsconfig.json --noEmit` before the `node --import tsx --test` invocation, so a
  type error still fails the command before any test executes

#### Scenario: npm run test:docs still runs only the doc-conformance suite, standalone

- **GIVEN** `package.json`'s `test:docs` script
- **WHEN** it is run directly
- **THEN** it reports the same 259 tests / 66 suites / 0 fail as running the `*.docs-test.ts` glob alone,
  unaffected by the `test` script's change

#### Scenario: A doc-conformance failure now fails npm test, the same command that gates type-checking

- **GIVEN** a `*.docs-test.ts` file whose assertion fails (e.g. a doc's pinned prose was edited away)
- **WHEN** `npm test` is run
- **THEN** the overall command exits non-zero — a prose regression is now a build failure, not a
  silently-ignored separate suite

### Requirement: The test script's own shape is guarded by a persisted test against the real package.json (QA Round-1 D1)

`src/ci/package-scripts.ts` SHALL export a pure, side-effect-free module (`parsePackageJsonScripts`,
`runsTypecheckFirst`, `coversTestGlob`) that reads an ALREADY-LOADED `package.json` document and pins
the MEANINGFUL properties of its `test` script — that `tsc -p tsconfig.json --noEmit` is the first
`&&`-chained command, and that a given glob pattern appears as one of the `node --test` invocation's
quoted arguments — robust to harmless reformatting (extra whitespace around `&&`, single- vs
double-quoted glob arguments) so it never becomes a nuisance test someone deletes. A test in this
repository's `npm test` suite SHALL read the REAL `package.json` from this repository's own root
(resolved via `import.meta.url`, never a copied string constant or a hardcoded checkout path), parse it
with `parsePackageJsonScripts`, and assert the `test` script runs the typecheck step first and covers
BOTH `"src/**/*.test.ts"` AND `"src/**/*.docs-test.ts"`, and that `test:docs` covers only the latter —
so a future silent revert (e.g. someone quietly dropping the `*.docs-test.ts` glob back out of `test`)
is caught by this suite instead of staying green forever, unnoticed, which is exactly the class of
drift issue #199 itself was filed to close.

#### Scenario: runsTypecheckFirst pins the ordering, robust to harmless reformatting

- **GIVEN** two synthetic fixture scripts whose commands are identical except for extra whitespace
  around their `&&` separator, and a third fixture with the typecheck step moved to run SECOND
- **WHEN** `runsTypecheckFirst` is called on each
- **THEN** it returns `true` for both whitespace variants and `false` for the reordered one

#### Scenario: coversTestGlob is quote-style-robust and never confuses the two suite globs

- **GIVEN** a script containing `"src/**/*.test.ts"` (double-quoted) and a script containing
  `'src/**/*.test.ts'` (single-quoted), and separately a script containing only
  `"src/**/*.docs-test.ts"`
- **WHEN** `coversTestGlob` is called checking for `"src/**/*.test.ts"` against each
- **THEN** it returns `true` for both quote styles and `false` for the docs-only script — the two suite
  globs are never confused for one another

#### Scenario: This repository's real package.json test script satisfies the guard

- **GIVEN** this repository's real `package.json`, read from its own root resolved via
  `import.meta.url` and parsed with `parsePackageJsonScripts`
- **WHEN** its `test` and `test:docs` scripts are checked
- **THEN** `test` runs the typecheck step first and covers both `"src/**/*.test.ts"` and
  `"src/**/*.docs-test.ts"`, and `test:docs` covers `"src/**/*.docs-test.ts"` but NOT
  `"src/**/*.test.ts"`

### Requirement: A GitHub Actions workflow runs npm test on every push and pull request, hermetically

`.github/workflows/ci.yml` SHALL define a workflow that triggers on both the `push` and `pull_request`
GitHub events, with no branch filter and no path filter (every push, every pull request). It SHALL run
on `ubuntu-latest`, check out the repository with `actions/checkout` using `fetch-depth: 0` (full
history — NOT the action's shallow-clone default), set up Node 22 or newer via `actions/setup-node`
(matching `package.json`'s `engines.node: ">=22"`), install dependencies via `npm ci` against the
committed `package-lock.json`, and then run a step whose command is EXACTLY `npm test` (never a narrower
subset, never an additional flag). The workflow file SHALL declare no `secrets:` block and SHALL contain
no reference (in any job, step, `env:`, or `with:` value) to Magnific, Zoho, Apify, or AWS credentials or
endpoints — the same hermetic, no-live-external-call contract the build/CI loop keeps everywhere else
(ADR-0005).

#### Scenario: The workflow triggers on both push and pull_request, unfiltered

- **GIVEN** `.github/workflows/ci.yml` as shipped
- **WHEN** its `on:` trigger list is read
- **THEN** it includes both `push` and `pull_request`, with no `branches:`/`paths:` filter narrowing
  either

#### Scenario: The workflow checks out full history, not a shallow clone

- **GIVEN** `.github/workflows/ci.yml`'s `actions/checkout` step
- **WHEN** its `with:` block is read
- **THEN** `fetch-depth` is `0`

#### Scenario: The workflow uses Node 22 or newer and runs npm ci then exactly npm test, in that order

- **GIVEN** `.github/workflows/ci.yml`'s `actions/setup-node` step and its `run:` steps
- **WHEN** they are read
- **THEN** `node-version` names Node 22 or newer, and an exact `npm ci` step appears, in step order,
  BEFORE an exact `npm test` step (the ORDER is checked, not merely that both commands are present
  somewhere — QA Round-1 Defect D2)

#### Scenario: The workflow carries no live-credential reference

- **GIVEN** `.github/workflows/ci.yml`'s raw text
- **WHEN** it is scanned for `secrets.` and for Magnific/Zoho/Apify/AWS-shaped names
- **THEN** no match is found, and no `secrets:` block is declared anywhere in the file

#### Scenario: fetch-depth: 0 is required because a real test in npm test shells to two specific historical commits

- **GIVEN** `src/secrets-scan/historical-incident.test.ts` (part of the regular `npm test` suite, not new
  to this change), which runs `git show bb955eb:.agents/mcp_config.json` and
  `git show 8f7c8f6:.agents/mcp_config.json`
- **WHEN** `git merge-base --is-ancestor` is checked for each commit against `origin/main`
- **THEN** both are confirmed ancestors, so a full-history checkout (`fetch-depth: 0`) makes both
  commits resolvable in CI — a shallow clone would make this real, pre-existing test fail in CI even
  though it passes locally

### Requirement: The workflow's own shape is proven by a pure parser module and a real-file regression test

`src/ci/workflow.ts` SHALL export a pure, side-effect-free (no filesystem, no `git`, no clock) module
that parses a GitHub Actions workflow YAML string (via the `yaml` package) and exposes:
`triggersOnPushAndPullRequest(workflow)` (true only when both `push` and `pull_request` are present in
the `on:` trigger, under any shape GitHub Actions accepts — mapping, list, or bare string);
`checkoutFetchDepth(workflow)` (the `fetch-depth` value declared on the first `actions/checkout` step, or
`undefined` when absent); `setupNodeVersion(workflow)` (the `node-version` value declared on the first
`actions/setup-node` step, or `undefined` when absent); `runsExactNpmTest(workflow)` (true only when some
step's `run:` command, trimmed, is exactly `npm test`); `runsNpmCiBeforeNpmTest(workflow)` (true only
when an exact `npm ci` step appears, in step order, BEFORE an exact `npm test` step — asserting the
ORDER, not merely that both commands are present somewhere; QA Round-1 Defect D2); and
`referencesLiveCredentials(rawYamlText)` (true when the raw text contains `secrets.` or a
Magnific/Zoho/Apify/AWS-shaped credential name, case-insensitively). A test in this repository's
`npm test` suite SHALL read `.github/workflows/ci.yml` from this repository's own root — resolved from
the test file's own on-disk location via `import.meta.url`, never `process.cwd()` or a hardcoded
checkout path — parse it with this module, and assert it satisfies all six checks, so a future edit
that narrows the trigger, drops `fetch-depth: 0`, changes the run command, reorders or drops the
install step, or adds a live-credential reference is caught by this suite rather than only discovered
when CI itself goes red or, worse, silently stops being hermetic.

#### Scenario: triggersOnPushAndPullRequest reads every on: shape GitHub Actions accepts

- **GIVEN** three synthetic fixture workflows whose `on:` is, respectively, a mapping with `push:` and
  `pull_request:` keys, a bare list `[push, pull_request]`, and a single bare string `push` (missing
  `pull_request`)
- **WHEN** `triggersOnPushAndPullRequest` is called on each
- **THEN** it returns `true` for the mapping and the list, and `false` for the bare string missing
  `pull_request`

#### Scenario: runsExactNpmTest rejects a narrower or different command

- **GIVEN** synthetic fixture workflows whose only `run:` step is, respectively, `npm test`,
  `npm run test:docs`, `npm run test`, and `npm test -- --extra`
- **WHEN** `runsExactNpmTest` is called on each
- **THEN** it returns `true` only for the literal `npm test` step, and `false` for all three others

#### Scenario: runsNpmCiBeforeNpmTest asserts presence of BOTH steps AND their order

- **GIVEN** synthetic fixture workflows whose `run:` steps are, respectively: `npm ci` then `npm test`;
  only `npm test` (no `npm ci`); only `npm ci` (no `npm test`); `npm test` then `npm ci` (order
  reversed); and neither step at all
- **WHEN** `runsNpmCiBeforeNpmTest` is called on each
- **THEN** it returns `true` only for the first (both present, correct order), and `false` for all four
  others — including the reversed-order case, proving order is genuinely checked, not just presence

#### Scenario: referencesLiveCredentials catches a secrets. reference and a Magnific/Zoho/Apify/AWS-shaped name

- **GIVEN** synthetic fixture YAML text containing `${{ secrets.SOME_TOKEN }}`, and separately, text
  containing an env var named `MAGNIFIC_API_KEY` with no `secrets.` reference at all
- **WHEN** `referencesLiveCredentials` is called on each
- **THEN** both return `true`

#### Scenario: referencesLiveCredentials returns false for ordinary hermetic workflow text

- **GIVEN** synthetic fixture YAML text containing only `actions/checkout`, `actions/setup-node`,
  `npm ci`, and `npm test` steps, with no credential-shaped name anywhere
- **WHEN** `referencesLiveCredentials` is called
- **THEN** it returns `false`

#### Scenario: This repository's real ci.yml satisfies every check

- **GIVEN** `.github/workflows/ci.yml` as shipped, read from this repository's own root resolved via
  `import.meta.url`
- **WHEN** it is parsed with `parseWorkflow` and checked with all six functions
- **THEN** `triggersOnPushAndPullRequest` is `true`, `checkoutFetchDepth` is `0`, `setupNodeVersion`
  names Node 22 or newer, `runsExactNpmTest` is `true`, `runsNpmCiBeforeNpmTest` is `true`, and
  `referencesLiveCredentials` on the raw text is `false`

