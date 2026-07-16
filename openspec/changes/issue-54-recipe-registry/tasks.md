## 1. Recipe registry — the type + seeded entry (test-first)

- [x] 1.1 Write failing tests (`recipe/registry.test.ts`): registry has exactly one entry
  (`character-explainer-with-cast`); `getRecipe`/`isWiredRecipe`/`listWiredRecipeSlugs` behavior for
  known and unknown slugs (never throws).
- [x] 1.2 Write failing tests: the seeded Recipe declares `gates: ["cast"]`; a Space target whose node
  names EQUAL (reference/value equality, not re-typed literals) `space-driver/driver.ts`'s
  `JSON_MASTER_NODE_NAME`/`CHARACTER_NODE_NAME`, and whose cast/clip run-point names come from the SAME
  `execution-protocol/protocol.ts`'s `canonicalProtocol()`; a `specShape.validate` that IS
  `production-spec/validate.ts`'s `validate` (reference equality) and behaves correctly against a known
  valid/invalid Spec; a `copyShape` whose constants EQUAL `production-spec/contract.ts`'s
  `MAX_POST_COPY_CHARS`/`MIN_POST_COPY_EMOJIS`/`MAX_POST_COPY_EMOJIS`.
- [x] 1.3 Implement `Recipe`/`RecipeSpaceTarget`/`RecipeSpaceNodes`/`RecipeSpecShape`/`RecipeCopyShape`
  and the seeded `CHARACTER_EXPLAINER_WITH_CAST` entry in `src/recipe/registry.ts`, referencing (never
  duplicating) the existing exported constants/functions.

## 2. Recipe offering + selection — pure deep module (test-first)

- [x] 2.1 Write failing tests (`recipe/offer.test.ts`): `offeredRecipes` filters a Format's
  `default_recipes` to wired-only, preserving order, reporting unwired entries separately (never in
  `offered`).
- [x] 2.2 Write failing tests: `resolveRecipeSelection` — keeping the pre-filled default (chosen =
  default, nothing declined); declining the only default (declined, nothing chosen); an unwired
  request is never added to `chosen` (AC4) and is reported in `ignoredUnwired`; requesting a wired
  Recipe with no pre-filled default; duplicate requests deduplicate; an unwired Format default is
  never counted as "declined" (it was never offered).
- [x] 2.3 Implement `offeredRecipes`/`resolveRecipeSelection` in `src/recipe/offer.ts`.

## 3. Ledger: recipes / declined_recipes on the Idea record (test-first)

- [x] 3.1 Write failing tests (`ledger/ledger.test.ts`): `applyIdeaRecipeSelection` — sets the target
  Idea's `recipes`/`declined_recipes`, leaves other Ideas unchanged, pure (never mutates input), no-op
  for an unknown Idea, handles an empty `recipes` list (everything declined).
- [x] 3.2 Write failing tests: `writeIdeaRecipeSelection` — writes both fields for the target Idea,
  preserves unrelated fields, stores the declined reason VERBATIM, no-op for an unknown Idea.
- [x] 3.3 Implement `LedgerDeclinedRecipe`, `LedgerIdeaWithRecipes`, `applyIdeaRecipeSelection`,
  `writeIdeaRecipeSelection` in `src/ledger/ledger.ts`, mirroring `applyIdeaCast`/`writeIdeaCast`.

## 4. Wire /review-ideas (prompt-level, test-first via doc-conformance)

- [x] 4.1 Write failing tests (`recipe/review-docs.test.ts`, a REGULAR `.test.ts` per the
  `format-docs.test.ts` precedent — this behavior IS the acceptance criterion, not incidental doc
  conformance): pre-fill from the Format's `default_recipes` via `loadFormat`/`offeredRecipes`; never
  fabricates a Format when the Idea has none recorded; lets the Operator trim/extend conversationally;
  only wired Recipes are ever offered (never adds an unwired Recipe even on explicit request); declined
  Recipes are captured with a verbatim reason and written via `writeIdeaRecipeSelection`; the
  pre-existing `enqueueOnAccept` call is stated as byte-for-byte unchanged; auto-enqueue is skipped
  only when `chosen` is empty (a brand-new state, not a regression of today's always-one-Recipe case).
- [x] 4.2 Rewrite `.claude/commands/review-ideas.md`'s step 3 (presentation) and step 5 (ACCEPT) to
  implement the sequence above; update the Guardrails section to restate "only wired Recipes are ever
  offered" and "declined Recipes are logged verbatim, like Rejection Reasons".
- [x] 4.3 Update the doc-comment in `src/format/store.ts`'s `FormatFile.defaultRecipes` and both real
  Format files' `default_recipes` comment (`data/brands/{mundotip,straw-motion}/formats/*.yaml`) to
  reflect that the registry now exists and filters offers — `default_recipes` itself stays
  free-text/unvalidated at PARSE time (filtering happens at OFFER time in `offer.ts`).

## 5. OpenSpec

- [x] 5.1 Author `proposal.md`, this `tasks.md`, and spec deltas: ADDED `recipe-registry`, MODIFIED
  `brand-commands`.
- [x] 5.2 `npx openspec validate issue-54-recipe-registry --strict` green.

## 6. Self-review

- [x] 6.1 `npm test` green (type-check + full suite); confirm the pre-slice 755 tests are all still
  present and passing, plus the new tests for this slice.
- [x] 6.2 Simplify / dead-code pass; confirm every issue #54 acceptance criterion maps to a named test.
- [x] 6.3 Write the Build Report into `handoff.md`, explicitly flagging that this slice makes zero live
  Magnific Space calls, and listing Non-Goals/Known Limits transparently.
