## Why

ADR-0009 splits "format" into **Format** (a Brand's editorial line, issue #53 — already built) and
**Recipe** (a brand-agnostic production plan — how one Idea becomes one Asset via a named Space, its
own gates, its own Spec/copy shape). ADR-0010 says a Recipe is **defined in this repo**, not on the
Space canvas, and that the registry should be **seeded with exactly ONE entry** — "Character Explainer
with Cast" — wrapping today's existing spec shape, Execution Protocol, and cast/clip gates
**unchanged**. Issue #53 already added `default_recipes` to every Format file as free-text, explicitly
deferring validation against a real registry to this issue. Without the registry, `default_recipes` is
an unenforced string list and `/review-ideas` has no way to know which Recipes actually exist —
issue #54 closes that gap: a typed `Recipe` registry keyed by slug, and `/review-ideas` wired to
pre-fill/offer/decline against it.

## What Changes

- **Add a `Recipe` type + in-repo registry** (`src/recipe/registry.ts`), keyed by slug. Each Recipe
  declares: its ordered **gate list** (zero..many human picks), its **Production-Spec shape** (a
  description plus the validator function that enforces it), its **copy shape** (length/emoji
  constraints), and **which Space it drives** (id + name) **plus the on-canvas node names it
  touches** (the Spec-input node, the pinned-reference node, and the cast/clip run-point names).
  `getRecipe(slug)`, `listRecipes()`, `listWiredRecipeSlugs()`, and `isWiredRecipe(slug)` are the
  read API; `isWiredRecipe` is the **single, sole gate** for whether a Recipe is ever offered (AC4).
- **Seed the registry with exactly one entry — "Character Explainer with Cast"** — that describes
  today's wired path **byte-for-byte unchanged**: its `specShape.validate` IS (reference equality, not
  a re-implementation) `production-spec/validate.ts`'s `validate`; its `copyShape` constants ARE
  `production-spec/contract.ts`'s `MAX_POST_COPY_CHARS`/`MIN_POST_COPY_EMOJIS`/`MAX_POST_COPY_EMOJIS`;
  its Space node names ARE `space-driver/driver.ts`'s `JSON_MASTER_NODE_NAME`/`CHARACTER_NODE_NAME`;
  its cast/clip run-point names are read from the SAME `execution-protocol/protocol.ts`'s
  `canonicalProtocol()` the driver already runs. No existing module (`contract.ts`, `validate.ts`,
  `generate.ts`, `compose.ts`, `protocol.ts`, `parse.ts`, `driver.ts`, `queue.ts`, `scheduler.ts`) is
  modified by this slice — the registry only DESCRIBES the wired path; the generic run-until-gate
  driver that would actually SOURCE its behavior from a Recipe is issue #57.
- **Add a pure Recipe-offering/selection module** (`src/recipe/offer.ts`): `offeredRecipes(defaultRecipes)`
  filters a Format's `default_recipes` down to WIRED slugs only (an unwired default is dropped, never
  offered); `resolveRecipeSelection(defaultRecipes, requested)` resolves the Operator's final
  conversational choice into `{ chosen, declined, ignoredUnwired }` — `chosen` are the wired Recipes
  that will actually produce the Idea, `declined` are offered (pre-filled) Recipes the Operator dropped
  (need a verbatim reason), and `ignoredUnwired` is anything the Operator asked to add that isn't wired
  (never added — AC4 holds even against an explicit request).
- **Ledger gains `recipes` / `declined_recipes` on the Idea record** (`src/ledger/ledger.ts`):
  `applyIdeaRecipeSelection` (pure) + `writeIdeaRecipeSelection` (thin write shell), mirroring the
  existing `applyIdeaCast`/`writeIdeaCast` shape. `declined_recipes` is `{ recipe, reason }[]`, the
  reason stored **verbatim** — mirrors `rejection_reason`: logged only, v1 does not auto-apply it.
- **Wire `/review-ideas`** (`.claude/commands/review-ideas.md`): at ACCEPT, load the Idea's Format,
  pre-fill the offered (wired-only) Recipes from its `default_recipes`, let the Operator trim/extend
  conversationally (an unwired Recipe is never offered, even on explicit request), resolve the final
  selection, log every declined Recipe's reason verbatim via `writeIdeaRecipeSelection`, THEN proceed
  with `status: accepted` + `enqueueOnAccept` **exactly as before** (that call is untouched) whenever
  at least one Recipe was chosen. Pinned by a new prompt-conformance test suite
  (`src/recipe/review-docs.test.ts`), mirroring issue #53's `format-docs.test.ts` pattern.

## Non-Goals (explicitly deferred to later slices in the epic)

- **Per-Asset ledger / `AssetStore` / Recipe-keyed queue** — issues #55/#56. This slice's
  `recipes`/`declined_recipes` fields sit on the Idea record (today's grain); the per-Recipe Asset list
  ADR-0011 describes is a separate, larger reshape.
- **The generic run-until-gate driver** that actually reads a Recipe's gates/node-names to drive the
  Space — issue #57. This slice's registry is descriptive; `driver.ts`/`scheduler.ts`/`queue.ts` are
  untouched, and the wired production path keeps running through the SAME code it always has.
- **Per-Recipe Spec shape / out-of-Space copy step** — issue #58 (ADR-0012). The seeded Recipe's
  `specShape`/`copyShape` describe TODAY's Spec-embedded `post_copy` field; they are not yet consumed
  anywhere to change how a Spec is generated or validated.
- **A second real Recipe** — issue #60. The registry stays seeded with exactly one entry.
- **Re-pointing `producer.md` at the registry's Space target.** The attended `producer` agent still
  resolves its Space via `brand-profile.yaml`'s `production.space_id` (unchanged); the registry's
  `space.id` records the same value redundantly. This is untestable without the live Space and is not
  part of this slice's zero-behaviour-change bar.

## Capabilities

### Added Capabilities

- `recipe-registry`: the `Recipe` type + in-repo registry seeded with one entry, the pure
  offer/decline resolution, `/review-ideas`'s pre-fill/offer/decline wiring, and the ledger's
  `recipes`/`declined_recipes` fields + write shell. `brand-commands` is NOT modified — `/review-ideas`
  already has no dedicated Requirement of its own there (its Brief-path behavior lives under
  `format-store`, per issue #53); this slice's `/review-ideas` behavior is entirely about Recipes, so it
  lives here instead, as its own Requirement.

## Impact

- **New code:** `src/recipe/registry.ts` (+`registry.test.ts`), `src/recipe/offer.ts`
  (+`offer.test.ts`), `src/recipe/review-docs.test.ts`.
- **Modified code:** `src/ledger/ledger.ts` (+`ledger.test.ts`) — additive `LedgerDeclinedRecipe`,
  `applyIdeaRecipeSelection`, `writeIdeaRecipeSelection`; `.claude/commands/review-ideas.md` — the
  Recipe pre-fill/offer/decline sequence inserted into the ACCEPT step; `src/format/store.ts` — one
  doc-comment update (no behavior/type change) reflecting that `offeredRecipes` now filters
  `default_recipes`, not that the registry is unwired; `data/brands/{mundotip,straw-motion}/formats/*.yaml`
  — the matching doc-comment update.
- **Not touched:** `src/production-spec/**`, `src/execution-protocol/**`, `src/space-driver/**`,
  `src/production-queue/**` (`queue.ts`/`scheduler.ts`/`store.ts`/`enqueue-on-accept.ts`), the ledger's
  pre-existing `applyIdeaCast`/`writeIdeaCast`/`applyIdeaAsset`/`writeIdeaAsset`/status-write functions,
  `producer.md`, `CLAUDE.md`, `CONTEXT.md` (already documents the target Recipe model).
- **Hermetic:** the registry references `production-spec`/`execution-protocol`/`space-driver` constants
  and functions but never calls a live Magnific tool; `src/recipe/**` tests never construct a
  `FakeSpace` and never touch `spaces_*`/`creations_*` — the existing Magnific-fake-backed suites
  (`space-driver/**`, `production-spec/**`, `production-queue/**`) are untouched and stay green,
  proving the single-recipe path is unaffected.
- **Always-rules upheld:** ledger-as-source-of-truth (every Recipe selection is written to the Brand's
  ledger via the same write-shell pattern as Cast/Asset); the declined-Recipe reason is logged
  **verbatim**, mirroring Rejection Reasons (rule 6: v1 logs only, never auto-applies); an unwired
  Recipe is never offered/added, so `/review-ideas` cannot silently promise production the system
  cannot deliver; generate-never-publish/public-metrics-only/relative-not-absolute/explicit-attribution
  are unaffected (no production, metrics, or publish code touched).
