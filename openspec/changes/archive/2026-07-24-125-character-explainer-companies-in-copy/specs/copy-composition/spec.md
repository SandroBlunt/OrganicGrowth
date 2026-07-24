## ADDED Requirements

### Requirement: CopyInput carries an optional companies field — the WHOLE-Asset real companies/products, once the media exists

`src/copy/draft.ts`'s `CopyInput` SHALL gain an optional, Recipe-agnostic field, `companies?: readonly
string[]` — the real companies/products the whole Asset concerns, once the media exists. This is the
WHOLE-Asset-grain sibling of `CopySlideBeat.companies`'s per-slide/per-beat grain (issue #120): for a
single-media Recipe with no per-clip/per-beat narrative to attach a company list to (e.g. the Character
Explainer with Cast Recipe, whose 3 clips render one continuous narrative about the SAME picked
Character), the saved Production Spec's own `companies` field is threaded onto `CopyInput.companies`
directly, not onto a `slideNarrative` beat (issue #125). This field SHALL be optional and additive:
every existing `CopyInput` caller that omits it SHALL remain valid, and neither `defaultDraftCopy` nor
`skillDraftCopy`'s deterministic output SHALL be affected by its presence, emptiness, or absence.

#### Scenario: CopyInput without companies remains valid (backward compatible)

- **GIVEN** a `CopyInput` value with no `companies` field at all (every pre-#125 caller's shape)
- **WHEN** it is passed to `defaultDraftCopy`, `skillDraftCopy`, or `composeCopy`
- **THEN** it behaves exactly as it did before this change — no error, no behavior change

#### Scenario: CopyInput.companies is optional and purely additive, at every state

- **GIVEN** a `CopyInput` with no `companies` field, and separately the SAME input with `companies` set
  to a non-empty list, and separately again to an explicit empty list
- **WHEN** each is passed to `defaultDraftCopy` or `skillDraftCopy`
- **THEN** every call succeeds; the three variants produce BYTE-IDENTICAL `Copy` output — the mere
  presence, emptiness, or absence of `companies` never changes either deterministic drafter's own
  output — naming companies naturally in the caption's own wording is the `write-social-copy` Skill's
  own LLM judgment call, never a fixed template a deterministic drafter could be tested against

#### Scenario: An absent-companies Spec produces the same caption behavior as before this change

- **GIVEN** a Character Explainer Spec with no `companies` field, wired through
  `characterExplainerCompanies` into `CopyInput.companies` (normalizing to `[]`)
- **WHEN** the resulting `CopyInput` is drafted via `skillDraftCopy`
- **THEN** the resulting caption is byte-identical to drafting the SAME input with `companies` omitted
  from `CopyInput` entirely (the pre-#125 shape) — an absent-companies Spec never fabricates a mention,
  and changes nothing about drafting behavior

### Requirement: characterExplainerCompanies threads a saved Character Explainer Spec into CopyInput.companies, unchanged including an absent field

The system SHALL provide `characterExplainerCompanies(spec)`
(`src/copy/character-explainer-companies.ts`), a pure, deterministic function (no I/O, no model call, no
clock, never mutates its input) that reads a `ProductionSpec`'s
(`production-spec/contract.ts`) own top-level `companies` field and returns it UNCHANGED as `readonly
string[]`, normalized to `[]` when the Spec's own `companies` is absent (never fabricated; an absent
Spec field and an explicit empty Spec field both read the same "nothing to draw on" way at the Copy-step
boundary). This is the ONE place a Character Explainer Recipe's saved Spec becomes the Copy step's
`CopyInput.companies`. The News Carousel Recipe has no equivalent use for this function — its own
`companies` concept is per-slide, threaded instead by `newsCarouselSlideNarrative` into
`CopySlideBeat.companies`.

#### Scenario: A non-empty companies list is carried through unchanged

- **GIVEN** a `ProductionSpec` whose `companies` is `["OpenAI", "Anthropic"]`
- **WHEN** `characterExplainerCompanies(spec)` is called
- **THEN** it returns `["OpenAI", "Anthropic"]` exactly

#### Scenario: An explicit empty companies list is carried through as []

- **GIVEN** a `ProductionSpec` whose `companies` is `[]`
- **WHEN** `characterExplainerCompanies(spec)` is called
- **THEN** it returns `[]` — present, not fabricated

#### Scenario: An absent companies field normalizes to [] — never fabricated, never throws

- **GIVEN** a `ProductionSpec` with no `companies` field at all
- **WHEN** `characterExplainerCompanies(spec)` is called
- **THEN** it returns `[]` without throwing — no company name is invented for it

#### Scenario: The function never mutates its input Spec and is deterministic

- **GIVEN** a `ProductionSpec` value
- **WHEN** `characterExplainerCompanies(spec)` is called once, and again with the same `spec`
- **THEN** the input `spec` is unchanged after the call, and both calls return deep-equal results
