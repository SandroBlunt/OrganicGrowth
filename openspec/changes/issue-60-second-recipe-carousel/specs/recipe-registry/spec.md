## MODIFIED Requirements

### Requirement: The wired Character Explainer with Cast Recipe reproduces today's production path unchanged

The registry's `character-explainer-with-cast` entry SHALL continue to describe today's existing,
already-tested production path byte-for-byte, UNCHANGED by the second Recipe's addition (issue #60):
its `gates` SHALL be exactly `["cast"]`; its `specShape.validate` SHALL be the SAME function (reference
equality) as `production-spec/validate.ts`'s exported `validate`; its `copyShape`'s
`maxChars`/`minEmojis`/`maxEmojis` SHALL be `180`/`1`/`3` — THIS RECIPE'S OWN literal params (ADR-0012,
issue #58); its `space.nodes.specInput` and `space.nodes.pinnedReference` SHALL equal
`space-driver/driver.ts`'s exported `JSON_MASTER_NODE_NAME`/`CHARACTER_NODE_NAME`; and its
`space.nodes.castRunPoint`/`clipRunPoint` SHALL be read from the SAME
`execution-protocol/protocol.ts`'s `canonicalProtocol()` the Space driver already runs — never re-typed
as independent string literals. No existing production module (`contract.ts`, `validate.ts`,
`generate.ts`, `compose.ts`, `protocol.ts`, `parse.ts`, `driver.ts`, `queue.ts`, `scheduler.ts`) SHALL be
modified in a way that changes this Recipe's OWN observable behavior.

#### Scenario: The seeded Recipe's spec-shape validator is the real validator, not a re-implementation

- **GIVEN** the `character-explainer-with-cast` Recipe
- **WHEN** its `specShape.validate` is compared to `production-spec/validate.ts`'s exported `validate`
- **THEN** they are the SAME function (`===`), so the Recipe's validation can never drift from the
  actual Spec validator

#### Scenario: The seeded Recipe's copy-shape is its own literal param, not a Spec-contract constant

- **GIVEN** the `character-explainer-with-cast` Recipe
- **WHEN** its `copyShape.maxChars`/`minEmojis`/`maxEmojis` are inspected
- **THEN** they equal `180`/`1`/`3` — declared locally on the Recipe (`src/recipe/registry.ts`), not
  imported from `production-spec/contract.ts` (which no longer defines any post_copy-shape constant)

#### Scenario: The seeded Recipe's Space node names match the driver's own constants

- **GIVEN** the `character-explainer-with-cast` Recipe
- **WHEN** its `space.nodes.specInput` and `space.nodes.pinnedReference` are compared to
  `space-driver/driver.ts`'s `JSON_MASTER_NODE_NAME` and `CHARACTER_NODE_NAME`
- **THEN** they are equal

#### Scenario: The seeded Recipe's run-point names come from the real canonical protocol

- **GIVEN** the `character-explainer-with-cast` Recipe and `execution-protocol/protocol.ts`'s
  `canonicalProtocol()`
- **WHEN** the Recipe's `space.nodes.castRunPoint`/`clipRunPoint` are compared to the protocol's
  cast-gated and gateless run-point `start` names
- **THEN** they are equal

## ADDED Requirements

### Requirement: The registry holds a second Recipe with a genuinely different gate count, Space, and node shape

The registry SHALL hold a SECOND entry — `news-carousel` ("News Carousel", issue #60) — alongside the
wired `character-explainer-with-cast`, proving the registry generic: `listWiredRecipeSlugs()` SHALL
return both slugs, `listRecipes().length` SHALL be `2`, and `isWiredRecipe`/`getRecipe` SHALL resolve
both. `RecipeSpaceNodes` (`src/recipe/registry.ts`) SHALL widen so `pinnedReference`/`castRunPoint`/
`clipRunPoint` are OPTIONAL (present only for a Recipe with at least one pick-gate / a single
cast-and-clip run-point pair) and a new optional `slideRunPoints: readonly string[]` field covers a
Recipe whose media renders via SEVERAL parallel, Spec-selected run-points — a Recipe sets ONLY the
fields its own shape needs.

#### Scenario: The registry has exactly two entries after this slice

- **GIVEN** the registry as shipped after this slice
- **WHEN** `listWiredRecipeSlugs()` is called
- **THEN** it returns `["character-explainer-with-cast", "news-carousel"]` and
  `listRecipes().length` is `2`

#### Scenario: The News Carousel Recipe carries no pinned-reference/cast/clip run-point fields

- **GIVEN** `getRecipe("news-carousel")`
- **WHEN** its `space.nodes.pinnedReference`/`castRunPoint`/`clipRunPoint` are inspected
- **THEN** all three are `undefined` — this Recipe has no pick-gate to pin and no single
  cast-and-clip run-point pair (`space.nodes.slideRunPoints` is populated instead)

#### Scenario: An unregistered slug remains unresolved regardless of the second Recipe's addition

- **GIVEN** a slug that names neither registered Recipe (e.g. `"carousel"`, the placeholder used
  elsewhere in this spec suite)
- **WHEN** `getRecipe(slug)` / `isWiredRecipe(slug)` are called
- **THEN** `getRecipe` returns `null` and `isWiredRecipe` returns `false`

## RENAMED Requirements

- FROM: `### Requirement: The registry is seeded with exactly one Recipe reproducing today's wired path unchanged`
- TO: `### Requirement: The wired Character Explainer with Cast Recipe reproduces today's production path unchanged`
