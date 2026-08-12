## ADDED Requirements

### Requirement: The produce-news-carousel Skill authors the hero-only logo, the role-dependent text-card size, and the per-slide kind + real-media fetch step (ADR-0024, issue #188)

`.claude/skills/produce-news-carousel/SKILL.md` SHALL instruct the author that the Straw Motion logo
appears ONLY on the hook (`slide_index` 0) and cta (`slide_index` 6) slides, at their existing
respective scales, and that the logo clause is OMITTED ENTIRELY (not merely shrunk) on the 5 middle
slides. It SHALL instruct the author to state the Baseline Prompt document's own hero
text-card-minimum-vertical-space clause (at least 60%) on the hook/cta slides and its standard clause
(at least 50%) on every other slide. It SHALL instruct the author to set a slide's `kind` to
`"image"`/`"video"` (plus a matching `source_url`) ONLY when the Idea's brief identifies a SPECIFIC
real photo/clip from the story's own source — never a generic guess — and SHALL name
`src/asset/carousel-real-media.ts`'s fetch-first-fallback module (`resolveCarouselSlideMedia`/
`resolveCarouselMedia`) as the step, run before the Spec is saved, that tries the real fetch and falls
back straight to a fully generated slide with **no pause to ask the Operator, either way**, when the
source is unreachable or too low quality (ADR-0024). Its "Author-phase checklist" bullet list SHALL
name the new `text-card-size`, `slide-kind-source`, and `real-media-composited` items, and SHALL state
the reworked `logo-reference` item's hero-only scoping, alongside the checklist's pre-existing items.
As with every other Brand/Format-specific fact this Skill already avoids hardcoding (ADR-0015), none of
this new guidance SHALL introduce a hardcoded Straw Motion string (e.g. `"Unhypped News"`,
`"Straw_Motion_Logo"`, `"Brand_Logo"`).

#### Scenario: The Skill instructs the logo is hook/cta-only, omitted entirely on the 5 middle slides

- **GIVEN** the Skill's documented step-1/step-2 logo guidance
- **WHEN** it is read
- **THEN** it states the logo clause is present hook/cta ONLY and is omitted entirely (the whole
  clause, not a smaller version) on every other slide

#### Scenario: The Skill instructs the role-dependent text-card-size floor

- **GIVEN** the Skill's documented step-2 card-size guidance
- **WHEN** it is read
- **THEN** it states a hero (hook/cta) slide's `image_prompt` states at least 60% of the frame's
  vertical height, and every other slide's states at least 50%

#### Scenario: The Skill names the per-slide kind field and the real-media fetch-first-fallback module, with no Operator pause

- **GIVEN** the Skill's documented step-1/step-4 `kind`/real-media guidance
- **WHEN** it is read
- **THEN** it names `"generated"`/`"image"`/`"video"`, points at
  `src/asset/carousel-real-media.ts`'s `resolveCarouselSlideMedia`/`resolveCarouselMedia`, and states
  the fetch-first-fallback decision happens with no pause to ask the Operator, either way

#### Scenario: The Skill's checklist bullet list names the three new items and the reworked logo-reference scoping

- **GIVEN** the Skill's documented "Author-phase checklist" section
- **WHEN** it is read
- **THEN** it states the logo is scoped to the two hero slides only, names a hero text-card-size
  clause, and states an image-kind slide's `image_prompt` reserves a frame for the real, fetched photo

#### Scenario: The Skill still hardcodes no one Brand/Format's own strings

- **GIVEN** the Skill's full text after this change
- **WHEN** it is scanned for the literal strings `"Unhypped News"`, `"Straw_Motion_Logo"`, and
  `"Brand_Logo"`
- **THEN** none of them appear anywhere in the file
