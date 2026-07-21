## ADDED Requirements

### Requirement: The produce-news-carousel Skill's authoring guidance actively pushes placement spread, subject-type variety, and real-named-people balance, kept in sync with the checklist

`.claude/skills/produce-news-carousel/SKILL.md` SHALL instruct the author to actively spread `card_style`
placements across the vertical range, slide to slide, and to include at least one top-region placement
(a "top card, photo below" style) — never defaulting to repeating the same one or two placements, and
never leaving every card at the bottom/lower-left. It SHALL instruct the author to actively vary the
subject TYPE slide to slide (not leaning on the same "laptops/phones showing a product UI" motif for
every slide) and to reach for the real, named person when a story is clearly one specific person's,
balanced against product-led slides across the carousel. Its "Author-phase checklist" bullet list SHALL
name the new `placement-variety` item alongside the checklist's existing items. As with every other
Brand/Format-specific fact this Skill already avoids hardcoding (ADR-0015), none of this new guidance
SHALL introduce a hardcoded Straw Motion string (e.g. `"Unhypped News"`, `"Straw_Motion_Logo"`,
`"Brand_Logo"`).

#### Scenario: The Skill instructs spreading card_style placements, including a top-region card

- **GIVEN** the Skill's documented step-1 `card_style` guidance
- **WHEN** it is read
- **THEN** it instructs actively spreading placements across the vertical range and including at least
  one top-region placement, and states this is checked by the `placement-variety` checklist item

#### Scenario: The Skill instructs varying subject TYPE and reaching for the real named person, balanced with product shots

- **GIVEN** the Skill's documented step-1 `subject` guidance
- **WHEN** it is read
- **THEN** it instructs actively varying the subject type slide to slide (not defaulting to the same
  product-UI motif) and reaching for the real, named person when a story is clearly theirs, balanced
  against product-led slides

#### Scenario: The Skill's checklist bullet list names the new placement-variety item

- **GIVEN** the Skill's documented "Author-phase checklist" section
- **WHEN** it is read
- **THEN** it includes an item stating card placements are spread across the vertical range and include
  at least one top-region placement, alongside the pre-existing checklist bullets

#### Scenario: The Skill still hardcodes no one Brand/Format's own strings

- **GIVEN** the Skill's full text after this change
- **WHEN** it is scanned for the literal strings `"Unhypped News"`, `"Straw_Motion_Logo"`, and
  `"Brand_Logo"`
- **THEN** none of them appear anywhere in the file
