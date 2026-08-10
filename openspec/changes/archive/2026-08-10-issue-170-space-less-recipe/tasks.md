## 1. Widen the registry types (test-first)

- [x] 1.1 Write failing assertions in `registry.test.ts` / a new `recipe/fixtures/space-less-recipe.test.ts`
  proving `Recipe.space`/`Recipe.canvasInputs` can be `undefined` while every other field stays
  required — confirm they fail to type-check against today's `Recipe` interface.
- [x] 1.2 Widen `Recipe.space` and `Recipe.canvasInputs` to optional in `src/recipe/registry.ts`; add
  the ADR-0021 doc-comment reference (AC4). Confirm both seeded Recipes (`character-explainer-with-cast`,
  `news-carousel`) still populate both fields, unchanged.
- [x] 1.3 Fix every now-optional read site that assumed non-undefined (`registry.test.ts`,
  `two-recipes-end-to-end.test.ts`, `carousel-end-to-end.test.ts`, `cast-candidates-end-to-end.test.ts`,
  `producer-agent.docs-test.ts`) with a non-null assertion — each site only ever reads a WIRED Recipe's
  own `space`/`canvasInputs`, so this is type-checker plumbing only, never a behavior change (AC3).

## 2. Widen bindMediaSlots + auditBindMediaPhase to treat an absent canvasInputs as zero slots (test-first)

- [x] 2.1 Write a failing test in `bind-media.test.ts`: `bindMediaSlots(recipeWithNoCanvasInputs, {})`
  returns `{ ok: true, bound: [], boundSlotNames: Set() }` — currently throws (`Cannot read properties
  of undefined`) or fails to type-check.
- [x] 2.2 Implement the fix in `src/producer/bind-media.ts` (`recipe.canvasInputs?.mediaSlots ?? {}`).
- [x] 2.3 Write a failing test in `phase-contract.test.ts`: `auditBindMediaPhase(recipeWithNoCanvasInputs,
  { boundSlotNames: new Set() })` returns `{ ok: true, items: [] }`.
- [x] 2.4 Implement the fix in `src/recipe/phase-contract.ts` (same `?? {}` pattern).

## 3. usesSpace — the single Recipe-generic "does this Recipe drive a Space at all" predicate (test-first)

- [x] 3.1 Write failing tests (`uses-space.test.ts`): `usesSpace(recipe)` is `true` for both wired
  Recipes and `false` for a Recipe with no `space`.
- [x] 3.2 Implement `usesSpace` in `src/producer/uses-space.ts` — `recipe.space !== undefined`, pure,
  never throws.

## 4. The throwaway, NOT-wired test fixture Recipe (test-first)

- [x] 4.1 Write failing tests (`recipe/fixtures/space-less-recipe.test.ts`): a minimal Spec shape
  (`script` + non-empty `shot_list`) validates/rejects/scans banned words correctly; the fixture Recipe
  declares zero gates, no `space`, no `canvasInputs`, and all six Phase Contracts in order, with
  `bind-media`/`gate`/`render` all EMPTY checklists.
- [x] 4.2 Implement `src/recipe/fixtures/space-less-recipe.ts`: `validateSpaceLessTestSpec`,
  `scanSpaceLessTestSpecForBannedWords`, `validSpaceLessTestSpec()`, and `SPACE_LESS_TEST_RECIPE` — run
  `declaresAllPhasesInOrder` as an import-time guard, mirroring `registry.ts`'s own defensive throws
  (AC1). Confirm it is NEVER added to `REGISTRY` — `isWiredRecipe("test-space-less-recipe")` stays
  `false`.

## 5. The Space-less end-to-end proof: author -> bind-media -> gate -> copy -> save, zero Magnific calls (test-first)

- [x] 5.1 Write the failing end-to-end test (`producer/space-less-recipe-end-to-end.test.ts`): author
  (self-audited) -> save the Spec -> bind-media (`bindMediaSlots` with an empty resolutions map,
  self-audited, nothing bound) -> gate (assert zero gates, no pause) -> copy (composed + self-audited,
  reusing the real committed Straw Motion Brand Profile read-only) -> save (`writeAsset`, then
  `loadIdeaAssets` confirms `spec_path`/`copy` are set and `asset_url`/`asset_paths`/`pending_gate` are
  all absent). The file imports NEITHER a `SpaceMcpPort` NOR any Magnific fake — that absence is itself
  the zero-Magnific-calls proof (AC2).
- [x] 5.2 Confirm the test fails for the right reason before task 4's fixture exists, then passes once
  it does. No new implementation code needed beyond task 4 — this task is proof, not production code.

## 6. Full-suite green + self-review + Build Report

- [x] 6.1 Run `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run test:docs`, and
  `openspec validate --strict` for this change; all green — confirming AC3 (both wired Recipes'
  behavior is byte-identical).
- [x] 6.2 Self-review pass: remove dead code, tighten module boundaries, confirm every acceptance
  criterion in issue #170 maps to a specific test.
- [x] 6.3 Write the Build Report into `handoff.md`.
