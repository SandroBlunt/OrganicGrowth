# Slice Handoff — issue #110: News Carousel: logo consistency via negative-prompt guardrail + shrink pill/logo on slides 2–6

Bidirectional channel for this slice. `developer` writes the Build Report below; `qa` appends its
Verdict beneath it. Nothing here is ever overwritten — retries append `Round-N Build` blocks.

---

## Build Report (Round 1)

### What changed

Epic #106 items 5 and 7, stacked on #108 (no-dash-tells) and #109 (render-fidelity guardrails):

1. **(Item 5) Logo consistency via a negative-prompt guardrail — not compositing the real file
   (Operator's decision).** The News Carousel author-phase checklist's `logo-reference` item
   (`src/production-spec/news-carousel-author-checklist.ts`) previously **required** the raw,
   underscored reference name (e.g. `Straw_Motion_Logo`) in every slide's `image_prompt` — the exact
   thing that sometimes made the model print it as visible on-image text instead of using it as a bare
   reference identifier. It is now reworked: a prompt passes as long as it (a) references the
   connected logo — via the raw reference name **or** the Baseline Prompt's new, name-free generic
   reference phrase (`logoReferencePhrase`) — **and** (b) carries the document's new negative-prompt
   guardrail instruction (`logoNameGuardrailInstruction`) verbatim. A new, separate reject-only item,
   `logo-name-not-as-text`, flags the specific anti-pattern the reproduction showed: the reference name
   appearing QUOTED (this document's own convention for literal on-image text) — a strong signal a
   prompt is telling the model to DRAW the name.
2. **(Item 7) Shrink the "Unhypped News" pill + logo on slides after the hook.** The Baseline Prompt
   document now instructs a noticeably smaller pill + logo scale on every slide after the hook
   (`slide_index` 1-6: ~⅙ frame width for the logo) versus the hook slide itself (`slide_index` 0: the
   pre-existing ~⅓ frame width), so the copy/subject carry more of each non-hook slide's visual
   weight.

**No in-repo negative-prompt canvas field exists** (verified — see "Canvas negative-prompt field
finding" below), so the guardrail is authored as an explicit prohibitory clause inside the
`image_prompt` text itself, exactly as the issue's own "otherwise" fallback anticipates.

Composed with #108's no-dash rule and #109's four render-fidelity guardrails — neither removed nor
conflicted with; the new bullets/sentences were inserted alongside the existing "Card text",
"Photo"/"Subject", and vignette clauses, never replacing them.

### Canvas negative-prompt field finding

Verified, not assumed:

- The live-captured Carrousel Space board JSON DOES carry a raw `negativePrompt` attribute on its
  "Image Generator #21" node (`src/space-driver/fixtures/live-captures/carrousel/00-spaces_show.fullboard.json`),
  currently an empty string.
- BUT `src/recipe/registry.ts`'s `RecipeCanvasInputs`/`RecipeSpaceNodes` types carry a single text
  `promptNode` plus a named media-slot map only — no negative-prompt field of any kind, for either
  wired Recipe.
- `src/space-driver/port.ts`'s `SpaceMcpPort` interface (`readState`, `edit`, `editStatus`, `run`,
  `runStatus`, `fetchCreations`, `verifyPinned` — 7 methods) has no primitive to set a per-node
  attribute like `negativePrompt` distinct from the single injectable prompt-text node.
- `src/producer/fixtures/fake-carousel-space.ts` (the Magnific fake for this Recipe) models the same
  narrow port surface — no negative-prompt primitive either.
- A repo-wide grep for `negativePrompt`/`setNegativePrompt` outside the read-only live-capture
  JSON/README finds nothing.

**Conclusion: no in-repo negative-prompt canvas field exists for this Recipe to set.** The guardrail
is authored as an explicit prohibitory clause inside the `image_prompt` text — the issue's own
documented fallback — at all three layers of the document (top bullets, the reusable template, and
all 7 worked JSON examples), mirroring #109's own precedent that the Skill "starts from the
document's own worked example for the `card_style` you chose."

### Scoping note on slide 1 ("then")

The issue's own text says "slides 2-6" shrink and "the hook slide (0)" may stay large, using the
Spec's 0-indexed `slide_index` convention (confirmed by its own "(0)" annotation) — leaving
`slide_index` 1 ("then") unassigned to either bucket. Rather than invent an unrequested third size
tier, the document instructs "every slide after the hook (`slide_index` 1-6)" shrinks — a superset of
"slides 2-6" that satisfies the acceptance criterion (2-6 is a subset of 1-6) without an arbitrary
gap. A judgment call, not a silent scope change — flagged here and in `proposal.md`.

### Files touched

**New:**
- `openspec/changes/110-logo-guardrail-shrink-pill/proposal.md`
- `openspec/changes/110-logo-guardrail-shrink-pill/tasks.md`
- `openspec/changes/110-logo-guardrail-shrink-pill/specs/production-spec/spec.md`
- `openspec/changes/110-logo-guardrail-shrink-pill/specs/format-baseline-prompt/spec.md`
- `openspec/changes/110-logo-guardrail-shrink-pill/handoff.md` (this file)

**Modified:**
- `src/production-spec/news-carousel-author-checklist.ts` — `NewsCarouselBaselineParams` gains
  `logoReferencePhrase`/`logoNameGuardrailInstruction`; `verifyBaselineParamsAgainstDocument` checks
  both; the `logo-reference` item reworked (name OR phrase, AND the guardrail); new
  `logo-name-not-as-text` reject-only item (mirrors the `no-dash-tells`/`banned-words`
  precompute-then-report pattern); new module-doc section explaining the issue #110 design.
- `src/production-spec/fixtures/news-carousel-author-checklist-specs.ts` — `TEST_BASELINE` gains the
  two new fields (deliberately different wording from Straw Motion's real strings, per the file's own
  convention); `baselineAdherentImagePrompt()` parameterized off them (no longer a hardcoded
  "the connected reference image" literal); `missingLogoReference()` renamed to
  `logoReferenceNameFreeButGuarded()` (its new, correct behavior under the reworked rule); added
  `missingLogoGuardrail()`, `logoNotReferencedAtAll()`, `logoReferenceNameRenderedAsText()`.
- `src/production-spec/news-carousel-author-checklist.test.ts` — item-count assertions (10→11,
  11→12); the old logo-reference-absent test replaced by 5 new tests (net +4); the 3
  `documentText`-construction blocks updated to include the two new fields.
- `src/production-spec/fixtures/news-carousel-straw-motion-specs.ts` — Straw Motion's real
  `LOGO_REFERENCE_PHRASE`/`LOGO_NAME_GUARDRAIL_INSTRUCTION` constants added; `STRAW_MOTION_BASELINE`
  and `logoClause()` updated to carry them (the "no wider than a third" wording is left AS-IS — see
  Known limits).
- `src/production-spec/news-carousel-straw-motion-fixture.test.ts` — item-count assertion (10→11);
  the "STRAW_MOTION_BASELINE's strings are genuinely Straw Motion's own" test extended with the two
  new fields; new `describe` block (6 tests) pinning the negative guardrail + slide-position sizing
  prose + the doc/fixture sync + the full-checklist pass.
- `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` — new "Logo guardrail"
  bullet; "Logo"/pill bullets gain the slide-position scale rule; the reusable template's scale phrase
  bracket-ified + the guardrail sentence inserted; all 7 worked JSON examples gain the guardrail
  sentence (one `replace_all` edit, verified 7 hits = 7 examples; the template's own occurrence is
  line-wrapped, confirmed present via the normalized-prose test).
- `.claude/skills/produce-news-carousel/SKILL.md` — Step 2 describes the new scale bracket + the
  negative guardrail (composes with the pre-existing "render unaltered" mention); the "Author-phase
  checklist" mirror reworded for the `logo-reference` item + a new bullet for
  `logo-name-not-as-text`; kept the docs-test-pinned phrase "document's own logo reference name"
  intact.
- `src/recipe/registry.ts` — `NEWS_CAROUSEL_PHASES`'s author-checklist "logo reference name" bullet
  reworded (array length/mechanical-agent-judged counts unchanged — mirrors #108's own precedent of
  not 1:1-syncing this coarser summary to the graduated checklist's item count; confirmed via
  `registry.test.ts`, unmodified, still green).

**Re-run, unmodified, to confirm no regression:**
`src/producer/carousel-end-to-end.test.ts`, `src/producer/two-recipes-end-to-end.test.ts` (both import
`STRAW_MOTION_BASELINE`/`strawMotionIdeaOneCarouselSpec`), `src/production-spec/produce-news-carousel-skill.docs-test.ts`,
`src/recipe/registry.test.ts`.

**Explicitly NOT touched (per this run's guardrails — a separate, in-progress HITL run):**
`data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.spec.json`, `idea-02...`, `idea-03...`,
`data/brands/straw-motion/ledger.json`. Never opened with Read/Write/Edit this session — `git status`
shows them modified, but that state predates this session (confirmed at the very start, before any
tool call).

### How to run

```bash
npm test                                                             # full suite: tsc --noEmit + all *.test.ts
node --import tsx --test src/production-spec/news-carousel-author-checklist.test.ts
node --import tsx --test src/production-spec/news-carousel-straw-motion-fixture.test.ts
node --import tsx --test src/producer/carousel-end-to-end.test.ts src/producer/two-recipes-end-to-end.test.ts
node --import tsx --test src/production-spec/produce-news-carousel-skill.docs-test.ts
node --import tsx --test src/recipe/registry.test.ts
openspec validate 110-logo-guardrail-shrink-pill --strict            # this change
openspec validate --all --strict                                     # whole project
npm run test:docs                                                    # separate from the npm test gate; confirms no NEW failure
```

Result: **1393 pass / 0 fail / 371 suites** (baseline on this branch was 1383 pass / 370 suites; +10
net new tests, +1 new suite — the new `describe` block in `news-carousel-straw-motion-fixture.test.ts`
— zero regressions).
`npm run test:docs`: **82 pass / 1 fail** — the one failure is the same pre-existing, unrelated
`producer-agent.docs-test.ts` case (see Known limits) — neither `producer.md` nor that test file
appears anywhere in this slice's diff.
`openspec validate 110-logo-guardrail-shrink-pill --strict`: **valid.**
`openspec validate --all --strict`: **28 passed, 0 failed.**

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proving test(s) |
|---|---|---|
| 1 | The Baseline Prompt document carries a negative/guardrail clause: reference image used unaltered; no redraw/restyle/recolor; the reference name/filename is never rendered as visible text | `news-carousel-straw-motion-fixture.test.ts`'s new `describe("news-carousel.md carries the issue #110...")` → `"(AC1) instructs never rendering the logo's reference name/filename as visible on-image text — a negative-prompt guardrail"` (reads the REAL committed document) and `"(AC1) still instructs the logo rendered unaltered..."` (proves composition, not replacement) |
| 2 | The author checklist's logo rule is reworked so a prompt WITHOUT the raw underscored reference name still passes (given the logo reference + negative guardrail are present); the old "must contain the literal reference name" requirement no longer forces the leak | `news-carousel-author-checklist.test.ts`'s `"passes the reworked logo-reference item when the raw reference name is absent but the generic phrase + negative guardrail are present (issue #110 AC2/AC5)"` — explicitly asserts the raw name is genuinely absent from every slide's `image_prompt`, then asserts `logo-reference`'s `ok` is `true`. Complemented by `"fails the logo-reference item when the negative guardrail instruction is absent..."` and `"fails the logo-reference item when the logo is not referenced at all..."`, proving the item isn't vacuously true |
| 3 | The Baseline Prompt document instructs a smaller pill + logo on slides 2–6, larger allowed on the hook slide (slide 0) | `news-carousel-straw-motion-fixture.test.ts`'s `"(AC3) instructs a smaller pill + logo on every slide after the hook, larger allowed on the hook slide (slide_index 0)"` — reads the REAL document and asserts the "scale varies by slide position"/"hook slide (slide_index 0)"/"no wider than ~⅙ frame width"/"noticeably smaller" phrases are present |
| 4 | Existing logo/pill checklist checks (unaltered-logo, never-all-caps pill, etc.) still pass; pinned docs-tests updated | `news-carousel-straw-motion-fixture.test.ts`'s `"(AC4) the pre-existing logo/pill checklist facts... are still genuine substrings of the document"` + its pre-existing `"passes auditNewsCarouselAuthorPhase parameterized with Straw Motion's REAL baseline strings"` test (now asserting `items.length === 11`, still `ok: true`) + the pre-existing `"news-carousel.md instructs the four render-fidelity guardrails (issue #109)"` block, unmodified and still green. `produce-news-carousel-skill.docs-test.ts` and `src/recipe/registry.test.ts` re-run unmodified, still green |
| 5 | `npm test` green, with a test showing a name-free-but-guarded prompt passes the reworked logo rule AND a reference-name-as-text case is discouraged/flagged | `npm test`: 1393/0/371 (see above). Name-free-but-guarded: the SAME test cited for AC2. Reference-name-as-text flagged: `"fails the new logo-name-not-as-text item when the reference name is rendered as literal quoted on-image text (issue #110 AC5) — isolated from every other item"` — asserts `ok: false`, a `detail` naming the exact slide field, AND that `logo-reference`/`pill-text-caps` remain `ok: true` (isolated mutation) |

### Fakes / fixtures used

- **Magnific fake — explicitly flagged, per the pipeline's own instruction.** No NEW test in this
  slice invokes `FakeCarouselSpace`/`FakeSpace` directly — every new/changed assertion is plain-file
  (a real markdown-document read via `loadFormat`/`loadBaselinePrompt`) or pure in-memory-fixture
  (`TEST_BASELINE`, `STRAW_MOTION_BASELINE`, `strawMotionIdeaOneCarouselSpec()`). Two PRE-EXISTING
  tests that DO drive `FakeCarouselSpace` — `src/producer/carousel-end-to-end.test.ts` and
  `src/producer/two-recipes-end-to-end.test.ts` — were re-run, UNMODIFIED, specifically to confirm the
  updated `STRAW_MOTION_BASELINE`/`strawMotionIdeaOneCarouselSpec()` fixture still drives them
  cleanly; both pass. No live `spaces_*`/`creations_*` call was made anywhere in this session. I was
  not given, and did not use, the Magnific MCP tools. No credits spent, no board mutated.
- **Real-file + in-memory fixtures:**
  - The real, committed `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`,
    read via the real `loadFormat("straw-motion", "unhypped-news")` +
    `loadBaselinePrompt(..., "news-carousel")` — a plain-file read, no network, no Space.
  - `STRAW_MOTION_BASELINE` / `strawMotionIdeaOneCarouselSpec()` — an in-memory fixture built from
    constants that mirror the document's own verbatim clauses (now including the two new #110
    fields).
  - The separate, deliberately-different stand-in `TEST_BASELINE`/`baselineAdherentCarouselSpec()`
    (`news-carousel-author-checklist-specs.ts`) — an in-memory fixture, no document read.

### Self-review notes

- Considered whether `logoReferencePhrase` needed to be a code-level parameter at all, versus a
  hardcoded structural constant (since "the connected reference image" describes HOW Magnific
  reference-binding works, arguably a universal, non-Brand-specific fact). Decided to parameterize it
  anyway, consistently with issue #85's established "parameterize everything from the document, never
  assume any wording is fixed" philosophy (mirrored by `neverAllCapsInstruction`, which is similarly
  generic-sounding but still parameterized) — and gave the stand-in `TEST_BASELINE` deliberately
  DIFFERENT wording ("the linked reference image") from Straw Motion's real "the connected reference
  image", so the existing non-hardcoding proof extends cleanly to the two new fields too.
- Parameterized `baselineAdherentImagePrompt()` (the test fixture builder) and `logoClause()` (the
  Straw Motion fixture builder) off the new `logoReferencePhrase` field instead of leaving "the
  connected reference image" hardcoded in the builder — a small hygiene fix that also made
  `logoReferenceNameFreeButGuarded()` (stripping only the raw name) correctly leave the phrase intact
  without any special-casing.
- Chose to correct a small, pre-existing item-count drift in `openspec/specs/production-spec/spec.md`
  (the folded canonical spec said "exactly 9 items", the code already returned 10 before this slice —
  `companies-cited` was never counted) while rewriting that exact Requirement anyway, rather than
  perpetuating it as `+1` further drift — unlike #108/#109, which each correctly left a DIFFERENT,
  untouched Requirement's own drift in place (out of scope for THEM). Also moved the rewritten
  Requirement's Scenarios from positional (`items[2]`, `items[6]`...) to stable-`id` references,
  matching how issue #105 already fixed the CODE/tests to select by id, never position — the spec
  text was the one place still describing the old, positional convention.
- Renamed `missingLogoReference()` to `logoReferenceNameFreeButGuarded()` rather than keeping the old
  name with new behavior — a misleadingly-named-but-now-inverted test would be worse hygiene than a
  rename; its call sites and doc comment were updated together.
- Re-verified the `Edit` tool's `replace_all` for the 7 worked-example guardrail insertions actually
  hit exactly 7 places (not 8, since the template's own occurrence is deliberately left line-wrapped,
  prose-only — confirmed by grep count and by the normalized-prose test passing) before treating the
  template as needing its own, separate edit.
- Ran `grep -nE '[a-zA-Z]-$'` on the edited document (mirroring issue #109's own self-review step) —
  zero hits, no stray line-wrap hyphen artifact introduced.
- Simplified a test that had called `logoReferenceNameFreeButGuarded()` twice (once to audit, once to
  inspect) down to a single call, reusing the same `spec` value.
- Confirmed no acceptance criterion required touching `production-spec/news-carousel-validate.ts`,
  `news-carousel-brand-safety.ts`, `dash-safety.ts`, `copy/*`, `space-driver/*`, or
  `data/brands/straw-motion/brand-profile.yaml` — left untouched.
- Confirmed via `git status --short` before and after every batch of edits that the four leftover
  W29/ledger files were never touched, and that no git command (add/commit/stash/push/checkout) was
  run at any point this session.

### Known limits

- **Pre-existing, unrelated `npm run test:docs` failure** (NOT part of the `npm test` gate, and not
  touched by this slice): `producer-agent.docs-test.ts`'s *"producer.md is a thin, recipe-generic
  conductor — no recipe-specific procedure"* fails because `.claude/agents/producer.md` does not
  contain a phrase that test expects. Neither that test file nor `producer.md` appears anywhere in
  this slice's diff.
- **The committed idea-01 fixture (`strawMotionIdeaOneCarouselSpec()`) is not retrofitted with the
  new slide-position sizing.** It gains ONLY the new pinned guardrail sentence (required for it to
  keep passing the reworked `logo-reference` item); its logo-scale wording stays at the pre-#110
  "~third of the frame width" for every slide. This is a historical, already-graduated example
  authored before issue #110 — a future real `produce-news-carousel` Skill run against the updated
  document is what will actually author a Spec demonstrating the shrunk, per-slide-position scale.
- **Slide 1 ("then") scoping is a judgment call, not literally named by the issue** — see "Scoping
  note on slide 1" above. The document instructs "every slide after the hook" shrinks (a superset of
  the literal "slides 2-6"), rather than leaving slide 1 in an unspecified, arbitrary third tier.
- **No code-level, per-slide-index-aware mechanical check verifies the pill/logo's actual rendered
  scale** — AC3 asks the document to INSTRUCT the smaller size; a Production Spec's `image_prompt`
  text doesn't carry a numeric, structurally-checkable "scale" field, and the render effect itself is
  unverifiable in this hermetic build (no live Space). Proven via a docs-level prose pin instead,
  mirroring issue #109's own precedent for prompt-text guidance that can't be independently
  structurally checked.
- **The render effect itself is unverifiable in this hermetic build** — this slice proves the
  document instructs the guardrail + the sizing rule, and that the reworked checklist rule computes
  correctly against both a guarded and an unguarded Spec; it cannot prove a live Magnific render
  actually stops printing the logo name as text or actually looks smaller, by design (no live Space in
  this pipeline).

---

## QA Verdict — Round 1: PASS

Verified by reading the issue, the Build Report, the OpenSpec change (`proposal.md`, `tasks.md`, both
spec deltas), the real Baseline Prompt document, all touched/re-run code and test files in full, then
independently running the suites myself (not trusting the Build Report's numbers). No product code,
tests, specs, or the two leftover W29/ledger files were edited — only this Verdict was appended.

### Suite result

- **`npm test`** (`tsc -p tsconfig.json --noEmit && node --import tsx --test "src/**/*.test.ts"`), run
  in full myself: **1393 pass / 0 fail / 371 suites**, `duration_ms 2120.427167`. Matches the Build
  Report's claimed count exactly and is genuinely green (tsc passed silently as part of the same
  command — a tsc failure would have aborted before any test output). This is +10 net tests / +1 suite
  over the stated pre-slice baseline of 1383/370, consistent with the diff's scope.
- **`npm run test:docs`** (`node --import tsx --test "src/**/*.docs-test.ts"`), run in full myself:
  **82 pass / 1 fail / 20 suites**. The single failure is
  `producer-agent.docs-test.ts` → *"producer.md is a thin, recipe-generic conductor — no
  recipe-specific procedure (issue #88)"*. Confirmed this is pre-existing and unrelated to this slice:
  `git diff --stat` on the branch shows neither `.claude/agents/producer.md` nor
  `producer-agent.docs-test.ts` anywhere in the diff. No NEW docs-test failure was introduced by this
  slice.
- **`openspec validate 110-logo-guardrail-shrink-pill --strict`**: `Change '110-logo-guardrail-shrink-pill' is valid` (exit 0).
- **`openspec validate --all --strict`**: `Totals: 28 passed, 0 failed (28 items)` (exit 0). Confirmed
  the two rewritten `production-spec` Requirement titles (`News Carousel author-phase checklist is
  graduated from the #77 prototype, runs as code, parameterized` and `The graduated Skill's target
  output is proven on-contract against a real (Brand x Format)`) exist verbatim in the canonical
  `openspec/specs/production-spec/spec.md` (correct MODIFIED semantics), and the new
  `format-baseline-prompt` Requirement title does not collide with any existing one (correct ADDED
  semantics).
- Extra rigor, run in isolation myself: `news-carousel-author-checklist.test.ts` +
  `news-carousel-straw-motion-fixture.test.ts` together → **43 pass / 0 fail** (27 + 16, matching the
  Build Report's per-file counts exactly). `carousel-end-to-end.test.ts` +
  `two-recipes-end-to-end.test.ts` + `registry.test.ts` → **47 pass / 0 fail**, confirming the
  FAKE-Space-driven paths still work cleanly with the updated `STRAW_MOTION_BASELINE` fixture.

### Per-criterion results

| # | Acceptance criterion | Result | Proving test / evidence |
|---|---|---|---|
| 1 | Baseline Prompt doc carries a negative/guardrail clause: reference image unaltered; no redraw/restyle/recolor; reference name/filename never rendered as visible text | PASS | Read `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` directly: the "Logo guardrail — negative-prompt instruction (issue #110)" bullet, the reusable template, and all 7 worked JSON examples state exactly this. Proven by `news-carousel-straw-motion-fixture.test.ts`: `"(AC1) instructs never rendering the logo's reference name/filename as visible on-image text — a negative-prompt guardrail"` and `"(AC1) still instructs the logo rendered unaltered..."` — both pass |
| 2 | Author checklist's logo rule reworked: a prompt WITHOUT the raw underscored reference name still passes (logo reference + negative guardrail present); old "must contain the literal name" requirement gone | PASS | Read `news-carousel-author-checklist.ts`'s `logo-reference` item directly: `ok` requires `(referencesConnectedLogo) && prompt.includes(logoNameGuardrailInstruction)`, where `referencesConnectedLogo` is `logoReferenceName OR logoReferencePhrase` — the raw name is genuinely no longer independently required. Proven by `news-carousel-author-checklist.test.ts`'s `"passes the reworked logo-reference item when the raw reference name is absent but the generic phrase + negative guardrail are present (issue #110 AC2/AC5)"`, which explicitly asserts the raw name is absent from every slide AND `logo-reference.ok === true` |
| 3 | Baseline Prompt doc instructs a smaller pill + logo on slides 2–6, larger allowed on the hook slide (0) | PASS | Read the document directly: "Logo" bullet + ""Unhypped News" pill" bullet both state "Scale varies by slide position" — hook slide (`slide_index 0`) may keep ~⅓ frame width, every other slide (`slide_index` 1-6) is ~⅙ frame width / noticeably smaller. Proven by `"(AC3) instructs a smaller pill + logo on every slide after the hook, larger allowed on the hook slide (slide_index 0)"` |
| 4 | Existing logo/pill checks (unaltered-logo, never-all-caps pill, etc.) still pass; pinned docs-tests updated | PASS | Confirmed in code: the "render exactly as provided... do not restyle" unaltered-logo clause is still one of `fixedClauses`; `pillText`/`neverAllCapsInstruction` still gate `pill-text-caps`, unchanged in mechanism. Proven by `"(AC4) the pre-existing logo/pill checklist facts... are still genuine substrings of the document"` and the full-checklist-pass tests (`items.length === 11`, `ok: true`, including `logo-reference` and `logo-name-not-as-text`). `registry.test.ts` and `produce-news-carousel-skill.docs-test.ts` re-run by me, unmodified, still green |
| 5 | `npm test` green; a test shows a name-free-but-guarded prompt PASSES the reworked rule AND a reference-name-as-text case is discouraged/flagged | PASS | `npm test`: 1393/0/371, confirmed by me. Name-free-but-guarded pass: same test as AC2. Reference-name-as-text flagged: `"fails the new logo-name-not-as-text item when the reference name is rendered as literal quoted on-image text (issue #110 AC5) — isolated from every other item"` — asserts `ok: false`, `detail` names `slides[0].image_prompt`, while `logo-reference`/`pill-text-caps` stay `ok: true` (isolated mutation, confirmed by reading the test and its fixture `logoReferenceNameRenderedAsText()`) |

### Per-scenario results (spec deltas)

**`production-spec` — Requirement: News Carousel author-phase checklist is graduated from the #77 prototype, runs as code, parameterized**

| Scenario | Result | Covering test |
|---|---|---|
| A baseline-adherent Spec passes every mechanical item; agent-judged item flagged, not failed | PASS | `"a baseline-adherent Spec passes every mechanical item; the agent-judged item is flagged, not failed"` |
| A short Spec fails slide-count-role-order, referencing validateNewsCarouselSpec | PASS | `"fails the '7 slides, roles in order' item on a short Spec..."` |
| A prompt missing the raw reference name still passes logo-reference (generic phrase + guardrail present) | PASS | `"passes the reworked logo-reference item when the raw reference name is absent..."` |
| A prompt with the raw name but missing the guardrail fails logo-reference | PASS | `"fails the logo-reference item when the negative guardrail instruction is absent..."` |
| A prompt referencing the logo by neither name nor phrase fails logo-reference | PASS | `"fails the logo-reference item when the logo is not referenced at all..."` |
| A prompt quoting the reference name fails logo-name-not-as-text, isolated | PASS | `"fails the new logo-name-not-as-text item when the reference name is rendered as literal quoted on-image text..."` |
| A Spec missing pill text or the caps instruction fails pill-text-caps | PASS | `"fails the pill-text/caps-guard item when the parameterized pill text is absent"` + `"...when the never-all-caps instruction is absent"` |
| A Spec missing one fixed clause fails fixed-clauses | PASS | `"fails the fixed-baseline-clauses item when one parameterized clause is dropped"` |
| An unconfirmed card_style fails card-style-stat-callout | PASS | `"fails the card-style item when a slide's card_style is not one of the parameterized confirmed styles"` |
| A banned word fails banned-words, reject-only, named not rewritten | PASS | `"fails the banned-word item, reject-only, and names the word and field — never rewrites the Spec"` |
| An em dash fails no-dash-tells, reject-only, isolated | PASS | `"fails the new no-dash-tells item when a slide's on-card text carries an em dash..."` |
| Genuinely parameterized — different (Brand x Format) strings change the outcome | PASS | `"is genuinely parameterized — DIFFERENT (Brand x Format) strings fail a Spec authored for TEST_BASELINE's strings"` |
| Never throws on a malformed/non-object Spec | PASS | `"never throws on a malformed / non-object Spec, and fails cleanly"` |

**`production-spec` — Requirement: The graduated Skill's target output is proven on-contract against a real (Brand x Format)**

| Scenario | Result | Covering test |
|---|---|---|
| Committed fixture passes the #81 structural validator | PASS | `"passes validateNewsCarouselSpec (#81's structural contract)"` |
| Committed fixture passes the #85/#110 checklist, parameterized with Straw Motion's real strings | PASS | `"passes auditNewsCarouselAuthorPhase parameterized with Straw Motion's REAL baseline strings (#85's checklist)"` |
| STRAW_MOTION_BASELINE's own strings are genuinely present in the real document | PASS | `"loadFormat + loadBaselinePrompt resolve the real document, and every STRAW_MOTION_BASELINE string is a real substring of its prose"` |
| STRAW_MOTION_BASELINE genuinely differs from the stand-in TEST_BASELINE | PASS | `"is genuinely a DIFFERENT baseline than the stand-in TEST_BASELINE..."` |

**`format-baseline-prompt` — Requirement: Straw Motion's news-carousel Baseline Prompt instructs a logo negative-prompt guardrail and slide-position pill/logo scale (ADDED)**

| Scenario | Result | Covering test |
|---|---|---|
| The document instructs the negative-prompt logo guardrail | PASS | `"(AC1) instructs never rendering the logo's reference name/filename as visible on-image text..."` |
| The document still instructs the logo rendered unaltered (composed, not replaced) | PASS | `"(AC1) still instructs the logo rendered unaltered..."` |
| The document instructs a smaller pill+logo after the hook, larger allowed on the hook slide | PASS | `"(AC3) instructs a smaller pill + logo on every slide after the hook..."` |
| Pre-existing logo/pill checklist facts remain genuine substrings | PASS | `"(AC4) the pre-existing logo/pill checklist facts... are still genuine substrings of the document"` |
| The graduated Straw Motion fixture carries the guardrail verbatim | PASS | `"every strawMotionIdeaOneCarouselSpec() slide carries the negative guardrail clause verbatim..."` |

All 22 scenarios across both spec deltas trace to a real, named test; I read every one of the tests
listed above in full and re-ran the files myself (43/43 green for the two files carrying the
issue-#110-specific scenarios).

### Judgment calls — explicit ruling

**(a) Historical idea-01 fixture not retrofitted with the smaller pill/logo scale (only the guardrail
sentence added).** **ACCEPTABLE — not a defect.** AC3's literal text asks only that "the Baseline
Prompt document instructs" the smaller scale — it does not ask that every already-authored,
already-graduated Spec in the repo be rewritten to demonstrate it. `strawMotionIdeaOneCarouselSpec()`
is explicitly a *historical* fixture, authored before issue #110 existed; a Baseline Prompt document is
read by a producer Skill at authoring time, so the correct proof that the NEW instruction works is a
future live Skill run against the updated document (out of scope for a hermetic build), not a
retrofit of an old fixture. The gap is transparently disclosed in three places (`proposal.md`
Non-Goals, `tasks.md` 5.3, and this Build Report's Known limits) rather than silently left — I found no
place where the spec deltas or tests claim the fixture demonstrates the new scale (the
`format-baseline-prompt` ADDED Requirement's fixture-sync sentence explicitly asks only for the
guardrail to be carried, never the scale). Confirmed directly in code: `logoClause()` in
`news-carousel-straw-motion-specs.ts` still hardcodes "no wider than roughly a third of the frame
width" for every slide/edge, unconditioned on slide index — consistent with what the Build Report
states.

**(b) Doc shrinks "every slide after the hook" (`slide_index` 1-6), a superset of the issue's literal
"slides 2-6", rather than leaving slide 1 in an unassigned third tier.** **ACCEPTABLE — satisfies AC3,
does not contradict the issue.** AC3 requires only that slides 2-6 shrink and that the hook slide (0)
be *allowed* to stay large — both hold here (2-6 ⊂ 1-6, and slide 0 is verified still at ~⅓ frame
width via the "(AC1)"/"(AC3)" tests above and via my own direct read of the document). The issue's own
"Why" reproduction text additionally describes the problem ("Both are rendered at a fixed, hook-sized
scale on every slide... so the branding competes with the copy/subject for visual weight on every
slide, not just the hook") as occurring on every non-hook slide, which supports treating slide 1 the
same as 2-6 rather than inventing an unrequested third size tier for it alone. This is disclosed
explicitly as a judgment call, not a silent scope change, in both `proposal.md` and this Build Report.

### Always-rules + Magnific-fake checks

| Check | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | `git diff --stat` on the branch touches only `production-spec/*`, `recipe/registry.ts`, the Baseline Prompt doc, and the Skill doc — no publish-path file anywhere in the diff |
| Public-metrics-only / Relative-not-absolute | PASS | No metrics/scoring/performance-tracker file touched by this slice's diff |
| Explicit-attribution | PASS | No Post/attribution/`log-post` code touched by this slice's diff |
| Ledger-as-source-of-truth | PASS (with note) | `data/brands/straw-motion/ledger.json` and the three W29 `idea-0N.news-carousel.spec.json` files DO show working-tree diffs, but independently confirmed pre-existing and unrelated to this slice: `grep -c "Never render this reference image"` against all three W29 spec files returns `0` for each — none of issue #110's new guardrail/phrase text leaked into them, confirming the developer's session genuinely never wrote to these paths. `git log` shows their last commit as `7c074ff`/`83d189b`, predating this branch's own commits (`4e2af73`/`94c83d8`); the working-tree diff is a separate, concurrent, in-progress HITL production run (per the developer's own note and independently consistent with the repo's session-memory log) |
| Magnific fake / no live-Space calls | PASS | Grepped every new/changed test+fixture file (`news-carousel-author-checklist.test.ts`, `news-carousel-author-checklist-specs.ts`, `news-carousel-straw-motion-fixture.test.ts`, `news-carousel-straw-motion-specs.ts`) for `spaces_`/`creations_`/`FakeCarouselSpace`/`FakeSpace`: **zero hits** — these are plain-file (`loadFormat`/`loadBaselinePrompt`) + pure-function fixture tests, no Space involved at all. The two PRE-EXISTING tests that DO drive the fake (`carousel-end-to-end.test.ts`, `two-recipes-end-to-end.test.ts`) were re-run by me, unmodified, and are green (47/47 alongside `registry.test.ts`) — both import only `FakeCarouselSpace`/`FakeSpace` (the in-repo fakes), never a live MCP call |
| No in-repo negative-prompt canvas field exists (AC1's "otherwise" premise) | PASS, independently verified | `src/recipe/registry.ts`: `RecipeCanvasInputs` = `{ mediaSlots, promptNode }`; `RecipeSpaceNodes` = `{ specInput, pinnedReference?, castRunPoint?, clipRunPoint, watermarkNode? }` — no negative-prompt field in either. `src/space-driver/port.ts`'s `SpaceMcpPort` has exactly 7 methods (`readState`, `edit`, `editStatus`, `run`, `runStatus`, `fetchCreations`, `verifyPinned`), none a per-node-attribute setter. `src/producer/fixtures/fake-carousel-space.ts`: zero hits for `negativePrompt`. Repo-wide `grep -rlo negativePrompt` hits only the two read-only live-capture board JSON fixtures (`.../live-captures/00-spaces_show.fullboard.json`, `.../live-captures/carrousel/00-spaces_show.fullboard.json`, `"negativePrompt": ""` on the Carrousel's Image Generator node) plus this module's own doc-comment describing the finding — confirming the guardrail-as-prompt-clause approach is genuinely the only available path, not an assumption |

### Defect list

None. No failing test, no missing acceptance-criterion coverage, no always-rule violation, and no
live-Space call found anywhere in this slice.

**Verdict: PASS.** `/build-issue` may proceed to open the branch/PR and request the Operator's merge
approval.
