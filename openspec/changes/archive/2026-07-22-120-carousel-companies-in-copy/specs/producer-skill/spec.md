## MODIFIED Requirements

### Requirement: The shared copy step's producer procedure exists in-repo as an invocable, swappable Skill

The system SHALL provide the shared, out-of-canvas copy step's producer procedure (ADR-0012, mirroring
ADR-0018's per-Recipe media-authoring Skills) as a project Skill at
`.claude/skills/write-social-copy/SKILL.md`, whose front-matter `name` field is exactly
`write-social-copy` — the slug `Recipe.copySkill` (`src/recipe/registry.ts`) names for both wired
Recipes today. The Skill SHALL document composing the caption + hashtags from the Brand's hard rules,
the resolved Format's voice, the Idea's material, and the chosen Recipe's own `copyShape`, and SHALL
document sharpening the ACTUAL produced on-slide narrative (a multi-slide Recipe's per-slide
`role`/`text`/`stat_callout`/`companies`, once the media exists) into the caption's own plain-language
recap, rather than re-deriving a caption from the brief alone. It SHALL document naming the real
companies/products drawn from a beat's own `companies` field (issue #120) wherever the Format's voice
naturally allows it — grounded in what the Production Spec actually recorded, the SAME "grounded, never
invented" standard the News Carousel author phase's own `companies-cited` checklist item already holds
the on-slide `image_prompt` to — and SHALL state that an empty or absent `companies` field contributes
NO company/product mention: never invented, never re-guessed from the title/angle/mediaContext when the
produced narrative doesn't name one.

#### Scenario: The Skill file exists and declares its own slug

- **GIVEN** the repo at this change's state
- **WHEN** `.claude/skills/write-social-copy/SKILL.md` is read
- **THEN** the file exists, is non-empty, and its front-matter `name` field is exactly
  `write-social-copy`

#### Scenario: The Skill documents sharpening the produced on-slide narrative into the caption

- **GIVEN** the Skill's documented steps
- **WHEN** they are read
- **THEN** they state that, once the media exists, a multi-slide Recipe's ACTUAL produced per-slide
  narrative is pulled forward and sharpened into the caption's own plain-language recap — never a
  generic restatement of the brief alone

#### Scenario: The Skill names companies as part of the produced-narrative input it reads

- **GIVEN** the Skill's documented Inputs section
- **WHEN** it is read
- **THEN** it names `companies` and `CopySlideBeat` alongside the pre-existing `role`/`text`/
  `stat_callout` fields as part of the produced on-slide narrative it draws on

#### Scenario: The Skill instructs naming real companies/products from that field, grounded in the Spec

- **GIVEN** the Skill's documented drafting step
- **WHEN** it is read
- **THEN** it instructs naming the real companies/products a slide's own `companies` field actually
  records, grounded in what the Production Spec recorded — never a re-guess from the brief's prose

#### Scenario: The Skill states an empty or absent companies field contributes no mention

- **GIVEN** the Skill's documented drafting step
- **WHEN** it is read
- **THEN** it states that a beat whose `companies` is empty or absent contributes NO company/product
  mention, and that one is never invented or re-guessed from other material
