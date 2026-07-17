## RENAMED Requirements

- FROM: `### Requirement: The registry is seeded with exactly one Recipe reproducing today's wired path unchanged`
- TO: `### Requirement: The registry seeds the Character Explainer with Cast Recipe, reproducing today's wired path unchanged`

## MODIFIED Requirements

### Requirement: A Recipe is a typed, in-repo registry entry keyed by slug

The system SHALL define a `Recipe` type and an in-repo registry keyed by slug
(`src/recipe/registry.ts`). Each Recipe SHALL declare: its ordered **gate list** (zero..many human
picks), its **Production-Spec shape** (a description plus the validator function AND the banned-word
scanner function that enforce it), its **copy shape** (length/emoji constraints), **which Space it
drives** — a Space id and name — **plus the on-canvas node names it touches** (the Spec-input node,
and, for a Recipe with at least one pick-gate, the pinned-reference node and the cast run-point name;
every Recipe has a gateless run-point name that renders the final Asset), and its canvas's **two typed
inputs** — a named **media-slot map** (slot name -> `{ kind: "brand-asset" | "idea-pick", media:
"image" | "video" | "audio", required: boolean, plus either a `brandAssetKey` or a `gate` naming one of
this Recipe's own declared gates }`) and a **prompt node** (the text node name the Producer
authors/injects its media prompt into). Recipes are brand-agnostic: any Brand can use any Recipe
present in the registry. `getRecipe(slug)` SHALL return the Recipe or `null` (never throw);
`listRecipes()` and `listWiredRecipeSlugs()` SHALL enumerate every registered Recipe; `isWiredRecipe(slug)`
SHALL be the single, sole predicate for whether a Recipe is registered.

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
- **AND** the News Carousel Recipe has exactly one slot, `"Brand Logo"`, of kind `"brand-asset"`

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
runs; and its `canvasInputs` SHALL declare exactly one `idea-pick` media slot named
`"Selected Character"` (image, required, `gate: "cast"`) whose `promptNode` equals its
`space.nodes.specInput`. No existing production module (`contract.ts`, `validate.ts`, `generate.ts`,
`compose.ts`, `protocol.ts`, `parse.ts`, `driver.ts`, `queue.ts`, `scheduler.ts`, `brand-safety.ts`)
SHALL be behaviourally modified to build this Recipe entry — the registry only DESCRIBES the wired
path; it does not drive it.

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

## ADDED Requirements

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
Cast Recipe's `180`/`1`/`3`; and its `canvasInputs` SHALL declare exactly one `brand-asset` media slot
named `"Brand Logo"` (image, required, `brandAssetKey: "brand-logo"`) whose `promptNode` equals its
sole run-point's name.

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
- **THEN** they are equal (`"Slides Prompts"`)

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

#### Scenario: The News Carousel Recipe's canvasInputs describe its Brand Logo slot and its sole prompt node

- **GIVEN** the seeded `news-carousel` Recipe
- **WHEN** its `canvasInputs` is inspected
- **THEN** `mediaSlots["Brand Logo"]` is `{ kind: "brand-asset", media: "image", required: true,
  brandAssetKey: "brand-logo" }`
- **AND** `promptNode` equals `space.nodes.clipRunPoint` (`"Slides Prompts"`)

### Requirement: A Recipe declares two typed canvas inputs — a media-slot map and a prompt node

Per ADR-0016, every Recipe's `canvasInputs` SHALL declare exactly two kinds of input: a named
**media-slot map** (`mediaSlots`), where each entry is either a **brand-asset slot** (`kind:
"brand-asset"`, carrying a `brandAssetKey` the future `BrandAssetStore` resolves, reused every run) or
an **idea-pick slot** (`kind: "idea-pick"`, carrying a `gate` that SHALL be one of this Recipe's own
declared `gates`, filled per Idea once the Operator's pick at that gate is in); and a **prompt node**
(`promptNode`) — the text node name the Producer authors/injects its media prompt into. Every media
slot SHALL declare a `media` kind (`"image" | "video" | "audio"`) and a `required` flag. This is
declarative only in this slice: no binding/authoring code reads `canvasInputs` yet (deferred to later
slices in the map-#70 build chain).

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
