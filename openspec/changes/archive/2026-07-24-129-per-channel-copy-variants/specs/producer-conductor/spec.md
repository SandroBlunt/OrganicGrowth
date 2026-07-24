## ADDED Requirements

### Requirement: producer.md documents composing one Copy variant per targeted Channel platform

`.claude/agents/producer.md`'s Copy-phase section SHALL document reading the Brand's FULL Channel list
(`loadChannels`, ADR-0019) before drafting — every entry's `platform`, not just the primary — and, when
more than one platform is targeted, drafting ONE variant per targeted platform from the SAME produced
material (never one shared caption). It SHALL state that the primary Channel's variant is checked with
`validateCopy` against the Recipe's own `copyShape`, never `platform-shape.ts`'s own bounds, while every
other targeted platform's variant is checked with `validateCopyForPlatform`. It SHALL state that a
single-Channel Brand keeps drafting just the one caption, unchanged, and that the saved Asset carries
`copy.variants` (`src/copy/contract.ts`'s `Copy.variants`) only when more than one platform was
targeted. The output-bundle description SHALL state that `caption.txt` renders every variant, labeled by
platform, when more than one is targeted.

#### Scenario: The Copy-phase section reads the Brand's full Channel list before drafting

- **GIVEN** `.claude/agents/producer.md`'s Copy-phase section
- **WHEN** it is read
- **THEN** it names `loadChannels`, `ADR-0019`, and states this covers every Channel entry, not just
  the primary

#### Scenario: The Copy-phase section instructs one variant per targeted platform, and states the single-Channel case is unchanged

- **GIVEN** `.claude/agents/producer.md`'s Copy-phase section
- **WHEN** it is read
- **THEN** it instructs drafting one variant per targeted platform from the same produced material,
  and separately states a single-Channel Brand keeps drafting just the one caption, unchanged

#### Scenario: The Copy-phase section names the two per-variant checkers

- **GIVEN** `.claude/agents/producer.md`'s Copy-phase section
- **WHEN** it is read
- **THEN** it names `validateCopyForPlatform` for every non-primary targeted platform, and states the
  primary Channel never consults `platform-shape.ts`'s own bounds

#### Scenario: The output bundle description states caption.txt labels every variant by platform

- **GIVEN** `.claude/agents/producer.md`'s Save-phase / output-bundle description
- **WHEN** it is read
- **THEN** it states that, when more than one platform is targeted, `caption.txt` renders every
  variant, each under its own `=== PLATFORM ===` label
