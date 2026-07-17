## ADDED Requirements

### Requirement: resolveIdeaFormat resolves an Idea's Format from its ledger record, defensively

The system SHALL provide `resolveIdeaFormat(idea, ideaId)` (`src/producer/resolve-format.ts`), a pure
function that resolves the Format slug governing an Idea's production from the ledger's
`LedgerIdea.format` field (`src/ledger/ledger.ts`). When `idea.format` is a non-empty, non-blank
string, it SHALL return `{ ok: true, format }` (trimmed). When `idea.format` is absent, blank, or not
a string — the expected shape for an Idea recorded before multi-format existed — it SHALL return
`{ ok: false, message }`, where `message` names `ideaId` and explains the Idea carries no Format,
never a fabricated/guessed default. The function SHALL never throw for any input shape.

`src/ledger/ledger.ts`'s `LedgerIdea` SHALL carry an optional `format?: string` field, read through
UNCHANGED by `loadIdeas` (mirroring how `recipes` is already carried through): a well-formed string is
included; a missing, non-string, or blank raw value is OMITTED entirely (never included as
`undefined`, never fabricated) — an old ledger record with no `format` at all continues to load
without error.

#### Scenario: An Idea with a recorded Format resolves ok

- **GIVEN** a ledger Idea record whose `format` is `"unhypped-news"`
- **WHEN** `resolveIdeaFormat(idea, "idea-01")` is called
- **THEN** it returns `{ ok: true, format: "unhypped-news" }`

#### Scenario: An Idea with no Format recorded (a pre-multi-format record) STOPs, never crashes

- **GIVEN** a ledger Idea record with no `format` field at all
- **WHEN** `resolveIdeaFormat(idea, "idea-01")` is called
- **THEN** it returns `{ ok: false, message }` where `message` names `"idea-01"` and states the Idea
  carries no Format, and the call does not throw

#### Scenario: loadIdeas carries a recorded format through; omits a missing/garbled one entirely

- **GIVEN** a ledger with one Idea record carrying `format: "unhypped-news"` and another with no
  `format` field
- **WHEN** `loadIdeas(path)` is called
- **THEN** the first Idea's `format` is `"unhypped-news"` and the second Idea's `format` is
  `undefined` (the key entirely absent from the returned object, mirroring how `recipes` is omitted)

### Requirement: bindMediaSlots resolves a Recipe's declared media slots, STOPping on a missing REQUIRED one

The system SHALL provide `bindMediaSlots(recipe, resolutions)` (`src/producer/bind-media.ts`), a pure
function that walks `recipe.canvasInputs.mediaSlots` (`src/recipe/registry.ts`) against an
already-looked-up `MediaSlotResolutions` map (slot name -> `{ kind, found, ... }`, supplied by the
caller — this module performs no I/O, no `BrandAssetStore` call, no Magnific call itself). For each
slot: a `found: true` resolution is BOUND (added to the result's `bound` list and `boundSlotNames`
set); a REQUIRED slot with no resolution, or a `found: false` one, SHALL STOP the entire bind
immediately, returning `{ ok: false, missingSlot, message }` — `message` SHALL be the looked-up
resolution's own `message` when supplied (e.g. `BrandAssetStore.getBrandAsset`'s own hint), or a
generic ADR-0016 message naming the slot and Recipe otherwise. An OPTIONAL slot with no resolution
SHALL simply be skipped, never blocking. The function SHALL NEVER return `ok: true` with a required
slot left unbound (ADR-0016: never bind a half-complete Asset).

#### Scenario: A found brand-asset slot binds; the bound-slot-names set is ready for auditBindMediaPhase

- **GIVEN** the seeded `news-carousel` Recipe (one required `"Brand Logo"` brand-asset slot) and a
  resolution `{ "Brand Logo": { kind: "brand-asset", found: true, path } }`
- **WHEN** `bindMediaSlots(recipe, resolutions)` is called
- **THEN** it returns `{ ok: true, bound: [{ name: "Brand Logo", ... }], boundSlotNames: Set(["Brand Logo"]) }`

#### Scenario: A found idea-pick slot binds — the character Recipe's Selected Character

- **GIVEN** the seeded `character-explainer-with-cast` Recipe (one required `"Selected Character"`
  idea-pick slot) and a resolution `{ "Selected Character": { kind: "idea-pick", found: true, pick } }`
- **WHEN** `bindMediaSlots(recipe, resolutions)` is called
- **THEN** it returns `ok: true` with that slot bound, carrying the resolved `pick`

#### Scenario: A missing REQUIRED brand-asset slot STOPs with the store's own clear message

- **GIVEN** the seeded `news-carousel` Recipe and a resolution `{ "Brand Logo": { kind: "brand-asset", found: false, message: "Brand Asset \"brand-logo\" not found for Brand \"straw-motion\" ..." } }`
- **WHEN** `bindMediaSlots(recipe, resolutions)` is called
- **THEN** it returns `{ ok: false, missingSlot: "Brand Logo", message }` where `message` is exactly
  the supplied lookup message — never a generic placeholder that discards the real reason

#### Scenario: A REQUIRED slot with NO resolution supplied at all STOPs with a generic ADR-0016 message

- **GIVEN** the seeded `news-carousel` Recipe and an EMPTY resolutions map
- **WHEN** `bindMediaSlots(recipe, {})` is called
- **THEN** it returns `ok: false`, `missingSlot: "Brand Logo"`, and `message` mentions the slot is
  REQUIRED, cites ADR-0016, and states a half-complete Asset is never bound

### Requirement: A gate-free Recipe (News Carousel) runs end-to-end against a second, purpose-built Magnific fake

The system SHALL provide a SECOND Magnific fake, `FakeCarouselSpace`
(`src/producer/fixtures/fake-carousel-space.ts`), implementing the SAME narrow `SpaceMcpPort`
(`src/space-driver/port.ts`) as the character-Recipe's existing `FakeSpace`, but modelling the News
Carousel Recipe's genuinely different canvas shape (a single node that is simultaneously the prompt
node and the sole gateless run-point, plus a named logo-reference node) — never reusing the
character-Recipe fake's hard-coded node names. Driving a News Carousel job's FIRST (and only) leg
through `driveToNextGate` against this fake SHALL bind the Brand Logo media slot (via
`bindMediaAsset`), inject the authored Spec into the Recipe's OWN `canvasInputs.promptNode`, run the
Recipe's sole run-point, and FINISH with the rendered Asset — with NO pause anywhere, since this
Recipe declares zero gates (`Recipe.gates` is `[]`).

#### Scenario: A gate-free News Carousel job runs straight through to a finished Asset

- **GIVEN** the seeded `news-carousel` Recipe (zero declared gates), a `FakeCarouselSpace`, a found
  Brand Logo resolution, and the real, committed Straw Motion carousel Spec fixture (issue #87)
- **WHEN** the Brand Logo is bound via `bindMediaAsset`, then `driveToNextGate` is called with
  `{ kind: "first", targetGate: null, spec, promptNode: recipe.canvasInputs.promptNode }`
- **THEN** the result is `ok: true` with `outcome.kind === "finished"`, carrying the rendered Asset's
  id and URL, and the fake recorded exactly one media-bind edit, one Spec-inject edit, and one render
  run — no pause, no publish action anywhere

#### Scenario: A missing required Brand Asset STOPs the run before any Space call

- **GIVEN** the seeded `news-carousel` Recipe and a `found: false` Brand Logo resolution
- **WHEN** `bindMediaSlots` is called with that resolution
- **THEN** it returns `ok: false` naming the `"Brand Logo"` slot, and a freshly-constructed
  `FakeCarouselSpace` for the same scenario records ZERO edit goals and ZERO runs — the STOP happens
  before any Space interaction is even attempted
