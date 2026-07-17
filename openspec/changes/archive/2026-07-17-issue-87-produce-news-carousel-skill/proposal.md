## Why

ADR-0018 decided the News Carousel Recipe's producer procedure is an interpreting **Skill** — it
reads the Brand's hard rules + the Format's Baseline Prompt document (ADR-0015) + the Idea's brief,
authors the media prompt in the document's own shape, and self-checks against the author-phase
contract, before the thin Producer injects the result into the canvas (ADR-0010). Map ticket #77
prototyped exactly this Skill and validated it end-to-end: it authored 7 on-contract carousel
prompts from the real, locked `baseline-prompt.md` + idea-01's brief and passed the author checklist
10/10. Issues #81 (the Spec shape + validator), #83 (the Format's Baseline Prompt pointer + Straw
Motion's real, committed document), and #85 (the author-phase checklist, graduated into code) have
since landed the exact pieces that prototype pointed at. This slice graduates the #77 prototype
itself: it lands `produce-news-carousel` as a real, in-repo, docs-tested project Skill, and proves
concretely — via a committed fixture — that following it on a real brief plus the real imported
Baseline Prompt document yields a Spec that passes BOTH #81's validator and #85's author-phase
checklist.

## What Changes

- **The Skill lands in-repo** at `.claude/skills/produce-news-carousel/SKILL.md`, invocable by its
  slug (`produce-news-carousel`, its front-matter `name`). It carries over the #77 prototype's
  decision-rich content, updated to reference this repo's actual, now-landed modules by name:
  - **Inputs — load all three, STOP if the baseline document or the brief is missing.** The Brand's
    hard rules (`production-spec/brand-profile.ts`'s `loadBannedWords`/`loadCopyRules`); the
    Format's Baseline Prompt document (`format/store.ts`'s `loadFormat` +
    `format/baseline-prompt.ts`'s `loadBaselinePrompt`) — read every run, its fixed clauses
    reproduced verbatim, never from memory; STOP on any of the loader's three not-found reasons
    (`"not-declared"`, `"malformed"`, `"dangling"`). The Idea brief — STOP if it cannot be read.
  - **Leading idea — grounded, not invented.** Every slide names real products/logos/actions where
    it reports something real; a feeling/outcome/prediction uses a described photographic scene;
    never an invented UI presented as a real product's actual screen.
  - **Steps.** Derive the 7-slide narrative (fixed role order
    `hook → then → shift → proof → different → next → cta`, `news-carousel-contract.ts`'s
    `CAROUSEL_ROLES`; a ≤140-char `text` per slide, `CAROUSEL_TEXT_MAX_CHARS`) → assemble each
    `image_prompt` from the Baseline Prompt's own template, swapping only the bracketed parts,
    keeping every fixed clause verbatim → self-audit against
    `news-carousel-author-checklist.ts`'s `auditNewsCarouselAuthorPhase`, parameterized from the
    SAME document just read (never a different Brand/Format's strings); a banned word is
    REJECT-ONLY, STOP, never a silent swap → emit the `NewsCarouselSpec`
    (`news-carousel-contract.ts`), independently confirmed by `validateNewsCarouselSpec`
    (`news-carousel-validate.ts`), through the spec store (`production-spec/store.ts`'s `saveSpec`/
    `specPathFor`).
  - Aspect ratio and model are stated as the canvas's own settings, never prompt clauses.
  - **Nothing Brand- or Format-specific is hardcoded** (ADR-0015): the Skill never names Straw
    Motion's own pill text ("Unhypped News") or logo reference name ("Straw_Motion_Logo") anywhere
    in its prose — it only ever describes reading those values FROM the document.
- **The Skill is docs-tested** (`src/production-spec/produce-news-carousel-skill.docs-test.ts`):
  pins its front-matter slug, its references to the validator/checklist/spec-store/baseline-prompt-
  loader by exact module and function name, its STOP semantics, its "grounded, not invented" leading
  idea, that it never runs the Space or calls a `spaces_*`/`creations_*` tool, that it never
  publishes, and that it never hardcodes any one Brand/Format's own strings.
- **AC2 is proven concretely with a committed fixture**
  (`src/production-spec/fixtures/news-carousel-straw-motion-specs.ts`): `STRAW_MOTION_BASELINE` (a
  `NewsCarouselBaselineParams` built from Straw Motion's REAL, committed
  `news-carousel.md` strings — `"Straw_Motion_Logo"`, `"Unhypped News"`, its real never-all-caps
  sentence, five clauses verbatim from its reusable template, its two confirmed card styles) and
  `strawMotionIdeaOneCarouselSpec()` (idea-01's 7 on-contract prompts, the map-#77 prototype's
  validated authored content, assembled the same way the Skill's step 2 does). A new test
  (`src/production-spec/news-carousel-straw-motion-fixture.test.ts`) asserts this fixture passes
  BOTH `validateNewsCarouselSpec` (#81) and `auditNewsCarouselAuthorPhase` (#85) parameterized with
  `STRAW_MOTION_BASELINE`, AND that `STRAW_MOTION_BASELINE`'s own strings are genuinely present in
  the real, committed Baseline Prompt document (loaded via `loadFormat` + `loadBaselinePrompt`,
  never asserted by fiat).

## Non-Goals (explicitly deferred)

- **Driving the Space.** The Skill does not run the canvas, call any `spaces_*`/`creations_*` tool,
  or hold Magnific credentials — that is the thin, recipe-generic Producer, issue #88.
- **Composing the Copy.** This Recipe's copy step (caption/hashtags/mentions) is a separate step,
  out of the canvas (ADR-0012) — not this Skill's job.
- **The thin Producer actually invoking this Skill by slug at runtime.** Wiring a Production Queue
  job whose recipe is `news-carousel` to run this Skill is issue #88's scope, not this slice's.
- **Sourcing `NewsCarouselBaselineParams` end-to-end from an arbitrary Format's document inside
  production code.** Issue #85 already built `auditNewsCarouselAuthorPhase` to ACCEPT these params;
  this slice's own new code (the Straw Motion fixture) hand-derives them for ONE real (Brand ×
  Format) pair to prove the Skill's target output is on-contract — an automated "parse the document
  into these five fields" reader is future work, matching #85's own stated Non-Goal.

## Capabilities

### Added Capabilities

- `producer-skill`: the `produce-news-carousel` Skill exists in-repo, invocable by its slug, and is
  docs-tested against the exact modules/functions it points at, its STOP rules, and the ADR-0015
  no-hardcoding rule.

### Modified Capabilities

- `production-spec`: gains a committed fixture (Straw Motion's real Baseline Prompt strings + the
  graduated map-#77 authored 7-slide Spec) and a test proving that fixture passes BOTH the #81
  structural validator and the #85 author-phase checklist — the concrete stand-in for "an agent
  correctly follows the Skill's prose."

## Impact

- **New code:** `.claude/skills/produce-news-carousel/SKILL.md`;
  `src/production-spec/produce-news-carousel-skill.docs-test.ts`;
  `src/production-spec/fixtures/news-carousel-straw-motion-specs.ts`;
  `src/production-spec/news-carousel-straw-motion-fixture.test.ts`.
- **Not touched:** `news-carousel-contract.ts`, `news-carousel-validate.ts`,
  `news-carousel-brand-safety.ts`, `news-carousel-author-checklist.ts`, `format/store.ts`,
  `format/baseline-prompt.ts`, `production-spec/store.ts`, `production-spec/brand-profile.ts`,
  `recipe/registry.ts` (all REFERENCED by the new Skill/tests, never modified) — this slice adds a
  Skill file, a docs-test, a fixture, and a proving test; it changes no existing module's behavior.
  `.claude/agents/producer.md` and the queue/driver code are untouched (issue #88's scope).
- **Hermetic:** no Magnific fake is needed — the Skill is a markdown procedure (no code runs it at
  build time) and every new test is plain-file + pure-function testing (a Format YAML, a markdown
  document, and two already-existing deterministic deep modules). No live `spaces_*`/`creations_*`
  call anywhere; no credits; no board mutation. The `developer` agent was not given the Magnific MCP
  tools for this slice and never reached for them.
- **Always-rules upheld:** generate-never-publish (the Skill explicitly states it never runs the
  Space and never publishes; no publish/post code touched); the banned-word hard filter (rule 9) is
  REFERENCED, not weakened or duplicated (the Skill points at the existing
  `auditNewsCarouselAuthorPhase`/`scanNewsCarouselForBannedWords`, reject-only); ledger-as-source-of-
  truth is unaffected (no ledger-write code touched this slice); public-metrics-only/relative-not-
  absolute/explicit-attribution are unaffected (no metrics/attribution code touched).
