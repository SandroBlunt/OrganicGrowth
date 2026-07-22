## 1. Extend NewsCarouselBaselineParams + fixtures for genuine placement variety (test-first)

- [x] 1.1 Extend the stand-in `TEST_BASELINE` (`news-carousel-author-checklist-specs.ts`) with a
  top-region style among its `confirmedCardStyles` plus the new `topRegionCardStyles`/
  `minDistinctCardStyles` fields, chosen so a top-region style and at least 3 non-top-region styles all
  exist (needed to isolate the OR-condition's two disjuncts independently).
- [x] 1.2 Update `baselineAdherentCarouselSpec()`'s `card_style` cycling to spread across ALL of
  `TEST_BASELINE.confirmedCardStyles` (still passes every EXISTING mechanical item; now also passes the
  not-yet-built placement-variety item).
- [x] 1.3 Add `allBottomPlacements()` (cycles only non-top-region styles — reproduces the idea-01
  pattern: plenty of distinct placements, zero top-region) and `tooFewDistinctPlacements()` (only 2
  distinct styles, one of them top-region — isolates the OTHER disjunct) fixtures.

## 2. The new placement-variety checklist item (test-first)

- [x] 2.1 Write failing tests (`news-carousel-author-checklist.test.ts`): a Spec built from
  `allBottomPlacements()` fails the NEW `placement-variety` item (present, `kind: "mechanical"`,
  `ok: false`) while every OTHER mechanical item still passes (issue #106 AC1); a Spec built from
  `baselineAdherentCarouselSpec()` passes it (AC2); a Spec built from `tooFewDistinctPlacements()` fails
  it too (the OTHER OR-disjunct); the item participates in the overall `ok` (ADR-0017); swapping in a
  relaxed `NewsCarouselBaselineParams` (redefining "top region" + lowering the threshold) flips the SAME
  candidate Spec from failing to passing, proving the rule is genuinely parameterized, never hardcoded
  (AC3); the function never throws on a malformed/non-object Spec.
- [x] 2.2 Add `topRegionCardStyles`/`minDistinctCardStyles` to the `NewsCarouselBaselineParams`
  interface (`news-carousel-author-checklist.ts`), documented as excluded from
  `verifyBaselineParamsAgainstDocument`'s verbatim check (same exemption as `confirmedCardStyles`).
- [x] 2.3 Implement `hasPlacementVariety(slides, baseline)` and wire the new `placement-variety`
  `ChecklistItemAudit` into `auditNewsCarouselAuthorPhase`'s returned `items` (mechanical, participates
  in overall `ok`). Bump every pre-existing `items.length` assertion in
  `news-carousel-author-checklist.test.ts` by one (9→10 without `documentText`, 10→11 with it).

## 3. Prove it against the REAL Straw Motion baseline + the literal reported repro (test-first)

- [x] 3.1 Extend `STRAW_MOTION_BASELINE` (`news-carousel-straw-motion-specs.ts`) with the document's
  full real 7-style catalog, its own top-region styles (`top_card`/`top_card_inset`), and
  `minDistinctCardStyles`. Extend the fixture's `buildImagePrompt` assembler with a `top_card` ("top
  card, photo below") composition branch, and diversify `IDEA_01_AUTHORED_SLIDES` (one slide now
  genuinely uses `top_card`) so the fixture demonstrates real, on-contract, varied output — not just a
  monotone one.
- [x] 3.2 Write failing tests (`news-carousel-straw-motion-fixture.test.ts`): a Spec carrying idea-01's
  ACTUAL reported `card_style` pattern (`full_width, floating_toast, small_badge, full_width_inset,
  floating_toast, small_badge_inset, full_width`) against `STRAW_MOTION_BASELINE` fails the
  `placement-variety` item while every other mechanical item still passes (the literal AC1
  reproduction, real style names); the diversified `strawMotionIdeaOneCarouselSpec()` passes it (AC2).
  Bump the pre-existing `items.length` assertion there too (9→10).

## 4. Strengthen the Baseline Prompt document + the Skill's authoring guidance, kept in sync (test-first)

- [x] 4.1 Write failing tests (`news-carousel-straw-motion-fixture.test.ts`, new describe block): the
  real, committed `news-carousel.md`'s Card-style guidance actively requires at least one top-region
  placement; its Subject guidance actively instructs varying subject TYPE and reaching for the real
  named person, balanced against product shots.
- [x] 4.2 Strengthen `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`'s Card
  style and Subject bullets accordingly — additive only; no existing locked clause, worked example, or
  the 7-slide narrative formula is touched.
- [x] 4.3 Write failing tests (`produce-news-carousel-skill.docs-test.ts`, new describe block): the
  Skill's `card_style`/`subject` guidance carries the same active instructions; the Skill names the new
  `placement-variety` item; the Skill's "Author-phase checklist" bullet list includes it.
- [x] 4.4 Strengthen `.claude/skills/produce-news-carousel/SKILL.md`'s step-1 `card_style`/`subject`
  bullets and its "Author-phase checklist" list to match — nothing Brand/Format-specific hardcoded
  (confirmed by the pre-existing "nothing hardcoded" docs-test, still green).

## 5. Self-review + full-suite green

- [x] 5.1 Re-read every changed module/fixture/test/doc for dead code, wording repetition, and drifted
  docstrings; confirm the checklist module still never re-implements
  `validateNewsCarouselSpec`/`scanNewsCarouselForBannedWords`, and that the new item is the ONLY new
  mechanical check added.
- [x] 5.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run test:docs`, and
  `openspec validate --strict` for this change; all green (one pre-existing, unrelated `test:docs`
  failure in `producer-agent.docs-test.ts` — about `producer.md`, untouched by this slice — noted, not
  fixed here).
- [x] 5.3 Write the Build Report into `handoff.md`, mapping every issue #106 acceptance criterion to its
  proving test(s), flagging that no Magnific fake/surface is touched by this slice, and listing known
  limits (the `registry.ts` static checklist listing drift; the deferred #106 items).
