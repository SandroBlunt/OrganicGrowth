## MODIFIED Requirements

### Requirement: bindMediaSlots resolves a Recipe's declared media slots, STOPping on a missing REQUIRED one

The system SHALL provide `bindMediaSlots(recipe, resolutions)` (`src/producer/bind-media.ts`), a pure
function that walks `recipe.canvasInputs?.mediaSlots ?? {}` (`src/recipe/registry.ts`) — an absent
`canvasInputs` (a Space-less Recipe, ADR-0021) is treated as ZERO declared media slots, never a crash —
against an already-looked-up `MediaSlotResolutions` map (slot name -> `{ kind, found, ... }`, supplied
by the caller — this module performs no I/O, no `BrandAssetStore` call, no Magnific call itself). For
each slot: a `found: true` resolution is BOUND (added to the result's `bound` list and `boundSlotNames`
set); a REQUIRED slot with no resolution, or a `found: false` one, SHALL STOP the entire bind
immediately, returning `{ ok: false, missingSlot, message }` — `message` SHALL be the looked-up
resolution's own `message` when supplied (e.g. `BrandAssetStore.getBrandAsset`'s own hint), or a
generic ADR-0016 message naming the slot and Recipe otherwise. An OPTIONAL slot with no resolution
SHALL simply be skipped, never blocking. The function SHALL NEVER return `ok: true` with a required
slot left unbound (ADR-0016: never bind a half-complete Asset). For a Recipe with NO declared media
slots at all (whether because it has none, or because it is Space-less), `bindMediaSlots` SHALL return
`{ ok: true, bound: [], boundSlotNames: new Set() }` regardless of what `resolutions` carries — there is
nothing to bind, so nothing can ever be missing.

#### Scenario: A found brand-asset slot binds; the bound-slot-names set is ready for auditBindMediaPhase

- **GIVEN** the seeded `news-carousel` Recipe (one required `"Brand_Logo"` brand-asset slot) and a
  resolution `{ "Brand_Logo": { kind: "brand-asset", found: true, path } }`
- **WHEN** `bindMediaSlots(recipe, resolutions)` is called
- **THEN** it returns `{ ok: true, bound: [{ name: "Brand_Logo", ... }], boundSlotNames: Set(["Brand_Logo"]) }`

#### Scenario: A found idea-pick slot binds — the character Recipe's Selected Character

- **GIVEN** the seeded `character-explainer-with-cast` Recipe (one required `"Selected Character"`
  idea-pick slot) and a resolution `{ "Selected Character": { kind: "idea-pick", found: true, pick } }`
- **WHEN** `bindMediaSlots(recipe, resolutions)` is called
- **THEN** it returns `ok: true` with that slot bound, carrying the resolved `pick`

#### Scenario: A missing REQUIRED brand-asset slot STOPs with the store's own clear message

- **GIVEN** the seeded `news-carousel` Recipe and a resolution `{ "Brand_Logo": { kind: "brand-asset", found: false, message: "Brand Asset \"brand-logo\" not found for Brand \"straw-motion\" ..." } }`
- **WHEN** `bindMediaSlots(recipe, resolutions)` is called
- **THEN** it returns `{ ok: false, missingSlot: "Brand_Logo", message }` where `message` is exactly
  the supplied lookup message — never a generic placeholder that discards the real reason

#### Scenario: A REQUIRED slot with NO resolution supplied at all STOPs with a generic ADR-0016 message

- **GIVEN** the seeded `news-carousel` Recipe and an EMPTY resolutions map
- **WHEN** `bindMediaSlots(recipe, {})` is called
- **THEN** it returns `ok: false`, `missingSlot: "Brand_Logo"`, and `message` mentions the slot is
  REQUIRED, cites ADR-0016, and states a half-complete Asset is never bound

#### Scenario: A Space-less Recipe with no canvasInputs always binds ok, with nothing bound (ADR-0021)

- **GIVEN** a Space-less Recipe whose `canvasInputs` is `undefined`
- **WHEN** `bindMediaSlots(recipe, {})` is called
- **THEN** it returns `{ ok: true, bound: [], boundSlotNames: Set() }` — there is no canvas to bind
  anything into, so the bind phase is a clean no-op rather than a crash

## ADDED Requirements

### Requirement: usesSpace signals whether a Recipe drives a Magnific Space at all (ADR-0021)

The system SHALL provide `usesSpace(recipe)` (`src/producer/uses-space.ts`), a pure, synchronous
predicate returning `recipe.space !== undefined`. This is the single Recipe-generic signal the thin
Producer SHALL check before doing ANY canvas work for a Recipe's job — binding media slots into canvas
nodes, driving any Execution Protocol run-point, or setting the watermark `@handle` — skipping all of it
when `usesSpace` returns `false` (a Space-less Recipe, ADR-0021). The function SHALL never throw and
SHALL perform no I/O.

#### Scenario: usesSpace is true for both wired Recipes

- **GIVEN** `getRecipe("character-explainer-with-cast")` and `getRecipe("news-carousel")`
- **WHEN** `usesSpace` is called on each
- **THEN** both return `true` — this slice changes neither wired Recipe's behavior

#### Scenario: usesSpace is false for a Space-less Recipe

- **GIVEN** a Recipe whose `space` field is `undefined`
- **WHEN** `usesSpace(recipe)` is called
- **THEN** it returns `false`

### Requirement: A Space-less Recipe runs author -> bind-media -> gate -> copy -> save with zero Magnific calls

The system SHALL prove, against a throwaway, NOT-wired test fixture Recipe
(`src/recipe/fixtures/space-less-recipe.ts`'s `SPACE_LESS_TEST_RECIPE` — never added to `REGISTRY`,
never offered at Review, never touching the Production Queue), that the six-phase shape every wired
Recipe already uses works end-to-end for a Recipe with no Space: author the candidate Spec and
self-audit it (`auditAuthorPhase`), save it (`specPathFor`/`saveSpec`); bind media via `bindMediaSlots`
with an empty resolutions map (nothing to bind, `ok: true`), self-audited via `auditBindMediaPhase`
(vacuously `ok: true`); the gate phase is a no-op (`recipe.gates` is `[]`, so nothing pauses); compose
Copy the SAME way both wired Recipes do (`composeCopy`, self-audited via `auditCopyPhase`); save the
Asset (`writeAsset`) carrying `spec_path` and `copy` but NO `asset_url`/`asset_paths`/`pending_gate` —
nothing was ever rendered by a Space. The proving test file SHALL import NEITHER a `SpaceMcpPort` NOR
any Magnific fake (`FakeSpace`/`FakeCarouselSpace`) — their absence is itself the "zero Magnific calls"
proof, since there is no Space-interaction code path for a Space-less Recipe's job to exercise at all.

#### Scenario: The fixture Recipe's author, copy, and save phases produce a valid, ledger-recorded Asset

- **GIVEN** `SPACE_LESS_TEST_RECIPE` and a valid candidate Spec built from its own fixture builder
- **WHEN** the Spec is authored/self-audited/saved, Copy is composed/self-audited, and the Asset is
  written via `writeAsset`
- **THEN** the ledger's Asset for this Recipe has `status: "produced"`, a `spec_path`, and a `copy`
  whose caption satisfies the Recipe's own `copyShape`

#### Scenario: The saved Asset carries no asset_url, no asset_paths, and no pending_gate

- **GIVEN** the same Space-less run
- **WHEN** the saved Asset is loaded back via `loadIdeaAssets`
- **THEN** `asset_url`, `asset_paths`, and `pending_gate` are all `undefined` — no Space ever rendered
  any media, and this zero-gate Recipe's Asset never carries a pause

#### Scenario: The bind-media phase resolves with nothing bound, never a crash on the absent canvas

- **GIVEN** `SPACE_LESS_TEST_RECIPE` (no `canvasInputs`) and an empty resolutions map
- **WHEN** `bindMediaSlots(recipe, {})` is called, then `auditBindMediaPhase(recipe, { boundSlotNames:
  bindResult.boundSlotNames })`
- **THEN** both calls return `ok: true`, with nothing bound and an empty audit `items` list
