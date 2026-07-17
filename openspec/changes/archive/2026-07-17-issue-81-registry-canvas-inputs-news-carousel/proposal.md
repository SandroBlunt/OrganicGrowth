## Why

Map #70's recipe-architecture wayfinding (ADR-0015–0018) decided the target model for making Recipes
reusable per-Brand, but nothing has been built yet. ADR-0016 says every Recipe's canvas takes **two
typed inputs** — a named **media-slot map** and a **prompt node** — and that a **second Recipe**
("News Carousel") should join the registry as a genuinely different shape (zero gates, several
authored slides, a Brand Logo reference) to prove the registry/driver machinery generalizes, not just
describes one Recipe. The unmerged `issue-60-second-recipe-carousel` salvage branch built a second
Recipe once already, targeting the OLD multi-lane "AI News" canvas — but that canvas was rebuilt
single-lane (map #70 session) and its own build report flagged a real gap: the shared banned-word
scanner never learned to read a carousel Spec's `slides[]` fields, so a banned word in an
`image_prompt` would have silently reached the Space. This issue is the first build slice of the
map-#70 replacement chain: it makes the registry the single source of truth for a Recipe's canvas
(gates, spec shape, copy shape, Space target, AND its two typed canvas inputs), wires the rebuilt
single-lane Carrousel Space as a second, zero-gate Recipe, and closes the banned-word gap for good —
without changing one line of the wired *Character Explainer with Cast* Recipe's behavior.

## What Changes

- **`Recipe` gains typed canvas inputs (ADR-0016).** A new `RecipeCanvasInputs` field (`canvasInputs`)
  holds a named **media-slot map** (`MediaSlotMap`, keyed by slot name, each slot either a
  `brand-asset` slot — `{ kind, media, required, brandAssetKey }`, reused every run from the Brand's
  future Brand Asset store — or an `idea-pick` slot — `{ kind, media, required, gate }`, filled by one
  of this Recipe's own declared gates) and a **prompt node** (the text node name the Producer
  authors/injects its media prompt into). BOTH wired Recipes populate it: the character Recipe gets one
  `idea-pick` slot (`"Selected Character"`, filled by its `"cast"` gate) whose prompt node equals its
  existing Spec-input node (`JSON Master`); the News Carousel Recipe gets one `brand-asset` slot
  (`"Brand Logo"`, image, required, key `"brand-logo"`) whose prompt node is its Space's sole node
  (`"Slides Prompts"`).
- **`RecipeSpaceNodes` widens `pinnedReference`/`castRunPoint` to optional** — they only apply to a
  Recipe with at least one pick-gate; a zero-gate Recipe (News Carousel) sets neither. `specInput` and
  `clipRunPoint` stay required (every Recipe injects a Spec somewhere and has one gateless run-point
  that renders the final Asset — for a zero-gate Recipe, that IS its only run-point).
- **`RecipeSpecShape` gains `scanBannedWords`** — a per-Recipe banned-word scanner living on the
  registry alongside `validate`, so `RecipeSpecShape` is a self-contained description of "how to check
  this Recipe's Spec" (structural AND brand-safety). The character Recipe's is (reference-equal to)
  the existing `production-spec/brand-safety.ts`'s `scanForBannedWords` — unchanged behavior.
- **News Carousel joins the registry** (`slug: "news-carousel"`), wired end-to-end DESCRIPTIVELY:
  zero gates; targets the rebuilt single-lane "Carrousel" Space (one run-point — inject + run
  `"Slides Prompts"` downstream, no gate — `canonicalCarouselProtocol()`, a new sibling to the wired
  Recipe's `canonicalProtocol()`); its own Spec shape (`news-carousel-contract.ts` +
  `news-carousel-validate.ts`, map ticket #77's decided shape: exactly 7 slides, in fixed role order
  `hook -> then -> shift -> proof -> different -> next -> cta`, each slide carrying `slide_index`,
  `role`, `card_style`, `stat_callout`, `text` (≤140 chars), and the full authored `image_prompt`); its
  own banned-word scanner (`news-carousel-brand-safety.ts`) covering EVERY slide text field — `role`,
  `card_style`, `stat_callout`, `text`, `image_prompt` — closing the gap the issue-60 salvage build
  report flagged; its own copy shape (2200 chars / 0–2 emojis — Instagram's real caption cap, an
  editorial voice).
- **`ValidationError.code` widens from the wired Recipe's own closed union to plain `string`** (issue
  #81) so `RecipeSpecShape.validate`'s shared `(spec: unknown) => ValidationResult` signature is
  satisfiable by a DIFFERENT Recipe's validator with its own error-code vocabulary — `validate()`
  itself still only ever produces its own `ValidationCode` values (a subtype of `string`), so this is
  purely additive.
- **`isWiredRecipe` stays the single wiring gate** — no change to `src/recipe/offer.ts`'s logic at all;
  registering News Carousel in `REGISTRY` is sufficient for `offeredRecipes`/`resolveRecipeSelection`
  to offer it the moment any Format lists it in `default_recipes`, and an unwired slug still never
  surfaces. Proven with new tests, not new code.

## Non-Goals (explicitly deferred to later slices in the map-#70 build chain)

- **Brand Asset store** (`data/brands/<slug>/assets/`, `BrandAssetStore`) — issue #82. The News
  Carousel Recipe's `"Brand Logo"` media slot is declared here; nothing reads/binds an actual asset
  file yet.
- **Format Baseline Prompt** (the per-Brand×Format "look" document a Recipe Skill interprets) — issue
  #83.
- **Phase Contracts** (the per-phase checklist the Producer self-audits against) — issue #85 (blocked
  by this issue).
- **The `produce-news-carousel` Skill** that actually authors on-contract slide prompts — issue #87.
- **The thin, recipe-generic Producer** that actually drives ANY wired Recipe (binding media slots,
  running its Space, composing its copy) — issue #88. Today's attended `producer` agent still only
  knows how to drive the character Recipe; re-pointing it at News Carousel is explicitly out of scope
  here, mirroring how issue #54 registered the FIRST Recipe descriptively before issue #57's generic
  driver existed.
- **End-to-end two-Recipe proof** (one Idea -> two Recipes -> two Assets) — issue #89.
- **Live-Space verification of the "Carrousel" canvas** (issue #86, HITL, needs the Operator) — this
  slice's Space id/node names are taken from the Operator-confirmed decisions already captured in the
  map-#70 session notes and the issue's own text, never invented, but are not re-verified against a
  live capture here (the build is hermetic; no Magnific fake is even needed, since no driver code is
  touched — see Impact).

## Capabilities

### Modified Capabilities

- `recipe-registry`: gains the two typed canvas inputs on `Recipe` (media-slot map + prompt node),
  widens `RecipeSpaceNodes`'s gate-specific fields to optional, gains `RecipeSpecShape.scanBannedWords`,
  and gains a second seeded entry (`news-carousel`) proving all of the above on a genuinely different
  shape (zero gates, different Space, different Spec/copy shape).
- `production-spec`: gains the News Carousel Recipe's OWN Spec contract + validator (exactly 7 slides,
  fixed role order, a 140-char text cap) and its OWN banned-word scanner covering every slide text
  field including `image_prompt` — closing the gap the issue-60 salvage build flagged. The wired
  Recipe's own contract/validator/banned-word behavior is unchanged (`ValidationError.code`'s widening
  is a type-only, non-behavioral change).
- `execution-protocol`: gains a second canonical protocol artifact (`canonicalCarouselProtocol()`) for
  the single-lane Carrousel Space — one run-point, `"Slides Prompts"`, `downstream`, no gate — read by
  the registry the same anti-drift way the wired Recipe's `canonicalProtocol()` already is.

## Impact

- **New code:** `src/production-spec/news-carousel-contract.ts` (+`.test.ts`),
  `src/production-spec/news-carousel-validate.ts` (+`.test.ts`),
  `src/production-spec/news-carousel-brand-safety.ts` (+`.test.ts`),
  `src/production-spec/fixtures/news-carousel-specs.ts`.
- **Modified code:** `src/recipe/registry.ts` (+`.test.ts`) — canvas-input types, widened
  `RecipeSpaceNodes`, `RecipeSpecShape.scanBannedWords`, the second seeded entry;
  `src/execution-protocol/protocol.ts` (+`.test.ts`) — `canonicalCarouselProtocol()`;
  `src/production-spec/validate.ts` — `ValidationError.code` widened to `string` (additive, no
  behavior change to `validate()` itself); `src/recipe/offer.test.ts` — new cases proving AC4
  generalizes to the newly-wired slug.
- **Not touched:** `src/recipe/offer.ts` (its logic was already generic — issue #54's own design),
  `src/space-driver/driver.ts` (the generic `driveToNextGate` already drives a zero-gate, single-run-
  point Recipe unmodified — a first leg with `targetGate: null` injects the Spec, runs the sole
  run-point, and finishes, exactly the News Carousel Recipe's shape), `src/production-spec/brand-
  safety.ts` (the wired Recipe's own scanner, referenced not modified), `.claude/agents/producer.md`,
  `data/brands/**/formats/*.yaml` (no Format is updated to offer `news-carousel` — a product/content
  decision left for later, mirroring the issue-60 salvage build's own precedent), `CONTEXT.md`/
  `CLAUDE.md` (their "today one Recipe is wired" framing is left for a later slice once the Recipe is
  actually drivable end-to-end, not just registry-wired — again mirroring the issue-60 precedent, which
  registered a second Recipe without touching either doc).
- **Hermetic:** no Magnific fake is even needed for this slice — no driver/Space-interaction code is
  touched, so there is nothing new to exercise through the fake boundary. Every new module is a pure,
  deterministic deep module (contract types, a validator, a banned-word scanner, a protocol artifact)
  tested with plain in-memory fixtures. No live `spaces_*`/`creations_*` call anywhere.
- **Always-rules upheld:** generate-never-publish (no publish code touched); the banned-word hard
  filter (rule 9) is STRENGTHENED, not weakened — a carousel Spec's every text field is now scannable,
  closing a real gap; public-metrics-only/relative-not-absolute/explicit-attribution are unaffected (no
  metrics/attribution code touched); ledger-as-source-of-truth is unaffected (no ledger write path
  touched — News Carousel is not yet producible, so no Asset for it is ever written).
