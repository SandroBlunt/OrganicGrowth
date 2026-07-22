## ADDED Requirements

### Requirement: Straw Motion's news-carousel Baseline Prompt instructs a logo negative-prompt guardrail and slide-position pill/logo scale

The system SHALL keep Straw Motion's real, committed
`data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` instructing (epic #106
items 5, 7), each verified as a literal, normalized substring of the document's own prose (never
asserted by fiat):

1. **A negative-prompt logo guardrail.** The document SHALL instruct that the connected reference
   image is rendered unaltered (no redraw/restyle/recolor/reshape — composing with, not replacing,
   the pre-existing "render exactly as provided" clause), AND SHALL instruct that the logo's
   reference name, file name, or any underscored/technical token that identifies it is NEVER rendered
   as visible text anywhere in the image. Because no in-repo negative-prompt canvas field exists for
   this Recipe (verified — no such field in `src/recipe/registry.ts`'s typed canvas inputs or
   `src/space-driver/port.ts`'s `SpaceMcpPort`), this guardrail is stated as an explicit prohibitory
   clause inside the image prompt text itself, present in the document's top bullets, its reusable
   template, and all 7 worked JSON examples (so the `produce-news-carousel` Skill, which "starts from
   the document's own worked example for the `card_style` you chose", can never pick up a
   pre-#110, unguarded example).
2. **Slide-position pill/logo scale.** The document SHALL instruct that the "Unhypped News" pill and
   the logo render at a noticeably SMALLER scale on every slide after the hook (`slide_index` 1-6)
   than on the hook slide itself (`slide_index` 0), so the copy/subject carry more of each non-hook
   slide's visual weight. The hook slide MAY keep the pre-existing larger scale.

`src/production-spec/fixtures/news-carousel-straw-motion-specs.ts`'s `STRAW_MOTION_BASELINE` and the
graduated `strawMotionIdeaOneCarouselSpec()` fixture it builds SHALL carry the document's own negative
guardrail instruction verbatim, so the fixture continues to demonstrate a genuinely on-contract
example.

#### Scenario: The document instructs the negative-prompt logo guardrail

- **GIVEN** the real, committed Straw Motion news-carousel Baseline Prompt document, loaded via
  `loadFormat("straw-motion", "unhypped-news")` then `loadBaselinePrompt(..., "news-carousel")`
- **WHEN** its content is normalized (blockquote markers stripped, lines joined with a space, repeated
  whitespace collapsed) and checked for the guardrail instruction
- **THEN** it contains the phrase "negative-prompt instruction", a phrase matching "never render
  (this|its) reference image's name or file name", and the phrase "as visible text anywhere in the
  image"

#### Scenario: The document still instructs the logo rendered unaltered — composed with, not replacing, the pre-existing clause

- **GIVEN** the same normalized document content
- **WHEN** it is checked for the pre-existing "render unaltered" instruction
- **THEN** it contains a phrase matching "render(ed)? unaltered" and the pre-existing sentence "do not
  change its shape, proportions, or color in any way, and do not restyle it to match the scene"

#### Scenario: The document instructs a smaller pill + logo on every slide after the hook, larger allowed on the hook slide

- **GIVEN** the same normalized document content
- **WHEN** it is checked for the slide-position sizing instruction
- **THEN** it contains the phrase "scale varies by slide position", the phrase "hook slide
  (slide_index 0)", the phrase "no wider than ~⅙ frame width", and the phrase "noticeably smaller"

#### Scenario: The pre-existing logo/pill checklist facts remain genuine substrings of the document

- **GIVEN** the same normalized document content
- **WHEN** it is checked for `STRAW_MOTION_BASELINE`'s pre-existing `logoReferenceName`,
  `neverAllCapsInstruction`, and `pillText`
- **THEN** all three remain present, verbatim — the new guardrail/sizing instructions compose with
  the existing logo/pill facts, never replacing or contradicting them

#### Scenario: The graduated Straw Motion fixture carries the document's negative guardrail instruction verbatim

- **GIVEN** `strawMotionIdeaOneCarouselSpec()`'s 7 slides
- **WHEN** each slide's `image_prompt` is checked
- **THEN** every one carries the document's negative-prompt logo guardrail sentence verbatim,
  proving the document and the graduated fixture were updated together, not independently
