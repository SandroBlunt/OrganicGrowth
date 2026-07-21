## ADDED Requirements

### Requirement: producer.md loads the Skill named by Recipe.copySkill for the shared copy phase

`.claude/agents/producer.md`'s Copy-phase section SHALL document loading the copywriting Skill named by
the resolved Recipe's `copySkill` field (`src/recipe/registry.ts`), via the Skill tool
(`.claude/skills/<slug>/SKILL.md`), and following it as the producer's own writing instructions for the
caption — exactly mirroring how the Author phase already loads that Recipe's own media-authoring Skill
by the job's Recipe slug. This SHALL NOT hard-code a single copy-Skill name as the only possibility: the
doc SHALL resolve it from the Recipe's own field, so a future Recipe naming a different `copySkill`
requires no edit to this agent's own prose. The doc SHALL still state that, once the media exists, the
producer sharpens the ACTUAL produced on-slide narrative into the caption (for a multi-slide Recipe),
and SHALL retain every pre-existing reference this phase already documents:
`src/copy/inject.ts`'s `injectRequiredParts`, `src/copy/validate.ts`'s `validateCopy`, `auditCopyPhase`,
and ADR-0012.

#### Scenario: The Copy-phase section resolves the Skill from Recipe.copySkill, never a hard-coded name

- **GIVEN** `.claude/agents/producer.md`'s Copy-phase section
- **WHEN** it is read
- **THEN** it names `Recipe.copySkill` (or `copySkill`) and `src/recipe/registry.ts`, and states the
  Skill is loaded via the Skill tool

#### Scenario: The doc's own example copySkill slug matches the LIVE registry's real value

- **GIVEN** `.claude/agents/producer.md`'s Copy-phase section, and the live registry's
  `getRecipe("news-carousel")!.copySkill` / `getRecipe("character-explainer-with-cast")!.copySkill`
- **WHEN** the doc's own example slug is compared against BOTH
- **THEN** they are equal — a future rename of `copySkill` in the registry, without a matching doc
  update, fails this scenario loudly rather than drifting silently

#### Scenario: The Copy-phase section still documents sharpening the produced on-slide narrative

- **GIVEN** `.claude/agents/producer.md`'s Copy-phase section
- **WHEN** it is read
- **THEN** it states that, once the media exists, the producer sharpens the ACTUAL produced on-slide
  narrative into the caption for a multi-slide Recipe

#### Scenario: Every pre-existing Copy-phase reference is retained

- **GIVEN** `.claude/agents/producer.md`'s Copy-phase section
- **WHEN** it is read
- **THEN** it still names `src/copy/inject.ts`, `injectRequiredParts`, `src/copy/validate.ts`,
  `validateCopy`, `auditCopyPhase`, and `ADR-0012`
