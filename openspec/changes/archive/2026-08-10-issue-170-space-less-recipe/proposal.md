## Why

The new **News Short Script** Recipe (Unhypped Daily design session, 2026-08-10) produces a
teleprompter script plus a **Shot List** of collected media — it drives no Magnific Space at all.
Today that is unrepresentable: `Recipe.space` and `RecipeSpaceNodes.specInput`/`clipRunPoint` are
required (`src/recipe/registry.ts`), `Recipe.canvasInputs` is required, and the deep modules the thin
Producer calls during the bind phase (`bindMediaSlots`, `auditBindMediaPhase`) assume every Recipe has
a canvas to read slots off. **ADR-0021**
(`docs/adr/0021-space-less-recipe-script-assets.md`) decides the Space target becomes optional; this
issue builds that support GENERICALLY, proven against a throwaway test fixture — the actual News Short
Script Recipe (its own Spec shape, Skill, and registry entry) is explicitly deferred to a follow-up
slice.

## What Changes

- **`Recipe.space` and `Recipe.canvasInputs` both become OPTIONAL** (`src/recipe/registry.ts`) — a
  Recipe with no Space declares neither: there is no canvas to bind media into, inject a prompt onto,
  or drive a run-point against. Everything else a Recipe owns stays REQUIRED and unchanged: its `gates`
  list, `specShape` (validator + banned-word scan), `copyShape`, `copySkill`, and its six ordered
  `phases` (ADR-0021's own text: "Everything else a Recipe owns is unchanged and still required").
  BOTH wired Recipes (`character-explainer-with-cast`, `news-carousel`) keep populating both fields
  exactly as before — this is a pure type WIDENING, never a behavior change for either.
- **`bindMediaSlots` (`src/producer/bind-media.ts`) and `auditBindMediaPhase`
  (`src/recipe/phase-contract.ts`) treat an absent `canvasInputs` as zero media slots** — both already
  handle a Recipe with an EMPTY `mediaSlots` map vacuously (`ok: true`, nothing bound/checked); this
  change only widens their read (`recipe.canvasInputs?.mediaSlots ?? {}`) so a Space-less Recipe hits
  that same, already-tested vacuous path rather than crashing on `undefined`.
- **A new pure predicate, `usesSpace(recipe)` (`src/producer/uses-space.ts`)**, is the single
  Recipe-generic signal the thin Producer checks before doing ANY canvas work — binding media slots
  into canvas nodes, driving an Execution Protocol run-point, or setting the watermark `@handle`. It is
  simply `recipe.space !== undefined`; proven `true` for both wired Recipes (unaffected) and `false`
  for the new test fixture.
- **A throwaway, NOT-wired test fixture Recipe** (`src/recipe/fixtures/space-less-recipe.ts`'s
  `SPACE_LESS_TEST_RECIPE`) proves the widened types are actually usable end-to-end: zero gates, no
  `space`, no `canvasInputs`, a minimal Spec shape (`script` + `shot_list`) with its own
  validator/banned-word scan (mirroring the News Carousel Recipe's own per-Recipe shape pattern), and
  six Phase Contracts whose Space-bound phases (`bind-media`, `gate`, `render`) declare EMPTY, no-op
  checklists — the exact same pattern the zero-gate News Carousel Recipe's own `gate` phase already
  uses. This fixture is never added to the real `REGISTRY` — `isWiredRecipe`/`getRecipe` never see it,
  so Review's offered-Recipe set and the Production Queue are untouched (matching the issue's stated
  scope).
- **A new end-to-end test** (`src/producer/space-less-recipe-end-to-end.test.ts`) drives the fixture
  Recipe through author -> bind-media (no-op) -> gate (no-op) -> copy -> save, writing a `produced`
  Asset that carries `spec_path` + `copy` but NO `asset_url`/`asset_paths` (nothing was ever rendered)
  — importing NEITHER a `SpaceMcpPort` NOR any Magnific fake, which is itself the proof of "zero
  Magnific calls": there is no Space-interaction code path for a Space-less Recipe to exercise.
- **The registry's doc comment cites ADR-0021** for the widened fields.

## Non-Goals (explicitly deferred to the follow-up slice that builds the real News Short Script Recipe)

- The real News Short Script Production-Spec contract, validator, and banned-word scanner.
- The real News Short Script producer Skill that authors the script + Shot List.
- Actually collecting a Shot List's media (best-effort download, video preferred, a marked link
  fallback) — ADR-0021's own "render" step for a Space-less Recipe. This slice's fixture Recipe
  declares its `render` phase's checklist EMPTY on purpose; the real collection logic is future work.
- Registering the real Recipe in `REGISTRY`, offering it at Review, or updating any Format's
  `default_recipes`.
- Any change to `.claude/agents/producer.md`'s prose — there is no wired Space-less Recipe yet for it
  to document; the generic support this slice adds is proven at the code layer (registry types +
  `bindMediaSlots`/`auditBindMediaPhase` + `usesSpace` + the end-to-end test against the fixture).

## Capabilities

### Modified Capabilities

- `recipe-registry`: `Recipe.space`/`Recipe.canvasInputs` become optional (ADR-0021); a new Requirement
  documents the Space-less shape, proven against a test fixture.
- `phase-contracts`: `auditBindMediaPhase` documented to treat an absent `canvasInputs` as zero media
  slots (vacuously `ok: true`).
- `producer-conductor`: `bindMediaSlots` documented to treat an absent `canvasInputs` the same way; a
  new Requirement adds `usesSpace` and the fixture-driven, zero-Magnific-calls end-to-end proof.

## Impact

- **New code:** `src/recipe/fixtures/space-less-recipe.ts` (+`.test.ts`), `src/producer/uses-space.ts`
  (+`.test.ts`), `src/producer/space-less-recipe-end-to-end.test.ts`.
- **Modified code:** `src/recipe/registry.ts` (widened `Recipe.space`/`Recipe.canvasInputs` types +
  ADR-0021 doc reference), `src/producer/bind-media.ts` (+`.test.ts` — a new space-less case),
  `src/recipe/phase-contract.ts` (+`.test.ts` — a new space-less case), `src/recipe/registry.test.ts` /
  `src/producer/two-recipes-end-to-end.test.ts` / `src/producer/carousel-end-to-end.test.ts` /
  `src/producer/cast-candidates-end-to-end.test.ts` / `src/production-spec/producer-agent.docs-test.ts`
  — non-null assertions (`recipe.space!`/`recipe.canvasInputs!`) added at read sites that, by
  construction, only ever run against the two wired Recipes (both of which still always populate both
  fields) — a type-checker-satisfying change only, zero behavior change (AC3).
- **Not touched:** `src/space-driver/**` (its primitives already take explicit `promptNode`/
  `pinnedReferenceNodeName` params rather than a whole `Recipe`, so nothing there depends on
  `Recipe.space`'s optionality), `.claude/agents/producer.md`, `data/brands/**/formats/*.yaml`,
  `CONTEXT.md` (its "Recipe" entry already documents ADR-0021's Space-less shape from the ADR-authoring
  commit), `CLAUDE.md` (still accurately states two Recipes are wired — this slice wires none).
- **Hermetic, no live Space/Apify anywhere.** The two wired Recipes' own end-to-end tests keep using
  their existing Magnific fakes (`FakeSpace`, `FakeCarouselSpace`) exactly as before — this change adds
  no new fake, because the whole point of the new test is that a Space-less Recipe never reaches the
  Magnific boundary at all.
- **Always-rules upheld:** generate-never-publish (the new fixture's Asset is written but never
  published — no publish code touched); public-metrics-only/relative-not-absolute (no metrics code
  touched); explicit-attribution (no `/log-post` code touched); ledger-as-source-of-truth (the fixture's
  Asset is written through the SAME `writeAsset` every Recipe already uses).
