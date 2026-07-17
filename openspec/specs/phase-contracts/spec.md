# phase-contracts Specification

## Purpose
TBD - created by archiving change issue-85-phase-contracts. Update Purpose after archive.
## Requirements
### Requirement: A Recipe run moves through six ordered phases, each with a checkable contract

The system SHALL define six production PHASES, always in this order (`PHASE_ORDER`,
`src/recipe/phase-contract.ts`): `author` (author the prompt), `bind-media` (bind media into the
canvas's slots), `gate` (pause at a human pick-gate), `render` (drive the Space to render the media),
`copy` (compose the Copy out of the Space), and `save` (write the produced Asset to the ledger). Each
phase SHALL declare a `PhaseContract` — `{ phase, description, checklist }` — where `checklist` is a
list of `ChecklistItem`s describing what a valid output for that phase looks like.
`declaresAllPhasesInOrder(phases)` SHALL be the pure shape guard: `true` iff `phases` has exactly six
entries whose `phase` fields equal `PHASE_ORDER` in order; `false` otherwise (a short list, an
out-of-order list, or an extra entry). This is declarative vocabulary shared by every wired Recipe
(CONTEXT.md "Phase Contract"; ADR-0017) — it is NOT a new validation framework: mechanical checklist
items reference existing code (see the next Requirement).

#### Scenario: PHASE_ORDER is exactly the six ADR-0017 phases, in order

- **GIVEN** `src/recipe/phase-contract.ts`'s exported `PHASE_ORDER`
- **WHEN** it is inspected
- **THEN** it is exactly `["author", "bind-media", "gate", "render", "copy", "save"]`

#### Scenario: declaresAllPhasesInOrder is true for a well-ordered, complete 6-phase list

- **GIVEN** a `PhaseContract[]` with one entry per `PHASE_ORDER` value, in that exact order
- **WHEN** `declaresAllPhasesInOrder` is called with it
- **THEN** it returns `true`

#### Scenario: declaresAllPhasesInOrder is false for a short list

- **GIVEN** a `PhaseContract[]` with only one entry (`"author"`)
- **WHEN** `declaresAllPhasesInOrder` is called with it
- **THEN** it returns `false`

#### Scenario: declaresAllPhasesInOrder is false for an out-of-order list

- **GIVEN** a `PhaseContract[]` with all six entries present but the first two swapped
- **WHEN** `declaresAllPhasesInOrder` is called with it
- **THEN** it returns `false`

### Requirement: A checklist item is either a mechanical check (referenced, never duplicated) or agent-judged prose

Every `ChecklistItem` a `PhaseContract`'s `checklist` carries SHALL be exactly one of two kinds: a
**mechanical** item (`{ kind: "mechanical", description, reference }`) — `reference` SHALL be a
human-facing pointer string naming the EXISTING module/function that performs the check (e.g.
`"production-spec/validate.ts: validate"`) — the check itself SHALL NOT be re-implemented inside the
checklist declaration; or an **agent-judged** item (`{ kind: "agent-judged", description }`) — prose
only, describing something only an agent/human can judge, carrying no `reference` field. An
agent-judged item is never auto-computed and never blocks an overall pass/fail on its own (ADR-0017:
it is flagged for review, not auto-failed).

#### Scenario: A mechanical item's reference names an existing module/function, never a re-implementation

- **GIVEN** either wired Recipe's `author` phase checklist
- **WHEN** its mechanical items are inspected
- **THEN** each carries a non-empty `reference` string naming an existing validator/scanner module
  (`production-spec/validate.ts`, `production-spec/brand-safety.ts`,
  `production-spec/news-carousel-validate.ts`, `production-spec/news-carousel-brand-safety.ts`, or
  `production-spec/news-carousel-author-checklist.ts`) — never a description of new logic invented for
  the checklist declaration itself

#### Scenario: An agent-judged item carries no reference and is never auto-computed

- **GIVEN** the News Carousel Recipe's `author` phase checklist's "grounded subject" item
- **WHEN** it is inspected
- **THEN** its `kind` is `"agent-judged"`, it carries no `reference` field, and when this phase is
  audited (`auditNewsCarouselAuthorPhase`) its computed `ok` is `null` — never `true` or `false` — and
  never causes the overall audit to fail

### Requirement: auditAuthorPhase, auditBindMediaPhase, and auditCopyPhase are generic across ANY wired Recipe

The system SHALL provide three auditor functions in `src/recipe/phase-contract.ts`, each generic
across every Recipe registered in `src/recipe/registry.ts` — the SAME function call, given a
DIFFERENT Recipe, audits that Recipe's own rules with zero drift risk:

- `auditAuthorPhase(recipe, { candidateSpec, bannedWords })` SHALL run `recipe.specShape.validate` and
  `recipe.specShape.scanBannedWords` against `candidateSpec` (never re-implementing either) and return
  a `PhaseAuditResult` for the `"author"` phase whose `ok` is `true` iff both pass.
- `auditBindMediaPhase(recipe, { boundSlotNames })` SHALL, for every entry in
  `recipe.canvasInputs.mediaSlots`, check that a REQUIRED slot's name is present in `boundSlotNames`
  (an optional slot always passes) and return a `PhaseAuditResult` for the `"bind-media"` phase whose
  `ok` is `true` iff every required slot is bound.
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

- **GIVEN** the seeded `news-carousel` Recipe (one required `"Brand Logo"` slot)
- **WHEN** `auditBindMediaPhase(recipe, { boundSlotNames: new Set(["Brand Logo"]) })` is called
- **THEN** the result's `ok` is `true`

#### Scenario: auditCopyPhase enforces each Recipe's OWN, different copy shape

- **GIVEN** a 200-character caption with no emoji
- **WHEN** `auditCopyPhase` is called against the character Recipe (`maxChars: 180`) and separately
  against the News Carousel Recipe (`maxChars: 2200`)
- **THEN** the character Recipe's result `ok` is `false` (over its length cap) and the News Carousel
  Recipe's result `ok` is `true` (within its own, larger cap and its 0-emoji-minimum)

### Requirement: auditPhase is the single dispatcher entry point for "does this run satisfy its phase's contract"

The system SHALL provide `auditPhase(recipe, request)` in `src/recipe/phase-contract.ts`, where
`request` is `{ phase: "author", candidateSpec, bannedWords } | { phase: "bind-media", boundSlotNames }
| { phase: "copy", candidateCopy, rules }`. It SHALL dispatch to `auditAuthorPhase`,
`auditBindMediaPhase`, or `auditCopyPhase` respectively and return the IDENTICAL `PhaseAuditResult`
those functions would return when called directly with the same arguments. This is the literal
"auditor" that, given ANY wired Recipe, a saved artifact, and which phase it belongs to, answers
"does this run satisfy the contract of the phase it is in?" with a pass/fail result.

#### Scenario: auditPhase("author", ...) is identical to calling auditAuthorPhase directly

- **GIVEN** the seeded `character-explainer-with-cast` Recipe and a well-formed candidate Spec
- **WHEN** `auditPhase(recipe, { phase: "author", candidateSpec, bannedWords: [] })` is called, and
  separately `auditAuthorPhase(recipe, { candidateSpec, bannedWords: [] })` is called
- **THEN** the two results are deeply equal

#### Scenario: auditPhase dispatches "bind-media" and "copy" identically, for either wired Recipe

- **GIVEN** the seeded `news-carousel` Recipe
- **WHEN** `auditPhase(recipe, { phase: "bind-media", boundSlotNames: new Set(["Brand Logo"]) })` and
  `auditPhase(recipe, { phase: "copy", candidateCopy, rules })` are each called, and compared to
  `auditBindMediaPhase`/`auditCopyPhase` called directly with the same arguments
- **THEN** each dispatched result is deeply equal to its direct counterpart

