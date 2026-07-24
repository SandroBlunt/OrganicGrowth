## 1. Ground the current Character Explainer contract + Copy step + the #120/#122 precedent

- [x] 1.1 Read issue #125 in full, plus its parent epic #120 and the merged PR #122 (`git show`
  4606bd682...) — the exact pattern to mirror: `CopySlideBeat.companies` on `src/copy/draft.ts`, the
  `newsCarouselSlideNarrative` wiring module, and the `write-social-copy` Skill's own companies
  guidance.
- [x] 1.2 Read `src/production-spec/contract.ts` + `validate.ts` in full: confirm today's Character
  Explainer Spec (`character_concepts` + `clips` + `thumbnails`) has NO companies concept at all —
  unlike News Carousel, this field must be ADDED here, not merely threaded further downstream.
- [x] 1.3 Read `src/production-spec/news-carousel-contract.ts`'s `CarouselSlide.companies` (per-slide,
  always-present) and confirm `thumbnails`'s own top-level (not per-clip) precedent on THIS Recipe's
  contract — decide per-Asset (top-level, OPTIONAL) fits this Recipe's shape better than per-clip: all
  3 clips render one continuous narrative about the SAME picked Character.
- [x] 1.4 Read `src/copy/draft.ts` in full: confirm `CopyInput.mediaContext` is this Recipe's own
  "what was actually produced" input (free text, no `slideNarrative` beats) — the new `companies` field
  therefore sits at the WHOLE-Asset grain, sibling to `mediaContext`, not inside a beat.
  `src/recipe/registry.ts`'s `CHARACTER_EXPLAINER_PHASES` author-phase checklist has a PINNED item
  count (`registry.test.ts`: "exactly 3 items") — confirms no new mechanical checklist item may be
  added there without breaking an existing test (AC6: additive-only).
- [x] 1.5 Read `.claude/skills/produce-character-explainer/SKILL.md` +
  `produce-character-explainer-skill.docs-test.ts` in full (the author-phase Skill to extend).
- [x] 1.6 Read `.claude/skills/write-social-copy/SKILL.md` + `write-social-copy-skill.docs-test.ts` in
  full (the copy-step Skill to extend, already carrying #120's companies guidance for News Carousel).
- [x] 1.7 Run `npm test`, `npm run test:docs`, `npx openspec validate --all --strict` standalone to
  capture the exact baseline: 1498 pass / 0 fail (unit), 116 pass / 0 fail (docs), 30/30 openspec items
  — zero pre-existing failures to work around.

## 2. ProductionSpec.companies — the contract + validator (test-first)

- [x] 2.1 Write new tests in `src/production-spec/validate.test.ts` FIRST (failing): a Spec with no
  `companies` field is accepted (backward compatible); a Spec with a non-empty `companies` list is
  accepted; a Spec with an explicit empty `companies` list is accepted; a Spec whose `companies` is
  present but not an array is rejected (`companies_shape`); a Spec whose `companies` array contains a
  blank entry is rejected (`companies_shape`).
- [x] 2.2 Add `companies?: readonly string[]` to `ProductionSpec` (`src/production-spec/contract.ts`),
  doc-commented with the per-Asset-vs-per-clip decision. Add the matching optional-shape check + new
  `"companies_shape"` `ValidationCode` to `validate()` (`src/production-spec/validate.ts`). Add new
  fixtures (`specWithCompanies`, `specWithEmptyCompanies`, `companiesNotArray`, `companiesBlankEntry`)
  to `src/production-spec/fixtures/specs.ts`, `validSpec()` itself left UNCHANGED. Run 2.1: green.

## 3. generate.ts / composeSpec — the deterministic author-phase proof (test-first)

- [x] 3.1 Write new tests in `src/production-spec/generate.test.ts` FIRST (failing): a Brief with no
  `companies` field yields a Spec with no `companies` field (absent, never invented); a Brief naming
  real companies yields a Spec whose `companies` matches exactly; a Brief with an explicit empty
  `companies` array yields a Spec with an explicit empty array (not dropped).
- [x] 3.2 Add `companies?: readonly string[]` to `Brief` (`src/production-spec/generate.ts`); thread it
  through unchanged onto the generated Spec, omitting the key entirely when the Brief's own field is
  undefined (`exactOptionalPropertyTypes`-safe). Run 3.1: green.
- [x] 3.3 Add end-to-end tests to `src/production-spec/compose.test.ts`: a Brief naming companies
  writes a Spec whose `companies` survives to disk (`composeSpec` -> `saveSpec` -> re-read -> compare);
  a Brief naming none writes a Spec with no `companies` key at all.

## 4. characterExplainerCompanies — the Copy-step wiring function (test-first)

- [x] 4.1 Write `src/copy/character-explainer-companies.test.ts` FIRST (failing): a Spec's non-empty
  `companies` is carried through unchanged; an explicit empty `companies` is carried through as `[]`;
  an ABSENT `companies` field normalizes to `[]` (never fabricated, never throws); the function never
  mutates its input Spec; it is deterministic. Plus the concrete AC5 proof: an absent-companies Spec's
  wired-through `CopyInput.companies` (`[]`), drafted via `skillDraftCopy`, produces a caption
  BYTE-IDENTICAL to the same input with `companies` omitted entirely (the pre-#125 shape) — and a
  present, non-empty `companies` list ALSO produces a byte-identical caption, proving the deterministic
  drafter's own output is unaffected either way.
- [x] 4.2 Implement `characterExplainerCompanies(spec): readonly string[]` in
  `src/copy/character-explainer-companies.ts` (pure, no I/O, no model call, no clock). Run 4.1: green.
- [x] 4.3 Add `companies?: readonly string[]` to `CopyInput` (`src/copy/draft.ts`), doc-commented as
  the whole-Asset-grain sibling of `CopySlideBeat.companies`.
- [x] 4.4 Add a new test to `src/copy/draft.test.ts`: a top-level `CopyInput.companies` list (present
  non-empty, present empty, absent) never changes `skillDraftCopy`'s OR `defaultDraftCopy`'s
  deterministic output — mirrors the #120 `CopySlideBeat.companies` availability proof exactly.
- [x] 4.5 Add an end-to-end test to `src/copy/compose.test.ts`: a saved Character Explainer Spec's
  `companies` threaded via `characterExplainerCompanies` through `composeCopy` (drafter:
  `skillDraftCopy`) against that Recipe's own `copyShape`, asserting `ok: true` and `validateCopy`
  still passes — proves the WHOLE pipeline stays green with the new field flowing through it.

## 5. The two Skills' own instructions (test-first)

- [x] 5.1 Write new `describe` blocks in `src/production-spec/produce-character-explainer-skill.docs-test.ts`
  FIRST (failing): the Skill names the TOP-LEVEL `companies` field; instructs populating it from the
  Idea brief when real companies/products are named; instructs omitting it entirely when the brief
  names none, never invented.
- [x] 5.2 Update `.claude/skills/produce-character-explainer/SKILL.md`: Inputs item 2 (the brief may
  name real companies/products), a new authoring step (step 4, renumbering self-audit/emit to 5/6), a
  new self-audit checklist bullet, the emit step's shape description, and the bottom checklist summary.
  Run 5.1: green.
- [x] 5.3 Write new `describe` blocks in `src/copy/write-social-copy-skill.docs-test.ts` FIRST
  (failing): the Skill names `CopyInput.companies`/`characterExplainerCompanies` for the Character
  Explainer Recipe; names that Recipe by name; instructs naming companies "at either grain".
- [x] 5.4 Update `.claude/skills/write-social-copy/SKILL.md`: Inputs item 4 and the Steps section 1
  "Name the real companies/products" bullet, generalized to cover BOTH grains (`CopySlideBeat.companies`
  per-beat, `CopyInput.companies` per-Asset) — kept the ORIGINAL #120 phrasing pattern intact
  (`companies` ... `empty or absent`) so the pre-existing #120 docs-test assertion keeps passing
  unmodified. Run 5.3 and the WHOLE pre-existing #120/#111 docs-test suite: both green.

## 6. OpenSpec

- [x] 6.1 Author `proposal.md` (Why / What Changes / Non-Goals / Capabilities / Impact), this
  `tasks.md`, and three spec deltas: `production-spec` (MODIFIED — `ProductionSpec.companies` +
  `validate()`), `copy-composition` (MODIFIED/ADDED — `CopyInput.companies` +
  `characterExplainerCompanies`), `producer-skill` (MODIFIED — both Skills' companies guidance).
- [x] 6.2 `openspec validate 125-character-explainer-companies-in-copy --strict` green.

## 7. Self-review

- [x] 7.1 `npm test` green (type-check + full suite; baseline 1498 pass / 0 fail -> 1517 pass / 0 fail,
  +19 tests, zero regressions).
- [x] 7.2 `npm run test:docs` green (baseline 116 pass / 0 fail -> 122 pass / 0 fail, +6 tests, zero
  regressions).
- [x] 7.3 Simplify pass: confirm every issue #125 acceptance criterion maps to a named, passing test;
  confirm no `spaces_*`/`creations_*` call anywhere in the diff; confirm `src/recipe/registry.ts`
  (pinned checklist counts), `src/production-spec/news-carousel-*`, `.claude/agents/producer.md`, the
  Channel model, and `brand-profile.yaml` were never touched; confirm no git command beyond read-only
  inspection was run; remove any dead code/unused import.
- [x] 7.4 Write the Build Report into `handoff.md`: what changed, files touched, how to run, per-AC
  self-assessment mapping each AC to its proving test, fakes/fixtures used (explicitly: no Magnific
  fake needed — this slice's code has no Space/MCP call of its own), self-review notes, known limits
  (the Non-Goals above, restated for qa).
