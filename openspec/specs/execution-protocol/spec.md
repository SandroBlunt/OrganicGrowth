# execution-protocol Specification

## Purpose
TBD - created by archiving change issue-4-producer-protocol-parse. Update Purpose after archive.
## Requirements
### Requirement: A Producer Protocol node carries the Execution Protocol on the Space

The Space SHALL carry its **Execution Protocol** in a `Producer Protocol` node holding JSON: an ordered
list of run-points `{ start, mode, gate }`, where the cast run-point references the cast generator
("Character Variants Generator") and the clip run-point references the clip extractor ("Clip
extractor"), with the human **Cast gate** marked between Phase A and Phase B (ADR-0003). Node names come
from the verified inventory in `docs/producer-spikes-results.md`. The canonical protocol artifact SHALL
be authored in code as the single source of truth for that node's content (authoring it onto the live
canvas is a runtime act, deferred from the hermetic build).

#### Scenario: The canonical protocol has ordered run-points and a marked Cast gate

- **GIVEN** the canonical `Producer Protocol` artifact
- **WHEN** it is read
- **THEN** its first run-point starts at "Character Variants Generator" (the cast run-point) with the
  Cast gate marked
- **AND** its second run-point starts at "Clip extractor" (the clip run-point) with no gate

### Requirement: The Producer Protocol node stays under the read-API truncation cap

The `Producer Protocol` node's serialized content SHALL stay comfortably under the Magnific read API's
~1,900-character text-node truncation cap (`docs/producer-spikes-results.md`, Spike 3), so the node
round-trips through the read API without silently dropping run-points. This SHALL be verifiable
hermetically — by asserting the serialized size against the cap — without touching the live Space.

#### Scenario: The serialized protocol round-trips without truncation

- **GIVEN** the canonical `Producer Protocol` artifact serialized to the string the node would hold
- **WHEN** its length is measured
- **THEN** it is comfortably under the ~1,900-character read-API truncation cap

### Requirement: Parse the Execution Protocol and resolve run-points by name

The system SHALL provide a pure `parse(spaceState)` function that reads the `Producer Protocol` node
from a `spaces_state` snapshot, parses its ordered run-points, and resolves each run-point's `start`
node **name** to the concrete node on that Space. Resolution SHALL be by name only — the parser SHALL
NOT hard-code any node ID for a run-point — so the same parser generalizes across any Space that follows
the convention. On success it SHALL return the run-points with their resolved node IDs, their run mode,
and their parsed gate.

#### Scenario: The cast and clip run-points resolve to the correct nodes

- **GIVEN** a captured `spaces_state` fixture whose `Producer Protocol` node holds the canonical
  protocol
- **WHEN** `parse(spaceState)` is called
- **THEN** the cast run-point resolves to the "Character Variants Generator" node's ID
- **AND** the clip run-point resolves to the "Clip extractor" node's ID
- **AND** each carries its run mode

#### Scenario: The Cast gate is parsed

- **GIVEN** the captured `spaces_state` fixture holding the canonical protocol
- **WHEN** `parse(spaceState)` is called
- **THEN** the cast run-point's gate is the Cast gate
- **AND** the clip run-point has no gate

#### Scenario: Run-point IDs are resolved by name, not hard-coded

- **GIVEN** a `spaces_state` fixture identical to the canonical one but with every node ID relabelled
- **WHEN** `parse(spaceState)` is called
- **THEN** each run-point resolves to the relabelled node ID for its referenced name
- **AND** no original/hard-coded node ID appears in the result

### Requirement: Reject a run-point that points at a non-uniquely-named node

A run-point SHALL be valid only when its `start` name resolves to exactly one node. `parse` SHALL reject
a run-point whose name matches more than one node on the Space with a clear error that names the
offending node (the Space contains duplicate names elsewhere; those are not valid run-points). A
run-point whose name matches no node SHALL be rejected with a distinct error.

#### Scenario: A run-point referencing a duplicate-named node is rejected

- **GIVEN** a `spaces_state` fixture with two nodes named "Character #2" and a protocol whose cast
  run-point references "Character #2"
- **WHEN** `parse(spaceState)` is called
- **THEN** it reports failure with a clear error identifying the ambiguous run-point and naming
  "Character #2"

#### Scenario: A run-point referencing a missing node is rejected distinctly

- **GIVEN** a protocol whose run-point references a node name that is not on the Space
- **WHEN** `parse(spaceState)` is called
- **THEN** it reports failure with an unresolved-name error, distinct from the ambiguous-name error

### Requirement: The parser fails clearly on a missing or malformed protocol

`parse` SHALL not throw on an expected-but-malformed Space state; it SHALL return a failure with a
specific, identifiable reason when the `Producer Protocol` node is absent, empty, not valid JSON, or
does not contain a `run_points` array, and when an individual run-point is missing its `start` name or
carries an invalid `mode` or `gate`.

#### Scenario: A missing Producer Protocol node fails clearly

- **GIVEN** a `spaces_state` fixture with no `Producer Protocol` node
- **WHEN** `parse(spaceState)` is called
- **THEN** it reports failure identifying the missing protocol node

#### Scenario: Malformed protocol content fails with a specific reason

- **GIVEN** a `Producer Protocol` node whose content is empty, non-JSON, or lacks a `run_points` array
- **WHEN** `parse(spaceState)` is called
- **THEN** it reports failure with the specific reason for each case

### Requirement: The parser accepts arbitrary Recipe-declared gate names

`parse()` SHALL NOT hard-code any fixed set of valid gate names. A run-point's `gate` field SHALL be
accepted as `null` (no gate) or ANY non-empty string — any gate name a Recipe declares (ADR-0010), not
only `"cast"`. Which gate names a given production plan actually uses, and in what order, is the in-repo
Recipe's own concern (`src/recipe/registry.ts`'s `Recipe.gates`); the parser only resolves what is
written on the Space and rejects a shape that could never name a gate (not a string, or an empty
string) — never a specific, otherwise-well-formed name.

#### Scenario: A gate name other than "cast" parses successfully

- **GIVEN** a `spaces_state` fixture whose protocol has a run-point with `gate: "review"`
- **WHEN** `parse(spaceState)` is called
- **THEN** it succeeds and that run-point's `gate` is `"review"`

#### Scenario: Several distinct gate names on one protocol all parse

- **GIVEN** a `spaces_state` fixture whose protocol has run-points gated `"gateA"` and `"gateB"`
- **WHEN** `parse(spaceState)` is called
- **THEN** it succeeds and each run-point carries its own distinct gate name, in order

#### Scenario: A malformed gate shape is still rejected, distinctly from an unrecognized name

- **GIVEN** a run-point whose `gate` is neither `null` nor a string (e.g. a number), or is an empty
  string
- **WHEN** `parse(spaceState)` is called
- **THEN** it reports failure with `run_point_gate_invalid` — the SAME failure a malformed gate always
  produced; only the fixed-name restriction is lifted, not the shape check

