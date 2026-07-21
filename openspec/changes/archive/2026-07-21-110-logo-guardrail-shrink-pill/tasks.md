## 1. Ground the canvas negative-prompt field question before touching any prose or code

- [x] 1.1 Search the repo for any in-repo negative-prompt canvas primitive: `src/recipe/registry.ts`
  (`RecipeCanvasInputs`/`RecipeSpaceNodes` — a single text `promptNode` + named media slots only, no
  negative-prompt field), `src/space-driver/port.ts` (`SpaceMcpPort` — 7 methods, none sets a per-node
  attribute like `negativePrompt`), `src/producer/fixtures/fake-carousel-space.ts` (models the same
  narrow port surface, no negative-prompt primitive).
- [x] 1.2 Confirm the live-captured board JSON DOES carry a raw `negativePrompt` attribute on the
  Carrousel Space's "Image Generator #21" node
  (`src/space-driver/fixtures/live-captures/carrousel/00-spaces_show.fullboard.json`) — but nothing in
  this codebase's Recipe/driver abstraction reads or writes it.
- [x] 1.3 Conclusion: no in-repo negative-prompt canvas field exists to set. Document this finding in
  `proposal.md`'s "Canvas negative-prompt field finding" and carry it into the Build Report; express
  the guardrail as explicit prohibitory clauses inside the `image_prompt` text instead (the issue's own
  documented fallback).

## 2. Ground the current logo-reference rule + every place it's pinned (test-first prep)

- [x] 2.1 Read `src/production-spec/news-carousel-author-checklist.ts` in full: the current
  `logo-reference` item requires `imagePrompt(s).includes(baseline.logoReferenceName)` — the raw,
  underscored name, unconditionally, on every slide.
  Read `src/production-spec/fixtures/news-carousel-author-checklist-specs.ts` (`TEST_BASELINE` +
  `missingLogoReference()`) and `src/production-spec/fixtures/news-carousel-straw-motion-specs.ts`
  (`STRAW_MOTION_BASELINE` + `logoClause()`) — the two places that currently supply/pin
  `NewsCarouselBaselineParams`.
- [x] 2.2 Read the real, committed
  `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` in full (confirmed it
  already carries #108's no-dash rule + #109's four render-fidelity guardrails — compose with both,
  don't revert either).
- [x] 2.3 Confirm `registry.test.ts` asserts only the News Carousel author-phase checklist array's
  LENGTH (8) and mechanical/agent-judged counts, never individual item wording, and that
  `openspec/specs/production-spec/spec.md`'s existing Requirement already understates the checklist's
  real item count (9, missing `companies-cited`) — a pre-existing drift #108/#109 each left in place;
  since this change rewrites this exact Requirement anyway, it states the accurate count instead (see
  `proposal.md` Non-Goals).

## 3. Rework the checklist (test-first: fixtures + tests first, then the item logic)

- [x] 3.1 Add `logoReferencePhrase`/`logoNameGuardrailInstruction` to `NewsCarouselBaselineParams`;
  extend `verifyBaselineParamsAgainstDocument` to check both, verbatim, mirroring the existing four
  checks.
- [x] 3.2 Update `TEST_BASELINE` (deliberately different wording from Straw Motion's, per the file's
  own convention) and parameterize `baselineAdherentImagePrompt()` off the two new fields (no longer a
  hardcoded "the connected reference image" literal). Rename `missingLogoReference()` to
  `logoReferenceNameFreeButGuarded()` (its NEW, correct behavior under the reworked rule); add
  `missingLogoGuardrail()`, `logoNotReferencedAtAll()`, `logoReferenceNameRenderedAsText()`.
- [x] 3.3 Rework the `logo-reference` item: `ok` now requires (raw name OR generic phrase) AND the
  guardrail instruction, for every slide. Add the new `logo-name-not-as-text` reject-only item
  (mirrors `no-dash-tells`/`banned-words`'s precompute-then-report pattern): flags the reference name
  appearing quoted.
- [x] 3.4 Update `news-carousel-author-checklist.test.ts`: item-count assertions (10→11, 11→12); the
  old "fails logo-reference when the name is absent" test is replaced by five tests — passes
  name-free-but-guarded (AC2/AC5), fails when the guardrail alone is missing, fails when the logo
  isn't referenced at all, fails the new item on a quoted-name case (isolated from every other item),
  and the baseline-adherent Spec passes the new item cleanly.
- [x] 3.5 Run `src/production-spec/news-carousel-author-checklist.test.ts`: all pass (27/27, +5 net
  vs. the pre-#110 22 — one old test replaced by five new ones is +4 net there, plus the two
  documentText-construction updates keep the pre-existing doc-verification tests green).

## 4. Keep the graduated Straw Motion fixture + its end-to-end callers in sync

- [x] 4.1 Add `LOGO_REFERENCE_PHRASE`/`LOGO_NAME_GUARDRAIL_INSTRUCTION` constants to
  `news-carousel-straw-motion-specs.ts` (Straw Motion's real, soon-to-be-committed doc wording); add
  both to `STRAW_MOTION_BASELINE`; update `logoClause()` to interpolate `LOGO_REFERENCE_PHRASE` (in
  place of the hardcoded "the connected reference image" literal) and insert
  `LOGO_NAME_GUARDRAIL_INSTRUCTION` after the existing "render unaltered" clause.
- [x] 4.2 Update `news-carousel-straw-motion-fixture.test.ts`'s `items.length` assertion (10→11).
- [x] 4.3 Run `src/producer/carousel-end-to-end.test.ts` + `src/producer/two-recipes-end-to-end.test.ts`
  (both import `STRAW_MOTION_BASELINE`/`strawMotionIdeaOneCarouselSpec`): confirm still green,
  unmodified — proves the fixture change doesn't regress the FAKE-Space-driven end-to-end paths.

## 5. Write the Baseline Prompt document (the actual AC1/AC3 fix)

- [x] 5.1 "Logo" bullet: add the slide-position scale rule (hook ~⅓, every other slide ~⅙). New
  "Logo guardrail — negative-prompt instruction" bullet: the negative clause, plus the "no in-repo
  negative-prompt field" finding and the "state it as an explicit prohibition in the prompt instead"
  fallback. "Unhypped News" pill bullet: same slide-position scale rule.
- [x] 5.2 Reusable template: bracket-ify the fixed "no wider than roughly a third" phrase into a
  `[SCALE — ...]` variable describing both tiers; insert the guardrail sentence after the existing
  "do not restyle it to match the scene." sentence, before the vignette sentence.
- [x] 5.3 All 7 worked JSON examples (explicitly hook-slide illustrations — scale unchanged, per
  `proposal.md`'s scoping): insert the SAME guardrail sentence at the same point, via one `replace_all`
  edit across the identical, byte-for-byte-repeated clause pair.
- [x] 5.4 Proofread: grep the document for the guardrail sentence (8 hits expected: 7 single-line
  JSON examples + the line-wrapped template, confirmed via the normalized-prose test) and for any
  line-wrap hyphen artifact (`grep -nE '[a-zA-Z]-$'`), mirroring issue #109's own self-review step.

## 6. Add the new automated pins for the document (issue's own "guard with docs-tests" instruction)

- [x] 6.1 Extend the existing "STRAW_MOTION_BASELINE's strings are genuinely Straw Motion's own" test
  with the two new fields.
- [x] 6.2 New `describe` block in `news-carousel-straw-motion-fixture.test.ts`: (AC1) the negative
  guardrail phrase present; (AC1) the pre-existing "render unaltered" clause still present, composed
  with, not replaced; (AC3) the slide-position sizing rule present; (AC4) the pre-existing logo/pill
  facts (`STRAW_MOTION_BASELINE.logoReferenceName`/`neverAllCapsInstruction`/`pillText`) still genuine
  substrings; the doc/fixture sync check (every `strawMotionIdeaOneCarouselSpec()` slide carries the
  guardrail + phrase verbatim); the committed fixture still passes the full checklist with BOTH
  `logo-reference` and `logo-name-not-as-text` `ok: true`.
- [x] 6.3 Run the file: all pre-existing + new tests pass (16/16).

## 7. Keep the prose mirrors (SKILL.md, registry.ts) accurate

- [x] 7.1 `.claude/skills/produce-news-carousel/SKILL.md` Step 2: describe the new scale bracket and
  the negative guardrail; keep the docs-test-pinned phrase "document's own logo reference name" intact
  while adding the "OR its name-free generic reference phrase" alternative.
- [x] 7.2 SKILL.md's "Author-phase checklist" mirror: reword the logo-reference bullet; add a bullet
  for the new reject-only item; note the doc-verification bullet now also covers the two new fields.
- [x] 7.3 `src/recipe/registry.ts`'s `NEWS_CAROUSEL_PHASES` author-checklist array: reword the
  "logo reference name" bullet's description (array length/mechanical-agent-judged counts unchanged,
  mirroring issue #108's own precedent).
- [x] 7.4 Run `produce-news-carousel-skill.docs-test.ts` and `src/recipe/registry.test.ts`: both green,
  unchanged assertions.

## 8. OpenSpec

- [x] 8.1 Author `proposal.md` (Why / What Changes / Canvas negative-prompt field finding / Scoping
  note on slide 1 / Non-Goals / Capabilities / Impact), this `tasks.md`, and the two spec deltas:
  `production-spec` (MODIFIED: the checklist Requirement rewritten + the graduated-fixture
  Requirement's item count) and `format-baseline-prompt` (ADDED: the negative guardrail + slide-position
  sizing Requirement).
- [x] 8.2 `openspec validate 110-logo-guardrail-shrink-pill --strict` green.

## 9. Self-review

- [x] 9.1 `npm test` green (type-check + full suite; 1383 baseline → 1393, +10 net, zero regressions).
- [x] 9.2 `npm run test:docs` — confirmed no NEW failure introduced (82 pass / 1 fail, the same
  pre-existing `producer-agent.docs-test.ts` failure; `producer.md` and that test file both appear
  nowhere in this slice's diff).
- [x] 9.3 Simplify pass: confirmed every issue #110 acceptance criterion maps to a named, passing
  test; confirmed no `spaces_*`/`creations_*` call anywhere in the diff; confirmed the four leftover
  W29/ledger files were never opened this session; confirmed no git command was run.
- [x] 9.4 Write the Build Report into `handoff.md`, explicitly flagging that no Magnific fake was
  directly invoked by the new/changed tests (stating which pre-existing FAKE-driven tests were re-run
  to confirm no regression), stating the canvas negative-prompt-field finding plainly, and listing
  known limits (the pre-existing `test:docs` failure; the deliberate choice not to retrofit the
  committed idea-01 fixture's logo scale; the slide-1 scoping judgment call).
