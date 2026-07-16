## ADDED Requirements

### Requirement: A Recipe is a typed, in-repo registry entry keyed by slug

The system SHALL define a `Recipe` type and an in-repo registry keyed by slug
(`src/recipe/registry.ts`). Each Recipe SHALL declare: its ordered **gate list** (zero..many human
picks), its **Production-Spec shape** (a description plus the validator function that enforces it),
its **copy shape** (length/emoji constraints), and **which Space it drives** — a Space id and name —
**plus the on-canvas node names it touches** (the Spec-input node, the pinned-reference node, and the
cast/clip run-point names). Recipes are brand-agnostic: any Brand can use any Recipe present in the
registry. `getRecipe(slug)` SHALL return the Recipe or `null` (never throw); `listRecipes()` and
`listWiredRecipeSlugs()` SHALL enumerate every registered Recipe; `isWiredRecipe(slug)` SHALL be the
single, sole predicate for whether a Recipe is registered.

#### Scenario: getRecipe returns the seeded Recipe by slug

- **GIVEN** the registry as shipped in this slice
- **WHEN** `getRecipe("character-explainer-with-cast")` is called
- **THEN** it returns a `Recipe` whose `slug` is `"character-explainer-with-cast"` and whose `name` is
  `"Character Explainer with Cast"`

#### Scenario: getRecipe returns null for an unregistered slug, never throws

- **GIVEN** a slug not present in the registry (e.g. `"carousel"`, `""`, or a path-traversal string)
- **WHEN** `getRecipe(slug)` is called
- **THEN** it returns `null` without throwing

#### Scenario: isWiredRecipe is the sole registration predicate

- **GIVEN** the registry as shipped in this slice
- **WHEN** `isWiredRecipe("character-explainer-with-cast")` and `isWiredRecipe("carousel")` are called
- **THEN** the first returns `true` and the second returns `false`

### Requirement: The registry is seeded with exactly one Recipe reproducing today's wired path unchanged

The registry SHALL be seeded with exactly one entry — **"Character Explainer with Cast"**
(`slug: "character-explainer-with-cast"`) — that describes today's existing, already-tested production
path byte-for-byte: its `gates` SHALL be exactly `["cast"]`; its `specShape.validate` SHALL be the SAME
function (reference equality) as `production-spec/validate.ts`'s exported `validate`; its `copyShape`'s
`maxChars`/`minEmojis`/`maxEmojis` SHALL equal `production-spec/contract.ts`'s
`MAX_POST_COPY_CHARS`/`MIN_POST_COPY_EMOJIS`/`MAX_POST_COPY_EMOJIS`; its `space.nodes.specInput` and
`space.nodes.pinnedReference` SHALL equal `space-driver/driver.ts`'s exported
`JSON_MASTER_NODE_NAME`/`CHARACTER_NODE_NAME`; and its `space.nodes.castRunPoint`/`clipRunPoint` SHALL
be read from the SAME `execution-protocol/protocol.ts`'s `canonicalProtocol()` the Space driver already
runs — never re-typed as independent string literals. No existing production module (`contract.ts`,
`validate.ts`, `generate.ts`, `compose.ts`, `protocol.ts`, `parse.ts`, `driver.ts`, `queue.ts`,
`scheduler.ts`) SHALL be modified to build this Recipe entry — the registry only describes the wired
path; it does not (in this slice) drive it.

#### Scenario: The seeded Recipe's spec-shape validator is the real validator, not a re-implementation

- **GIVEN** the seeded `character-explainer-with-cast` Recipe
- **WHEN** its `specShape.validate` is compared to `production-spec/validate.ts`'s exported `validate`
- **THEN** they are the SAME function (`===`), so the Recipe's validation can never drift from the
  actual Spec validator

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
