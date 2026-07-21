## Why

A produced News Carousel's 7 slides are supposed to look visually varied — the Format's Baseline
Prompt document confirms 7 distinct card placements, including a "top card, photo below" option — but
the author-phase checklist (`auditNewsCarouselAuthorPhase`) has never once looked at the SPREAD of
`card_style` across a carousel's 7 slides. straw-motion's idea-01 (the 2026-07-21 HITL re-run, run
2026-W29) reproduces the gap concretely: its 7 slides used `full_width`, `floating_toast`,
`small_badge`, `full_width_inset`, `floating_toast`, `small_badge_inset`, `full_width` — 5 distinct
values, all bottom/lower-left, **zero** top-region cards — and the checklist passed it clean, because
its only `card_style` rule is "is this one of the confirmed styles", never "do the 7 slides vary." The
same review also found subjects leaning on the same "product screens/UIs" motif slide after slide, and
real, named people almost never used even though the Baseline Prompt already permits them ("the real,
named person, if the story is clearly theirs").

Issue #106 is a ~13-item epic; this change builds only the one slice its own Triage Assessment carved
out as decision-free and reproduction-confirmed (the Agent Brief): a **mechanical placement-variety
check**, plus stronger authoring guidance for placement spread, subject-type variety, and reaching for
real named people. Items 4–13 (bland copy, the logo-redraw/reference-name design question, the 7-slide
comprehension-formula rewrite, pill/logo sizing, em dashes, font size, full-bleed/vignette rendering,
and the publish/tracking bundle redesign) are explicitly out of scope — several are blocked on open
design decisions the reporter has not yet settled.

## What Changes

- **A new mechanical `placement-variety` checklist item** in
  `auditNewsCarouselAuthorPhase` (`src/production-spec/news-carousel-author-checklist.ts`): given the 7
  slides' `card_style` values, it is `ok: false` when the carousel uses fewer than
  `baseline.minDistinctCardStyles` distinct placements **OR** uses zero placements from
  `baseline.topRegionCardStyles` — both are OR'd failure conditions, so either alone is enough to flag
  a carousel. It is `ok: true` only when both are satisfied. `kind: "mechanical"` (ADR-0017) — fully
  computable from the Spec's own `card_style` fields — and it participates in the overall `ok` exactly
  like every other mechanical item in this checklist.
- **`NewsCarouselBaselineParams` gains two new fields**: `topRegionCardStyles` (which of
  `confirmedCardStyles` sit in the frame's top region) and `minDistinctCardStyles` (the minimum count of
  distinct placements to count as "varied"). Both are DATA, read from the Baseline Prompt document's own
  definitions — never a hardcoded literal in the checked module (ADR-0015), mirroring
  `confirmedCardStyles`'s own existing precedent. Neither is added to
  `verifyBaselineParamsAgainstDocument`'s verbatim cross-check, for the same reason `confirmedCardStyles`
  already isn't: they are the Format's own short names/thresholds, not literal document prose.
- **Straw Motion's real `news-carousel.md` Baseline Prompt document is strengthened**: the Card style
  bullet now actively instructs spreading placements across the vertical range and requires at least one
  top-region ("top card, photo below") placement; the Subject bullet now actively instructs varying the
  subject TYPE slide to slide (not leaning on the same product-screen motif) and reaching for the real,
  named person when a story is clearly theirs, balanced against product shots. No existing locked clause
  (the logo rule, the pill rule, the 7-slide narrative formulas, the reusable template, the worked
  Examples) is touched.
- **The `produce-news-carousel` Skill's authoring guidance is strengthened to match** — its `card_style`
  and `subject` step-1 bullets now carry the same active instructions, and its "Author-phase checklist"
  bullet list gains the new `placement-variety` item — kept in sync via an extended
  `produce-news-carousel-skill.docs-test.ts` (this repo's existing registry-pinned docs-test pattern for
  this exact Skill file).
- **Test fixtures updated for genuine variety.** The stand-in `TEST_BASELINE`
  (`news-carousel-author-checklist-specs.ts`) gains a top-region style and the new threshold fields, plus
  two new focused fixtures (`allBottomPlacements`, `tooFewDistinctPlacements`) that isolate each half of
  the OR-condition. The real `STRAW_MOTION_BASELINE` (`news-carousel-straw-motion-specs.ts`) gains the
  document's full real 7-style catalog, its own top-region styles, and its `minDistinctCardStyles`; its
  `strawMotionIdeaOneCarouselSpec()` fixture is diversified (one slide now genuinely renders the "top
  card, photo below" composition) so it demonstrates a real, on-contract, VARIED carousel — not just a
  monotone one that happens to pass every other check.

## Non-Goals (explicitly deferred — see the issue's own "Out of scope")

- **Items 4/6 — bland copy, reengineering the 7-slide comprehension formula.** Copy-step /
  idea-strategist subsystem; a separate, larger slice.
- **Item 5 — the logo being redrawn instead of composited, and the `Straw_Motion_Logo` reference name
  sometimes rendering as on-image text.** Needs a design decision (natural-language reference vs.
  compositing the real file) and changes the checklist's own logo-reference rule + canvas handling —
  untouched here.
- **Item 7 — shrinking the "Unhypped News" pill and the logo on slides 2–6.** A sizing/taste call on a
  fixed clause; untouched here.
- **Item 8 — fake on-screen UI text rendering as gibberish.** A model limitation / prompt-guidance
  question, not mechanically checkable.
- **Item 9 — forbidding em dashes in copy.** Lives in the copy step / Brand copy rules, a different
  subsystem; its own clean slice, deliberately not bundled here.
- **Items 10/11/12 — supporting-line font size, full-bleed/no letterboxing, vignette-not-black-box.**
  Baseline-doc clause wording + canvas render/output settings; render-behavior, not mechanically
  testable in this hermetic suite.
- **Item 13 + the Round-4 "publish + tracking bundle" redesign.** Blocked on the reporter's own open
  design questions (folder/file naming, metadata format, confirming it is a generated view of the ledger
  per always-rule 7, and which lifecycle step refreshes it) — a human decision, not this agent's to make.
- **The fixed 7-role narrative order, the 140-char on-card text limit, and the existing logo/pill/
  banned-word checks** are unchanged — this slice only ADDS the placement-variety item alongside them.
- **No re-render.** idea-01/02/03's actual production data
  (`data/brands/straw-motion/ideas/2026-W29/…`) is untouched — this slice is checklist/doc/Skill code
  only; the W29 run's corrections were applied by hand, out of band, and are not this slice's concern.

## Capabilities

### Modified Capabilities

- `production-spec`: `auditNewsCarouselAuthorPhase` gains the `placement-variety` mechanical checklist
  item; `NewsCarouselBaselineParams` gains `topRegionCardStyles`/`minDistinctCardStyles`; the real
  Straw Motion Baseline Prompt document's Card-style and Subject guidance is strengthened.
- `producer-skill`: the `produce-news-carousel` Skill's authoring guidance and checklist bullet list are
  strengthened and kept in sync with the code, pinned by its existing docs-test.

## Impact

- **New/changed code:** `src/production-spec/news-carousel-author-checklist.ts` (+`.test.ts`),
  `src/production-spec/fixtures/news-carousel-author-checklist-specs.ts`,
  `src/production-spec/fixtures/news-carousel-straw-motion-specs.ts`,
  `src/production-spec/news-carousel-straw-motion-fixture.test.ts`,
  `src/production-spec/produce-news-carousel-skill.docs-test.ts`,
  `.claude/skills/produce-news-carousel/SKILL.md`,
  `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`.
- **Not touched:** `src/production-spec/news-carousel-validate.ts`,
  `src/production-spec/news-carousel-brand-safety.ts`, `src/production-spec/news-carousel-contract.ts`
  (the structural contract/validator/banned-word scan are REFERENCED, never re-implemented or
  weakened); `src/recipe/registry.ts` (its own static, DECLARED `NEWS_CAROUSEL_PHASES` checklist listing
  already predates issue #102's `companies-cited` item and is left as-is here too — a pre-existing,
  out-of-scope drift between the registry's descriptive listing and the checklist function's real,
  dynamic item set; not this slice's concern to reconcile); `.claude/agents/producer.md` (generic,
  Recipe-agnostic — reads "the Skill's own checklist" dynamically, names no item count); any Space
  driver, execution-protocol, or production-queue code; the actual production data under
  `data/brands/straw-motion/ideas/2026-W29/`.
- **Hermetic build.** No Magnific fake is exercised by this slice — every new/changed module is a pure,
  deterministic deep module (a checklist function, test fixtures, and prose documents) tested with
  plain in-memory data and real committed files (the Baseline Prompt markdown, the SKILL.md). No
  `spaces_*`/`creations_*` call anywhere; no credits; no board mutation.
- **Always-rules upheld:** generate-never-publish (no publish code touched; the Skill's own "never
  publishes" line is unchanged); public-metrics-only/relative-not-absolute (no metrics code touched);
  explicit-attribution (no Post/attribution code touched); the banned-word hard filter (rule 9) is
  unchanged, still reject-only; ledger-as-source-of-truth is unaffected (no ledger-write path touched).
