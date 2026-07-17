# Slice Handoff — issue-87-produce-news-carousel-skill

Bidirectional channel between `developer` and `qa`. Developer writes the Build Report below; `qa`
appends its Verdict beneath it. Retries append `Round-N Build` blocks — nothing here is overwritten.

## Build Report (Round 1)

### What changed

Graduated the map-ticket-#77 prototype into a real, in-repo, docs-tested project **Skill**:
`produce-news-carousel` — the News Carousel Recipe's producer procedure (ADR-0018). The Skill reads
the Brand's hard rules, the Format's Baseline Prompt document (ADR-0015, issue #83), and the Idea's
brief; derives the fixed 7-slide narrative; assembles each slide's `image_prompt` from the Baseline
Prompt's own template (swapping only the bracketed parts, keeping every fixed clause verbatim);
self-audits against the author-phase checklist (issue #85's `auditNewsCarouselAuthorPhase`); and
emits the Production Spec (issue #81's `NewsCarouselSpec`) through the spec store. It explicitly does
**not** run the Space (that is the thin Producer, issue #88) and never publishes.

Since "an agent correctly follows prose" is not directly unit-testable, AC2 is proven concretely: a
committed fixture (`STRAW_MOTION_BASELINE` + `strawMotionIdeaOneCarouselSpec()`) carries Straw
Motion's **real** committed Baseline Prompt strings and the map-#77 prototype's validated 7-slide
authored output (10/10 on the author checklist), and a new test proves that fixture passes BOTH
`validateNewsCarouselSpec` (#81) and `auditNewsCarouselAuthorPhase` (#85) — and, separately, that
`STRAW_MOTION_BASELINE`'s own strings are genuinely present in the real, committed document (never
asserted by fiat).

### Files touched

**New:**
- `.claude/skills/produce-news-carousel/SKILL.md` — the Skill: front-matter slug
  `produce-news-carousel`; the three inputs with STOP semantics; the grounded-not-invented leading
  idea; the four production steps; the author-phase checklist restated for a human reader; a "what
  this Skill does not do" section (no Space-driving, no Copy composition, no publishing). Every
  referenced module/function is named exactly (`news-carousel-contract.ts`,
  `news-carousel-validate.ts`, `news-carousel-author-checklist.ts`, `format/store.ts`,
  `format/baseline-prompt.ts`, `production-spec/store.ts`, `production-spec/brand-profile.ts`).
  Contains **no** Brand/Format-specific literal (no "Unhypped News", no "Straw_Motion_Logo"/
  "Brand_Logo" anywhere) — only ever describes reading those values from the document.
- `src/production-spec/produce-news-carousel-skill.docs-test.ts` — pins the Skill's slug, its exact
  module/function references, its STOP rules, its grounded-not-invented leading idea, that it never
  runs the Space (and contains no literal `spaces_*(`/`creations_*(` call) and never publishes, and
  that it never hardcodes any one Brand/Format's own strings. 21 assertions across 8 `describe`
  blocks.
- `src/production-spec/fixtures/news-carousel-straw-motion-specs.ts` — `STRAW_MOTION_BASELINE` (a
  `NewsCarouselBaselineParams` built from Straw Motion's real, committed
  `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`: the real logo
  reference name `Straw_Motion_Logo`, the real pill text `"Unhypped News"`, the real never-all-caps
  sentence, five clauses verbatim from the document's reusable template, its two confirmed card
  styles) and `strawMotionIdeaOneCarouselSpec()` — idea-01's 7-slide Spec, assembled the same way
  the Skill's step 2 does (a small clause-assembler mirroring the map-#77 prototype's
  `generate-carousel-spec.mjs`, now graduated to typed TS).
- `src/production-spec/news-carousel-straw-motion-fixture.test.ts` — the AC2 proof (see "How AC2 is
  proven" below). 5 tests across 2 `describe` blocks.
- `openspec/changes/issue-87-produce-news-carousel-skill/` — `proposal.md`, `tasks.md`,
  `specs/producer-skill/spec.md` (new capability), `specs/production-spec/spec.md` (modified), this
  `handoff.md`.

**Not touched:** `news-carousel-contract.ts`, `news-carousel-validate.ts`,
`news-carousel-brand-safety.ts`, `news-carousel-author-checklist.ts`, `format/store.ts`,
`format/baseline-prompt.ts`, `production-spec/store.ts`, `production-spec/brand-profile.ts`,
`recipe/registry.ts`, `.claude/agents/producer.md`, all `src/space-driver/**`/
`src/execution-protocol/**`/`src/production-queue/**` files — all REFERENCED by the new Skill/tests,
none modified.

### How to run

```bash
# type-check + full unit suite (what `npm test` runs)
npx tsc -p tsconfig.json --noEmit
npm test

# just this slice's new test files
node --import tsx --test \
  src/production-spec/news-carousel-straw-motion-fixture.test.ts \
  src/production-spec/produce-news-carousel-skill.docs-test.ts

# docs tests
npm run test:docs

# build (emits dist/, proves tsconfig.build.json is happy too)
npm run build

# OpenSpec
npx openspec validate issue-87-produce-news-carousel-skill --strict
npx openspec validate --all --strict
```

All green: `npx tsc --noEmit` clean; `npm test` — **1290/1290 pass**; `npm run test:docs` —
**54/54 pass** (13 suites); `npm run build` — clean; `npx openspec validate --all --strict` —
**25/25 pass** (24 pre-existing specs + this change).

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #87) | Proving test(s) |
|---|---|---|
| 1 | The Skill exists in-repo, invocable by slug, and is docs-tested the way agent docs are (its promised names, shape, and STOP rules stay true). | `.claude/skills/produce-news-carousel/SKILL.md` exists with front-matter `name: produce-news-carousel`. `src/production-spec/produce-news-carousel-skill.docs-test.ts`: `"exists and is readable"`, `"declares its own slug in the front-matter \`name\` field"`; the "references the correct in-repo slugs/paths" describe block (4 tests: #81 shape+validator, #85 checklist, #83 pointer+loader, spec store, Brand hard-rules reader); the "STOP semantics stay true" describe block (3 tests: missing Baseline Prompt document — all 3 reasons; missing brief; banned word REJECT-only); the "grounded-not-invented leading idea" test; the "does not run the Space" describe block (2 tests, including a literal scan for `spaces_*(`/`creations_*(` calls); "never publishes". |
| 2 | Following it on a real brief + the imported baseline document yields a spec that passes #81's validator and #85's author-phase checklist. | `src/production-spec/news-carousel-straw-motion-fixture.test.ts`: `"passes validateNewsCarouselSpec (#81's structural contract)"` and `"passes auditNewsCarouselAuthorPhase parameterized with Straw Motion's REAL baseline strings (#85's checklist)"`, both run against the committed `strawMotionIdeaOneCarouselSpec()` fixture with `STRAW_MOTION_BASELINE`. See "How AC2 is proven" below for the full chain. |
| 3 | Nothing Brand- or Format-specific is hardcoded in the Skill. | `produce-news-carousel-skill.docs-test.ts`'s `"never hardcodes Straw Motion's own pill text, logo reference name, or Format name"` (asserts `"Unhypped News"`/`"Straw_Motion_Logo"`/`"Brand_Logo"` appear NOWHERE in the Skill's text) and `"instead describes the logo/pill/card-style values as read from the document, generically"`. Verified by direct reading of the Skill's full prose during authoring — every mention of the pill text, logo name, and card styles is phrased as "the document's own X", never a literal Brand value. |
| 4 | Built test-first; strict validate + both suites green. | Both new test files were written before/alongside their subject module (the Skill's docs-test alongside the Skill; the fixture-proving test alongside the fixture) — see `tasks.md`'s task-by-task order. `openspec validate --all --strict` → 25/25. `npm test` → 1290/1290. `npm run test:docs` → 54/54. `npx tsc --noEmit` clean. |

### How AC2 is proven (the fixture + dual-gate test)

"An agent correctly follows the Skill's prose" cannot be unit-tested directly, so AC2 is made
concrete in three linked pieces:

1. **The fixture** (`fixtures/news-carousel-straw-motion-specs.ts`) commits the map-#77 prototype's
   validated authored content (7 on-contract prompts for idea-01, originally checked 10/10 against
   the author checklist) — updated to use the logo reference name the REAL, currently-committed
   Baseline Prompt document actually carries (`Straw_Motion_Logo`; the prototype's later
   `Brand_Logo` rename addendum never landed in the committed document, so the committed document —
   the actual source of truth per ADR-0015 — is what this fixture follows). `STRAW_MOTION_BASELINE`
   carries that document's own pill text, logo name, never-all-caps sentence, five fixed clauses,
   and two confirmed card styles.
2. **The dual-gate test** (`news-carousel-straw-motion-fixture.test.ts`) runs the fixture through
   BOTH gates named in the issue: `validateNewsCarouselSpec` (#81's structural contract — exactly 7
   slides, fixed role order, ≤140-char text, well-shaped slides) and `auditNewsCarouselAuthorPhase`
   parameterized with `STRAW_MOTION_BASELINE` (#85's full 8-item author-phase checklist — logo
   reference, pill text + caps guardrail, fixed clauses, confirmed card style, banned words). Both
   pass with `ok: true`.
3. **Genuineness check** — a third test loads the REAL Format (`loadFormat("straw-motion",
   "unhypped-news")`) and its REAL Baseline Prompt document (`loadBaselinePrompt(...,
   "news-carousel")`), normalizes the wrapped markdown blockquote into plain prose, and asserts
   every one of `STRAW_MOTION_BASELINE`'s strings is a literal substring of that real document —
   proving the baseline parameters used in step 2 are not invented for the test, but drawn from the
   actual, committed (Brand × Format) document. A companion test asserts `STRAW_MOTION_BASELINE` is
   genuinely different from issue #85's own stand-in `TEST_BASELINE` (proving this isn't the same
   fixture renamed).

Together: the Skill's target output (the fixture) is on-contract against both gates, and the
baseline it's checked against is provably the real document's own strings — not a self-consistent
but disconnected invention.

### Fakes / fixtures used

- **No Magnific fake was needed and none was used.** This slice touches zero
  `src/space-driver/**`/`src/execution-protocol/**` code — the Skill is a markdown procedure (no
  code runs it at build time), and every new test is plain-file + pure-function testing: a real
  Format YAML (`data/brands/straw-motion/formats/unhypped-news.yaml`), a real markdown document
  (`data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`), and two
  already-existing, already-tested deterministic deep modules (`validateNewsCarouselSpec`,
  `auditNewsCarouselAuthorPhase`). **No live `spaces_*`/`creations_*` call anywhere; no credits
  spent; no board mutation.** The `developer` agent was not given the Magnific MCP tools for this
  slice and never reached for them.
- Fixtures used:
  - `src/production-spec/fixtures/news-carousel-straw-motion-specs.ts` (**new**) —
    `STRAW_MOTION_BASELINE`, `strawMotionIdeaOneCarouselSpec()`.
  - `src/production-spec/fixtures/news-carousel-author-checklist-specs.ts`'s `TEST_BASELINE`
    (existing, issue #85) — imported only to prove `STRAW_MOTION_BASELINE` is genuinely a different
    baseline, not the same fixture renamed.
  - The real `data/brands/straw-motion/formats/unhypped-news.yaml` and
    `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` — the actual,
    committed production data (not a temp-dir fixture), mirroring the precedent already set by
    `src/format/baseline-prompt.test.ts`'s own "real migrated straw-motion Baseline Prompt" describe
    block (issue #83 AC2).

### Self-review notes

- Fixed a `noUncheckedIndexedAccess` compile error on the fixture's `FIXED_CLAUSES` array by
  declaring it `as const` (a fixed 5-tuple) instead of `readonly string[]`, so indexed access
  (`FIXED_CLAUSES[0]`, `[1]`, `[2]`, `[4]`) inside the clause-assembler stays non-undefined without
  scattering defensive checks.
- Replaced a weak, purely-negative "grounded subject" assertion (a `doesNotMatch` that would
  trivially always pass) with a concrete, positive one: every slide's `image_prompt` must name
  idea-01's three real companies (via the pill's "three tiny real product logos" row), and the
  "shift" slide must additionally name all three real products by name — a genuinely checkable
  stand-in for the checklist's own agent-judged "grounded, not invented" item, for this committed
  fixture specifically.
- Replaced a `docs-test`'s over-fragile regex (`document's own\s+(pill|confirmed)`, which failed
  against the Skill's own markdown bold markers around "confirmed") with one that tolerates 0–2
  literal `*` characters, and added a second, separate assertion for the pill-text phrasing instead
  of cramming both into one brittle alternation.
- Replaced an in-test dynamic `await import(...)` of `TEST_BASELINE` with a top-level static import,
  matching the rest of the repo's test-file convention (no dynamic imports where a static one
  suffices).
- Considered adding a `skill`/`skillSlug` field to `Recipe` in `src/recipe/registry.ts` so the
  registry could point at this Skill by name — deliberately did NOT: issue #87's own scope is the
  Skill's existence and target output, not wiring the Recipe registry or the thin Producer to invoke
  it (that is issue #88's explicit job). Touching `registry.ts` here would be scope creep beyond the
  slice.

### Known limits (explicitly deferred)

- **The Skill does not run the Space.** It has no Magnific tools and calls none — driving the
  "Carrousel" canvas (injecting the emitted Spec into the "Slides Prompts" node and running it) is
  the thin, recipe-generic Producer, issue #88.
- **No production code invokes this Skill by slug yet.** Wiring a Production Queue job whose
  `recipe` is `news-carousel` to actually run `produce-news-carousel` (by the Skill tool, keyed on
  the job's slug) is issue #88's scope — this slice only lands the Skill itself and proves its
  target output is on-contract.
- **`NewsCarouselBaselineParams` is still hand-derived for this ONE (Brand × Format) pair, not
  parsed from the document by code.** `STRAW_MOTION_BASELINE` was built by reading
  `news-carousel.md` and transcribing its own strings — there is no automated "read the document,
  extract these five fields" reader; issue #85 explicitly deferred that, and this slice does not
  build it either. The Skill's own job (interpreting the document at production time) is prose, run
  by an agent, not by this fixture's construction.
- **The "grounded subject" checklist item stays agent-judged**, exactly as ADR-0017 designed —
  this slice's own concrete test (every slide names idea-01's real companies) is a stand-in proof
  for the COMMITTED fixture specifically, not a general mechanical check the Skill or the checklist
  runs at production time for an arbitrary future Idea.

---

## QA Verdict — Round 1: PASS

### Suite result

All commands run exactly as the Build Report instructed, from the repo root, on branch
`issue-87-produce-news-carousel-skill` (working tree matches `main` plus five new, untracked files —
no other file modified):

| Command | Result |
|---|---|
| `npm test` (runs `tsc -p tsconfig.json --noEmit` then the full `src/**/*.test.ts` suite via `node --import tsx --test`) | **1290/1290 pass, 0 fail** (350 suites) |
| `npm run test:docs` (`src/**/*.docs-test.ts`) | **54/54 pass, 0 fail** (13 suites) |
| `npx openspec validate --all --strict` | **25/25 pass, 0 fail** (24 pre-existing specs + `change/issue-87-produce-news-carousel-skill`) |
| `npx openspec validate issue-87-produce-news-carousel-skill --strict` | `Change 'issue-87-produce-news-carousel-skill' is valid` |
| `node --import tsx --test src/production-spec/news-carousel-straw-motion-fixture.test.ts src/production-spec/produce-news-carousel-skill.docs-test.ts` (this slice's new files, isolated) | **26/26 pass** (5 + 21) |

No command failed to run; no skipped/todo tests. All green, actually observed, not assumed.

### Per-criterion results

| # | Acceptance criterion (issue #87) | Result | Proving test |
|---|---|---|---|
| 1 | The Skill exists in-repo, invocable by slug, and is docs-tested the way agent docs are (its promised names, shape, STOP rules stay true). | **PASS** | `.claude/skills/produce-news-carousel/SKILL.md` exists, non-empty, front-matter `name: produce-news-carousel` (confirmed by direct read). `produce-news-carousel-skill.docs-test.ts` — 8 `describe` blocks / 21 assertions, all green: exists+slug, 5 groups of exact module/function references (#81 shape+validator, #85 checklist, #83 loader, spec store, brand-profile), STOP semantics (3 not-found reasons + missing brief), banned-word REJECT-only, grounded-not-invented, does-not-run-Space (incl. literal regex scan for `spaces_*(`/`creations_*(`), never-publishes, no-hardcoding. |
| 2 | Following it on a real brief + the imported baseline document yields a spec that passes #81's validator and #85's author-phase checklist. | **PASS** | `news-carousel-straw-motion-fixture.test.ts`: `validateNewsCarouselSpec(strawMotionIdeaOneCarouselSpec())` → `ok: true`, `errors: []`. `auditNewsCarouselAuthorPhase(spec, [], STRAW_MOTION_BASELINE)` → `ok: true`, 8 items, exactly 1 `agent-judged` (`ok: null`), every `mechanical` item `ok: true`. Independently re-read `news-carousel-author-checklist.ts` (unmodified, pre-existing #85 code) to confirm the audit function is real logic, not a stub — it delegates the structural gate to `validateNewsCarouselSpec` and the banned-word gate to `scanNewsCarouselForBannedWords`, and only computes the NEW checks (logo/pill/clauses/card-style) itself. |
| 3 | Nothing Brand- or Format-specific is hardcoded in the Skill. | **PASS** | `grep -c "Straw_Motion_Logo\|Unhypped News\|Brand_Logo" .claude/skills/produce-news-carousel/SKILL.md` → 0 matches (independently verified by direct read of the full file: every mention of pill text / logo name / card styles is phrased as "the document's own X" / "the Baseline Prompt document's own confirmed styles", never a literal Brand value). `produce-news-carousel-skill.docs-test.ts`'s no-hardcoding describe block is green. |
| 4 | Built test-first; strict validate + both suites green. | **PASS** | `tasks.md` shows docs-test written alongside the Skill (section 2) and the fixture-proving test written alongside the fixture (section 3), both before the final green-suite pass (section 4) — consistent with a test-first order. `openspec validate --all --strict` → 25/25. `npm test` → 1290/1290. `npm run test:docs` → 54/54. |

### Per-scenario results

**`specs/producer-skill/spec.md` (new capability):**

| Requirement / Scenario | Result | Covering test |
|---|---|---|
| The Skill file exists and declares its own slug | **PASS** | `docs-test.ts` "exists and is readable" + "declares its own slug in the front-matter `name` field" |
| STOP semantics for a missing Baseline Prompt document or a missing brief are documented | **PASS** | `docs-test.ts` "STOPs when the Baseline Prompt document is missing (any of the three not-found reasons)" (asserts `STOP`, `found: false`, all 3 literal reason strings `"not-declared"`/`"malformed"`/`"dangling"`) + "STOPs when the Idea brief cannot be read" |
| A banned word is REJECT-only, never a silent swap | **PASS** | `docs-test.ts` "treats a banned word as REJECT-only — STOP, never a silent swap (always-rule 6/9)" |
| The grounded-not-invented leading idea is documented | **PASS** | `docs-test.ts` "states every slide names real products/logos/actions where it reports something real" |
| Every referenced module/function is named exactly | **PASS** | `docs-test.ts`'s "references the correct in-repo slugs/paths" block — 5 tests covering `news-carousel-contract.ts`/`NewsCarouselSpec`/`CAROUSEL_ROLES`/`CAROUSEL_TEXT_MAX_CHARS`, `news-carousel-validate.ts`/`validateNewsCarouselSpec`, `news-carousel-author-checklist.ts`/`auditNewsCarouselAuthorPhase`/`NewsCarouselBaselineParams`, `format/store.ts`/`loadFormat` + `format/baseline-prompt.ts`/`loadBaselinePrompt`, `production-spec/store.ts`/`saveSpec`/`specPathFor`, `brand-profile.ts`/`loadBannedWords` — all present, independently confirmed by direct read of `SKILL.md` |
| The Skill states it does not run the Space and contains no Magnific tool call | **PASS** | `docs-test.ts` "states it does not drive the canvas or call any Magnific tool" (regex scan for `spaces_[a-z_]+\(` / `creations_[a-z_]+\(` — none found; the file's only mentions of `spaces_*`/`creations_*` are inside prose describing NOT calling them, confirmed by independent grep) |
| The Skill states it never publishes | **PASS** | `docs-test.ts` "never publishes (always-rule 1 / ADR-0002)" |
| The Skill never hardcodes Straw Motion's own strings | **PASS** | `docs-test.ts` "never hardcodes Straw Motion's own pill text, logo reference name, or Format name" — `doesNotMatch` for `"Unhypped News"` and `Straw_Motion_Logo|Brand_Logo` |

**`specs/production-spec/spec.md` (modified capability):**

| Requirement / Scenario | Result | Covering test |
|---|---|---|
| The committed fixture passes the #81 structural validator | **PASS** | `news-carousel-straw-motion-fixture.test.ts` "passes validateNewsCarouselSpec (#81's structural contract)" — `ok: true`, `errors: []` |
| The committed fixture passes the #85 author-phase checklist, parameterized with Straw Motion's real strings | **PASS** | Same file, "passes auditNewsCarouselAuthorPhase parameterized with Straw Motion's REAL baseline strings (#85's checklist)" — `ok: true`, `items.length === 8`, exactly 1 `agent-judged` item with `ok: null`, every `mechanical` item `ok: true` |
| `STRAW_MOTION_BASELINE`'s own strings are genuinely present in the real, committed document | **PASS** — independently re-verified by directly reading `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` and confirming `"Straw_Motion_Logo"`, `"Unhypped News"`, the never-all-caps sentence, and all five `FIXED_CLAUSES` strings appear verbatim in the document's "★ THE BASELINE PROMPT" section and worked examples. | Same file's second `describe` block: loads the REAL `loadFormat("straw-motion","unhypped-news")` + `loadBaselinePrompt(..., "news-carousel")`, normalizes the blockquote, asserts substring containment for `logoReferenceName`, `pillText`, `neverAllCapsInstruction`, and every `fixedClauses` entry |
| `STRAW_MOTION_BASELINE` is genuinely a different baseline than the stand-in `TEST_BASELINE` | **PASS** | Same block, "is genuinely a DIFFERENT baseline than the stand-in TEST_BASELINE" — `notEqual` on `logoReferenceName` and `pillText` against issue #85's own `TEST_BASELINE` fixture (confirmed by reading `fixtures/news-carousel-author-checklist-specs.ts` — `TEST_BASELINE.logoReferenceName === "Brand_Logo"`, distinct from `"Straw_Motion_Logo"`) |

### OpenSpec faithfulness (proposal + spec deltas vs issue #87, ADR-0018, ADR-0015)

- **Proposal correctly scopes the slice** to graduating the #77 prototype into a real Skill + a
  fixture-based proof, matching issue #87's "What to build" section almost clause-for-clause (inputs/
  STOP semantics, leading idea, 4 steps, aspect-ratio/model as canvas settings, no hardcoding).
- **Cross-checked against ADR-0018**: the ADR states the Skill is "the interpreter" that "reads the
  Brand's hard rules + the Format's baseline prompt (ADR-0015) + the Idea's brief" and "authors the
  media prompt(s)…self-checking against the author-phase contract" — this is exactly what the built
  `SKILL.md` documents (Inputs section + 4 Steps). The ADR's "thin Producer selects the Recipe by the
  queue job's slug and runs that Recipe's Skill" is correctly left OUT of this slice's scope (Non-Goals
  + Known Limits both flag it as issue #88) — this is a faithful, not a dropped, boundary: issue #87's
  own acceptance criteria only ask for the Skill's existence and target-output proof, never for the
  wiring.
- **Cross-checked against ADR-0015**: "Brand/Format specifics the document carries…come from the
  document, never hardcoded in the Recipe or the Skill" — matches Requirement 4 of
  `specs/producer-skill/spec.md` and its scenario, verified true above.
- **No misread found.** The spec deltas' Scenarios all trace cleanly back to issue #87's acceptance
  criteria; nothing in the spec asserts behavior the issue didn't ask for, and nothing required by the
  issue is missing from the spec. The "Non-Goals" section explicitly and correctly excludes #88's
  scope (driving the Space, composing Copy, wiring the Skill invocation, an automated document-to-
  params reader) — each of these matches a real, already-filed follow-up issue (#88, or #85's own
  stated Non-Goal), not a silently dropped #87 criterion.

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | **PASS** | `SKILL.md` §"What this Skill does not do": "It does not run the Space… It does not compose the Copy… It does not publish anything, ever." No publish/post code touched (`git status` shows only 5 new files, all under `.claude/skills/produce-news-carousel/` and `src/production-spec/`). |
| Public-metrics-only | **N/A this slice** | No metrics/Apify code touched — confirmed by file list; not exercised by this slice's tests. |
| Relative-not-absolute | **N/A this slice** | No scoring/comparison code touched. |
| Explicit-attribution | **N/A this slice** | No Post/attribution code touched. |
| Ledger-as-source-of-truth | **N/A this slice** | No ledger-write code touched; `recipe/registry.ts`, `production-queue/**` confirmed untouched via `git status --porcelain` (only 5 untracked new files; zero modified files). |
| Banned-word REJECT-only | **PASS** | `SKILL.md` step 3: "A banned word is REJECT-ONLY — STOP and report; never silently swap it for another word (always-rule 6/9)." `docs-test.ts` pins this exact phrasing. The referenced `auditNewsCarouselAuthorPhase`/`scanNewsCarouselForBannedWords` (pre-existing, unmodified #85 code) already implement reject-only, never-swap semantics — re-read directly to confirm. |
| Magnific fake / no live Space | **PASS — critical check clean.** | `grep -rn "spaces_\|creations_" .claude/skills/produce-news-carousel/ src/production-spec/produce-news-carousel-skill.docs-test.ts src/production-spec/news-carousel-straw-motion-fixture.test.ts src/production-spec/fixtures/news-carousel-straw-motion-specs.ts` → only 3 hits, all either prose describing what the Skill does NOT do, or the docs-test's own `doesNotMatch` regex assertions guarding against a literal call. Zero `spaces_*(`/`creations_*(` calls anywhere. `git status --porcelain` confirms zero files touched under `src/space-driver/**`/`src/execution-protocol/**`/`src/production-queue/**`. No credits spent, no board mutation, hermetic build confirmed. |

### Defect list

None. No defects found in Round 1.

### Overall

**PASS.** All three suites (`npm test`, `npm run test:docs`, `openspec validate --all --strict`) run
green as claimed and independently re-verified. Every acceptance criterion of issue #87 maps to a real,
passing test that genuinely exercises it (not a hollow assertion) — spot-checked the underlying
pre-existing #81/#85 modules to confirm the fixture test exercises real logic, and independently
re-read the real committed Baseline Prompt document to confirm the fixture's "real substring" claims
are genuine, not asserted by fiat. Every Requirement Scenario in both spec deltas traces cleanly back
to the issue and to ADR-0018/ADR-0015; no misread, no dropped criterion, no scope creep. No live
Magnific/Space call anywhere in the diff. The Skill's own known limits (not yet wired by slug, params
still hand-derived) are genuinely issue #88's scope, not a #87 criterion quietly dropped. This slice is
clear to proceed to a PR.
