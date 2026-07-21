## ADDED Requirements

### Requirement: A Recipe declares a swappable copySkill — the Skill slug its copy step loads

`Recipe` (`src/recipe/registry.ts`) SHALL gain a `copySkill: string` field — the project Skill slug
(`.claude/skills/<slug>/SKILL.md`) the thin Producer loads, via the Skill tool, to run this Recipe's
shared out-of-canvas copy step (ADR-0012), mirroring how a Recipe's media-authoring step names its own
Skill. Both seeded Recipes (`character-explainer-with-cast` and `news-carousel`) SHALL set
`copySkill: "write-social-copy"` — proving the field generalizes across a genuinely different Recipe
(different gate count, Spec shape, and copy shape) while reflecting that ADR-0012 already made the copy
step ONE shared step, parameterized by `copyShape`. A future Recipe (or a future Recipe-specific
copywriting need) MAY point `copySkill` at a different Skill slug without changing any other Recipe's
config or `.claude/agents/producer.md`'s own prose.

#### Scenario: Both seeded Recipes declare the same copySkill today

- **GIVEN** `getRecipe("character-explainer-with-cast")` and `getRecipe("news-carousel")`
- **WHEN** each Recipe's `copySkill` is inspected
- **THEN** both equal `"write-social-copy"`

#### Scenario: copySkill is a plain string field, independent of gates/spec shape/copy shape

- **GIVEN** the two seeded Recipes, which differ in `gates`, `specShape`, and `copyShape`
- **WHEN** `copySkill` is compared across them
- **THEN** it is present and non-empty on both, independent of how their other fields differ — proving
  it is its own, separately swappable field
