## MODIFIED Requirements

### Requirement: A Recipe is a typed, in-repo registry entry keyed by slug

The system SHALL define a `Recipe` type and an in-repo registry keyed by slug
(`src/recipe/registry.ts`). Each Recipe SHALL declare: its ordered **gate list** (zero..many human
picks), its **Production-Spec shape** (a description plus the validator function AND the banned-word
scanner function that enforce it), its **copy shape** (length/emoji constraints), its **copySkill** (the
Skill slug its copy step loads), and its **six ordered Phase Contracts** (`phases`, ADR-0017): `author`,
`bind-media`, `gate`, `render`, `copy`, `save`, ALWAYS in this order (`PHASE_ORDER`,
`src/recipe/phase-contract.ts`), each carrying a `description` and a `checklist` of `ChecklistItem`s —
either `{ kind: "mechanical", description, reference }` (a human-facing pointer to the existing
module/function that runs it — NEVER a re-implementation) or `{ kind: "agent-judged", description }`
(prose only, flagged for review, never auto-failed). `declaresAllPhasesInOrder(phases)`
(`phase-contract.ts`) SHALL be true for every registered Recipe's `phases`.

**OPTIONALLY (ADR-0021, `docs/adr/0021-space-less-recipe-script-assets.md`), a Recipe declares which
Space it drives** — a Space id and name, plus the on-canvas node names it touches (the Spec-input node,
and, for a Recipe with at least one pick-gate, the pinned-reference node and the cast run-point name;
every Space-driving Recipe has a gateless run-point name that renders the final Asset) — **and its
canvas's two typed inputs**, a named **media-slot map** (slot name -> `{ kind: "brand-asset" |
"idea-pick", media: "image" | "video" | "audio", required: boolean, plus either a `brandAssetKey` or a
`gate` naming one of this Recipe's own declared gates }`) and a **prompt node** (the text node name the
Producer authors/injects its media prompt into). `Recipe.space` and `Recipe.canvasInputs` are BOTH
absent, together, for a **Space-less Recipe** (ADR-0021) — one whose Asset is written words (a script)
plus collected media, with no canvas to bind media into, inject a prompt onto, or drive a run-point
against; every other field above stays REQUIRED regardless of whether a Recipe drives a Space. Recipes
are brand-agnostic: any Brand can use any Recipe present in the registry. `getRecipe(slug)` SHALL return
the Recipe or `null` (never throw); `listRecipes()` and `listWiredRecipeSlugs()` SHALL enumerate every
registered Recipe; `isWiredRecipe(slug)` SHALL be the single, sole predicate for whether a Recipe is
registered.

#### Scenario: getRecipe returns the seeded Character Explainer with Cast Recipe by slug

- **GIVEN** the registry as shipped in this slice
- **WHEN** `getRecipe("character-explainer-with-cast")` is called
- **THEN** it returns a `Recipe` whose `slug` is `"character-explainer-with-cast"` and whose `name` is
  `"Character Explainer with Cast"`

#### Scenario: getRecipe returns the seeded News Carousel Recipe by slug

- **GIVEN** the registry as shipped in this slice
- **WHEN** `getRecipe("news-carousel")` is called
- **THEN** it returns a `Recipe` whose `slug` is `"news-carousel"` and whose `name` is
  `"News Carousel"`

#### Scenario: getRecipe returns null for an unregistered slug, never throws

- **GIVEN** a slug not present in the registry (e.g. `"carousel"`, `""`, or a path-traversal string)
- **WHEN** `getRecipe(slug)` is called
- **THEN** it returns `null` without throwing

#### Scenario: isWiredRecipe is true for both seeded Recipes and false for an unregistered slug

- **GIVEN** the registry as shipped in this slice
- **WHEN** `isWiredRecipe("character-explainer-with-cast")`, `isWiredRecipe("news-carousel")`, and
  `isWiredRecipe("carousel")` are called
- **THEN** the first two return `true` and the third returns `false`

#### Scenario: Each Recipe's canvasInputs media-slot map is keyed by slot name and typed by kind

- **GIVEN** the seeded `character-explainer-with-cast` and `news-carousel` Recipes
- **WHEN** their `canvasInputs.mediaSlots` are inspected
- **THEN** the character Recipe has exactly one slot, `"Selected Character"`, of kind `"idea-pick"`
- **AND** the News Carousel Recipe has exactly one slot, `"Brand_Logo"`, of kind `"brand-asset"`

#### Scenario: Every wired Recipe declares all six phases, in PHASE_ORDER's exact order

- **GIVEN** the seeded `character-explainer-with-cast` and `news-carousel` Recipes
- **WHEN** `declaresAllPhasesInOrder(recipe.phases)` is called for each
- **THEN** both return `true`

#### Scenario: A phase's checklist item is either mechanical (referenced) or agent-judged (prose)

- **GIVEN** either wired Recipe's `phases`
- **WHEN** any `checklist` entry across any phase is inspected
- **THEN** its `kind` is either `"mechanical"` (carrying a non-empty `reference` string naming the
  existing module/function that runs it) or `"agent-judged"` (carrying no `reference` field)

#### Scenario: Both wired Recipes still populate BOTH space and canvasInputs, unchanged by this slice

- **GIVEN** `getRecipe("character-explainer-with-cast")` and `getRecipe("news-carousel")`
- **WHEN** each Recipe's `space` and `canvasInputs` fields are inspected
- **THEN** both are present (non-`undefined`) on both Recipes, with the SAME values this capability's
  other Requirements already pin — this slice's widening never changes either seeded Recipe's actual
  shape

## ADDED Requirements

### Requirement: A Recipe's Space target and canvas inputs are optional — a Space-less Recipe (ADR-0021)

`Recipe.space` and `Recipe.canvasInputs` (`src/recipe/registry.ts`) SHALL both be OPTIONAL fields,
absent together for a **Space-less Recipe**: one whose Asset is written words (a script) plus collected
media, with nothing to render. Every other Recipe field — `gates`, `specShape`, `copyShape`,
`copySkill`, and `phases` — SHALL stay REQUIRED regardless. A Space-less Recipe's `phases` SHALL still
declare all six phases, in `PHASE_ORDER`'s exact order (`declaresAllPhasesInOrder`); its Space-bound
phases (`bind-media`, `gate`, `render` — those a Recipe with no canvas has nothing to do for) MAY
declare an EMPTY checklist, mirroring the exact pattern the zero-gate News Carousel Recipe's own `gate`
phase already uses for a phase with nothing to check.

#### Scenario: A Recipe with no Space target can be registered and passes the import-time guard

- **GIVEN** a Recipe declaring `gates: []`, no `space`, no `canvasInputs`, a Spec shape, a copy shape, a
  `copySkill`, and all six Phase Contracts in order
- **WHEN** it is placed in a registry Map keyed by its own `slug` (mirroring `REGISTRY`'s own
  construction) and `declaresAllPhasesInOrder(recipe.phases)` is called
- **THEN** the Map lookup returns the Recipe unchanged, and `declaresAllPhasesInOrder` returns `true` —
  the SAME shape guard every wired Recipe's own module-load already runs

#### Scenario: A Space-less Recipe's space and canvasInputs are both actually absent

- **GIVEN** a Space-less test fixture Recipe
- **WHEN** its `space` and `canvasInputs` fields are inspected
- **THEN** both are `undefined`

#### Scenario: A Space-less Recipe still declares gates, a spec shape, a copy shape, and a copySkill

- **GIVEN** a Space-less test fixture Recipe
- **WHEN** its `gates`, `specShape`, `copyShape`, and `copySkill` are inspected
- **THEN** `gates` is `[]`, `specShape.validate`/`specShape.scanBannedWords` are both functions,
  `copyShape` carries positive `maxChars` and valid emoji bounds, and `copySkill` is a non-empty string
  — every field ADR-0021 says stays required is actually present

#### Scenario: A Space-less Recipe's bind-media, gate, and render Phase Contracts declare empty checklists

- **GIVEN** a Space-less test fixture Recipe's `phases`
- **WHEN** its `bind-media`, `gate`, and `render` phases are inspected
- **THEN** each one's `checklist` is `[]` — the same empty-checklist pattern the zero-gate News Carousel
  Recipe's own `gate` phase already uses for a phase with nothing to check
