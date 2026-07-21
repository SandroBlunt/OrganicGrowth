## ADDED Requirements

### Requirement: News Carousel author-phase checklist gains a mechanical placement-variety item, parameterized from the Baseline Prompt

`auditNewsCarouselAuthorPhase` (`src/production-spec/news-carousel-author-checklist.ts`) SHALL include a
`placement-variety` `ChecklistItemAudit` with `kind: "mechanical"`, computed from the candidate Spec's 7
slides' own `card_style` values against two fields of the `baseline` argument (a
`NewsCarouselBaselineParams`): `topRegionCardStyles` (which of `confirmedCardStyles` sit in the frame's
top region) and `minDistinctCardStyles` (the minimum count of distinct placements to count as "spread
across the vertical range"). The item's `ok` SHALL be `false` when EITHER of two conditions holds — the
count of distinct `card_style` values across the 7 slides is below `minDistinctCardStyles`, OR none of
the 7 slides' `card_style` values is a member of `topRegionCardStyles` — and `true` only when neither
holds. Neither `topRegionCardStyles` nor `minDistinctCardStyles` SHALL be a literal string/number
hardcoded inside the checked module (ADR-0015) — both come from the `baseline` argument, exactly as
`confirmedCardStyles` already does. The item SHALL participate in the checklist's overall `ok` (a
mechanical item, never merely flagged — ADR-0017), and the function SHALL never throw for any input
shape.

#### Scenario: A Spec whose 7 slides use only bottom/lower-region placements fails the item — the idea-01 pattern

- **GIVEN** a well-formed, otherwise baseline-adherent 7-slide Spec whose `card_style` values are all
  drawn from `baseline`'s non-top-region confirmed styles (reproducing straw-motion idea-01's actual
  reported pattern: plenty of distinct bottom placements, zero top-region cards)
- **WHEN** `auditNewsCarouselAuthorPhase(spec, [], baseline)` is called
- **THEN** the result's `ok` is `false`, the `placement-variety` item is present with `kind:
  "mechanical"` and `ok: false`, and every OTHER mechanical item still reports `ok: true`

#### Scenario: A Spec whose placements spread across the vertical range and include a top-region card passes the item

- **GIVEN** a well-formed, baseline-adherent 7-slide Spec whose `card_style` values use at least
  `baseline.minDistinctCardStyles` distinct values, including at least one member of
  `baseline.topRegionCardStyles`
- **WHEN** `auditNewsCarouselAuthorPhase(spec, [], baseline)` is called
- **THEN** the result's `ok` is `true` and the `placement-variety` item's `ok` is `true`

#### Scenario: A Spec with a top-region card but too few distinct placements still fails the item

- **GIVEN** a 7-slide Spec whose `card_style` values use only 2 distinct values (fewer than
  `baseline.minDistinctCardStyles`), one of which IS a member of `baseline.topRegionCardStyles`
- **WHEN** `auditNewsCarouselAuthorPhase(spec, [], baseline)` is called
- **THEN** the `placement-variety` item's `ok` is `false` — the presence of a top-region card alone does
  not satisfy the distinct-count half of the check

#### Scenario: The rule is genuinely parameterized — a different NewsCarouselBaselineParams changes the outcome for the SAME Spec

- **GIVEN** a 7-slide Spec that fails `placement-variety` under one `NewsCarouselBaselineParams`
  (because none of its `card_style` values is in that baseline's `topRegionCardStyles`)
- **WHEN** `auditNewsCarouselAuthorPhase` is called again with the SAME, unmodified Spec but a DIFFERENT
  `NewsCarouselBaselineParams` whose `topRegionCardStyles` includes one of the styles the Spec actually
  uses, and whose `minDistinctCardStyles` is low enough to already be satisfied
- **THEN** the `placement-variety` item's `ok` flips to `true` — proving neither "top region" nor the
  distinct-count threshold is a literal baked into the checked module

#### Scenario: The function never throws on a malformed or non-object Spec, and the item fails cleanly

- **GIVEN** `null` or `{}` as the candidate Spec
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it
- **THEN** it returns a `PhaseAuditResult` without throwing, and the `placement-variety` item's `ok` is
  `false`

### Requirement: Straw Motion's real Baseline Prompt document actively instructs placement spread, subject-type variety, and real-named-people balance

`data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`'s "Card style" bullet SHALL
actively instruct spreading card placements across the vertical range, slide to slide, and SHALL state
that every carousel MUST use at least one top-region ("top card, photo below") placement alongside its
bottom/lower placements. Its "Subject" bullet SHALL actively instruct varying the subject TYPE slide to
slide (not leaning on the same product-screen motif for every slide) and reaching for the real, named
person when a story is clearly theirs, balanced against product shots across the carousel. No existing
locked clause (the logo rule, the pill rule, the 7-slide narrative formulas, the reusable template, or
the worked Examples) SHALL be altered.

#### Scenario: The document's Card-style guidance requires at least one top-region placement, actively

- **GIVEN** the real, committed Baseline Prompt document, loaded via `loadFormat("straw-motion",
  "unhypped-news")` then `loadBaselinePrompt(brand, format, "news-carousel")` and normalized (blockquote
  markers stripped, lines joined, whitespace collapsed)
- **WHEN** its Card-style guidance is inspected
- **THEN** it states placements are actively spread and that every carousel MUST use at least one top
  card / "top card, photo below" placement

#### Scenario: The document's Subject guidance instructs subject-type variety and reaching for the real named person

- **GIVEN** the same normalized document
- **WHEN** its Subject guidance is inspected
- **THEN** it instructs varying the subject TYPE slide to slide and balancing real, named people against
  product shots across the carousel

#### Scenario: idea-01's ACTUAL reported card_style pattern, checked against the real Straw Motion baseline, is flagged

- **GIVEN** a 7-slide Spec carrying idea-01's actual reported `card_style` sequence (`full_width,
  floating_toast, small_badge, full_width_inset, floating_toast, small_badge_inset, full_width`) and
  otherwise baseline-adherent image prompts
- **WHEN** `auditNewsCarouselAuthorPhase` is called with `STRAW_MOTION_BASELINE`
- **THEN** the result's `ok` is `false` and the `placement-variety` item's `ok` is `false`, while every
  other mechanical item remains `ok: true`

#### Scenario: A genuinely varied 7-slide spread against the real Straw Motion baseline passes

- **GIVEN** `strawMotionIdeaOneCarouselSpec()`, whose `card_style` values spread across at least
  `STRAW_MOTION_BASELINE.minDistinctCardStyles` distinct placements including at least one of
  `STRAW_MOTION_BASELINE.topRegionCardStyles`
- **WHEN** `auditNewsCarouselAuthorPhase` is called with `STRAW_MOTION_BASELINE`
- **THEN** the result's `ok` is `true` and the `placement-variety` item's `ok` is `true`
