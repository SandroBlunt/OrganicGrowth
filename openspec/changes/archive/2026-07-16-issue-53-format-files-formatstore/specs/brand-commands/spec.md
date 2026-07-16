## MODIFIED Requirements

### Requirement: Content agents thread the Brand and restate it at each human gate

The content agents (`trend-scout`, `idea-strategist`, `producer`, `performance-tracker`) SHALL
receive the Brand at invocation, use only that Brand's paths for all file reads and writes, and
restate the active Brand explicitly in their output at each human gate (Review, Cast pick, Publish).
No agent shall ever infer the "current" Brand from a global default; it must be stated. `trend-scout`
and `idea-strategist` additionally SHALL receive the Format at invocation (a Trend Research Run is
scoped to one Format — ADR-0013) and use that Format's own file for voice/sources/mode, restating
both the Brand and the Format in their output.

#### Scenario: trend-scout threads the Brand AND the Format through all its file I/O

- **GIVEN** an invocation with Brand `mundotip` and Format `life-hacks`
- **WHEN** trend-scout runs
- **THEN** it reads its sources + peer-vs-curated mode from
  `data/brands/mundotip/formats/life-hacks.yaml` (NOT from `seeds.yaml`)
- **AND** it reads Apify actor slugs from `data/brands/mundotip/seeds.yaml` (the one thing still
  read from there — data-handling rule 2)
- **AND** reads the brand profile from `data/brands/mundotip/brand-profile.yaml` for Brand-wide hard
  rules
- **AND** writes trends/ideas under `data/brands/mundotip/ideas/life-hacks/<run>/`
  (Format-namespaced)
- **AND** appends to `data/brands/mundotip/ledger.json`, tagging the record with
  `format: life-hacks`

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
