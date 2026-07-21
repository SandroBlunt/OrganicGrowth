## ADDED Requirements

### Requirement: Straw Motion's news-carousel Baseline Prompt instructs render-fidelity guardrails (real names, minimum body-text size, full-bleed every card style, soft vignette never a solid box)

The system SHALL keep Straw Motion's real, committed
`data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` instructing four
render-fidelity guardrails (epic #106 items 8, 10, 11, 12), each verified as a literal, normalized
substring of the document's own prose (never asserted by fiat):

1. **Real names over fine fake-UI text.** The document SHALL instruct preferring a real, recognizable
   product/screen over describing small invented UI text, SHALL name the failure mode (fine invented
   UI text renders as misspelled gibberish), and SHALL instruct keeping any on-screen text minimal
   where no real screen can be shown.
2. **Minimum body-text size.** The document SHALL instruct that the on-card supporting line beneath the
   stat callout renders at a minimum of roughly 13-14px equivalent, never shrunk to a small
   caption-sized afterthought.
3. **Full-bleed, no letterboxing, for every card style — including the top card.** The document SHALL
   instruct that every card style, INCLUDING the top card placement (photo below the card), fills its
   own photo region edge to edge with no black margins or letterboxing at any edge.
4. **Soft vignette, never a solid box.** The document SHALL instruct that the logo's own backing, and
   any floating card's own backing, is always a soft (gradient) vignette, and SHALL explicitly forbid a
   hard-edged solid black bar or filled box.

`src/production-spec/fixtures/news-carousel-straw-motion-specs.ts`'s `STRAW_MOTION_BASELINE.fixedClauses`
and the graduated `strawMotionIdeaOneCarouselSpec()` fixture it builds SHALL stay byte-for-byte in sync
with the document's own updated logo-vignette clause, so the fixture continues to demonstrate a
genuinely on-contract example, not a stale one.

#### Scenario: The document instructs preferring real names over fine fake-UI text

- **GIVEN** the real, committed Straw Motion news-carousel Baseline Prompt document, loaded via
  `loadFormat("straw-motion", "unhypped-news")` then `loadBaselinePrompt(..., "news-carousel")`
- **WHEN** its content is normalized (blockquote markers stripped, lines joined with a space, repeated
  whitespace collapsed)
- **THEN** it contains a phrase naming fine invented UI text rendering as misspelled gibberish, and a
  phrase instructing on-screen text be kept minimal where no real screen can be shown

#### Scenario: The document instructs a minimum, readable supporting-line size

- **GIVEN** the same normalized document content
- **WHEN** it is checked for the supporting-line size instruction
- **THEN** it contains "13-14px equivalent" and a phrase naming a small "caption-sized afterthought" as
  what to avoid

#### Scenario: The document instructs full-bleed, edge-to-edge, no black margins, for every card style including the top card

- **GIVEN** the same normalized document content
- **WHEN** it is checked for the full-bleed instruction
- **THEN** it contains the phrase "including the top card", the phrase "no black margins", and the
  phrase "edge to edge"

#### Scenario: The document instructs a soft vignette and explicitly forbids a hard-edged solid box

- **GIVEN** the same normalized document content
- **WHEN** it is checked for the logo/card backing instruction
- **THEN** it contains "soft dark gradient vignette" and explicitly forbids "a hard-edged solid black
  bar or box" (or "filled box")

#### Scenario: The graduated Straw Motion fixture's vignette clause stays in sync with the document's updated wording

- **GIVEN** `strawMotionIdeaOneCarouselSpec()`'s 7 slides
- **WHEN** each slide's `image_prompt` is checked
- **THEN** every one carries the document's UPDATED logo-vignette sentence verbatim — "A soft dark
  gradient vignette sits behind it for legibility against the photo, never a hard-edged solid black bar
  or box." — proving the doc and the graduated fixture were updated together, not independently
