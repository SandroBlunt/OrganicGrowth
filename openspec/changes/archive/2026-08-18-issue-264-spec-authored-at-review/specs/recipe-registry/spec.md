## ADDED Requirements

### Requirement: A Recipe declares a producerSkill — the Skill slug that authors its Production Spec (ADR-0031)

Every Recipe registry entry (`src/recipe/registry.ts`) SHALL carry a required `producerSkill: string`
field naming the `.claude/skills/<slug>/SKILL.md` Skill that authors that Recipe's Production Spec —
structurally identical to the existing `copySkill` field naming the Skill that composes the Recipe's
out-of-canvas Copy. This field is the single, typed source of the Recipe -> authoring-Skill mapping: any
caller that needs to know which Skill authors a given Recipe's Spec (Review's accept flow, the attended
Producer) SHALL resolve it from this field, never from prose duplicated into any one agent's own
instructions.

#### Scenario: Each of the three wired Recipes declares its own producerSkill

- **GIVEN** the in-repo Recipe registry
- **WHEN** `getRecipe("character-explainer-with-cast")`, `getRecipe("news-carousel")`, and
  `getRecipe("news-short-script")` are each called
- **THEN** they return `producerSkill` values `"produce-character-explainer"`, `"produce-news-carousel"`,
  and `"produce-news-short-script"` respectively — each matching a real, existing
  `.claude/skills/<slug>/SKILL.md` directory

#### Scenario: producerSkill is independent of gates/specShape/copyShape — the Recipes differ in those but the field itself is always present

- **GIVEN** the three wired Recipes, which differ in `gates`, `specShape`, and `space`
- **WHEN** each Recipe's `producerSkill` is read
- **THEN** every one is a non-empty string, present regardless of how many gates that Recipe declares or
  whether it drives a Magnific Space at all (the Space-less `news-short-script` Recipe still declares one)
