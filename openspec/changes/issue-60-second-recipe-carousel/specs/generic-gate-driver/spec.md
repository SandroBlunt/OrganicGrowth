## ADDED Requirements

### Requirement: A finished leg's AssetResult resolves EVERY produced creation, not just the first

`AssetResult` (`src/space-driver/driver.ts`) SHALL carry `media: readonly Creation[]` — every creation
a finished leg produced, resolved to `{identifier, url}` pairs, in the order the run produced them.
`assetId`/`assetUrl` SHALL continue to name the PRIMARY (first) creation, so a single-media Recipe's
caller never has to branch — for a single-creation finish, `media` SHALL be a one-element array equal
to `[{identifier: assetId, url: assetUrl}]` (no behavior change to the wired Recipe's own result shape).
A finished leg whose creation ids resolve to NO media SHALL fail (`run_failed`) rather than return `ok`
with an empty result.

#### Scenario: A single-creation finish yields a one-element media array

- **GIVEN** a leg whose run produces exactly one creation
- **WHEN** it finishes
- **THEN** `AssetResult.media` has exactly one entry, equal to `{identifier: assetId, url: assetUrl}`

#### Scenario: A multi-creation finish resolves every creation, in order

- **GIVEN** a leg whose run produces SEVERAL creations
- **WHEN** it finishes
- **THEN** `AssetResult.media` contains one entry per produced creation, in the order they were
  produced
- **AND** `assetId`/`assetUrl` equal the FIRST creation's identifier/url

### Requirement: driveSelectedRunPoints drives a caller-selected, ordered subset of a Space's parallel run-points to one finished, multi-media Asset

The system SHALL provide `driveSelectedRunPoints(port, spaceState, spec, runPointNames, poll)`
(`src/space-driver/driver.ts`) for a Recipe whose Production Spec ITSELF determines WHICH of a Space's
SEVERAL parallel, always-gateless run-points to drive for a given Idea (e.g. the News Carousel Recipe:
only the slides present in an Idea's Spec, never the Space's full fixed set) — a shape
`driveToNextGate`'s own gate-name walk cannot express, since every one of these run-points shares the
SAME gate (`null`). It SHALL inject the Spec ONCE, then run each NAMED run-point downstream IN ORDER,
one at a time (never in parallel — the single attended Operator, ADR-0008), accumulating every produced
creation id. A run-point name that cannot be resolved from the parsed Execution Protocol, or a run that
fails, SHALL stop the WHOLE leg IMMEDIATELY (no partial/best-effort result) — run-points AFTER the
failing one SHALL NEVER be started. It SHALL finish with the SAME `{assetId, assetUrl, media}` shape
`driveToNextGate`'s finished outcome carries (both share the underlying `finishLeg`), and it SHALL take
no publish action (generate-never-publish). `driveToNextGate` itself SHALL be unmodified by this
addition — the two orchestrators are independent, built from the SAME low-level primitives
(`injectSpec`, `runRunPoint`).

#### Scenario: Drives only the run-points named, never any others on the Space

- **GIVEN** a fake Space with SEVEN available parallel run-points and a caller-supplied list of 5 names
- **WHEN** `driveSelectedRunPoints` is called with those 5 names
- **THEN** exactly 5 runs are started, one per named run-point, in the given order
- **AND** the two run-points NOT named are never run

#### Scenario: Every produced creation is collected into the finished Asset's media, in run order

- **GIVEN** a fake Space where each of N named run-points produces one creation
- **WHEN** `driveSelectedRunPoints` finishes
- **THEN** `AssetResult.media` contains all N creations, in the SAME order the run-point names were
  given

#### Scenario: An unresolvable run-point name stops the whole leg immediately, without recovery

- **GIVEN** a list of names where the SECOND name does not exist on the Space
- **WHEN** `driveSelectedRunPoints` is called
- **THEN** it fails with `run_point_unresolved`
- **AND** only the FIRST name's run-point was ever run — nothing after the unresolved name started,
  and no Fallback-Protocol in-canvas-agent recovery is attempted

#### Scenario: A mid-list run failure stops the whole leg immediately

- **GIVEN** a list of 5 names where the THIRD named run-point's run fails
- **WHEN** `driveSelectedRunPoints` is called
- **THEN** it fails with the run's own failure code
- **AND** run-points 1 and 2 ran, run-point 3 failed, and run-points 4 and 5 NEVER started

#### Scenario: An empty run-point-names list fails cleanly without touching the Space

- **GIVEN** an empty `runPointNames` array
- **WHEN** `driveSelectedRunPoints` is called
- **THEN** it fails without issuing any edit or run
