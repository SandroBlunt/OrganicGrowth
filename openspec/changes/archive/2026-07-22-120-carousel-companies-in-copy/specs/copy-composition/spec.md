## MODIFIED Requirements

### Requirement: CopyInput carries an optional slideNarrative — the ACTUAL produced on-slide beats, once the media exists

`src/copy/draft.ts`'s `CopyInput` SHALL gain an optional field, `slideNarrative`, an array of
`CopySlideBeat` (`{ role: string, text: string, statCallout?: string, companies?: readonly string[] }`)
— the produced Production Spec's OWN per-slide `role`/`text`/`stat_callout`/`companies` values,
available only once a multi-slide Recipe's media has been authored. `companies` mirrors
`production-spec/news-carousel-contract.ts`'s `CarouselSlide.companies` — the real companies/products
named on that slide, or an empty array when the slide names none (issue #120: threading the Spec's own,
already-verified companies list one step further downstream, so a drafter can name what the post is
actually about instead of re-guessing from the brief). This field, and `companies` specifically, SHALL
be optional and additive: every existing `CopyInput`/`CopySlideBeat` caller that omits either SHALL
remain valid, and `defaultDraftCopy`'s behavior SHALL be completely unaffected by their presence or
absence.

#### Scenario: CopyInput without slideNarrative remains valid (backward compatible)

- **GIVEN** a `CopyInput` value with no `slideNarrative` field at all (every pre-existing caller's
  shape)
- **WHEN** it is passed to `defaultDraftCopy` or `composeCopy`
- **THEN** it behaves exactly as it did before this change — no error, no behavior change

#### Scenario: A CopySlideBeat's companies field is optional and purely additive

- **GIVEN** a `CopySlideBeat` with no `companies` field at all (every pre-#120 caller's shape), and
  separately the SAME beat with `companies` set (non-empty on one beat, `[]` on another)
- **WHEN** either is passed to `skillDraftCopy` or `composeCopy`
- **THEN** the call succeeds either way; the mere presence of `companies` never changes the
  deterministic drafter's own output (`skillDraftCopy`'s caption is byte-identical with vs. without the
  field on an otherwise-identical `slideNarrative`) — naming companies naturally in the caption's own
  wording is the `write-social-copy` Skill's own LLM judgment call, never a fixed template a
  deterministic drafter could be tested against

#### Scenario: A Spec whose slides all have empty companies arrays produces the same caption behavior as before this change

- **GIVEN** a News Carousel Spec whose every slide's `companies` is `[]`
- **WHEN** `newsCarouselSlideNarrative(spec)` builds its `CopyInput.slideNarrative` and it is drafted
  via `skillDraftCopy`
- **THEN** the resulting caption is byte-identical to drafting the SAME narrative with `companies`
  omitted from every beat entirely (the pre-#120 shape) — an all-empty-companies Spec never fabricates
  a mention, and changes nothing about drafting behavior

## ADDED Requirements

### Requirement: newsCarouselSlideNarrative threads a saved News Carousel Spec into CopyInput.slideNarrative, companies unchanged including empty arrays

The system SHALL provide `newsCarouselSlideNarrative(spec)`
(`src/copy/news-carousel-slide-narrative.ts`), a pure, deterministic function (no I/O, no model call, no
clock, never mutates its input) that maps a `NewsCarouselSpec`'s
(`production-spec/news-carousel-contract.ts`) `slides` array, in their existing order, into
`CopySlideBeat[]`: each slide's `role` and `text` carried through verbatim, `stat_callout` renamed to
`statCallout`, and `companies` passed through UNCHANGED — including an empty array, never invented,
never dropped. This is the ONE place a News Carousel Recipe's saved Spec becomes the Copy step's
`CopyInput.slideNarrative`. The *Character Explainer with Cast* Recipe has no equivalent function — it
declares no per-clip `companies` concept, and none is added for it by this change.

#### Scenario: All 7 slides map through, in order, with every field carried through exactly

- **GIVEN** a well-formed 7-slide `NewsCarouselSpec`
- **WHEN** `newsCarouselSlideNarrative(spec)` is called
- **THEN** it returns 7 `CopySlideBeat`s in the SAME order, each one's `role`/`text`/`statCallout`/
  `companies` exactly equal to its source slide's `role`/`text`/`stat_callout`/`companies`

#### Scenario: A slide's empty companies array is carried through as [], never omitted

- **GIVEN** a `NewsCarouselSpec` slide whose `companies` is `[]` (names no real company)
- **WHEN** `newsCarouselSlideNarrative(spec)` is called
- **THEN** the corresponding `CopySlideBeat.companies` is present and equal to `[]` — not `undefined`,
  not omitted from the object, and no company name is fabricated for it

#### Scenario: The function never mutates its input Spec and is deterministic

- **GIVEN** a `NewsCarouselSpec` value
- **WHEN** `newsCarouselSlideNarrative(spec)` is called once, and again with the same `spec`
- **THEN** the input `spec` is unchanged after the call, and both calls return deep-equal results
