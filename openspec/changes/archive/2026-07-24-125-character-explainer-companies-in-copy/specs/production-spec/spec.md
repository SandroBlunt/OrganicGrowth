## MODIFIED Requirements

### Requirement: Production Spec validation

The system SHALL provide a pure `validate(spec)` function that returns whether a Production Spec
conforms to the Character Explainer with Cast Recipe's contract and, when it does not, the specific
reasons it failed. A well-formed Spec SHALL be accepted. A malformed Spec SHALL be rejected before it
could reach the Space (so a bad Spec never wastes a run or credits). The Spec is MEDIA INSTRUCTIONS
ONLY (ADR-0012) — it carries no `post_copy` field; a stray `post_copy` field present on a candidate
object is simply not read/checked (it is not part of the contract). Validation SHALL reject, each with
an identifiable reason:

- `character_concepts` whose length is not exactly 3;
- `clips` whose length is not exactly 3;
- a missing `thumbnails` field;
- a `thumbnails` field nested inside a `clip` (or elsewhere) instead of at the TOP LEVEL of the Spec.

Its error type, `ValidationError`, SHALL type `code` as plain `string` (not narrowed to this
contract's own closed `ValidationCode` union) so the SAME `ValidationResult`/`ValidationError` shape is
reusable by a DIFFERENT Recipe's OWN validator (e.g. the News Carousel Recipe's
`validateNewsCarouselSpec`) with its own error-code vocabulary — `validate()` itself is unaffected and
continues to only ever produce `ValidationCode` values (a subtype of `string`).

`ProductionSpec` (`src/production-spec/contract.ts`) SHALL additionally carry an OPTIONAL, TOP-LEVEL
`companies` field, `readonly string[]` — the real companies/products this Asset concerns, mirroring
`news-carousel-contract.ts`'s per-slide `CarouselSlide.companies` but at the WHOLE-Asset grain, since
this Recipe's 3 clips render one continuous narrative about the SAME picked Character rather than 7
independently-labeled slides (issue #125). `validate()` SHALL NOT require this field to be present — a
Spec authored before this change, or an Idea naming no real company, is still a well-formed Spec. WHEN
`companies` is present, `validate()` SHALL require it to be an array whose every entry is a non-empty
string (the array itself MAY be empty), and SHALL reject it, with an identifiable reason (a new
`ValidationCode`, `"companies_shape"`), otherwise.

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

#### Scenario: A DIFFERENT Recipe's validator can reuse the SAME ValidationResult/ValidationError shape

- **GIVEN** `validateNewsCarouselSpec`, a validator for a completely different Recipe's contract
- **WHEN** its return value's `errors[].code` values (e.g. `"slides_count"`, `"slide_role_order"`) are
  inspected against the `ValidationError` type
- **THEN** they type-check as valid `ValidationError.code` values, proving the shared shape is
  Recipe-agnostic

#### Scenario: A Spec with no companies field at all is accepted (issue #125, backward compatible)

- **GIVEN** an otherwise well-formed Production Spec with no `companies` field
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: true` — `companies` is never required

#### Scenario: A Spec with a non-empty companies list is accepted

- **GIVEN** an otherwise well-formed Production Spec whose top-level `companies` is
  `["OpenAI", "Anthropic"]`
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: true`

#### Scenario: A Spec with an explicit empty companies list is accepted

- **GIVEN** an otherwise well-formed Production Spec whose top-level `companies` is `[]`
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: true` — an explicit empty list is a valid, passing state, not an error

#### Scenario: A companies field that is present but not an array is rejected

- **GIVEN** an otherwise well-formed Production Spec whose `companies` field is the string `"OpenAI"`
  (not an array)
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: false` with an error whose `code` is `"companies_shape"`

#### Scenario: A companies array containing a blank entry is rejected

- **GIVEN** an otherwise well-formed Production Spec whose `companies` array contains a blank/
  whitespace-only string entry
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: false` with an error whose `code` is `"companies_shape"`

### Requirement: Compose and persist a Production Spec beside the Brief, segmented by Recipe

The Producer SHALL compose a contract-conformant Production Spec from an accepted Brief and persist it
to the Brand's `data/brands/<slug>/ideas/<run>/idea-NN.<recipe>.spec.json` (the machine-readable
sibling of the Brief, now segmented by the chosen Recipe — ADR-0011, issue #56), so the Operator can
inspect exactly what will drive a render and so a SECOND chosen Recipe for the same Idea gets its OWN
Spec file rather than overwriting the first Recipe's. `recipe` SHALL be a required, explicit parameter
(never defaulted or inferred) to both `specPathFor` and `composeSpec`'s options. The persisted Spec
SHALL pass `validate()` and the brand-safety filter; a Spec that fails either SHALL NOT be written.

`src/production-spec/generate.ts`'s `Brief` (the deterministic author-phase composer's own input, and
the Character Explainer Recipe's `produce-character-explainer` Skill's real-world counterpart) SHALL
carry a matching OPTIONAL `companies` field, `readonly string[]`. WHEN `Brief.companies` is supplied
(non-empty OR an explicit `[]`), `generate()` SHALL carry it through UNCHANGED onto the generated
Spec's own top-level `companies` field. WHEN `Brief.companies` is `undefined`, the generated Spec SHALL
carry NO `companies` field at all (never invented to fill it).

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

#### Scenario: A Brief naming real companies writes a Spec whose companies list survives to disk (issue #125)

- **GIVEN** an accepted Brief whose `companies` field is `["OpenAI", "Anthropic"]`
- **WHEN** `composeSpec` composes and persists its Production Spec (Recipe
  `character-explainer-with-cast`)
- **THEN** the written Spec's `companies` field, re-read from disk, deep-equals
  `["OpenAI", "Anthropic"]`

#### Scenario: A Brief naming no companies writes a Spec with no companies field — never fabricated

- **GIVEN** an accepted Brief with no `companies` field at all
- **WHEN** `composeSpec` composes and persists its Production Spec (Recipe
  `character-explainer-with-cast`)
- **THEN** the written Spec, re-read from disk, has no `companies` field at all
