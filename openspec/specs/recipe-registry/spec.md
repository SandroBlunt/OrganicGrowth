# recipe-registry Specification

## Purpose
TBD - created by archiving change issue-54-recipe-registry. Update Purpose after archive.
## Requirements
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

### Requirement: An unwired Recipe is never offered at Review

`offeredRecipes(defaultRecipes)` (`src/recipe/offer.ts`) SHALL filter a Format's `default_recipes` list
down to WIRED Recipe slugs only (per `isWiredRecipe`), preserving order; any slug not present in the
registry SHALL be excluded from the offered set and reported separately (`unwired`), never presented as
an available option. `resolveRecipeSelection(defaultRecipes, requested)` SHALL likewise never add an
unwired slug to `chosen`, even when the Operator's `requested` list explicitly names one — it SHALL be
reported in `ignoredUnwired` instead. This holds regardless of whether the unwired slug came from the
Format file or from the Operator asking for it by name.

#### Scenario: A Format default that is not wired is filtered out of the offer

- **GIVEN** `default_recipes: ["character-explainer-with-cast", "carousel"]` where `"carousel"` is not
  in the registry
- **WHEN** `offeredRecipes` is called with that list
- **THEN** `offered` is `["character-explainer-with-cast"]` and `unwired` is `["carousel"]`

#### Scenario: An Operator request for an unwired Recipe is never added to the chosen set

- **GIVEN** `default_recipes: ["character-explainer-with-cast"]` and an Operator `requested` list of
  `["character-explainer-with-cast", "carousel"]`
- **WHEN** `resolveRecipeSelection` is called
- **THEN** `chosen` is `["character-explainer-with-cast"]` and `ignoredUnwired` is `["carousel"]` —
  `"carousel"` never appears in `chosen`

### Requirement: default_recipes are pre-filled at Review; declined Recipes are logged verbatim

`resolveRecipeSelection(defaultRecipes, requested)` SHALL compute `chosen` (the wired Recipes the
Operator kept or added) and `declined` (offered/wired defaults the Operator dropped, present in
`defaultRecipes` but absent from `chosen`). `/review-ideas` SHALL present the offered (wired-only) set
as the pre-filled default at Review, let the Operator trim/extend it conversationally, then write the
resolved selection onto the accepted Idea's ledger record via `writeIdeaRecipeSelection` — recording
`recipes` (the chosen set) and `declined_recipes` (each declined Recipe paired with a free-text reason
captured VERBATIM, mirroring Rejection Reasons). Declined-Recipe reasons SHALL be logged only (v1) —
never auto-applied to future suggestions or future Formats.

#### Scenario: Keeping the pre-filled default results in nothing declined

- **GIVEN** `default_recipes: ["character-explainer-with-cast"]` and the Operator keeps it unchanged
- **WHEN** `resolveRecipeSelection` is called with `requested` equal to the default
- **THEN** `chosen` is `["character-explainer-with-cast"]` and `declined` is `[]`

#### Scenario: Declining the only offered Recipe logs it, with the reason stored verbatim

- **GIVEN** `default_recipes: ["character-explainer-with-cast"]` and the Operator declines it with the
  reason "want to see the first Reel land before trying a second Recipe"
- **WHEN** the selection is resolved and written via `writeIdeaRecipeSelection`
- **THEN** the Idea's ledger record has `recipes: []` and
  `declined_recipes: [{ recipe: "character-explainer-with-cast", reason: "want to see the first Reel
  land before trying a second Recipe" }]` — the reason stored exactly as given, not summarized or altered

#### Scenario: writeIdeaRecipeSelection preserves unrelated ledger fields

- **GIVEN** an Idea record with unrelated fields (`title`, `fit_score`, etc.) and a sibling Idea record
- **WHEN** `writeIdeaRecipeSelection` is called for the target Idea
- **THEN** only the target Idea's `recipes`/`declined_recipes` change; the sibling Idea and the target
  Idea's other fields are unchanged

### Requirement: The wired production path is unchanged by this slice

Accepting an Idea with at least one chosen Recipe SHALL still call `enqueueOnAccept` exactly as before
this slice (same signature, same behavior — Recipe-unaware; re-keying the queue per chosen Recipe is a
later slice). `src/production-spec/**`, `src/execution-protocol/**`, `src/space-driver/**`, and
`src/production-queue/**` SHALL NOT be modified by this slice.

#### Scenario: Accepting an Idea with the default Recipe kept enqueues exactly as before

- **GIVEN** an Idea whose Format's only default Recipe is kept (not declined)
- **WHEN** the Idea is accepted
- **THEN** `enqueueOnAccept(ideaId, brand, { ledgerPath })` is called with the same arguments and
  effect as it had before this slice — one `cast`-phase, `status: queued` job is appended

#### Scenario: Declining every offered Recipe accepts the Idea without enqueueing production

- **GIVEN** an Idea whose only offered Recipe the Operator declines, naming no replacement
- **WHEN** the Idea is accepted
- **THEN** the ledger record's `status` becomes `accepted` and `recipes` is `[]`
- **AND** `enqueueOnAccept` is NOT called — there is nothing to produce yet

### Requirement: The registry seeds the Character Explainer with Cast Recipe, reproducing today's wired path unchanged

The registry SHALL seed the **"Character Explainer with Cast"** Recipe (`slug:
"character-explainer-with-cast"`) that describes today's existing, already-tested production path
byte-for-byte, UNCHANGED by this slice: its `gates` SHALL be exactly `["cast"]`; its
`specShape.validate` SHALL be the SAME function (reference equality) as `production-spec/validate.ts`'s
exported `validate`; its `specShape.scanBannedWords` SHALL be the SAME function (reference equality) as
`production-spec/brand-safety.ts`'s exported `scanForBannedWords`; its `copyShape`'s
`maxChars`/`minEmojis`/`maxEmojis` SHALL be `180`/`1`/`3`; its `space.nodes.specInput` and
`space.nodes.pinnedReference` SHALL equal `space-driver/driver.ts`'s exported
`JSON_MASTER_NODE_NAME`/`CHARACTER_NODE_NAME`; its `space.nodes.castRunPoint`/`clipRunPoint` SHALL be
read from the SAME `execution-protocol/protocol.ts`'s `canonicalProtocol()` the Space driver already
runs; its `canvasInputs` SHALL declare exactly one `idea-pick` media slot named
`"Selected Character"` (image, required, `gate: "cast"`) whose `promptNode` equals its
`space.nodes.specInput`; and its `phases` SHALL declare all six phases in order, with its `author`
phase's checklist carrying exactly one mechanical item referencing `specShape.validate`, one
mechanical item referencing `specShape.scanBannedWords`, and one agent-judged item, and its `copy`
phase's checklist carrying exactly one mechanical item referencing `copy/validate.ts`'s `validateCopy`
under this Recipe's own `copyShape`. No existing production module (`contract.ts`, `validate.ts`,
`generate.ts`, `compose.ts`, `protocol.ts`, `parse.ts`, `driver.ts`, `queue.ts`, `scheduler.ts`,
`brand-safety.ts`, `copy/validate.ts`) SHALL be behaviourally modified to build this Recipe entry — the
registry only DESCRIBES the wired path; it does not drive it.

#### Scenario: The seeded Recipe's spec-shape validator is the real validator, not a re-implementation

- **GIVEN** the seeded `character-explainer-with-cast` Recipe
- **WHEN** its `specShape.validate` is compared to `production-spec/validate.ts`'s exported `validate`
- **THEN** they are the SAME function (`===`), so the Recipe's validation can never drift from the
  actual Spec validator

#### Scenario: The seeded Recipe's banned-word scan is the real scanner, not a re-implementation

- **GIVEN** the seeded `character-explainer-with-cast` Recipe
- **WHEN** its `specShape.scanBannedWords` is compared to `production-spec/brand-safety.ts`'s exported
  `scanForBannedWords`
- **THEN** they are the SAME function (`===`)

#### Scenario: The seeded Recipe's copy-shape is its own literal param, not a Spec-contract constant

- **GIVEN** the seeded `character-explainer-with-cast` Recipe
- **WHEN** its `copyShape.maxChars`/`minEmojis`/`maxEmojis` are inspected
- **THEN** they equal `180`/`1`/`3`

#### Scenario: The seeded Recipe's Space node names match the driver's own constants

- **GIVEN** the seeded `character-explainer-with-cast` Recipe
- **WHEN** its `space.nodes.specInput` and `space.nodes.pinnedReference` are compared to
  `space-driver/driver.ts`'s `JSON_MASTER_NODE_NAME` and `CHARACTER_NODE_NAME`
- **THEN** they are equal

#### Scenario: The seeded Recipe's run-point names come from the real canonical protocol

- **GIVEN** the seeded `character-explainer-with-cast` Recipe and `execution-protocol/protocol.ts`'s
  `canonicalProtocol()`
- **WHEN** the Recipe's `space.nodes.castRunPoint`/`clipRunPoint` are compared to the protocol's
  cast-gated and gateless run-point `start` names
- **THEN** they are equal

#### Scenario: The seeded Recipe's canvasInputs describe its existing Cast-pick and Spec-input node

- **GIVEN** the seeded `character-explainer-with-cast` Recipe
- **WHEN** its `canvasInputs` is inspected
- **THEN** `mediaSlots["Selected Character"]` is `{ kind: "idea-pick", media: "image", required: true,
  gate: "cast" }`
- **AND** `promptNode` equals `space.nodes.specInput`

#### Scenario: The seeded Recipe's author-phase checklist references its own specShape functions

- **GIVEN** the seeded `character-explainer-with-cast` Recipe's `author` phase
- **WHEN** its `checklist` is inspected
- **THEN** it has exactly 3 items: one mechanical item referencing `specShape.validate`, one mechanical
  item referencing `specShape.scanBannedWords`, and one agent-judged item

#### Scenario: The seeded Recipe's copy-phase checklist references validateCopy under its own copyShape

- **GIVEN** the seeded `character-explainer-with-cast` Recipe's `copy` phase
- **WHEN** its `checklist` is inspected
- **THEN** it has exactly 1 mechanical item referencing `copy/validate.ts`'s `validateCopy`

### Requirement: The registry is seeded with a second Recipe: News Carousel, zero gates

The registry SHALL seed a second Recipe — **"News Carousel"** (`slug: "news-carousel"`) — proving the
registry's per-Recipe shapes generalize to a genuinely different production plan: its `gates` SHALL be
`[]` (a zero-gate Recipe renders unattended end-to-end); its `space` SHALL target the single-lane
"Carrousel" Space, whose `nodes.clipRunPoint` SHALL be read from `execution-protocol/protocol.ts`'s
`canonicalCarouselProtocol()` (its sole, gateless run-point) and whose `nodes.pinnedReference`/
`castRunPoint` SHALL be absent (it has no pick-gate to pin or render a paused Cast for); its
`specShape.validate`/`scanBannedWords` SHALL be the SAME functions (reference equality) as
`production-spec/news-carousel-validate.ts`'s `validateNewsCarouselSpec` and
`production-spec/news-carousel-brand-safety.ts`'s `scanNewsCarouselForBannedWords`; its `copyShape`
SHALL be `{ maxChars: 2200, minEmojis: 0, maxEmojis: 2 }` — DIFFERENT from the Character Explainer with
Cast Recipe's `180`/`1`/`3`; its `canvasInputs` SHALL declare exactly one `brand-asset` media slot named
`"Brand_Logo"` (image, required, `brandAssetKey: "brand-logo"`) whose `promptNode` equals its sole
run-point's name; and its `phases` SHALL declare all six phases in order, with its `author` phase's
checklist carrying exactly 8 items (7 mechanical, 1 agent-judged — the "grounded subject" item), its
`gate` phase's checklist EMPTY (it declares zero gates), and its `copy` phase's checklist carrying
exactly one mechanical item referencing `copy/validate.ts`'s `validateCopy` under this Recipe's own
`copyShape`.

`"Brand_Logo"` and `"JSON Master"` (the run-point/prompt-node name below) are the REAL canvas node
names, verified against the live "Carrousel" Space capture (issue #86,
`src/space-driver/fixtures/live-captures/carrousel/00-spaces_show.fullboard.json`). The earlier
placeholders (`"Brand Logo"`, `"Slides Prompts"`) named no real canvas node at all; the Operator chose
(2026-07-18, recorded in the capture's own README) to align the BUILD to the canvas rather than rename
the canvas (issue #89). A brand-asset media slot has no separate `pinnedReference`-style field (unlike
an idea-pick slot) — its map key IS its physical canvas node, mirroring how `promptNode` already works.
This is a DIFFERENT node, on a DIFFERENT Space, than the wired *Character Explainer with Cast* Recipe's
own `"JSON Master"` node — the two share only a name, never a canvas.

#### Scenario: The News Carousel Recipe declares zero gates

- **GIVEN** the seeded `news-carousel` Recipe
- **WHEN** its `gates` is inspected
- **THEN** it is `[]` — a gate count different from the Character Explainer with Cast Recipe's `["cast"]`

#### Scenario: The News Carousel Recipe targets the single-lane Carrousel Space with no pick-gate nodes

- **GIVEN** the seeded `news-carousel` Recipe
- **WHEN** its `space` is inspected
- **THEN** `space.name` is `"Carrousel"`, `space.id` differs from the Character Explainer with Cast
  Recipe's Space id
- **AND** `space.nodes.pinnedReference` and `space.nodes.castRunPoint` are both absent (`undefined`)

#### Scenario: The News Carousel Recipe's run-point comes from its own canonical protocol

- **GIVEN** the seeded `news-carousel` Recipe and `execution-protocol/protocol.ts`'s
  `canonicalCarouselProtocol()`
- **WHEN** the Recipe's `space.nodes.clipRunPoint` is compared to the protocol's sole run-point's
  `start` name
- **THEN** they are equal (`"JSON Master"`) — the REAL, captured node name (issue #86/#89)

#### Scenario: The News Carousel Recipe's spec-shape is its own validator and scanner, not a re-implementation

- **GIVEN** the seeded `news-carousel` Recipe
- **WHEN** its `specShape.validate` and `specShape.scanBannedWords` are compared to
  `news-carousel-validate.ts`'s `validateNewsCarouselSpec` and `news-carousel-brand-safety.ts`'s
  `scanNewsCarouselForBannedWords`
- **THEN** they are the SAME functions (`===`) respectively

#### Scenario: The News Carousel Recipe's copy-shape differs from the wired Recipe's

- **GIVEN** the seeded `news-carousel` Recipe
- **WHEN** its `copyShape` is compared to the Character Explainer with Cast Recipe's `copyShape`
- **THEN** News Carousel's is `{ maxChars: 2200, minEmojis: 0, maxEmojis: 2 }`, different from the
  other Recipe's `{ maxChars: 180, minEmojis: 1, maxEmojis: 3 }`

#### Scenario: The News Carousel Recipe's canvasInputs describe its Brand_Logo slot and its sole prompt node

- **GIVEN** the seeded `news-carousel` Recipe
- **WHEN** its `canvasInputs` is inspected
- **THEN** `mediaSlots["Brand_Logo"]` is `{ kind: "brand-asset", media: "image", required: true,
  brandAssetKey: "brand-logo" }` — the map key IS the real, captured canvas node name (issue #86/#89)
- **AND** `promptNode` equals `space.nodes.clipRunPoint` (`"JSON Master"`)

#### Scenario: The News Carousel Recipe's author-phase checklist has 8 items, 7 mechanical + 1 agent-judged

- **GIVEN** the seeded `news-carousel` Recipe's `author` phase
- **WHEN** its `checklist` is inspected
- **THEN** it has exactly 8 items
- **AND** exactly 1 of them is `agent-judged` (the "grounded subject" item) and the remaining 7 are
  `mechanical`

#### Scenario: The News Carousel Recipe's gate-phase checklist is empty — it declares zero gates

- **GIVEN** the seeded `news-carousel` Recipe's `gate` phase
- **WHEN** its `checklist` is inspected
- **THEN** it is `[]`

### Requirement: A Recipe declares two typed canvas inputs — a media-slot map and a prompt node

Per ADR-0016, every Recipe's `canvasInputs` SHALL declare exactly two kinds of input: a named
**media-slot map** (`mediaSlots`), where each entry is either a **brand-asset slot** (`kind:
"brand-asset"`, carrying a `brandAssetKey` the `BrandAssetStore` resolves, reused every run) or an
**idea-pick slot** (`kind: "idea-pick"`, carrying a `gate` that SHALL be one of this Recipe's own
declared `gates`, filled per Idea once the Operator's pick at that gate is in); and a **prompt node**
(`promptNode`) — the text node name the Producer authors/injects its media prompt into. Every media
slot SHALL declare a `media` kind (`"image" | "video" | "audio"`) and a `required` flag.

#### Scenario: A brand-asset slot carries a brandAssetKey, not a gate

- **GIVEN** the News Carousel Recipe's `"Brand Logo"` media slot
- **WHEN** its shape is inspected
- **THEN** `kind` is `"brand-asset"` and it carries `brandAssetKey: "brand-logo"` — it carries no
  `gate` field

#### Scenario: An idea-pick slot's gate is one of its own Recipe's declared gates

- **GIVEN** the Character Explainer with Cast Recipe's `"Selected Character"` media slot
- **WHEN** its shape is inspected
- **THEN** `kind` is `"idea-pick"`, it carries `gate: "cast"`, and `"cast"` is a member of that same
  Recipe's `gates` array

### Requirement: A Recipe's on-canvas node names may declare an optional watermark parameter node (QA-1)

`RecipeSpaceNodes` (`src/recipe/registry.ts`) SHALL carry an OPTIONAL `watermarkNode?: string` field —
the name of a canvas text node the Brand's watermark `@handle` is set onto before a Recipe's final
render (`src/space-driver/driver.ts`'s `setWatermarkHandle`). This field is present ONLY for a Recipe
whose canvas actually has such a node — it is a GENERIC, per-Recipe declaration, never hard-coded
procedure. The seeded *Character Explainer with Cast* Recipe SHALL set it to the real, captured
`"Watermark instructions"` node name (`src/space-driver/driver.ts`'s `WATERMARK_NODE_NAME`); the
seeded *News Carousel* Recipe SHALL leave it absent (its canvas has no watermark parameter node).

#### Scenario: The wired Character Explainer Recipe declares its real, captured watermarkNode

- **GIVEN** `getRecipe("character-explainer-with-cast")`
- **WHEN** `recipe.space.nodes.watermarkNode` is inspected
- **THEN** it equals `"Watermark instructions"` (`WATERMARK_NODE_NAME`, `src/space-driver/driver.ts`)

#### Scenario: The News Carousel Recipe declares NO watermarkNode

- **GIVEN** `getRecipe("news-carousel")`
- **WHEN** `recipe.space.nodes.watermarkNode` is inspected
- **THEN** it is `undefined` — this Recipe's canvas has no watermark parameter node, and the thin
  Producer simply skips the watermark step for it

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

