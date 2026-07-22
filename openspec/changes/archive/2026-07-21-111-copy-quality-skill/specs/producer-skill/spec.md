## ADDED Requirements

### Requirement: The shared copy step's producer procedure exists in-repo as an invocable, swappable Skill

The system SHALL provide the shared, out-of-canvas copy step's producer procedure (ADR-0012, mirroring
ADR-0018's per-Recipe media-authoring Skills) as a project Skill at
`.claude/skills/write-social-copy/SKILL.md`, whose front-matter `name` field is exactly
`write-social-copy` — the slug `Recipe.copySkill` (`src/recipe/registry.ts`) names for both wired
Recipes today. The Skill SHALL document composing the caption + hashtags from the Brand's hard rules,
the resolved Format's voice, the Idea's material, and the chosen Recipe's own `copyShape`, and SHALL
document sharpening the ACTUAL produced on-slide narrative (a multi-slide Recipe's per-slide
`role`/`text`/`stat_callout`, once the media exists) into the caption's own plain-language recap, rather
than re-deriving a caption from the brief alone.

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

### Requirement: The Skill hands off to the SAME deterministic checker every Copy already goes through

The Skill SHALL document handing off its drafted caption/hashtags to
`src/copy/inject.ts`'s `injectRequiredParts` and then `src/copy/validate.ts`'s `validateCopy` — the SAME
checker every Recipe's Copy already passes through (ADR-0012) — against the chosen Recipe's own
`copyShape` and the Brand's copy rules. It SHALL document that a banned word AND a dash "tell" (em dash,
en dash, or hyphen used as a sentence dash — issue #108) are REJECT-ONLY: redraft on a soft miss, STOP
and report on either, never a silent swap.

#### Scenario: The Skill references the exact checker functions it hands off to

- **GIVEN** the Skill's documented steps
- **WHEN** they are read
- **THEN** they name `src/copy/inject.ts`'s `injectRequiredParts` and `src/copy/validate.ts`'s
  `validateCopy` by exact module path and function name

#### Scenario: A banned word or a dash tell is reject-only, never a silent swap

- **GIVEN** the Skill's documented self-check step
- **WHEN** it is read
- **THEN** it states both a banned word and a dash tell STOP the run and are reported, and explicitly
  rules out silently rewriting the offending text

### Requirement: The Skill states it is swappable per Recipe, never runs the Space, and never publishes

The Skill SHALL state that it is resolved via `Recipe.copySkill` (`src/recipe/registry.ts`) — swappable
per Recipe, mirroring the per-Recipe media-authoring Skills — and SHALL state that it does not run the
Magnific Space, drive a canvas, or call any `spaces_*`/`creations_*` tool, containing no such literal
call anywhere in its own text. It SHALL state that it never publishes (always-rule 1; ADR-0002), and it
SHALL NOT hardcode any one Brand/Format's own pill text, logo reference name, or required CTA as a
literal string.

#### Scenario: The Skill states it is resolved via the swappable Recipe.copySkill field

- **GIVEN** the Skill's documented scope
- **WHEN** it is read
- **THEN** it names `Recipe.copySkill`/`src/recipe/registry.ts` and states it is swappable per Recipe

#### Scenario: The Skill states it does not run the Space and contains no Magnific tool call

- **GIVEN** the Skill's full text
- **WHEN** it is scanned
- **THEN** it states it does not run the Space, and no substring matching a `spaces_*(` or
  `creations_*(` call appears anywhere in the file

#### Scenario: The Skill never publishes and never hardcodes a Brand/Format string

- **GIVEN** the Skill's full text
- **WHEN** it is read and scanned for the literal strings `"Unhypped News"`, `"Straw_Motion_Logo"`, and
  `"Link in bio!"`
- **THEN** it states it never publishes, and none of those literal strings appear anywhere in the file
