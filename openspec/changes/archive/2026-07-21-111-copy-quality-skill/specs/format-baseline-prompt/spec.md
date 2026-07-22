## ADDED Requirements

### Requirement: Straw Motion's news-carousel Baseline Prompt's 7-slide narrative formula advances real comprehension, not just mood

The system SHALL keep Straw Motion's real, committed
`data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`'s "The 7-slide narrative"
section (epic #106 item 6) instructing, verified as a literal, normalized substring of the document's
own prose (never asserted by fiat):

1. **A standing comprehension rule.** Every role's on-slide line — the `stat_callout` AND the `text` —
   SHALL state plainly what happened and what it means; a short, punchy phrase is acceptable ONLY when
   it is ALSO informative.
2. **An explicit anti-pattern callout, by example.** A bare mood/vibe line that names no fact a reader
   could repeat back is named as the anti-pattern to avoid, using the issue's own reproduced examples
   ("Same week.", "You still check.") as the illustration of what NOT to write.
3. **The fixed role order, unchanged.** The 7 roles SHALL remain in the exact order hook → then → shift
   → proof → different → next → cta — this change reengineers each role's FORMULA, never the role list
   or its order.
4. **Per-role guidance split into what the `stat_callout` must name vs. what the `text` must state**,
   for every one of the 7 roles, so the short callout is never left to drift into mood-only content
   while only the longer supporting line stays informative.

This is a documentation-only change confined to this ONE section — the "★ THE BASELINE PROMPT" fixed
clauses, the reusable template, and the 7 worked JSON Examples elsewhere in the same document are
UNCHANGED, so `src/production-spec/fixtures/news-carousel-straw-motion-specs.ts`'s
`STRAW_MOTION_BASELINE`/`strawMotionIdeaOneCarouselSpec()` and every pre-existing #83/#85/#108/#109/#110
fact pinned against this document SHALL remain genuine, unmodified substrings.

#### Scenario: The document states the standing comprehension rule

- **GIVEN** the real, committed Straw Motion news-carousel Baseline Prompt document, loaded via
  `loadFormat("straw-motion", "unhypped-news")` then `loadBaselinePrompt(..., "news-carousel")`
- **WHEN** its content is normalized (blockquote markers stripped, lines joined with a space, repeated
  whitespace collapsed)
- **THEN** it contains a phrase stating every role's on-slide line must state what happened and what it
  means, and that a short phrase is acceptable only when it is also informative

#### Scenario: The document names the mood-only anti-pattern by the issue's own reproduced examples

- **GIVEN** the same normalized document content
- **WHEN** it is checked for the anti-pattern callout
- **THEN** it contains both `"Same week."` and `"You still check."` as the named illustration of what
  NOT to write

#### Scenario: The fixed role order is unchanged

- **GIVEN** the same normalized document content
- **WHEN** the 7 role names are checked, in order
- **THEN** they appear as `hook`, `then`, `shift`, `proof`, `different`, `next`, `cta`, in that exact
  order (matching `production-spec/news-carousel-contract.ts`'s `CAROUSEL_ROLES`)

#### Scenario: Every pre-existing #108/#109/#110 fact remains a genuine substring, composed with, not reverted

- **GIVEN** the same normalized document content
- **WHEN** it is checked for the pre-existing no-dash rule (#108), the four render-fidelity guardrails
  (#109), and the logo negative-prompt guardrail + slide-position sizing (#110)
- **THEN** all remain present, verbatim — this change composes with them, never replacing or
  contradicting any of them

#### Scenario: The graduated Straw Motion fixture is unaffected — this change touches only the narrative section

- **GIVEN** `strawMotionIdeaOneCarouselSpec()`'s 7 slides (`src/production-spec/fixtures/
  news-carousel-straw-motion-specs.ts`)
- **WHEN** each slide's `image_prompt` is checked against `STRAW_MOTION_BASELINE`'s fixed clauses
- **THEN** every one still passes — proving the narrative-section rewrite is isolated from the fixed
  clauses / template / worked Examples the fixture is built from
