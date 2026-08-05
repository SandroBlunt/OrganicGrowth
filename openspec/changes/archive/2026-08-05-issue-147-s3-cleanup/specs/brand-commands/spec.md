## MODIFIED Requirements

### Requirement: Every granular command SHALL accept and require an explicit Brand argument

The system SHALL require a `<brand>` argument as the first positional parameter of every granular
command that operates on a single Brand's state (`/run-trends`, `/review-ideas`, `/pick-cast`,
`/log-post`, `/track-performance`, `/report`, `/export-schedule`, `/cleanup-schedule-media`). These
commands SHALL operate only on the named Brand's paths (derived via the Brand resolver) and SHALL NOT
fall back to any global default Brand when `<brand>` is absent. For them an absent `<brand>` SHALL
produce a usage error (stderr + non-zero exit code), never a silent MundoTip fallback.

`/queue` is the deliberate exception: it renders the single, global Production Queue that spans all
Brands, so its Brand argument is an OPTIONAL filter, not a requirement — omitting it (or passing
`--all`) shows every Brand's jobs. See the dedicated `/queue` requirement below. `/queue` therefore
also never falls back to a default Brand; it simply shows all of them.

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

#### Scenario: /export-schedule requires all four positional arguments, including an explicit Brand

- **GIVEN** the `/export-schedule` CLI entry invoked with fewer than 4 arguments (brand, format, run,
  start-date)
- **WHEN** the CLI entry runs
- **THEN** it writes a usage message to stderr and sets a non-zero exit code
- **AND** it does NOT fall back to any default Brand, Format, or Run

#### Scenario: /cleanup-schedule-media requires an explicit Brand argument

- **GIVEN** the `/cleanup-schedule-media` CLI entry invoked with no arguments
- **WHEN** the CLI entry runs
- **THEN** it writes a usage message to stderr and sets a non-zero exit code
- **AND** it does NOT fall back to any default Brand
