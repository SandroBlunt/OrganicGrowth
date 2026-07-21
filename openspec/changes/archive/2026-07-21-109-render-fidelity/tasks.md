## 1. Ground the canvas-setting question (AC2) before touching any prose

- [x] 1.1 Search the repo for any in-repo aspect-ratio/resolution/output setting the Producer or a
  Recipe could set: `src/space-driver/port.ts` (the `SpaceMcpPort` interface — no such primitive),
  `src/recipe/registry.ts` (`RecipeSpaceTarget`/`RecipeCanvasInputs` — node names only, no
  aspect-ratio/output field), a repo-wide grep for `setAspectRatio`/`setResolution`/`aspectRatio` (only
  hits: the read-only fixture `src/producer/fixtures/fake-carousel-space.ts`'s
  `CARROUSEL_IMAGE_GENERATOR_SETTINGS`, sourced from the live capture, and the live-capture README).
- [x] 1.2 Confirm `.claude/skills/produce-news-carousel/SKILL.md` already states, in its own words,
  that aspect ratio/model are the canvas's own settings, never written into the prompt — the
  authoritative, in-repo confirmation this is a live-Space-only fact.
- [x] 1.3 Conclusion: no in-repo setting exists to verify/correct (AC2's own "if purely live-Space, say
  so and cover the in-repo clause instead" applies). Document this finding in `proposal.md`'s "Canvas-
  setting finding" and carry it into the Build Report; cover the in-repo clause via task 3 below.

## 2. Ground the Baseline Prompt document's current state + every place that pins it (test-first prep)

- [x] 2.1 Read `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` in full
  (confirmed it already carries #108's em-dash rule + "Card text" bullet — compose with it, don't
  revert it).
- [x] 2.2 Find every test that reads this document's content or a fixture mirroring it:
  `src/production-spec/news-carousel-straw-motion-fixture.test.ts` (reads the real document via
  `loadFormat`/`loadBaselinePrompt`, cross-checks `STRAW_MOTION_BASELINE`'s literal strings against it)
  and `src/production-spec/fixtures/news-carousel-straw-motion-specs.ts` (the `FIXED_CLAUSES`/
  `LOGO_REFERENCE_NAME`/`PILL_TEXT`/`NEVER_ALL_CAPS_INSTRUCTION` constants those checks are built from).
  Confirmed the SEPARATE `news-carousel-author-checklist-specs.ts`'s `TEST_BASELINE` is a stand-in,
  unaffected by any real-document edit.
- [x] 2.3 Confirm no worked-JSON-example text is machine-parsed anywhere (grep for `variation_id` in
  `src/` — zero hits) — the 7 worked examples are read by the Skill/a human, not asserted verbatim by
  any test beyond the 5 pinned `FIXED_CLAUSES`/`pillText`/etc. substrings, which DO also occur inside
  them.

## 3. Strengthen the Baseline Prompt document's prose (the actual fix; AC1 + AC2's in-repo half)

- [x] 3.1 Top "confirmed answer" bullets: `Photo` (full-bleed/no-letterboxing, every placement
  including top card), `Subject` (real names over fine fake-UI text; keep on-screen text minimal where
  no real screen exists), `Logo` (soft gradient vignette, never a hard-edged solid black bar/box),
  `Card text` (supporting-line minimum ~13-14px equivalent), `Card style` (every placement, including
  the top card, fills its photo region edge to edge, no black margins).
- [x] 3.2 The reusable swappable template: reinforce the photo-crop bracket (both graduated styles,
  "no black margins"), the `[SUBJECT: ...]` bracket (real-name/minimal-fake-UI-text guidance), the
  logo-vignette sentence (new wording — this is the ONE pinned `FIXED_CLAUSES` entry that changes,
  see task 4), the `[CARD CLAUSE]` bracket (mentions "never a hard-edged box"), and the card-text
  clause (minimum-size instruction) — because the Skill "starts from the document's own worked example
  for the card_style you chose" (SKILL.md step 2), so the template AND every worked example must carry
  the SAME reinforcement, not just the abstract bullets.
- [x] 3.3 All 7 worked JSON examples: apply the SAME four reinforcements at every occurrence — the
  logo-vignette sentence (all 7), the floating-card vignette sentence (examples 2, 4, 7), the
  supporting-line minimum-size phrase (all 7, adapted to each example's own sentence structure), and a
  full-bleed/no-black-margins phrase tailored to each placement's own photo-region description
  (examples 1/5's "cropped to ~70%", example 2's "filling the entire frame edge to edge", examples 3/6's
  "filling the remaining ~70-75%" — the TOP-CARD placement AC1 explicitly names — and examples 4/7's
  "filling nearly the entire frame" tightened to "the entire frame").

## 4. Keep the graduated Straw Motion fixture in sync (test-first: run before touching, confirm still green after)

- [x] 4.1 Run `news-carousel-straw-motion-fixture.test.ts` BEFORE touching the fixture (after step 3):
  confirms the ONE pinned clause that changed (`FIXED_CLAUSES[2]`, the logo-vignette sentence) is now a
  literal mismatch — the fixture's OLD wording is no longer a verbatim substring of the document's NEW
  wording, so the existing cross-check would fail once run against a stale fixture. (Verified by
  inspection of the diff rather than a deliberately-broken intermediate commit, since git operations are
  out of this session's scope — the mismatch is the direct, mechanical consequence of the doc edit.)
- [x] 4.2 Update `FIXED_CLAUSES[2]` in `news-carousel-straw-motion-specs.ts` to the document's new
  wording, verbatim — this alone keeps `logoClause()` (which interpolates `FIXED_CLAUSES[2]`) and every
  downstream `buildImagePrompt()` output in sync automatically.
- [x] 4.3 Self-review simplification (not required by any test, done for consistency): update
  `photoClause()` (both branches), `cardClause()`'s floating-toast branch, and `cardTextClause()` to
  mirror the document's new full-bleed/vignette/minimum-size wording too, so the graduated idea-01
  fixture is genuinely representative of the strengthened document end-to-end, not just still-passing.
- [x] 4.4 Run `news-carousel-straw-motion-fixture.test.ts` again: confirm all pre-existing assertions
  (structural validator, author-phase checklist, grounded-companies check, doc-cross-check) pass
  unchanged.

## 5. Add the new automated pin for the four render-fidelity clauses (issue's own "guard with docs-tests" instruction)

- [x] 5.1 Factor the repeated blockquote-normalizing logic (strip `"> "`, join lines, collapse
  whitespace) in `news-carousel-straw-motion-fixture.test.ts` into a shared `normalizeBaselineProse`
  helper — used by the pre-existing test AND the new ones (self-review: no duplicated logic).
- [x] 5.2 Write a new `describe` block, one test per render-fidelity ask (mirrors AC1's own four
  sub-bullets, for a direct 1:1 mapping): (8) real names / misspelled-gibberish / minimal-on-screen-text
  phrasing present; (10) "13-14px equivalent" + "caption-sized afterthought" present; (11) "including
  the top card" + "no black margins" + "edge to edge" present; (12) "soft dark gradient vignette" +
  "never a hard-edged solid black bar or box" present. Each reads the REAL committed document via
  `loadFormat`/`loadBaselinePrompt` — never asserts by fiat.
- [x] 5.3 Add one more test in the same block: every `strawMotionIdeaOneCarouselSpec()` slide's
  `image_prompt` carries the UPDATED logo-vignette sentence verbatim — proves the doc and the graduated
  fixture stay genuinely in sync after the wording change (not just independently green).
- [x] 5.4 Run the file: all pre-existing + 5 new tests pass (10/10).

## 6. OpenSpec

- [x] 6.1 Author `proposal.md` (Why / What Changes / Canvas-setting finding / Non-Goals / Capabilities /
  Impact), this `tasks.md`, and the spec delta: ADDED Requirement under `format-baseline-prompt` — the
  document instructs the four render-fidelity guardrails, each with its own Scenario, plus the
  doc/fixture-sync Scenario.
- [x] 6.2 `openspec validate 109-render-fidelity --strict` green.

## 7. Self-review

- [x] 7.1 `npm test` green (type-check + full suite; 1378 baseline -> 1383, +5 new, zero regressions).
- [x] 7.2 `npm run test:docs` — confirmed no NEW failure introduced (82 pass / 1 fail, same pre-existing
  `producer-agent.docs-test.ts` failure, unrelated to this slice — neither `producer.md` nor that test
  file appears anywhere in this slice's diff).
- [x] 7.3 Simplify pass: factored the normalize helper (task 5.1); confirmed every issue #109 acceptance
  criterion maps to a named, passing test; confirmed no `spaces_*`/`creations_*` call anywhere in the
  diff; confirmed the two leftover W29/ledger files were never opened this session.
- [x] 7.4 Write the Build Report into `handoff.md`, explicitly flagging that no Magnific fake was
  invoked (pure documentation + fixture + plain-file test change), stating the AC2 canvas-setting
  finding plainly, and listing known limits (the pre-existing `test:docs` failure; the pre-existing,
  untouched, already-stale byte-checksum Scenario in `format-baseline-prompt`'s canonical spec; the
  deliberate choice not to graduate a third code-level `CardStyle`).
