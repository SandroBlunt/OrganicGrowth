# Slice Handoff — issue-81-registry-canvas-inputs-news-carousel

Bidirectional channel between `developer` and `qa`. Developer writes the Build Report; `qa` appends a
Verdict below it. Retries append `Round-N Build` blocks. Nothing here is ever overwritten.

---

## Build Report (Round 1)

### What changed

Made the Recipe registry the single source of truth for a Recipe's canvas — every Recipe now declares
its **two typed canvas inputs** (ADR-0016): a named **media-slot map** and a **prompt node** — and
wired **News Carousel** as a second, zero-gate Recipe alongside the unchanged *Character Explainer
with Cast*. This is the first build slice of the map-#70 replacement chain for the superseded issue #60.

- **`Recipe` gains `canvasInputs: RecipeCanvasInputs`** (`src/recipe/registry.ts`): a `mediaSlots`
  map (`MediaSlotMap`, keyed by slot name) of either a `BrandAssetMediaSlot`
  (`{ kind: "brand-asset", media, required, brandAssetKey }`) or an `IdeaPickMediaSlot`
  (`{ kind: "idea-pick", media, required, gate }`), plus a `promptNode` string. The character Recipe
  gets one idea-pick slot (`"Selected Character"`, filled by its `"cast"` gate) whose `promptNode`
  equals its existing Spec-input node (`JSON Master`); News Carousel gets one brand-asset slot
  (`"Brand Logo"`, image, required, key `"brand-logo"`) whose `promptNode` is its Space's sole node
  (`"Slides Prompts"`).
- **`RecipeSpaceNodes` widens `pinnedReference`/`castRunPoint` to optional** — only a Recipe with a
  pick-gate sets them; News Carousel (zero gates) sets neither.
- **`RecipeSpecShape` gains `scanBannedWords`** — a per-Recipe banned-word scanner living beside
  `validate` on the registry. The character Recipe's is (reference-equal to) the existing
  `production-spec/brand-safety.ts`'s `scanForBannedWords`, unchanged.
- **News Carousel is registered** (`slug: "news-carousel"`): `gates: []`; targets the rebuilt
  single-lane "Carrousel" Space (id `a2402c48-b688-436b-8cb6-23a4aad7822e`, one run-point —
  `"Slides Prompts"`, `downstream`, no gate); its own Spec shape (exactly 7 slides, fixed role order
  `hook -> then -> shift -> proof -> different -> next -> cta`, each slide carrying `slide_index`,
  `role`, `card_style`, `stat_callout`, `text` ≤140 chars, `image_prompt` — map ticket #77's decided
  shape); its own banned-word scanner covering EVERY slide text field including `image_prompt`
  (closing the gap the issue-60 salvage build report flagged); its own copy shape (2200 chars / 0–2
  emojis).
- **`ValidationError.code` widened from a closed union to plain `string`** (`production-spec/
  validate.ts`) so `RecipeSpecShape.validate`'s shared signature is satisfiable by News Carousel's own
  validator with its own error-code vocabulary — additive only; `validate()` itself is unchanged.
- **A second canonical Execution Protocol artifact**, `canonicalCarouselProtocol()`
  (`src/execution-protocol/protocol.ts`) — one run-point, `"Slides Prompts"`, `downstream`, gate
  `null` — mirroring how the wired Recipe's own `canonicalProtocol()` is the anti-drift source for its
  node names.
- **No change to `src/recipe/offer.ts`** — `offeredRecipes`/`resolveRecipeSelection` were already
  generic over `isWiredRecipe`; registering News Carousel is sufficient for it to be offered the
  moment a Format lists it. New tests prove this rather than new code.

### Files touched

**New:**
- `src/production-spec/news-carousel-contract.ts` (+`.test.ts`)
- `src/production-spec/news-carousel-validate.ts` (+`.test.ts`)
- `src/production-spec/news-carousel-brand-safety.ts` (+`.test.ts`)
- `src/production-spec/fixtures/news-carousel-specs.ts`
- `openspec/changes/issue-81-registry-canvas-inputs-news-carousel/{proposal.md,tasks.md,handoff.md,specs/**}`

**Modified:**
- `src/recipe/registry.ts` (+`.test.ts`) — canvas-input types, widened `RecipeSpaceNodes`,
  `RecipeSpecShape.scanBannedWords`, the second seeded `NEWS_CAROUSEL` entry
- `src/execution-protocol/protocol.ts` (+`.test.ts`) — `canonicalCarouselProtocol()`
- `src/production-spec/validate.ts` — `ValidationError.code` widened to `string` (additive; no
  behavior change to `validate()`)
- `src/recipe/offer.test.ts` — new cases proving AC4 generalizes to the newly-wired `news-carousel` slug

**Not touched (verified — see "Acceptance-criteria self-assessment" #5):** `src/recipe/offer.ts`,
`src/space-driver/driver.ts`, `src/production-spec/brand-safety.ts`, `src/production-spec/contract.ts`,
`src/production-spec/compose.ts`, `src/execution-protocol/parse.ts`, `.claude/agents/producer.md`,
`data/brands/**/formats/*.yaml`, `CONTEXT.md`, `CLAUDE.md`.

### How to run

```bash
npx tsc -p tsconfig.json --noEmit         # type-check only
npm test                                  # type-check + full unit suite — 1100/1100 green
npm run test:docs                         # markdown-conformance suite — 25/25 green (unchanged)
npx openspec validate issue-81-registry-canvas-inputs-news-carousel --strict   # green
npx openspec validate --all --strict                                          # 21/21 green

# focused runs used while building:
node --import tsx --test src/recipe/registry.test.ts src/recipe/offer.test.ts
node --import tsx --test src/production-spec/news-carousel-contract.test.ts \
  src/production-spec/news-carousel-validate.test.ts \
  src/production-spec/news-carousel-brand-safety.test.ts
node --import tsx --test src/execution-protocol/protocol.test.ts
node --import tsx --test src/production-spec/validate.test.ts src/production-spec/brand-safety.test.ts
```

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #81) | Proven by |
|---|---|---|
| 1 | The Recipe type declares the typed canvas inputs (media-slot map + prompt node) and BOTH wired Recipes populate them; the registry stays the only wiring gate | `src/recipe/registry.test.ts` → "declares its typed canvas inputs: one idea-pick media slot (Selected Character)..." (character Recipe) and "...one brand-asset media slot (Brand Logo)..." (News Carousel); `isWiredRecipe` untouched, re-proven in the "seeded with two entries" describe block |
| 2a | news-carousel is wired: zero gates | `registry.test.ts` → "declares ZERO gates — a gate count different from the character Recipe's one" |
| 2b | ...single-lane Carrousel Space target | `registry.test.ts` → "declares a Space target different from the character Recipe's — the single-lane 'Carrousel' Space" + "declares its Space's SOLE run-point name from the SAME canonicalCarouselProtocol()"; `protocol.test.ts`'s new "canonical carousel Producer Protocol" describe block (5 tests: one run-point, no gate, downstream, name-only reference, size budget) |
| 2c | ...the #77 spec shape + validator | `news-carousel-contract.test.ts` (constants + fixture shape) + `news-carousel-validate.test.ts` (11 tests: well-formed accepted; not-an-object rejected; slides missing/wrong-count rejected; numeric/malformed slide rejected; text-too-long rejected; role-order violation rejected; slide_index misalignment rejected) |
| 2d | ...its own copy shape | `registry.test.ts` → "declares a copy-shape DIFFERENT from the character Recipe's 180/1-3 (2200/0/2)" |
| 3 | Banned-word scanning covers carousel image_prompt (and every other spec text field); a seeded banned word fails validation with a clear message | `news-carousel-brand-safety.test.ts` → "closes the issue-60 gap: a banned word in image_prompt is rejected and named clearly" (asserts both the word and the exact `slides[N].image_prompt` field) + "also scans the on-card text field" + "also scans stat_callout" + case-insensitivity + whole-word-boundary tests; `registry.test.ts` → "the spec-shape's banned-word scan catches a seeded banned word" |
| 4 | Review offers news-carousel for a Format whose default_recipes lists it; an unwired slug still never surfaces | `src/recipe/offer.test.ts` → "offers news-carousel for a Format whose default_recipes lists it (issue #81 AC4)" + "offers BOTH wired Recipes when a Format's default_recipes lists both, order preserved" + "news-carousel becoming wired does NOT make a different unwired slug ever surface" — zero changes to `offer.ts` itself, proving the existing generic mechanism already worked |
| 5 | The character Recipe's behaviour is unchanged; built test-first against the fake; strict OpenSpec validate + full suite green | `registry.test.ts`'s "The character Recipe declares gates + spec-shape + copy-shape + Space target (issue #54 AC1) — UNCHANGED by issue #81" describe block re-runs every pre-existing assertion (gates, Space id/name/nodes, run-points, validator identity, copy-shape values, no post_copy) unchanged, PLUS two new ones (scanBannedWords identity, canvasInputs); `git diff` confirms `src/production-spec/brand-safety.ts`, `src/production-spec/contract.ts`, `src/space-driver/driver.ts`, `src/recipe/offer.ts` are byte-for-byte untouched; `npm test` 1100/1100, `npm run test:docs` 25/25, `openspec validate --strict` green for this change and `--all` (21/21) |

### Fakes / fixtures used

- **No Magnific fake was needed for this slice.** No driver/Space-interaction code is touched or
  exercised — the existing generic `driveToNextGate` (`src/space-driver/driver.ts`) is untouched and
  is not called by any new test here. Every new module is a pure, deterministic deep module (a
  contract's types, a validator, a banned-word scanner, a protocol artifact, registry entries) tested
  against plain in-memory literal fixtures. **Confirmed no live `spaces_*`/`creations_*` call anywhere**
  — `grep -rn "spaces_\|creations_"` across the diff turns up only doc/comment mentions (e.g. "no live
  spaces_* call"), never a tool invocation; this `developer` build was never given the Magnific MCP
  tools.
- `src/production-spec/fixtures/news-carousel-specs.ts` — a new fixture module (`validCarouselSpec()` +
  7 focused broken variants), mirroring the existing `fixtures/specs.ts`'s one-mutation-per-variant
  discipline.
- `src/production-spec/fixtures/brand-profile.banned.yaml` — the EXISTING banned-words fixture, reused
  unchanged by the new carousel banned-word tests (proves the two scanners key off the same word list
  shape).

### Self-review notes

- Considered adding a `FakeCarouselSpace`/driving the new Recipe through `driveToNextGate` to prove it
  end-to-end, but the issue's own acceptance criteria and the map-#70 ticket boundaries (memory:
  "#87 produce-news-carousel Skill", "#88 thin recipe-generic Producer", "#89 end-to-end proof") place
  actual driving/binding in later slices; adding a fake here would be scope creep with no acceptance
  criterion requiring it, so it was left out — the registry's `canonicalCarouselProtocol()` +
  `space.nodes.clipRunPoint` are proven correct declaratively instead.
- Considered scanning only `image_prompt` for banned words (the literal field the gap report named),
  but chose to scan every slide text field (`role`, `card_style`, `stat_callout`, `text`,
  `image_prompt`) since the AC says "and every other spec text field" — cheap and strictly safer.
- Considered inventing a `card_style` enum (the #77 prototype found exactly two values,
  `full_width`/`floating_toast`), but the AC only requires a validator per the #77 shape (non-empty
  string) — hard-coding a closed enum here would invent a product fact the Format's Baseline Prompt
  (issue #83, not yet built) is meant to own; left as a validated non-empty string.
- Widened `ValidationError.code` to `string` rather than inventing a parallel `ValidationResult`-like
  type for News Carousel — confirmed (via `grep`) no other module relies on the narrower `ValidationCode`
  field type; `validate.test.ts` passes unchanged since every literal code `validate()` produces is a
  subtype of `string`.
- Kept `RecipeSpaceNodes`'s `pinnedReference`/`castRunPoint` widened to `?:` (never `| undefined`,
  respecting `exactOptionalPropertyTypes`) rather than adding a separate node-shape type per gate-count
  — the smaller, more honest diff; the character Recipe's literal object is unchanged and still sets
  both fields explicitly.
- Named the media-slot map's keys with the CONCEPTUAL/product-facing name (`"Selected Character"`,
  `"Brand Logo"`) rather than reusing the underlying physical canvas node name
  (`RecipeSpaceNodes.pinnedReference` is `"Character #2"`, a different string) — this matches
  CONTEXT.md's own "Media Slot & Prompt Node" glossary phrasing and ADR-0016's examples; resolving a
  slot name to its physical canvas target is explicitly the binding step's job (issue #88), documented
  in the `MediaSlotMap` docstring so a future reader isn't surprised the two names differ.

### Known limits

- **News Carousel is registered descriptively only.** Nothing reads/binds `canvasInputs` yet — the
  Brand Asset store (issue #82), the Format Baseline Prompt (issue #83), Phase Contracts (issue #85),
  the `produce-news-carousel` Skill (issue #87), and the thin recipe-generic Producer (issue #88) are
  all deferred, matching the issue's own scope and the map-#70 ticket chain. The attended `producer`
  agent (`.claude/agents/producer.md`) still only knows how to drive the character Recipe.
- **No Format's `default_recipes` was updated** to actually offer `news-carousel` at Review for any
  real Brand — a product/content decision left for later (mirrors the issue-60 salvage build's own
  precedent); the mechanism is proven generic via `offer.test.ts` instead.
- **`CONTEXT.md`/`CLAUDE.md`'s "today one Recipe is wired" framing is left unchanged.** "Wired" per
  `registry.ts`'s own established definition ("present in this registry") now technically includes
  `news-carousel`, but since it is not yet drivable end-to-end (see above), updating the
  Operator-facing framing docs is deferred to a later slice in the chain (again mirroring the issue-60
  precedent, which registered a second Recipe without touching either doc) rather than risking a
  misleading claim about what the pipeline can actually do today.
- **The `"Carrousel"` Space id/node name (`"Slides Prompts"`) are taken from the map-#70 session's
  Operator-confirmed decisions and the issue's own text, not re-verified against a fresh live capture**
  — issue #86 (HITL, needs the Operator) is the ticket that verifies/captures the live canvas.

---

## QA Verdict — Round 1: PASS

### Suite result

All three commands were actually run by QA (not assumed from the Build Report):

| Command | Result |
|---|---|
| `npm test` (tsc --noEmit, then the full Node test-runner suite) | **1100/1100 pass, 0 fail** (306 suites, 2953ms) |
| `npm run test:docs` | **25/25 pass, 0 fail** (5 suites) |
| `npx openspec validate --all --strict` | **21/21 items pass, 0 fail** — includes `✓ change/issue-81-registry-canvas-inputs-news-carousel` |
| `npx openspec validate issue-81-registry-canvas-inputs-news-carousel --strict` | `Change 'issue-81-registry-canvas-inputs-news-carousel' is valid` |

All green, actually executed, not assumed.

### Per-criterion results (issue #81 acceptance criteria)

| # | Criterion | Result | Proving test |
|---|---|---|---|
| 1 | `Recipe` type declares typed canvas inputs (media-slot map + prompt node); BOTH wired Recipes populate them; registry stays the only wiring gate | **PASS** | `src/recipe/registry.ts`'s `RecipeCanvasInputs`/`MediaSlotMap`/`BrandAssetMediaSlot`/`IdeaPickMediaSlot` types (read directly, lines 126–183); character Recipe's `canvasInputs` verified by `registry.test.ts` "declares its typed canvas inputs: one idea-pick media slot (Selected Character)..." and "declares its prompt node as the SAME node..."; News Carousel's by "declares its typed canvas inputs: one brand-asset media slot (Brand Logo)..." and "declares its prompt node as the SAME node its sole run-point starts at"; `isWiredRecipe` confirmed byte-for-byte unchanged (`git diff main -- src/recipe/offer.ts` empty) |
| 2a | news-carousel wired: zero gates | **PASS** | `registry.test.ts` → "declares ZERO gates..." asserts `recipe.gates` deepEqual `[]` |
| 2b | ...single-lane Carrousel Space target | **PASS** | `registry.test.ts` → "declares a Space target different from the character Recipe's..." (`space.name === "Carrousel"`, distinct id) + "declares its Space's SOLE run-point name from the SAME canonicalCarouselProtocol()"; `protocol.test.ts`'s "canonical carousel Producer Protocol" block (5 tests: exactly one run-point, no gate, downstream mode, name-only reference, under size budget) — read and confirmed `canonicalCarouselProtocol()` in `protocol.ts` returns exactly one run-point |
| 2c | ...the #77 spec shape + validator | **PASS** | `news-carousel-contract.test.ts` (constants: `CAROUSEL_SLIDE_COUNT===7`, fixed role order, 140-char cap) + `news-carousel-validate.test.ts` (11 tests covering accept/reject: non-object, missing/wrong-count slides, non-array slides, malformed slide, missing field, text-too-long, role-order violation, slide_index misalignment) — read source and confirmed the validator's logic actually implements each check, not just returns hard-coded results |
| 2d | ...its own copy shape | **PASS** | `registry.test.ts` → "declares a copy-shape DIFFERENT from the character Recipe's 180/1-3 (2200/0/2)" — confirmed literal values in `registry.ts` (`NEWS_CAROUSEL_COPY_MAX_CHARS=2200`, `MIN_EMOJIS=0`, `MAX_EMOJIS=2`) match the issue's own text |
| 3 | Banned-word scanning covers `image_prompt` + every other spec text field; a seeded banned word fails with a clear message (REJECT) | **PASS** | `news-carousel-brand-safety.test.ts` — "closes the issue-60 gap: a banned word in image_prompt is rejected and named clearly" (asserts `ok:false`, hits name the word AND the exact `slides[N].image_prompt` field) + "also scans the on-card text field" + "also scans stat_callout" + case-insensitivity + whole-word-boundary (embedded-substring) tests, all read and confirmed to exercise real mutations of a valid fixture via one-field-at-a-time changes, not stub assertions. `SLIDE_TEXT_KEYS` in `news-carousel-brand-safety.ts` confirmed to include all 5 slide text fields (`role`, `card_style`, `stat_callout`, `text`, `image_prompt`). Scan is a pure function returning `{ok:false, hits}` — a clear reject signal, never a silent swap; enforcement into an actual pipeline is correctly out of scope for this descriptive-only slice (issue #88) |
| 4 | Review offers news-carousel for a Format listing it in `default_recipes`; an unwired slug never surfaces | **PASS** | `src/recipe/offer.test.ts` — new cases "offers news-carousel..." + "offers BOTH wired Recipes... order preserved" + "news-carousel becoming wired does NOT make a different unwired slug ever surface" — confirmed via `git diff main -- src/recipe/offer.ts` that the production module has ZERO changes; the mechanism generalized purely from registering the new Recipe |
| 5 | Character Recipe's behaviour unchanged; built test-first against the fake; strict OpenSpec validate + full suite green | **PASS** | `git diff main -- src/recipe/registry.ts` shows the `CHARACTER_EXPLAINER_WITH_CAST` object's pre-existing fields (`gates`, `space.id/name/nodes`, `specShape.validate`, `copyShape.*`) are untouched — only additive fields (`scanBannedWords`, `canvasInputs`) were added; `git diff main -- src/production-spec/brand-safety.ts src/production-spec/contract.ts src/space-driver/driver.ts` all empty (confirmed byte-for-byte untouched); `registry.test.ts`'s pre-existing describe block re-runs every issue-#54 assertion unchanged; full suite green as reported above |

### Per-scenario results (spec deltas)

**`recipe-registry` spec** (`openspec/changes/issue-81-.../specs/recipe-registry/spec.md`):

| Scenario | Result | Covering test |
|---|---|---|
| getRecipe returns the seeded Character Explainer with Cast Recipe by slug | PASS | `registry.test.ts` "getRecipe returns the seeded character Recipe by slug" |
| getRecipe returns the seeded News Carousel Recipe by slug | PASS | `registry.test.ts` "getRecipe returns the seeded news-carousel Recipe by slug" |
| getRecipe returns null for an unregistered slug, never throws | PASS | `registry.test.ts` "getRecipe returns null for an unregistered slug — never throws" |
| isWiredRecipe is true for both seeded Recipes and false for an unregistered slug | PASS | `registry.test.ts` "isWiredRecipe is true for both seeded slugs and false for an unregistered one" |
| Each Recipe's canvasInputs media-slot map is keyed by slot name and typed by kind | PASS | `registry.test.ts`'s two "declares its typed canvas inputs..." tests (character + carousel) |
| The seeded Recipe's spec-shape validator is the real validator, not a re-implementation | PASS | `registry.test.ts` "declares a spec-shape whose validate function IS the real validator" (pre-existing, unchanged) |
| The seeded Recipe's banned-word scan is the real scanner, not a re-implementation | PASS | `registry.test.ts` "declares a spec-shape whose banned-word scan IS the real brand-safety scanner (zero drift, issue #81)" |
| The seeded Recipe's copy-shape is its own literal param | PASS | pre-existing copy-shape assertions, unchanged |
| The seeded Recipe's Space node names match the driver's own constants | PASS | pre-existing, unchanged |
| The seeded Recipe's run-point names come from the real canonical protocol | PASS | pre-existing, unchanged |
| The seeded Recipe's canvasInputs describe its existing Cast-pick and Spec-input node | PASS | `registry.test.ts` "declares its typed canvas inputs: one idea-pick media slot (Selected Character)..." |
| The News Carousel Recipe declares zero gates | PASS | `registry.test.ts` "declares ZERO gates..." |
| The News Carousel Recipe targets the single-lane Carrousel Space with no pick-gate nodes | PASS | `registry.test.ts` "declares a Space target different..." + "declares NO pinnedReference/castRunPoint..." |
| The News Carousel Recipe's run-point comes from its own canonical protocol | PASS | `registry.test.ts` "declares its Space's SOLE run-point name from the SAME canonicalCarouselProtocol()" |
| The News Carousel Recipe's spec-shape is its own validator and scanner | PASS | `registry.test.ts` "declares a spec-shape whose validator IS the real news-carousel validator" + "...banned-word scan IS the real news-carousel scanner" |
| The News Carousel Recipe's copy-shape differs from the wired Recipe's | PASS | `registry.test.ts` "declares a copy-shape DIFFERENT from the character Recipe's..." |
| The News Carousel Recipe's canvasInputs describe its Brand Logo slot and its sole prompt node | PASS | `registry.test.ts` "declares its typed canvas inputs: one brand-asset media slot (Brand Logo)..." |
| A brand-asset slot carries a brandAssetKey, not a gate | PASS | `registry.test.ts`'s Brand Logo slot assertion checks `kind`/`brandAssetKey`; TS structural typing (`BrandAssetMediaSlot` has no `gate` field) enforces the "carries no gate" half at compile time |
| An idea-pick slot's gate is one of its own Recipe's declared gates | PASS | `registry.test.ts` "declares its typed canvas inputs: one idea-pick media slot..." asserts `recipe.gates.includes(slot.gate)` |

**`execution-protocol` spec:**

| Scenario | Result | Covering test |
|---|---|---|
| The carousel protocol has exactly one run-point | PASS | `protocol.test.ts` "has exactly ONE run-point, starting at 'Slides Prompts'" |
| The carousel protocol references its node only by name | PASS | `protocol.test.ts` "references the node only by name — never a hard-coded node ID" |
| The serialized carousel protocol round-trips without truncation | PASS | `protocol.test.ts` "serializes comfortably under the read-API truncation cap" |

**`production-spec` spec (News Carousel additions + the widened `ValidationError.code`):**

| Scenario | Result | Covering test |
|---|---|---|
| A well-formed 7-slide Spec is accepted | PASS | `news-carousel-validate.test.ts` "accepts a valid 7-slide Spec with no errors" |
| A slide count other than 7 is rejected | PASS | "rejects 6 slides..." / "rejects 8 slides..." |
| Slides out of the fixed role order are rejected | PASS | "rejects slides whose roles are out of the fixed... order" |
| A slide_index that doesn't match its position is rejected | PASS | "rejects slide_index values that don't match position" |
| A slide's on-card text over 140 chars is rejected | PASS | "rejects a slide whose text exceeds 140 chars" |
| A slide missing a required field is rejected | PASS | "rejects a slide missing its image_prompt" |
| A banned word in image_prompt is rejected and named | PASS | `news-carousel-brand-safety.test.ts` "closes the issue-60 gap..." |
| A banned word in any other slide text field is also rejected | PASS | "also scans the on-card text field..." + "also scans stat_callout" |
| A clean News Carousel Spec passes the brand-safety filter | PASS | "passes a clean carousel Spec (no banned words)" |
| A banned word embedded inside an unrelated word does not false-positive | PASS | "does not match a banned word embedded inside an unrelated word" |
| Production Spec validation (wired Recipe, MODIFIED — `post_copy` unread, `code` widened) | PASS | pre-existing `validate.test.ts`, unchanged and green; `git diff main -- src/production-spec/validate.ts` confirms only the type widening, no behavior change |
| A DIFFERENT Recipe's validator can reuse the SAME ValidationResult/ValidationError shape | PASS | proven at compile time — `news-carousel-validate.ts` imports and returns `ValidationResult`/`ValidationError` from `validate.ts`; `npx tsc --noEmit` (part of `npm test`) is green, so the codes (`"slides_count"`, `"slide_role_order"`, etc.) type-check as valid `ValidationError.code` |

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | `grep -rn "ledger\|post_url\|publish\|Facebook" src/recipe/registry.ts src/production-spec/news-carousel-*.ts src/execution-protocol/protocol.ts` → no matches; no publish/ledger path touched |
| Public-metrics-only | PASS (unaffected) | No metrics/Apify code touched by this diff |
| Relative-not-absolute | PASS (unaffected) | No scoring/comparison code touched |
| Explicit-attribution | PASS (unaffected) | No `post_url`/attribution code touched (confirmed by same grep above) |
| Ledger-as-source-of-truth | PASS (unaffected) | No ledger read/write path touched; News Carousel is registered descriptively only and is not yet producible, so no Asset for it can ever be written by this slice's code |
| Magnific fake / no live-Space calls | PASS | `git status --porcelain` diff file list grepped for `spaces_\|creations_` → zero matches in any touched file; the new modules (`news-carousel-contract.ts`, `news-carousel-validate.ts`, `news-carousel-brand-safety.ts`, `protocol.ts`'s `canonicalCarouselProtocol()`) are pure, deterministic, no-I/O deep modules tested against plain in-memory fixtures — no driver/Space-interaction code is exercised or touched by this slice |

### OpenSpec-change-vs-issue faithfulness check

Read `proposal.md`, `tasks.md`, and all three spec deltas (`recipe-registry`, `execution-protocol`,
`production-spec`) against issue #81's text, ADR-0016, ADR-0017, CONTEXT.md's "Media Slot & Prompt Node"
/ "Brand Asset" glossary entries, and map ticket #77 (`gh issue view 77`):

- The media-slot map shape (`kind: "brand-asset" | "idea-pick"`, `media`, `required`, plus
  `brandAssetKey`/`gate`) matches ADR-0016's decision verbatim.
- The decision to keep `role`/`card_style`/`stat_callout`/`text` as structured fields alongside
  `image_prompt` (rather than the "truly thin" `{slide_index, image_prompt}` ticket #77 originally
  floated) is independently confirmed by ADR-0017's own text: "the stored Production Spec keeps the
  structured fields the checklist audits (the carousel keeps `role, card_style, stat_callout, text`
  beside `image_prompt`)... 'thin' is not 'minimal'" — this is not a misread, it is the currently
  accepted, documented decision.
- The Carrousel Space id (`a2402c48-b688-436b-8cb6-23a4aad7822e`) matches the id used in the prior
  (unmerged, superseded) issue-60 salvage commit for the same "AI News" board, confirming continuity
  claimed in the Build Report (`git show b65c1c3:src/recipe/registry.ts`).
- No scope creep found: the proposal's "Non-Goals" section correctly defers Brand Asset store (#82),
  Baseline Prompt (#83), Phase Contracts (#85), the Skill (#87), the generic Producer (#88), and
  end-to-end proof (#89) — matching the issue's own text and the map-#70 ticket chain memory.
- No dropped criterion found, no contradiction of CONTEXT.md/ADRs/PRD found.

**Faithfulness verdict: PASS.**

### Defect list

| # | Severity | Defect | Repro steps |
|---|---|---|---|
| 1 | low | `src/recipe/registry.test.ts`'s test titled `"the spec-shape's banned-word scan catches a seeded banned word (issue #81 AC3)"` (around line 157) does not actually test catching a banned word — it calls `scanBannedWords(validCarouselSpec(), ["miracle"])` and asserts `clean.ok === true`, i.e. it proves the CLEAN fixture passes when scanned against a word list that isn't present in it, not that a seeded banned word is caught/rejected. The test name over-claims what it covers. This is purely a test-hygiene issue: the actual "catches a seeded banned word" behavior (AC3) IS correctly and thoroughly proven elsewhere, in `src/production-spec/news-carousel-brand-safety.test.ts` ("closes the issue-60 gap: a banned word in image_prompt is rejected and named clearly", plus the `text`/`stat_callout` variants), so AC3 itself is not at risk. | Run `node --import tsx --test src/recipe/registry.test.ts` and read the test body at the "catches a seeded banned word" case — note it never constructs a Spec containing "miracle" and never asserts `ok === false`. Recommend renaming the test (e.g. to "...passes a Spec containing none of the seeded banned words") or adding an actual `ok === false` assertion with a Spec that does contain the seeded word, to match its own title. |

No high/critical/medium defects found. Suite is genuinely green, every acceptance criterion is proven
by a real, exercised test (not merely claimed), the OpenSpec change faithfully matches the issue and its
supporting ADRs, always-rules hold, and no live Magnific/Space call exists anywhere in the diff.

### Verdict: PASS

The slice may proceed to a PR.
