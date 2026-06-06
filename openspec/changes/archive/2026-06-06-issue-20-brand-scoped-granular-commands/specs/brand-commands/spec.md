## ADDED Requirements

### Requirement: Every granular command SHALL accept and require an explicit Brand argument

The system SHALL require a `<brand>` argument as the first positional parameter of every granular
command (`/run-trends`, `/review-ideas`, `/queue`, `/pick-cast`, `/log-post`, `/track-performance`,
`/report`). The command SHALL operate only on the named Brand's paths (derived via the Brand
resolver) and SHALL NOT fall back to any global default Brand when `<brand>` is absent. An absent
`<brand>` SHALL produce a usage error (stderr + non-zero exit code), never a silent MundoTip fallback.

#### Scenario: /report with a brand slug reads that Brand's ledger

- **GIVEN** two Brands, `mundotip` and `acme`, each with their own ledger at
  `data/brands/<slug>/ledger.json`
- **WHEN** `/report mundotip` is invoked (i.e. `reportCommand("mundotip", ...)`)
- **THEN** it reads `data/brands/mundotip/ledger.json` and returns the mundotip report
- **AND** it does NOT read `data/brands/acme/ledger.json`

#### Scenario: /report for a different brand reads that brand's ledger

- **GIVEN** two Brands with distinct ledger contents
- **WHEN** `/report acme` is invoked
- **THEN** it reads `data/brands/acme/ledger.json` and returns the acme report
- **AND** the mundotip ledger is not consulted

#### Scenario: omitting <brand> from /report is a clear error

- **GIVEN** no `<brand>` argument is supplied to the `/report` CLI
- **WHEN** the CLI entry runs
- **THEN** it writes a usage message to stderr and sets a non-zero exit code
- **AND** it does NOT fall back to reading any default Brand's ledger

#### Scenario: /pick-cast with a brand slug reads that Brand's ledger and enqueues into the shared queue

- **GIVEN** Brand `mundotip` has an Idea with a Cast in its ledger
- **WHEN** `/pick-cast mundotip <idea-id> 2` is invoked
- **THEN** it reads `data/brands/mundotip/ledger.json` for the Cast
- **AND** it enqueues the render into the global `data/queue.json`
- **AND** it does NOT read any other Brand's ledger

#### Scenario: /pick-cast for a different brand does not touch another brand's ledger

- **GIVEN** Brand `acme` and Brand `mundotip` both have Ideas with Casts
- **WHEN** `/pick-cast acme <idea-id> 1` is invoked
- **THEN** it reads `data/brands/acme/ledger.json` only
- **AND** `data/brands/mundotip/ledger.json` is not read

### Requirement: No global active-brand pointer file SHALL be written or read

The system SHALL NOT write or read any global "active brand" pointer file anywhere in the
repository. All Brand information SHALL be explicit per invocation. Two terminals running commands
concurrently on different Brands SHALL NOT clobber shared per-Brand state (other than the
intentionally shared global Production Queue). The per-Brand state (ledger, brand-profile, seeds,
ideas) SHALL be entirely separate under each Brand's directory.

#### Scenario: concurrent commands on different brands do not share per-brand state paths

- **GIVEN** two invocations: `reportCommand("mundotip", ...)` and `reportCommand("acme", ...)`
  running concurrently
- **WHEN** each resolves its ledger path
- **THEN** the paths are distinct (`data/brands/mundotip/ledger.json` vs
  `data/brands/acme/ledger.json`)
- **AND** no pointer file is written to determine the "active" brand

### Requirement: The TS commands report and pick-cast resolve the correct Brand via the resolver

The `reportCommand` and `pickCastCommand` functions in `src/commands/` SHALL use `resolveBrand(slug)`
from `src/brand/resolver.ts` to derive their ledger and queue paths from the explicit Brand slug.
When run against `mundotip`, they SHALL reproduce today's behavior exactly (same data, same output
format). The transitional `DEFAULT_LEDGER_PATH` hard-coded to `mundotip` SHALL NOT be used by the
CLI entry points when `<brand>` is absent — absence is an error, not a default.

#### Scenario: reportCommand routes to the Brand's ledger via the resolver

- **GIVEN** a valid Brand slug and a temp fixture ledger for that Brand
- **WHEN** `reportCommand(slug)` is called without an explicit `ledgerPath` override
- **THEN** it resolves the ledger path as `resolveBrand(slug).ledger`
- **AND** it reads only that Brand's ledger

#### Scenario: reportCommand against mundotip reproduces today's behavior

- **GIVEN** the migrated MundoTip ledger at `data/brands/mundotip/ledger.json`
- **WHEN** `reportCommand("mundotip")` is called
- **THEN** the output format and data is identical to the pre-slice output (same Ideas, same
  status, same scores)

#### Scenario: pickCastCommand routes to the Brand's ledger via the resolver

- **GIVEN** a valid Brand slug and a temp fixture ledger for that Brand containing an Idea with a Cast
- **WHEN** `pickCastCommand(slug, ideaId, n, {})` is called without explicit path overrides
- **THEN** it resolves the ledger path as `resolveBrand(slug).ledger`
- **AND** it enqueues the render into the global queue

### Requirement: The interim single-Brand default is removed from CLI entry points

The CLI entry points for `report` and `pick-cast` SHALL require an explicit `<brand>` argument.
Absent `<brand>`, they write a usage message to stderr and exit with a non-zero code. They SHALL NOT
silently read from `data/brands/mundotip/ledger.json` or any other Brand's ledger as a default.

#### Scenario: report CLI without a brand argument exits with usage error

- **GIVEN** the report CLI is invoked with no arguments
- **WHEN** the `main()` function runs
- **THEN** a usage message is written to stderr
- **AND** `process.exitCode` is set to a non-zero value
- **AND** no ledger file is read

#### Scenario: pick-cast CLI without a brand argument exits with usage error

- **GIVEN** the pick-cast CLI is invoked with only `<idea-id>` and `<n>` (brand missing)
- **WHEN** the `main()` function runs
- **THEN** a usage message is written to stderr
- **AND** `process.exitCode` is set to a non-zero value

### Requirement: Content agents thread the Brand and restate it at each human gate

The content agents (`trend-scout`, `idea-strategist`, `producer`, `performance-tracker`) SHALL
receive the Brand at invocation, use only that Brand's paths for all file reads and writes, and
restate the active Brand explicitly in their output at each human gate (Review, Cast pick, Publish).
No agent shall ever infer the "current" Brand from a global default; it must be stated.

#### Scenario: trend-scout threads the Brand through all its file I/O

- **GIVEN** an invocation with Brand `mundotip`
- **WHEN** trend-scout runs
- **THEN** it reads seeds from `data/brands/mundotip/seeds.yaml`
- **AND** reads the brand profile from `data/brands/mundotip/brand-profile.yaml`
- **AND** writes trends/ideas under `data/brands/mundotip/ideas/<run>/`
- **AND** appends to `data/brands/mundotip/ledger.json`

#### Scenario: producer restates the Brand at Gate 2 (Cast pick)

- **GIVEN** an invocation with Brand `mundotip` and an Idea paused at the Cast gate
- **WHEN** the producer pauses for the Cast pick
- **THEN** it restates "Brand: mundotip" (or equivalent) in the Cast gate output
- **AND** the Operator can see which Brand they are picking for

#### Scenario: always-rules hold per Brand

- **GIVEN** any granular command invoked with a Brand slug
- **WHEN** the command runs
- **THEN** generate-never-publish: the command never publishes to a Channel
- **AND** public-metrics-only: only public metrics are used for performance
- **AND** relative-not-absolute: scores are relative to the named Brand's own baseline
- **AND** explicit-attribution: Post→Idea links use only the logged URL for the named Brand
- **AND** ledger-as-source-of-truth: all status changes are written to the named Brand's ledger
