## ADDED Requirements

### Requirement: Production Spec contract is sourced without the truncated canvas node

The Production Spec contract (the shape and style rules the Space's `JSON master` node enforces) SHALL
be sourced **without** depending on reading the Space's system-prompt text node from the canvas, because
the Magnific read API truncates large text nodes at ~1,900 chars and cuts the system prompt off
mid-section (see `docs/producer-spikes-results.md`, Spike 3). The contract SHALL instead be encoded as a
compact, documented schema/style summary in code that the validator enforces, and the chosen sourcing
path SHALL be documented in the module.

#### Scenario: Contract enforcement does not read the canvas system-prompt node

- **GIVEN** the Producer composing a Production Spec
- **WHEN** the contract is consulted to build and validate the Spec
- **THEN** the contract comes from the in-code schema/style summary
- **AND** no canvas system-prompt text node is read (no live Space call, no WebFetch in tests)

### Requirement: Production Spec validation

The system SHALL provide a pure `validate(spec)` function that returns whether a Production Spec
conforms to the contract and, when it does not, the specific reasons it failed. A well-formed Spec SHALL
be accepted. A malformed Spec SHALL be rejected before it could reach the Space (so a bad Spec never
wastes a run or credits). Validation SHALL reject, each with an identifiable reason:

- `character_concepts` whose length is not exactly 3;
- `clips` whose length is not exactly 3;
- a `post_copy` longer than 180 characters;
- a `post_copy` containing 0 emojis or more than 3 emojis;
- a missing `thumbnails` field;
- a `post_copy` or `thumbnails` field nested inside a `clip` (or elsewhere) instead of at the TOP
  LEVEL of the Spec.

#### Scenario: A well-formed Spec is accepted

- **GIVEN** a Production Spec with exactly 3 `character_concepts`, exactly 3 `clips`, a top-level
  `post_copy` of ≤180 chars with 1–3 emojis, and a top-level `thumbnails` of 3 image prompts
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: true` with no errors

#### Scenario: Wrong number of character_concepts is rejected

- **GIVEN** a Production Spec with 4 `character_concepts`
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: false` with an error identifying `character_concepts` count

#### Scenario: Wrong number of clips is rejected

- **GIVEN** a Production Spec with 2 `clips`
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: false` with an error identifying `clips` count

#### Scenario: Over-long post_copy is rejected

- **GIVEN** a Production Spec whose `post_copy` exceeds 180 characters
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: false` with an error identifying `post_copy` length

#### Scenario: Wrong emoji count in post_copy is rejected

- **GIVEN** a Production Spec whose `post_copy` contains 0 emojis (and, separately, one with 4 emojis)
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: false` with an error identifying the `post_copy` emoji count in each case

#### Scenario: Missing thumbnails is rejected

- **GIVEN** a Production Spec with no `thumbnails` field
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: false` with an error identifying the missing `thumbnails`

#### Scenario: Nested post_copy or thumbnails is rejected

- **GIVEN** a Production Spec whose `post_copy` (or `thumbnails`) appears inside a `clip` instead of at
  the top level
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: false` with an error identifying that the field must be top-level

### Requirement: Brand-safety hard filter on the Production Spec

A generated or validated Production Spec SHALL honor the `brand-profile.yaml` hard filters: a Spec that
contains a banned word (in any text field — concepts, clip prompts, `post_copy`, or `thumbnails`) SHALL
be rejected, so a banned word never survives into a saved Spec (production must not reintroduce anything
Review would have filtered). The banned-word match SHALL be case-insensitive. When the brand profile
defines no banned words, the filter SHALL pass any Spec.

#### Scenario: A Spec containing a banned word is rejected

- **GIVEN** a brand profile that defines banned words and a Production Spec whose `post_copy` contains
  one of them
- **WHEN** the brand-safety filter is applied
- **THEN** the Spec is rejected and the banned word is named in the reason
- **AND** the Spec is not written to disk

#### Scenario: A clean Spec passes the brand-safety filter

- **GIVEN** a brand profile that defines banned words and a Production Spec that contains none of them
- **WHEN** the brand-safety filter is applied
- **THEN** the Spec passes

### Requirement: Compose and persist a Production Spec beside the Brief

The Producer SHALL compose a contract-conformant Production Spec from an accepted Brief and persist it
to `ideas/<run>/idea-NN.spec.json` (the machine-readable sibling of the Brief), so the Operator can
inspect exactly what will drive a render. The persisted Spec SHALL pass `validate()` and the
brand-safety filter; a Spec that fails either SHALL NOT be written.

#### Scenario: Composing an accepted Idea writes a valid Spec beside the Brief

- **GIVEN** an accepted Brief for Idea `idea-NN` in run `<run>`
- **WHEN** the Producer composes its Production Spec
- **THEN** a file `ideas/<run>/idea-NN.spec.json` is written
- **AND** the written Spec passes `validate()` and the brand-safety filter

#### Scenario: A failing Spec is refused, not written

- **GIVEN** a candidate Spec that fails validation or contains a banned word
- **WHEN** persistence is attempted
- **THEN** no `idea-NN.spec.json` is written and the failure is reported

### Requirement: Producer agent definition

OrganicGrowth SHALL define a content `producer` agent (model Opus) joining trend-scout /
idea-strategist / performance-tracker. Its definition SHALL describe the Producer's role per CLAUDE.md
and CONTEXT.md: it drives a pre-defined Magnific Space — generates a Production Spec from an accepted
Brief, runs the cast stage, pauses at the Cast gate, and renders the Asset after the Operator picks the
Character — and it **generates, never publishes**.

#### Scenario: The producer agent definition exists and is Opus

- **GIVEN** the repository's agent definitions
- **WHEN** the `producer` agent definition is read
- **THEN** it specifies model `opus`
- **AND** it describes generating a Production Spec and that the Producer generates but never publishes
