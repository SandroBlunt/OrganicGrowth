## Why

Issue #106 (the "carrousel improvements" epic), items 4 and 6 — from the same 2026-07-21 HITL review
that produced the variety slice (#107) and the em-dash/render-fidelity/logo slices already stacked on
this branch (#108/#109/#110):

- **(4) Copy feels bland.** The composed caption reads flat / report-like. The Operator's own two
  candidate fixes, both taken (**Both**, per the issue): give the `idea-strategist` richer inputs so
  briefs carry more punch, AND add a dedicated social-media copywriting Skill to the producer's
  out-of-canvas copy step (swappable, like the per-recipe author Skills).
- **(6) On-slide copy doesn't break down the news.** Reproduced against the real, leftover W29 run
  (`data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.spec.json` — left untouched by this
  change, per its own Non-Goals): several slides' on-slide `stat_callout` reads as a vibe headline
  ("Same week.", "You still check.") rather than explaining the story so a reader actually understands
  it. The Baseline Prompt document's "7-slide narrative" formula never told the author to make the
  short callout itself informative — only the longer supporting `text` had real content.

## What Changes

This is the largest slice in the epic; it is split internally into three parts, exactly as scoped:

### (a) Upstream — richer idea-strategist briefs

`.claude/agents/idea-strategist.md`'s Hard Boundary and Process sections are strengthened so a brief's
**angle** states the specific tension/contrast (named real entities, never a generic theme), its **hook
concept** names the exact surprise/reframe (not just "the idea of the opening"), and its **talking
points** carry a minimum count (at least 4) where EACH grounds one concrete, specific fact (a real
name, number, date, or claim pulled from the Trend's own evidence — never invented) — "a talking point
with no specific is not acceptable." A new Guardrails bullet ("Be concrete, never generic") makes this
a standing rule, not a one-off instruction. This directly feeds the News Carousel Skill's own existing
instruction to "pull the specific facts... straight out of the idea's brief for this slide" — richer
material upstream is how the downstream slides/copy get sharper, closing the loop the issue names
("richer briefs are how sharper copy gets made").

No brief schema exists in code (a Brief is a freeform, agent-authored markdown file — confirmed by
reading `src/production-spec/generate.ts`'s `Brief` interface, which only mirrors FRONT-MATTER, and by
the absence of any `idea-NN.md` body parser anywhere in `src/`) — this is a prompt-guidance change,
proven the same way `src/format/format-docs.test.ts` proves issue #53's own idea-strategist.md
requirements: a docs-conformance suite pinning the new guidance. Kept as a REGULAR `.test.ts` (like
that file, not `.docs-test.ts`), because richer briefs is a headline, not incidental, acceptance
criterion of this slice.

### (b) Downstream — a swappable copywriting Skill

A new project Skill, `.claude/skills/write-social-copy/SKILL.md`, mirrors the two existing per-recipe
author Skills' shape (Inputs / Steps / "What this Skill does not do") but for the shared, out-of-canvas
**copy step** (ADR-0012) instead of the media-authoring step. It composes the caption + hashtags and,
for a multi-slide Recipe, SHARPENS the ACTUAL produced on-slide narrative — the saved Production Spec's
own per-slide `role`/`text`/`stat_callout`, real content that exists only once the media has been
authored — into the caption's own plain-language recap of what happened and what it means, rather than
re-deriving a caption from the brief alone. It hands off to the SAME deterministic checker every Copy
already goes through: `injectRequiredParts` then `validateCopy` (length/emoji bounds, required
CTA/hashtags, banned words, and — since #108 landed on this branch — no em dash/en dash/spaced hyphen).

**Swappable, mirroring the per-recipe author Skills:** `Recipe` (`src/recipe/registry.ts`) gains a new
`copySkill: string` field — the Skill slug the thin Producer loads for the copy step, resolved from the
SAME in-repo registry every other per-Recipe fact already comes from (gates, Space, spec shape, copy
shape, canvas inputs, phase contracts). Both wired Recipes point at `"write-social-copy"` today (ADR-0012
already made the copy step ONE shared step, parameterized by `copyShape` — a genuinely different
Recipe's copywriting needs would point this field at a different Skill slug without touching either
Recipe's other config or this agent's own prose). `.claude/agents/producer.md`'s Copy-phase section is
updated to load the Skill named by `Recipe.copySkill` (the Skill tool), exactly mirroring how it already
loads the Author phase's Skill by the job's Recipe slug — the producer stays a thin, recipe-generic
conductor; it never hard-codes which copy Skill to run.

**The testable seam.** `src/copy/draft.ts` already defines the swap point production needs: an
injectable `CopyDrafter` (`(input, shape) => Copy`), with `defaultDraftCopy` as the existing, unguided
fallback. This slice adds `skillDraftCopy` — a SECOND, deterministic drafter standing in for "what an
LLM following the `write-social-copy` Skill's instructions produces," exactly the same relationship
`defaultDraftCopy` already has to the pre-#111 unguided copy-phase prose. `CopyInput` gains an optional
`slideNarrative` field (the produced per-slide `role`/`text`/`stat_callout` beats) so a drafter can
demonstrably sharpen real, already-produced content into the caption — proven by tests that assert the
composed caption actually contains the hook/shift/cta beats' own text, not just the brief's title.
Neither `composeCopy`'s signature nor `defaultDraftCopy`'s behavior changes — every existing caller
(`compose.test.ts`, the two end-to-end tests) is unaffected; `skillDraftCopy` is purely additive.

**AC4's proof.** New tests compose Copy via `skillDraftCopy` against BOTH wired Recipes' own `copyShape`
(180/1-3 and 2200/0-2) and a Brand Profile configuring banned words + required CTA/required hashtags,
asserting: the result passes `validateCopy` end to end; the required CTA/hashtags are present; a banned
word in the drafted caption is still rejected (the checker is never bypassed); and the drafter's own
join logic never introduces an em dash/en dash/spaced hyphen (mirroring `defaultDraftCopy`'s existing
"never joins with a dash tell" test, extended to `slideNarrative`-sourced text).

**Design note — "swappable per recipe/brand".** The issue's own phrasing pairs "recipe" and "brand".
This slice wires the per-Recipe half concretely (a real, tested `Recipe.copySkill` field the registry
already has a home for). A per-BRAND override would mean a Brand Profile field naming a preferred copy
Skill slug — but ADR-0013/issue #88 deliberately RETIRED the last per-Brand override of production
config (the old `production.space_id` pointer) in favor of everything living on the Recipe; adding a new
per-Brand override here would cut directly against that settled direction. This slice does not add one;
a future Brand-specific copywriting need is better served by a Format-scoped Baseline-Prompt-style
document (ADR-0015's own pattern) than a second override axis. Documented here, and in the Build
Report, as a judgment call — not a silent scope trim.

### (c) The 7-slide narrative formula, reengineered for comprehension

`data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`'s "## The 7-slide
narrative — a copy formula per role" section (the ONLY section touched — the fixed "★ THE BASELINE
PROMPT" clauses, the reusable template, and the 7 worked JSON Examples below it are untouched, so
`STRAW_MOTION_BASELINE`'s `fixedClauses`/`pillText`/etc. and the graduated
`strawMotionIdeaOneCarouselSpec()` fixture stay byte-for-byte in sync, unmodified) is rewritten so:

- A new, explicit standing instruction: every role's on-slide line — the `stat_callout` AND the
  `text` — must state plainly what happened and what it means; a short punchy phrase is fine only
  when it is ALSO informative; a bare mood/vibe line that names no fact is called out BY EXAMPLE as
  the anti-pattern to avoid ("Same week." and "You still check." — the issue's own reproduced
  examples — name nothing a reader could repeat back).
- Each of the 7 roles (fixed order unchanged: hook → then → shift → proof → different → next → cta)
  keeps its own job description but gains an explicit split: what the `stat_callout` must name (the
  fact, in a few words) and what the `text` must state (the plain-language meaning) — sharpening the
  existing formula rather than replacing its structure.

This is a documentation-only change (like #109/#110): no mechanical author-checklist item enforces
narrative QUALITY (that stays agent-judged, mirroring "grounded subject" — ADR-0017's own precedent
that judgment calls are never turned into brittle string checks). Proven the same way #109/#110 proved
their own doc-content changes: a new `describe` block in the EXISTING
`src/production-spec/news-carousel-straw-motion-fixture.test.ts` (which already reads the real,
committed document for issues #83/#85/#109/#110's own pins) — kept as a REGULAR `.test.ts`, not a new
`.docs-test.ts` file, following that file's own established precedent.

## Non-Goals (explicitly deferred / out of scope)

- **A structured brief schema.** Richer briefs stay freeform markdown, authored per the strengthened
  agent prose — no new TS type/parser for `idea-NN.md`'s body. Matches the existing system (no brief
  parser exists anywhere today) and the issue's own framing ("reflected in its output guidance/shape").
- **A stored, structured "sharpened on-slide text" ledger field.** The copywriting Skill's sharpening
  targets the CAPTION (the one field `validateCopy`/AC4 actually check) — it does not add a new
  `LedgerAssetRecord` field for per-slide alt-text/captions. The rendered slide's own pixels are already
  final by the time the copy step runs; nothing in this slice edits or re-renders them. A future
  alt-text feature is a natural next step but is not requested by this issue's acceptance criteria.
- **A per-Brand copySkill override.** See the design note above — deliberately not added, to stay
  consistent with ADR-0013/issue #88's settled direction.
- **A mechanical "no mood-only stat_callout" validator.** Narrative quality stays agent-judged
  (ADR-0017); (c) is a documentation change, not a new code check.
- **Retrofitting the committed `strawMotionIdeaOneCarouselSpec()` fixture's own stat_callouts** (e.g.
  its "Same week." for the "shift" role) to the new narrative guidance. That fixture is issue #87's
  already-graduated, already-passing example, out of scope for this issue's acceptance criteria; no
  test asserts anything about its narrative QUALITY (only its structural/checklist conformance), so
  leaving it untouched changes nothing this slice's tests check. Documented here as a judgment call.
- **The leftover, in-progress HITL run files**
  (`data/brands/straw-motion/ideas/2026-W29/idea-0{1,2,3}.news-carousel.spec.json`,
  `data/brands/straw-motion/ledger.json`) — a separate, concurrent run; explicitly left untouched.
- **Live-Magnific testing.** The copy step has no Space/MCP call of its own (`compose.ts`'s own module
  doc: "No Magnific, no Apify, no network"); this slice adds nothing that would need one.

## Capabilities

### Added Capabilities

- `idea-strategist-briefs`: the `idea-strategist` agent's brief-richness guidance (angle states a
  specific tension, hook concept names the exact surprise, talking points ground concrete specifics,
  minimum count) — a new capability, distinct from `format-scoped-trend-research` (which is about
  Format-file scoping mechanics, not brief content quality).

### Modified Capabilities

- `copy-composition`: `CopyInput` gains an optional `slideNarrative` field; a new `skillDraftCopy`
  drafter is added (additive — `defaultDraftCopy`/`composeCopy` unchanged).
- `recipe-registry`: `Recipe` gains a `copySkill: string` field; both seeded Recipes set it to
  `"write-social-copy"`.
- `producer-skill`: a new Skill, `write-social-copy`, exists at
  `.claude/skills/write-social-copy/SKILL.md` for the shared copy step.
- `producer-conductor`: `producer.md`'s Copy-phase section loads the Skill named by `Recipe.copySkill`
  and sharpens the produced on-slide narrative into the caption.
- `format-baseline-prompt`: the Straw Motion news-carousel Baseline Prompt's 7-slide narrative formula
  is reengineered for plain comprehension (composes with, does not revert, #108/#109/#110's own edits
  to the same document).

## Impact

- **Added:**
  - `.claude/skills/write-social-copy/SKILL.md`
  - `src/copy/write-social-copy-skill.docs-test.ts` (excluded from `npm test`, mirrors the other two
    Skills' own docs-tests)
  - `src/production-spec/producer-agent-copy-skill.test.ts` (regular `.test.ts` — core AC, not
    incidental doc conformance)
  - `src/format/idea-strategist-brief-richness.test.ts` (regular `.test.ts`)
- **Modified:**
  - `.claude/agents/idea-strategist.md` — Hard Boundary + Process + Guardrails strengthened for brief
    richness.
  - `.claude/agents/producer.md` — intro + Copy-phase section wired to `Recipe.copySkill`.
  - `src/copy/draft.ts` — `CopyInput.slideNarrative` (optional), `skillDraftCopy` added.
  - `src/copy/draft.test.ts` — new `describe` block for `skillDraftCopy`.
  - `src/copy/compose.test.ts` — new `describe` block proving AC4 (skillDraftCopy → composeCopy →
    validateCopy, both Recipe shapes, Brand rules, no dash tell).
  - `src/recipe/registry.ts` — `Recipe.copySkill` field; both seeded Recipes set to
    `"write-social-copy"`.
  - `src/recipe/registry.test.ts` — new assertions for `copySkill`.
  - `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` — the 7-slide narrative
    section only.
  - `src/production-spec/news-carousel-straw-motion-fixture.test.ts` — new `describe` block pinning
    the reengineered narrative guidance (mirrors #109/#110's own precedent in this same file).
- **Not touched:** `src/copy/compose.ts`, `src/copy/inject.ts`, `src/copy/validate.ts`,
  `src/copy/contract.ts` (the checker/injector/contract are unchanged — only the drafter side gains a
  new, additional export), `production-spec/news-carousel-validate.ts`,
  `news-carousel-author-checklist.ts`, `news-carousel-brand-safety.ts`, `dash-safety.ts`,
  `space-driver/*`, `execution-protocol/*`, the "★ THE BASELINE PROMPT" fixed-clauses section /
  reusable template / worked Examples of `news-carousel.md`, `src/production-spec/fixtures/
  news-carousel-straw-motion-specs.ts`, `data/brands/straw-motion/brand-profile.yaml`, the live
  Magnific canvas, `data/brands/straw-motion/ideas/2026-W29/**`, `data/brands/straw-motion/ledger.json`.
- **Hermetic:** the copy step has no Space/MCP call of its own — no fake Magnific Space is invoked by
  ANY new/changed test in this slice (all are plain-file + pure-function: markdown-agent-doc reads,
  and in-memory `CopyInput`/`Copy` fixtures through `composeCopy`/`validateCopy`). The `developer` agent
  was not given the Magnific MCP tools and did not use them. No live `spaces_*`/`creations_*` call
  anywhere in the diff.
- **Always-rules upheld:** generate-never-publish (no publish-path file touched; the new Skill and the
  agent-doc edits both explicitly state they never publish); public-metrics-only/relative-not-absolute
  (no metrics code touched); explicit-attribution (no Post/attribution code touched);
  ledger-as-source-of-truth (no ledger-write code path touched); reject-only banned-word/dash handling
  is preserved and extended, never weakened, by the new drafter.
