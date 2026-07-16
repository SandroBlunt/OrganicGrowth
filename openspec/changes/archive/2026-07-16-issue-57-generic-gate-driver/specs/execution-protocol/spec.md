## ADDED Requirements

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
