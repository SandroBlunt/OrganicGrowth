## ADDED Requirements

### Requirement: The registry is seeded with a third Recipe: News Short Script, zero gates, no Space (ADR-0021, issue #174)

The registry SHALL seed a third Recipe — **"News Short Script"** (`slug: "news-short-script"`) — the
FIRST real, wired Recipe to declare neither `space` nor `canvasInputs` (the generic Space-less support
issue #170 proved against a throwaway fixture): its `gates` SHALL be `[]`; its `specShape.validate`/
`scanBannedWords` SHALL be the SAME functions (reference equality) as
`production-spec/news-short-script-validate.ts`'s `validateNewsShortScriptSpec` and
`production-spec/news-short-script-brand-safety.ts`'s `scanNewsShortScriptForBannedWords`; its
`copyShape` SHALL mirror `copy/platform-shape.ts`'s own documented YouTube bounds
(`platformCopyShapeFor("youtube")`) — including `titleMaxChars: 100`, the ONE new field neither other
Recipe declares — read from that table rather than re-typed as independent literals, so the two can
never drift; its `copySkill` SHALL be `"write-social-copy"`, the SAME shared Skill both other Recipes
use; and its `phases` SHALL declare all six phases in order, with `bind-media` and `gate` EMPTY
(ADR-0021: no canvas, zero gates), `render` carrying at least one mechanical item referencing
`asset/shot-list-media.ts`'s `collectShotListMedia` (this Recipe's own "render" step — collecting the
Shot List's media instead of driving a canvas), and `author`/`copy` each referencing this Recipe's own
`specShape`/`copyShape` functions, mirroring how the other two Recipes' phases are declared.

#### Scenario: The News Short Script Recipe declares zero gates and no Space target

- **GIVEN** the seeded `news-short-script` Recipe
- **WHEN** its `gates`, `space`, and `canvasInputs` are inspected
- **THEN** `gates` is `[]`, and `space`/`canvasInputs` are both `undefined`

#### Scenario: The News Short Script Recipe's spec-shape is its own validator and scanner, not a re-implementation

- **GIVEN** the seeded `news-short-script` Recipe
- **WHEN** its `specShape.validate` and `specShape.scanBannedWords` are compared to
  `news-short-script-validate.ts`'s `validateNewsShortScriptSpec` and
  `news-short-script-brand-safety.ts`'s `scanNewsShortScriptForBannedWords`
- **THEN** they are the SAME functions (`===`) respectively

#### Scenario: The News Short Script Recipe's copy-shape mirrors YouTube's own documented bounds, including titleMaxChars

- **GIVEN** the seeded `news-short-script` Recipe and `copy/platform-shape.ts`'s
  `platformCopyShapeFor("youtube")`
- **WHEN** the Recipe's `copyShape` is compared to that table entry
- **THEN** `maxChars`/`minEmojis`/`maxEmojis`/`titleMaxChars` are all equal, and `titleMaxChars` is `100`
- **AND** neither the Character Explainer with Cast Recipe's nor the News Carousel Recipe's own
  `copyShape` declares a `titleMaxChars` field at all

#### Scenario: The News Short Script Recipe's bind-media and gate phases are EMPTY; its render phase is not

- **GIVEN** the seeded `news-short-script` Recipe's `phases`
- **WHEN** its `bind-media`, `gate`, and `render` phases are inspected
- **THEN** `bind-media.checklist` and `gate.checklist` are both `[]`
- **AND** `render.checklist` has at least one mechanical item referencing
  `asset/shot-list-media.ts`

#### Scenario: The News Short Script Recipe shares the SAME copySkill as both other Recipes

- **GIVEN** all three seeded Recipes
- **WHEN** each Recipe's `copySkill` is inspected
- **THEN** all three equal `"write-social-copy"`

### Requirement: `RecipeCopyShape` and `CopyShape` gain an optional `titleMaxChars` field (issue #174)

`RecipeCopyShape` (`src/recipe/registry.ts`) and `CopyShape` (`src/copy/contract.ts`) SHALL both gain an
OPTIONAL `titleMaxChars?: number` field — the two are structurally identical, so a Recipe's own
`copyShape` passes straight through with no conversion. Present ONLY for a Recipe whose Copy is a title
+ description shape (today: the News Short Script Recipe alone). Absent for both other Recipes' plain
caption + hashtags shape — a complete no-op for them everywhere this field is consulted
(`copy/validate.ts`'s `validateCopy`).

#### Scenario: Both other Recipes' copyShape carries no titleMaxChars field at all

- **GIVEN** `getRecipe("character-explainer-with-cast")` and `getRecipe("news-carousel")`
- **WHEN** each Recipe's `copyShape.titleMaxChars` is inspected
- **THEN** both are `undefined`
