## ADDED Requirements

### Requirement: The graduated Skill's target output is proven on-contract against a real (Brand x Format)

The system SHALL provide a committed fixture demonstrating that the `produce-news-carousel` Skill's
promised output — the map-#77 prototype's 7 on-contract carousel prompts for idea-01 — is genuinely
on-contract for a REAL Brand and Format, not only for the stand-in `TEST_BASELINE` issue #85 already
proved parameterization with. `src/production-spec/fixtures/news-carousel-straw-motion-specs.ts`
SHALL export `STRAW_MOTION_BASELINE` (a `NewsCarouselBaselineParams` built from Straw Motion's real,
committed `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`: its logo
reference name, its pill text, its never-all-caps instruction, five of its fixed clauses verbatim,
and its two confirmed card styles) and `strawMotionIdeaOneCarouselSpec()` (idea-01's 7-slide
authored Spec).

#### Scenario: The committed fixture passes the #81 structural validator

- **GIVEN** `strawMotionIdeaOneCarouselSpec()`
- **WHEN** `validateNewsCarouselSpec` is called with it
- **THEN** the result's `ok` is `true` and `errors` is empty

#### Scenario: The committed fixture passes the #85 author-phase checklist, parameterized with Straw Motion's real strings

- **GIVEN** `strawMotionIdeaOneCarouselSpec()` and `STRAW_MOTION_BASELINE`
- **WHEN** `auditNewsCarouselAuthorPhase(spec, [], STRAW_MOTION_BASELINE)` is called
- **THEN** the result's `ok` is `true`, `items.length` is `8`, exactly one item is `kind:
  "agent-judged"` with `ok: null`, and every `kind: "mechanical"` item is `ok: true`

#### Scenario: STRAW_MOTION_BASELINE's own strings are genuinely present in the real, committed document

- **GIVEN** the real Format loaded via `loadFormat("straw-motion", "unhypped-news")` and its
  Baseline Prompt for `"news-carousel"` loaded via `loadBaselinePrompt`
- **WHEN** the document's content is normalized (blockquote markers stripped, lines joined, repeated
  whitespace collapsed) and checked for substring containment
- **THEN** it contains `STRAW_MOTION_BASELINE.logoReferenceName`, `.pillText`,
  `.neverAllCapsInstruction`, and every entry of `.fixedClauses` — none of these strings are
  asserted by fiat; each is verified against the real document's own prose

#### Scenario: STRAW_MOTION_BASELINE is genuinely a different baseline than the stand-in TEST_BASELINE

- **GIVEN** `STRAW_MOTION_BASELINE` and issue #85's stand-in `TEST_BASELINE`
- **WHEN** their `logoReferenceName` and `pillText` fields are compared
- **THEN** they differ, proving this fixture is not the stand-in fixture renamed
