## ADDED Requirements

### Requirement: News Carousel author-phase checklist is graduated from the #77 prototype, runs as code, parameterized

The system SHALL provide `auditNewsCarouselAuthorPhase(candidateSpec, bannedWords, baseline)` in
`src/production-spec/news-carousel-author-checklist.ts`, where `baseline` is a
`NewsCarouselBaselineParams` (`{ logoReferenceName, pillText, neverAllCapsInstruction, fixedClauses,
confirmedCardStyles }`). It SHALL run the News Carousel Recipe's FULL author-phase checklist entirely
as CODE, returning a `PhaseAuditResult` (`src/recipe/phase-contract.ts`) with exactly 8 `items`, in
this order:

1. Exactly 7 slides, in fixed role order (`hook, then, shift, proof, different, next, cta`) — derived
   from `news-carousel-validate.ts`'s `validateNewsCarouselSpec`'s own result codes (`slides_count`,
   `slide_role_order`), never re-deriving the count/order rule.
2. Each slide's on-card `text` at most 140 chars — derived from the SAME `validateNewsCarouselSpec`
   result's `slide_text_too_long` code.
3. Each `image_prompt` references `baseline.logoReferenceName` — a NEW check, parameterized (never a
   hardcoded literal).
4. Each `image_prompt` contains `baseline.pillText` AND `baseline.neverAllCapsInstruction` — a NEW
   check, parameterized.
5. Each `image_prompt` keeps every clause in `baseline.fixedClauses` verbatim — a NEW check,
   parameterized.
6. Grounded subject (real product/logo/action, or an intentional photographic scene; never an
   invented UI shown as a real product's own screen) — `kind: "agent-judged"`, `ok: null`, never
   computed, never blocking the overall result.
7. `card_style` is one of `baseline.confirmedCardStyles`; `stat_callout` is non-empty — a NEW check,
   parameterized (the card-style membership check; `stat_callout` non-emptiness is additionally
   guaranteed by item 1's referenced structural validator).
8. No banned word in any field — derived from `news-carousel-brand-safety.ts`'s
   `scanNewsCarouselForBannedWords`'s own result, REJECT-only (never a silent swap, always-rule 9).

The overall `ok` SHALL be `true` iff `validateNewsCarouselSpec(candidateSpec).ok` is `true` AND no item
above is `ok: false` (the referenced structural validator is the authoritative gate for shape/count/
order/length). The function SHALL never throw, for any input shape.

#### Scenario: A baseline-adherent Spec passes every mechanical item; the agent-judged item is flagged, not failed

- **GIVEN** a well-formed 7-slide Spec whose every `image_prompt` carries `baseline.logoReferenceName`,
  `baseline.pillText`, `baseline.neverAllCapsInstruction`, and every clause in `baseline.fixedClauses`,
  and whose `card_style`s are each one of `baseline.confirmedCardStyles`
- **WHEN** `auditNewsCarouselAuthorPhase(spec, [], baseline)` is called
- **THEN** the result's `ok` is `true`, `items.length` is `8`, exactly one item is `kind:
  "agent-judged"` with `ok: null`, and every `kind: "mechanical"` item is `ok: true`

#### Scenario: A short Spec fails item 1 by referencing validateNewsCarouselSpec, not duplicating it

- **GIVEN** a Spec with only 6 slides
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it
- **THEN** the result's `ok` is `false` and `items[0].ok` is `false`

#### Scenario: A Spec missing the parameterized logo reference name fails item 3 only

- **GIVEN** a baseline-adherent Spec with `baseline.logoReferenceName` removed from every
  `image_prompt`
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it and the SAME `baseline`
- **THEN** the result's `ok` is `false`, `items[2].ok` is `false`, and every OTHER mechanical item
  (e.g. `items[3]`, the pill-text/caps-guard item) remains `ok: true`

#### Scenario: A Spec missing the pill text or the never-all-caps instruction fails item 4

- **GIVEN** a baseline-adherent Spec with either `baseline.pillText` or
  `baseline.neverAllCapsInstruction` removed from every `image_prompt`
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it and the SAME `baseline`
- **THEN** the result's `ok` is `false` and `items[3].ok` is `false`

#### Scenario: A Spec missing one fixed baseline clause fails item 5

- **GIVEN** a baseline-adherent Spec with one entry of `baseline.fixedClauses` removed from every
  `image_prompt`
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it and the SAME `baseline`
- **THEN** the result's `ok` is `false` and `items[4].ok` is `false`

#### Scenario: A Spec using an unconfirmed card_style fails item 7

- **GIVEN** a baseline-adherent Spec whose first slide's `card_style` is not a member of
  `baseline.confirmedCardStyles`
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it
- **THEN** the result's `ok` is `false` and `items[6].ok` is `false`

#### Scenario: A banned word fails item 8, reject-only, and is named — never rewritten

- **GIVEN** a baseline-adherent Spec containing the word `"miracle"` and a `bannedWords` list of
  `["miracle"]`
- **WHEN** `auditNewsCarouselAuthorPhase(spec, ["miracle"], baseline)` is called
- **THEN** the result's `ok` is `false`, `items[7].ok` is `false`, its `detail` names `"miracle"`, and
  no rewritten/corrected Spec is ever returned alongside the result

#### Scenario: The checklist is genuinely parameterized — different (Brand x Format) strings change the outcome

- **GIVEN** a Spec authored to carry one `NewsCarouselBaselineParams`'s strings verbatim (a
  test-fixture baseline, deliberately different from any one real Brand/Format's own strings)
- **WHEN** `auditNewsCarouselAuthorPhase` is called with that SAME Spec but a DIFFERENT
  `NewsCarouselBaselineParams` (e.g. a different `logoReferenceName`/`pillText`)
- **THEN** the result's `ok` is `false` — proving no Brand/Format-specific string is hardcoded inside
  the checked module (issue #85's core ask)

#### Scenario: The function never throws on a malformed or non-object Spec

- **GIVEN** `null`, `{}`, or any other malformed candidate Spec
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it
- **THEN** it returns a `PhaseAuditResult` with `ok: false` rather than throwing
