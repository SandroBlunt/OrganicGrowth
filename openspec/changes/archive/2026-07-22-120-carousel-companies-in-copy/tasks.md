## 1. Ground the current copy step + News Carousel Spec contract before touching anything

- [x] 1.1 Read the issue #120 GitHub issue and its triage Agent Brief comment in full (the authoritative
  spec for this slice — the issue body itself describes a much larger, explicitly out-of-scope epic).
- [x] 1.2 Read `src/production-spec/news-carousel-contract.ts` in full: confirm `CarouselSlide.companies`
  is `readonly string[]` (never optional on the Spec side — always present, possibly empty).
- [x] 1.3 Read `src/copy/draft.ts` + `src/copy/draft.test.ts` in full: confirm `CopySlideBeat`'s current
  shape (`role`/`text`/`statCallout?`), that `statCallout` is declared on the type but not actually
  consumed into the caption body by either `defaultDraftCopy` or `skillDraftCopy` today (a type-level,
  additive-field precedent to mirror for `companies` — no drafter is required to read it into the
  caption text; naming companies naturally is the Skill's own LLM job).
- [x] 1.4 Read `src/copy/compose.ts` + `compose.test.ts` in full: confirm `composeCopy`'s signature is
  unaffected by an additive `CopySlideBeat` field (no change needed there).
- [x] 1.5 Grep the whole repo for any existing "Spec slides -> CopySlideBeat[]" wiring function: NONE
  exists today (the real attended production flow has the LLM producer read the saved Spec directly, no
  code function builds `CopyInput.slideNarrative` from it) — confirms this slice adds a NEW pure module,
  not modifies an existing one.
- [x] 1.6 Read `.claude/skills/write-social-copy/SKILL.md` + `src/copy/write-social-copy-skill.docs-test.ts`
  in full (the copywriting Skill precedent + its pinned assertions to extend, never break).
- [x] 1.7 Read `src/production-spec/news-carousel-author-checklist.ts`'s `companies-cited` checklist item
  (the precedent for "mechanical: cited in the data" vs. `grounded-subject`'s `kind: "agent-judged"` —
  the SAME split this slice's own "data available" vs. "caption reads well" tests/docs mirror).
- [x] 1.8 Run `npm test` and `npm run test:docs` standalone to capture the exact baseline: 1469 pass / 0
  fail (unit), 108 pass / 0 fail (docs) — zero pre-existing failures to work around.

## 2. CopySlideBeat gains companies (test-first)

- [x] 2.1 Write a new test in `src/copy/draft.test.ts` FIRST (failing): a `skillDraftCopy` call given a
  `slideNarrative` beat carrying `companies` (non-empty on one beat, `[]` on another, absent on a third)
  compiles, does not throw, produces a `Copy` still passing `validateCopy`, and — the additive-field
  proof — produces the IDENTICAL output to the SAME `slideNarrative` with `companies` stripped entirely
  (proving the field's mere presence changes nothing about the deterministic drafter's own behavior;
  naming companies is the Skill's own LLM job, never a fixed template it can be tested against).
- [x] 2.2 Add `companies?: readonly string[]` to `CopySlideBeat` (`src/copy/draft.ts`), doc-commented
  mirroring `statCallout`'s own comment. Run 2.1: green.

## 3. newsCarouselSlideNarrative — the wiring function (test-first)

- [x] 3.1 Write `src/copy/news-carousel-slide-narrative.test.ts` FIRST (failing): a 7-slide, TYPED
  `NewsCarouselSpec` fixture (one slide with an empty `companies` array) maps to `CopySlideBeat[]` in
  the SAME order, with `role`/`text`/`statCallout`/`companies` each carried through EXACTLY —
  including the empty-array slide's `companies` staying `[]` (present, not omitted, not fabricated);
  the function never mutates its input Spec; it is deterministic (same Spec in, same beats out). Plus
  the concrete AC4 proof: an ALL-empty-companies Spec's wired-through `slideNarrative`, drafted via
  `skillDraftCopy`, produces a caption BYTE-IDENTICAL to the same narrative with `companies` omitted
  entirely — the pre-#120 shape — proving an empty-companies Spec changes nothing about caption
  behavior (never a fabricated mention).
- [x] 3.2 Implement `newsCarouselSlideNarrative(spec): readonly CopySlideBeat[]` in
  `src/copy/news-carousel-slide-narrative.ts` (pure, no I/O, no model call, no clock). Run 3.1: green.
- [x] 3.3 Add an end-to-end test to `src/copy/compose.test.ts`: a saved News Carousel Spec's `companies`
  (mixed empty/non-empty per slide) threaded via `newsCarouselSlideNarrative` through `composeCopy`
  (drafter: `skillDraftCopy`) against the News Carousel Recipe's own `copyShape`, asserting `ok: true`
  and `validateCopy` still passes — proves the WHOLE pipeline (wiring function -> drafter -> inject ->
  validate) stays green with the new field flowing through it.

## 4. The write-social-copy Skill's own instructions (test-first)

- [x] 4.1 Write new `describe` blocks in `src/copy/write-social-copy-skill.docs-test.ts` FIRST
  (failing): the Skill names `companies`/`CopySlideBeat` as part of its documented produced-narrative
  input; instructs naming the real companies/products from that field, grounded in the Spec (mirroring
  the author phase's own `companies-cited` "grounded, never invented" standard); states an empty/absent
  `companies` field contributes NO mention — never invented or re-guessed.
- [x] 4.2 Update `.claude/skills/write-social-copy/SKILL.md`: Inputs item 4 (mention `companies`
  alongside `role`/`text`/`stat_callout`) and Steps section 1 (a new bullet instructing grounded
  company/product naming, never fabricated, when `companies` is present; explicitly framed as the
  Skill's own LLM judgment call for WORDING, never a fixed template — only which companies exist to
  draw on is fixed by the data). Run 4.1: green.
- [x] 4.3 Re-run the WHOLE `write-social-copy-skill.docs-test.ts` file (every pre-existing #111
  assertion): still green, unmodified — proves the addition is purely additive to the doc.

## 5. OpenSpec

- [x] 5.1 Author `proposal.md` (Why / What Changes / Non-Goals / Capabilities / Impact), this
  `tasks.md`, and two spec deltas: `copy-composition` (MODIFIED — `CopySlideBeat.companies` +
  `newsCarouselSlideNarrative`), `producer-skill` (MODIFIED — the write-social-copy Skill's companies
  guidance).
- [x] 5.2 `openspec validate 120-carousel-companies-in-copy --strict` green.

## 6. Self-review

- [x] 6.1 `npm test` green (type-check + full suite; baseline 1469 pass / 0 fail -> record the new
  total, net delta, zero regressions).
- [x] 6.2 `npm run test:docs` green (baseline 108 pass / 0 fail -> record the new total, zero
  regressions).
- [x] 6.3 Simplify pass: confirm every issue #120 acceptance criterion maps to a named, passing test;
  confirm no `spaces_*`/`creations_*` call anywhere in the diff; confirm `.claude/agents/producer.md`,
  the Character Explainer Recipe, the Channel model, and `brand-profile.yaml` were never touched;
  confirm no git command beyond read-only inspection was run; remove any dead code/unused import.
- [x] 6.4 Write the Build Report into `handoff.md`: what changed, files touched, how to run, per-AC
  self-assessment mapping each AC to its proving test, fakes/fixtures used (explicitly: no Magnific
  fake needed — this slice's code has no Space/MCP call of its own), self-review notes, known limits
  (the Non-Goals above, restated for qa).
