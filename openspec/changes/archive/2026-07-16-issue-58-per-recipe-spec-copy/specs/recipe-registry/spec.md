## MODIFIED Requirements

### Requirement: The registry is seeded with exactly one Recipe reproducing today's wired path unchanged

The registry SHALL be seeded with exactly one entry — **"Character Explainer with Cast"**
(`slug: "character-explainer-with-cast"`) — that describes today's existing, already-tested production
path byte-for-byte: its `gates` SHALL be exactly `["cast"]`; its `specShape.validate` SHALL be the SAME
function (reference equality) as `production-spec/validate.ts`'s exported `validate`; its `copyShape`'s
`maxChars`/`minEmojis`/`maxEmojis` SHALL be `180`/`1`/`3` — THIS RECIPE'S OWN literal params (ADR-0012,
issue #58), no longer sourced from a Production-Spec-contract constant (Copy left the Spec entirely; a
different Recipe declares its own bounds); its `space.nodes.specInput` and `space.nodes.pinnedReference`
SHALL equal `space-driver/driver.ts`'s exported `JSON_MASTER_NODE_NAME`/`CHARACTER_NODE_NAME`; and its
`space.nodes.castRunPoint`/`clipRunPoint` SHALL be read from the SAME `execution-protocol/protocol.ts`'s
`canonicalProtocol()` the Space driver already runs — never re-typed as independent string literals. No
existing production module (`contract.ts`, `validate.ts`, `generate.ts`, `compose.ts`, `protocol.ts`,
`parse.ts`, `driver.ts`, `queue.ts`, `scheduler.ts`) SHALL be modified to build this Recipe entry beyond
what dropping `post_copy` from the Spec contract itself required — the registry only DESCRIBES the wired
path; it does not drive it.

#### Scenario: The seeded Recipe's spec-shape validator is the real validator, not a re-implementation

- **GIVEN** the seeded `character-explainer-with-cast` Recipe
- **WHEN** its `specShape.validate` is compared to `production-spec/validate.ts`'s exported `validate`
- **THEN** they are the SAME function (`===`), so the Recipe's validation can never drift from the
  actual Spec validator

#### Scenario: The seeded Recipe's copy-shape is its own literal param, not a Spec-contract constant

- **GIVEN** the seeded `character-explainer-with-cast` Recipe
- **WHEN** its `copyShape.maxChars`/`minEmojis`/`maxEmojis` are inspected
- **THEN** they equal `180`/`1`/`3` — declared locally on the Recipe (`src/recipe/registry.ts`), not
  imported from `production-spec/contract.ts` (which no longer defines any post_copy-shape constant)

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
