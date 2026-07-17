## 1. News Carousel Production-Spec contract + fixtures (test-first)

- [x] 1.1 Write `news-carousel-contract.test.ts`: `CAROUSEL_SLIDE_COUNT` is 7; `CAROUSEL_ROLES` is the
  fixed order `hook, then, shift, proof, different, next, cta`; `CAROUSEL_TEXT_MAX_CHARS` is 140; the
  `validCarouselSpec()` fixture has exactly 7 slides, in role order, `slide_index` 0..6, every slide's
  `text` within the cap.
- [x] 1.2 Implement `news-carousel-contract.ts` (`CarouselSlide`, `NewsCarouselSpec`, the constants
  above) and `fixtures/news-carousel-specs.ts` (a valid Spec + focused broken variants: 6/8 slides,
  numeric slides, roles out of order, `slide_index` off-by-one, text over 140 chars, a slide missing
  `image_prompt`).

## 2. News Carousel Production-Spec validator (test-first)

- [x] 2.1 Write `news-carousel-validate.test.ts`: accepts the valid 7-slide Spec; rejects non-objects;
  rejects missing/wrong-count `slides`; rejects non-object slide entries and a slide missing a required
  field; rejects text over 140 chars; rejects roles out of the fixed order; rejects `slide_index`
  misalignment — each with its own error code.
- [x] 2.2 Implement `validateNewsCarouselSpec` in `news-carousel-validate.ts`, reusing
  `production-spec/validate.ts`'s `ValidationResult`/`ValidationError` shape (widened `code` to
  `string` — task 3).

## 3. Widen `ValidationError.code` to `string` (additive, non-behavioral)

- [x] 3.1 Confirm `validate.test.ts` still passes unchanged after widening `ValidationError.code` from
  the closed `ValidationCode` union to `string` (the widening is a supertype change; every existing
  literal `code` value produced by `validate()` still satisfies it).
- [x] 3.2 Apply the widening in `production-spec/validate.ts`, documenting why (mirrors the shape
  `RecipeSpecShape.validate` needs to be shared across Recipes).

## 4. News Carousel banned-word scanner — closes the issue-60 gap (test-first)

- [x] 4.1 Write `news-carousel-brand-safety.test.ts`: a clean Spec passes; an empty banned-words list
  always passes; a banned word in `image_prompt` is rejected and named with its field (closing the
  flagged gap); a banned word in `text` and in `stat_callout` is also caught (every slide text field,
  not only `image_prompt`); matching is case-insensitive and whole-word (an embedded substring like
  "secure" containing "cure" does not false-positive).
- [x] 4.2 Implement `scanNewsCarouselForBannedWords`/`collectNewsCarouselTextFields` in
  `news-carousel-brand-safety.ts`, reusing `brand-safety.ts`'s shared `scanTextFields` core (never
  re-implementing the matching rule).

## 5. A second canonical Execution Protocol artifact for the single-lane Carrousel Space (test-first)

- [x] 5.1 Write failing tests (`protocol.test.ts`): `canonicalCarouselProtocol()` has exactly one
  run-point, starting at `"Slides Prompts"`, mode `downstream`, gate `null`; it references the node
  only by name; it serializes comfortably under the read-API truncation cap.
- [x] 5.2 Implement `canonicalCarouselProtocol()` in `execution-protocol/protocol.ts`.

## 6. Recipe registry — typed canvas inputs + the second seeded Recipe (test-first)

- [x] 6.1 Write failing tests (`registry.test.ts`): the registry now lists TWO wired slugs
  (`character-explainer-with-cast`, `news-carousel`); `isWiredRecipe`/`getRecipe` behave correctly for
  both, and an unregistered slug (e.g. `"carousel"`) still resolves to `null`/`false`.
- [x] 6.2 Write failing tests: the character Recipe's gates/Space/spec-shape/copy-shape assertions from
  issue #54 ALL still pass unchanged (byte-for-byte proof of AC5), PLUS it now declares
  `specShape.scanBannedWords` (reference-equal to `production-spec/brand-safety.ts`'s
  `scanForBannedWords`) and `canvasInputs` — one `idea-pick` media slot (`"Selected Character"`, image,
  required, `gate: "cast"`) and a `promptNode` equal to its existing `space.nodes.specInput`.
- [x] 6.3 Write failing tests: the News Carousel Recipe declares `gates: []`; a Space target named
  `"Carrousel"` with a `clipRunPoint` sourced from `canonicalCarouselProtocol()` and no
  `pinnedReference`/`castRunPoint`; a `specShape.validate`/`scanBannedWords` that ARE (reference
  equality) `validateNewsCarouselSpec`/`scanNewsCarouselForBannedWords`; a copy-shape of 2200/0/2
  (different from the character Recipe's 180/1/3); `canvasInputs` — one `brand-asset` media slot
  (`"Brand Logo"`, image, required, `brandAssetKey: "brand-logo"`) and a `promptNode` equal to its sole
  run-point's name (`"Slides Prompts"`).
- [x] 6.4 Implement the typed canvas-input types (`MediaKind`, `BrandAssetMediaSlot`,
  `IdeaPickMediaSlot`, `MediaSlot`, `MediaSlotMap`, `RecipeCanvasInputs`) and widen `RecipeSpaceNodes`'s
  `pinnedReference`/`castRunPoint` to optional in `recipe/registry.ts`.
- [x] 6.5 Implement `RecipeSpecShape.scanBannedWords` (add the field; wire the character Recipe's own
  value to `scanForBannedWords`) and populate both Recipes' `canvasInputs`.
- [x] 6.6 Implement the second seeded `NEWS_CAROUSEL` Recipe entry and add it to `REGISTRY`.

## 7. `isWiredRecipe` stays the sole wiring gate — prove AC4 generalizes (test-first)

- [x] 7.1 Write failing tests (`offer.test.ts`): `offeredRecipes(["news-carousel"])` offers it (order
  preserved when combined with the wired character slug); an unwired slug (`"carousel"`) still never
  surfaces even alongside the newly-wired `"news-carousel"`.
- [x] 7.2 Confirm no change to `src/recipe/offer.ts` is needed — its existing `isWiredRecipe`-driven
  logic already generalizes (issue #54's own design intent); the new tests are additional proof, not a
  behavior change.

## 8. Self-review + full-suite green

- [x] 8.1 Re-read every new/changed module for dead code, unused exports, and drifted docstrings.
- [x] 8.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run test:docs`, and
  `openspec validate --strict` for this change; all green.
- [x] 8.3 Write the Build Report into `handoff.md`, mapping every issue #81 acceptance criterion to its
  proving test(s), flagging the fakes/fixtures used (none touch the Magnific fake — no driver code is
  exercised by this slice), and listing known limits (deferred to #82/#85/#87/#88/#89).
