# production-spec Specification

## Purpose
TBD - created by archiving change issue-3-producer-production-spec. Update Purpose after archive.
## Requirements
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
wastes a run or credits). The Spec is MEDIA INSTRUCTIONS ONLY (ADR-0012) — it carries no `post_copy`
field; a stray `post_copy` field present on a candidate object is simply not read/checked (it is not part
of the contract). Validation SHALL reject, each with an identifiable reason:

- `character_concepts` whose length is not exactly 3;
- `clips` whose length is not exactly 3;
- a missing `thumbnails` field;
- a `thumbnails` field nested inside a `clip` (or elsewhere) instead of at the TOP LEVEL of the Spec.

#### Scenario: A well-formed Spec is accepted

- **GIVEN** a Production Spec with exactly 3 `character_concepts`, exactly 3 `clips`, and a top-level
  `thumbnails` of 3 image prompts
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

#### Scenario: Missing thumbnails is rejected

- **GIVEN** a Production Spec with no `thumbnails` field
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: false` with an error identifying the missing `thumbnails`

#### Scenario: Nested thumbnails is rejected

- **GIVEN** a Production Spec whose `thumbnails` appears inside a `clip` instead of at the top level
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: false` with an error identifying that the field must be top-level

#### Scenario: post_copy is no longer part of the contract

- **GIVEN** a Production Spec that is otherwise well-formed but carries a stray top-level `post_copy`
  field (of any length or emoji count)
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: true` — the stray field is simply not checked, since Copy is composed
  separately, outside the Spec (`copy-composition`, ADR-0012)

### Requirement: Brand-safety hard filter on the Production Spec

A generated or validated Production Spec SHALL honor the `brand-profile.yaml` hard filters: a Spec that
contains a banned word (in any text field — concepts, clip prompts, or thumbnails) SHALL be rejected, so
a banned word never survives into a saved Spec (production must not reintroduce anything Review would
have filtered). The banned-word match SHALL be case-insensitive. When the brand profile defines no
banned words, the filter SHALL pass any Spec. The Spec's own scan no longer reads a `post_copy` field
(retired — ADR-0012); the composed Copy's OWN banned-word scan is a separate requirement
(`copy-composition`'s "A pure, hermetic, per-Recipe copy validator..."), sharing the SAME underlying
`scanTextFields` matching core so the two can never drift on the word-boundary/case-insensitivity rule.

#### Scenario: A Spec containing a banned word is rejected

- **GIVEN** a brand profile that defines banned words and a Production Spec whose clip prompt contains
  one of them
- **WHEN** the brand-safety filter is applied
- **THEN** the Spec is rejected and the banned word is named in the reason
- **AND** the Spec is not written to disk

#### Scenario: A clean Spec passes the brand-safety filter

- **GIVEN** a brand profile that defines banned words and a Production Spec that contains none of them
- **WHEN** the brand-safety filter is applied
- **THEN** the Spec passes

#### Scenario: A stray post_copy field is not scanned

- **GIVEN** a Production Spec carrying a stray top-level `post_copy` field containing a banned word
- **WHEN** the brand-safety filter is applied
- **THEN** the Spec passes — the stray field is not collected/scanned, since `post_copy` is retired from
  the Spec entirely

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

### Requirement: Compose and persist a Production Spec beside the Brief, segmented by Recipe

The Producer SHALL compose a contract-conformant Production Spec from an accepted Brief and persist it
to the Brand's `data/brands/<slug>/ideas/<run>/idea-NN.<recipe>.spec.json` (the machine-readable
sibling of the Brief, now segmented by the chosen Recipe — ADR-0011, issue #56), so the Operator can
inspect exactly what will drive a render and so a SECOND chosen Recipe for the same Idea gets its OWN
Spec file rather than overwriting the first Recipe's. `recipe` SHALL be a required, explicit parameter
(never defaulted or inferred) to both `specPathFor` and `composeSpec`'s options. The persisted Spec
SHALL pass `validate()` and the brand-safety filter; a Spec that fails either SHALL NOT be written.

#### Scenario: Composing an accepted Idea writes a valid, Recipe-segmented Spec beside the Brief

- **GIVEN** an accepted Brief for Idea `idea-NN` in run `<run>`, composed for Recipe `<recipe>`
- **WHEN** the Producer composes its Production Spec
- **THEN** a file `data/brands/<slug>/ideas/<run>/idea-NN.<recipe>.spec.json` is written
- **AND** the written Spec passes `validate()` and the brand-safety filter

#### Scenario: Two Recipes of one Idea each get their own Spec file

- **GIVEN** one accepted Idea with TWO chosen Recipes, `character-explainer-with-cast` and `carousel`
- **WHEN** a Production Spec is composed and saved for each Recipe
- **THEN** the two Specs are written to two DIFFERENT paths, each segmented by its own Recipe
- **AND** neither Spec overwrites the other

#### Scenario: A failing Spec is refused, not written

- **GIVEN** a candidate Spec that fails validation or contains a banned word
- **WHEN** persistence is attempted
- **THEN** no `idea-NN.<recipe>.spec.json` is written and the failure is reported

