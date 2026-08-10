## MODIFIED Requirements

### Requirement: auditAuthorPhase, auditBindMediaPhase, and auditCopyPhase are generic across ANY wired Recipe

The system SHALL provide three auditor functions in `src/recipe/phase-contract.ts`, each generic
across every Recipe registered in `src/recipe/registry.ts` — the SAME function call, given a
DIFFERENT Recipe, audits that Recipe's own rules with zero drift risk:

- `auditAuthorPhase(recipe, { candidateSpec, bannedWords })` SHALL run `recipe.specShape.validate` and
  `recipe.specShape.scanBannedWords` against `candidateSpec` (never re-implementing either) and return
  a `PhaseAuditResult` for the `"author"` phase whose `ok` is `true` iff both pass.
- `auditBindMediaPhase(recipe, { boundSlotNames })` SHALL, for every entry in
  `recipe.canvasInputs?.mediaSlots ?? {}` (ADR-0021 — a Space-less Recipe's absent `canvasInputs` is
  treated as ZERO declared media slots, never a crash), check that a REQUIRED slot's name is present in
  `boundSlotNames` (an optional slot always passes) and return a `PhaseAuditResult` for the
  `"bind-media"` phase whose `ok` is `true` iff every required slot is bound — vacuously `true`, with an
  empty `items` list, for a Recipe with no media slots at all.
- `auditCopyPhase(recipe, { candidateCopy, rules })` SHALL run `../copy/validate.ts`'s `validateCopy`
  against `candidateCopy`, `recipe.copyShape`, and `rules` (never re-implementing it) and return a
  `PhaseAuditResult` for the `"copy"` phase whose `ok` is `true` iff `validateCopy` reports `ok: true`.

Each `PhaseAuditResult` SHALL carry `{ recipe: recipe.slug, phase, ok, items }`, where `items` is a
`ChecklistItemAudit[]` (`{ description, kind, ok, detail? }`) reporting each checked item's outcome
(`ok` is `true`/`false` for a computed mechanical item, `null` for an agent-judged one). `ok` at the
top level SHALL be `true` iff no item's `ok` is `false` (agent-judged `null` items never block it).

#### Scenario: auditAuthorPhase passes the character Recipe's author phase for a well-formed Spec

- **GIVEN** the seeded `character-explainer-with-cast` Recipe and a well-formed candidate Production
  Spec with no banned words
- **WHEN** `auditAuthorPhase(recipe, { candidateSpec, bannedWords: [] })` is called
- **THEN** the result's `ok` is `true` and `phase` is `"author"`

#### Scenario: auditAuthorPhase fails the character Recipe's author phase for a malformed Spec

- **GIVEN** the seeded `character-explainer-with-cast` Recipe and a Spec with only 2 clips (contract
  requires 3)
- **WHEN** `auditAuthorPhase` is called with it
- **THEN** the result's `ok` is `false` and the item referencing `specShape.validate` is `ok: false`

#### Scenario: auditAuthorPhase runs identically against the News Carousel Recipe — the SAME function

- **GIVEN** the seeded `news-carousel` Recipe and a well-formed 7-slide candidate Spec
- **WHEN** `auditAuthorPhase(recipe, { candidateSpec, bannedWords: [] })` is called
- **THEN** the result's `ok` is `true` and `recipe` is `"news-carousel"` — proving the SAME auditor
  function generalizes across a genuinely different Recipe (issue #85 AC4)

#### Scenario: auditBindMediaPhase fails when a Recipe's required media slot is not bound

- **GIVEN** the seeded `character-explainer-with-cast` Recipe (one required `"Selected Character"` slot)
- **WHEN** `auditBindMediaPhase(recipe, { boundSlotNames: new Set() })` is called
- **THEN** the result's `ok` is `false` and its item's `detail` mentions the run STOPS (ADR-0016)

#### Scenario: auditBindMediaPhase passes when every required slot is bound, for either Recipe

- **GIVEN** the seeded `news-carousel` Recipe (one required `"Brand_Logo"` slot)
- **WHEN** `auditBindMediaPhase(recipe, { boundSlotNames: new Set(["Brand_Logo"]) })` is called
- **THEN** the result's `ok` is `true`

#### Scenario: auditBindMediaPhase passes vacuously for a Recipe with no canvasInputs at all (ADR-0021)

- **GIVEN** a Space-less Recipe whose `canvasInputs` is `undefined`
- **WHEN** `auditBindMediaPhase(recipe, { boundSlotNames: new Set() })` is called
- **THEN** the result's `ok` is `true` and `items` is `[]` — there is nothing to check, never a crash on
  the missing `canvasInputs`

#### Scenario: auditCopyPhase enforces each Recipe's OWN, different copy shape

- **GIVEN** a 200-character caption with no emoji
- **WHEN** `auditCopyPhase` is called against the character Recipe (`maxChars: 180`) and separately
  against the News Carousel Recipe (`maxChars: 2200`)
- **THEN** the character Recipe's result `ok` is `false` (over its length cap) and the News Carousel
  Recipe's result `ok` is `true` (within its own, larger cap and its 0-emoji-minimum)
