## Why

Issue #106 (the "carrousel improvements" epic), items 5 and 7 — reproduced against a live render
(`data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.assets/1-then.png`):

- **(5) Brand logo is redrawn, not placed — and intermittently prints the reference name.** The
  News Carousel author-phase checklist (`auditNewsCarouselAuthorPhase`'s `logo-reference` item)
  **requires** the literal, underscored reference name `Straw_Motion_Logo` in every slide's
  `image_prompt`. The image model sometimes renders that odd, filename-like string as visible
  on-image TEXT (plus draws a wrong, generic swirl icon) instead of treating it as a bare identifier
  for the canvas-connected reference image.
- **(7) Slides 2-6: shrink the "Unhypped News" pill and the brand logo.** Both are rendered at a
  fixed, hook-sized scale on every slide (no wider than ~⅓ frame width), so the branding competes
  with the copy/subject for visual weight on every slide, not just the hook.

## What Changes

**Operator decision (stated in the issue): fix item 5 with a NEGATIVE-PROMPT guardrail — never by
compositing the real logo file.**

- **The Baseline Prompt document** (`data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`)
  gains a new negative/guardrail instruction — applied at all three of its layers (the top bullets, the
  reusable template, and all 7 worked JSON examples, mirroring issue #109's own precedent that the
  `produce-news-carousel` Skill "starts from the document's own worked example for the `card_style` you
  chose", so every layer must carry the SAME reinforcement):
  1. The connected reference image is used unaltered — no redraw/restyle/recolor/reshape (ALREADY
     instructed by the pre-existing "Render the logo exactly as provided..." fixed clause; composed
     with, not replaced).
  2. **NEW:** never render the logo's reference name, file name, or any underscored/technical token
     that identifies it (e.g. `Straw_Motion_Logo`) as visible text anywhere in the image.
  3. **No in-repo negative-prompt CANVAS field exists** for this Recipe (verified — see "Canvas
     negative-prompt field finding" below), so the guardrail is authored as an explicit prohibitory
     clause inside the `image_prompt` text itself, per the issue's own documented fallback.
- **The author-phase checklist's `logo-reference` item is reworked**
  (`src/production-spec/news-carousel-author-checklist.ts`): it no longer requires the raw,
  underscored reference name on its own. A prompt now passes as long as it (a) references the
  connected logo — via the raw reference name OR the Baseline Prompt's own new, name-free generic
  reference phrase (`logoReferencePhrase`) — AND (b) carries the document's new negative guardrail
  instruction (`logoNameGuardrailInstruction`) verbatim. Two new fields are added to
  `NewsCarouselBaselineParams` for this (`logoReferencePhrase`, `logoNameGuardrailInstruction`),
  parameterized exactly like every other Baseline Prompt fact this module checks (ADR-0015, issue
  #85) — never a hardcoded literal.
- **A new, separate reject-only checklist item, `logo-name-not-as-text`**, flags the specific
  anti-pattern the reproduction showed: the reference name appearing QUOTED — this same document's
  own convention for literal on-image text (e.g. `"Unhypped News"`) — a strong, checkable signal a
  prompt is telling the model to DRAW the name, not just use it as a reference.
- **The Baseline Prompt document instructs a smaller pill + logo on every slide after the hook**
  (item 7): the hook slide (`slide_index` 0) may keep the existing larger scale (~⅓ frame width);
  every other slide (`slide_index` 1-6) renders both noticeably smaller (~⅙ frame width for the
  logo), so the copy/subject carries more of the slide's visual weight. This is a documentation-only
  change (prose + the template's bracketed scale variable) — see "Scoping note on slide 1" below.
- **The graduated Straw Motion fixture** (`src/production-spec/fixtures/news-carousel-straw-motion-specs.ts`)
  is kept in sync with the document's one new pinned fact (the negative guardrail sentence,
  `LOGO_NAME_GUARDRAIL_INSTRUCTION`) — both the constant and the `logoClause()` function that
  interpolates it — so the graduated idea-01 example genuinely demonstrates the strengthened
  document's guardrail, not a stale mirror of it.
- **New, automated pins** (`src/production-spec/news-carousel-straw-motion-fixture.test.ts`) read the
  REAL committed document (never assert by fiat) and assert the negative guardrail + slide-position
  sizing instructions are present, plus that the graduated fixture stays in sync — mirroring issue
  #109's own "guard the prose clause changes with docs-tests wherever the repo pins Baseline Prompt
  content" instruction.
- **`.claude/skills/produce-news-carousel/SKILL.md`** and **`src/recipe/registry.ts`**'s own prose
  mirrors of the author-phase checklist are updated to describe the reworked rule accurately (SKILL.md
  keeps its docs-test-pinned phrase "document's own logo reference name" intact, alongside the new
  "OR its name-free generic reference phrase" alternative).

## Canvas negative-prompt field finding

Verified, not assumed: the News Carousel Recipe's Space has an "Image Generator #21" node whose raw,
captured board JSON DOES carry a `negativePrompt` attribute
(`src/space-driver/fixtures/live-captures/carrousel/00-spaces_show.fullboard.json`) — but:

- `src/recipe/registry.ts`'s `RecipeCanvasInputs`/`RecipeSpaceNodes` types carry a single text
  `promptNode` plus named media slots only — no negative-prompt field of any kind, for either wired
  Recipe.
- `src/space-driver/port.ts`'s `SpaceMcpPort` interface (`readState`, `edit`, `editStatus`, `run`,
  `runStatus`, `fetchCreations`, `verifyPinned`) has no primitive to set a per-node attribute like
  `negativePrompt` distinct from the single injectable prompt-text node — a repo-wide grep for
  `negativePrompt`/`setNegativePrompt` outside the read-only live-capture JSON/README finds nothing.
- `src/producer/fixtures/fake-carousel-space.ts` (the Magnific fake for this Recipe) models the same
  narrow `SpaceMcpPort` surface — no negative-prompt primitive either.

**Conclusion: no in-repo negative-prompt canvas field exists for this Recipe to set.** Per the
issue's own instruction ("via the canvas's negative-prompt field if one exists, otherwise as explicit
prohibitory clauses inside the image prompt"), the guardrail is authored as an explicit prohibitory
clause inside the `image_prompt` text itself.

## Scoping note on slide 1 ("then")

The issue's own text says "slides 2-6" shrink and "the hook slide (0)" may stay large, using the
Spec's 0-indexed `slide_index` convention throughout (confirmed by its own "(0)" annotation) — leaving
slide_index 1 ("then") unassigned to either bucket. Rather than invent an unrequested third size
tier, the document instructs "every slide after the hook (`slide_index` 1-6)" shrinks — a superset of
"slides 2-6" that trivially satisfies the acceptance criterion (2-6 ⊂ 1-6) without an arbitrary gap.
Documented here and in the Build Report as a judgment call, not a silent scope change.

## Non-Goals (explicitly deferred / out of scope)

- **Compositing the real logo file** — explicitly ruled out by the Operator's own decision; the fix
  is a negative-prompt guardrail only.
- **A code-level, per-slide-index-aware mechanical check for pill/logo SIZE** — AC3 asks the Baseline
  Prompt document to INSTRUCT the smaller scale; it does not ask for a new structural Production-Spec
  field or checklist item that verifies a rendered image's actual pixel scale (unverifiable from a
  Spec's text alone, and not requested). Proven via a docs-level pin instead, mirroring issue #109's
  own precedent for prompt-text guidance that isn't independently structurally checkable.
- **Retrofitting the committed idea-01 fixture's logo/pill scale** — `strawMotionIdeaOneCarouselSpec()`
  is a HISTORICAL, already-graduated example authored before this issue; only its NEW pinned fact (the
  guardrail sentence) is added to keep the checklist's `logo-reference` item passing. Its logo-scale
  wording is left at the pre-#110 "~third of the frame width" (correct for a hook-adjacent worked
  example, but not updated to demonstrate the new per-slide-position sizing) — a future real Skill run
  is what will actually produce a shrunk-scale Spec.
- **The item-count/scenario staleness `openspec/specs/production-spec/spec.md` already carried** for
  the `News Carousel author-phase checklist` Requirement (it said "exactly 9 items", the actual code
  already returned 10 before this slice — `companies-cited` was never counted) — since THIS change
  rewrites that exact Requirement anyway (the item list/order changes), the rewrite below states the
  ACCURATE, current item count/order (11) rather than perpetuating the drift, unlike #108/#109 which
  each left an unrelated, untouched Requirement's own drift in place.
- **`.claude/skills/produce-news-carousel/SKILL.md`'s Step 1/other sections beyond the two touched** —
  no other section references logo mechanics.
- **The leftover, in-progress HITL run files**
  (`data/brands/straw-motion/ideas/2026-W29/idea-0{1,2,3}.news-carousel.spec.json`,
  `data/brands/straw-motion/ledger.json`) — a separate, concurrent run; explicitly left untouched.

## Capabilities

### Added Capabilities

None new — this extends the existing `production-spec` and `format-baseline-prompt` capabilities.

### Modified Capabilities

- `production-spec`: the `News Carousel author-phase checklist is graduated from the #77 prototype,
  runs as code, parameterized` Requirement is rewritten — `logo-reference` reworked (no longer
  requires the raw reference name on its own), a new `logo-name-not-as-text` reject-only item added,
  two new `NewsCarouselBaselineParams` fields (`logoReferencePhrase`, `logoNameGuardrailInstruction`).
  The `The graduated Skill's target output is proven on-contract against a real (Brand x Format)`
  Requirement is updated for the new item count and the two new `STRAW_MOTION_BASELINE` fields.
- `format-baseline-prompt`: gains one ADDED Requirement — the Straw Motion news-carousel Baseline
  Prompt document instructs the logo negative-prompt guardrail and the slide-position pill/logo
  scale, each verified as a normalized substring of the real, committed document.

## Impact

- **Modified:**
  - `src/production-spec/news-carousel-author-checklist.ts` — `NewsCarouselBaselineParams` gains
    `logoReferencePhrase`/`logoNameGuardrailInstruction`; `logo-reference` item reworked;
    `logo-name-not-as-text` item added; `verifyBaselineParamsAgainstDocument` checks the two new
    fields.
  - `src/production-spec/fixtures/news-carousel-author-checklist-specs.ts` — `TEST_BASELINE` gains
    the two new fields (deliberately different wording from Straw Motion's); the adherent-prompt
    builder is parameterized off them; fixture mutators added/renamed for the new checks.
  - `src/production-spec/news-carousel-author-checklist.test.ts` — item-count assertions updated;
    new tests for the reworked rule + the new item.
  - `src/production-spec/fixtures/news-carousel-straw-motion-specs.ts` — Straw Motion's real
    `LOGO_REFERENCE_PHRASE`/`LOGO_NAME_GUARDRAIL_INSTRUCTION` constants added; `STRAW_MOTION_BASELINE`
    and `logoClause()` updated to carry them.
  - `src/production-spec/news-carousel-straw-motion-fixture.test.ts` — item-count assertion updated;
    new `describe` block pinning the negative guardrail + slide-position sizing prose, plus a
    doc/fixture sync check.
  - `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` — the negative-prompt
    logo guardrail (top bullets, template, all 7 worked examples) and the slide-position pill/logo
    sizing instruction.
  - `.claude/skills/produce-news-carousel/SKILL.md` — Step 2 and the "Author-phase checklist" mirror
    updated to describe the reworked rule + the new item.
  - `src/recipe/registry.ts` — the `NEWS_CAROUSEL_PHASES` author-checklist prose bullet for
    "logo reference name" reworded (count/order of that array's own items is unchanged, mirroring
    issue #108's own precedent of not 1:1-syncing this coarser summary to the graduated checklist's
    exact item count).
- **Not touched:** `production-spec/news-carousel-validate.ts`, `news-carousel-brand-safety.ts`,
  `dash-safety.ts`, `copy/*`, `space-driver/*`, `producer/*` (beyond the two end-to-end tests that
  already import `STRAW_MOTION_BASELINE`/`strawMotionIdeaOneCarouselSpec` and are re-run, unmodified,
  to confirm they stay green), `data/brands/straw-motion/brand-profile.yaml`, the live Magnific
  canvas, `data/brands/straw-motion/ideas/2026-W29/**`, `data/brands/straw-motion/ledger.json`.
- **Hermetic:** no Magnific fake is invoked directly by the new/changed tests in this slice (they are
  plain-file + pure-function: a real markdown-document read via `loadFormat`/`loadBaselinePrompt`, and
  in-memory fixtures) — no Space, no MCP tool, no network, no credits, no board mutation. The two
  pre-existing end-to-end tests that DO drive `FakeCarouselSpace`
  (`src/producer/carousel-end-to-end.test.ts`, `src/producer/two-recipes-end-to-end.test.ts`) are
  re-run unmodified to confirm the updated `STRAW_MOTION_BASELINE` fixture still drives them cleanly;
  no live `spaces_*`/`creations_*` call anywhere. The Magnific MCP tools were not given to, and were
  not used by, this build.
- **Always-rules upheld:** generate-never-publish (no publish-path file touched); public-metrics-only/
  relative-not-absolute (no metrics code touched); explicit-attribution (no Post/attribution code
  touched); ledger-as-source-of-truth (no ledger-write code path touched — the leftover W29/ledger
  files are pre-existing working-tree state from a separate run, confirmed untouched by this session).
