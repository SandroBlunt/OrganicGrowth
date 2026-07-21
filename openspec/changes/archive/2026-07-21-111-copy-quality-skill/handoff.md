# Slice Handoff — issue #111: News Carousel copy quality

Bidirectional handoff for `111-copy-quality-skill`. This file carries `developer` ⇄ `qa` communication
only — not a session handoff, not OpenSpec's `tasks.md`.

## Build Report (developer, Round 1)

### What changed

Split internally into the three parts the issue named, exactly as scoped ("Both — improve copy
upstream and downstream" + the item-6 narrative rewrite):

**(a) Upstream — richer idea-strategist briefs.** `.claude/agents/idea-strategist.md`'s Hard Boundary
now requires: the **angle** to name the specific tension/contrast with real entities from the Trend
(never a generic theme); the **hook concept** to name the exact surprise/reframe (still concept-level,
never the finished line); and **talking points** to carry at least 4 entries, each grounding one
concrete, specific fact (a real name, number, date, or claim from the Trend's own evidence — "a
talking point with no specific is not acceptable"). The Process step adds an explicit
"make every brief concrete, not generic" instruction, and a new Guardrails bullet ("Be concrete, never
generic") makes it a standing rule. No brief schema exists in code (a Brief stays freeform markdown —
confirmed by reading `production-spec/generate.ts`'s `Brief` interface, which only mirrors
front-matter, and by the absence of any brief-body parser anywhere in `src/`), so this is proven the
way `src/format/format-docs.test.ts` already proves issue #53's own idea-strategist.md requirements: a
docs-conformance suite, kept as a REGULAR `.test.ts` (not `.docs-test.ts`) since richer briefs is this
slice's own headline criterion, not incidental conformance.

**(b) Downstream — a swappable copywriting Skill.** A new project Skill,
`.claude/skills/write-social-copy/SKILL.md`, is the copywriting counterpart to the two existing
per-recipe author Skills. `Recipe` (`src/recipe/registry.ts`) gains a `copySkill: string` field — both
wired Recipes set it to `"write-social-copy"` today — and `.claude/agents/producer.md`'s Copy-phase
section now loads the Skill named by `Recipe.copySkill` (never hard-coded), exactly mirroring how it
already loads the Author phase's Skill by the job's Recipe slug. The testable seam is
`src/copy/draft.ts`'s pre-existing injectable `CopyDrafter`: a new `skillDraftCopy` function stands in,
deterministically, for what an LLM following the new Skill produces — exactly the relationship
`defaultDraftCopy` already has to the pre-#111 unguided copy-phase prose. `CopyInput` gains an optional
`slideNarrative` field (the produced Production Spec's own per-slide `role`/`text`/`stat_callout`
beats); when present, `skillDraftCopy` weaves the `"hook"`/`"shift"`/`"cta"` beats into the caption —
proving it sharpens the ACTUAL produced narrative, not the brief alone. Neither `composeCopy`'s
signature nor `defaultDraftCopy`'s behavior changed — every pre-existing caller is unaffected.

**(c) The 7-slide narrative formula, reengineered for comprehension.**
`data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`'s "The 7-slide narrative"
section (ONLY that section — the fixed clauses/template/worked Examples elsewhere are untouched) now
carries a standing rule ("every role's on-slide line — the `stat_callout` AND the `text` — must state
plainly what happened and what it means"), names the mood-only anti-pattern by the issue's own
reproduced examples ("Same week.", "You still check."), and splits each of the 7 roles' formula into
what the `stat_callout` must name (the fact) vs. what the `text` must state (the plain-language
meaning) — role order unchanged (hook → then → shift → proof → different → next → cta).

### Files touched

**Added:**
- `.claude/skills/write-social-copy/SKILL.md`
- `src/copy/write-social-copy-skill.docs-test.ts`
- `src/production-spec/producer-agent-copy-skill.test.ts`
- `src/format/idea-strategist-brief-richness.test.ts`
- `openspec/changes/111-copy-quality-skill/{proposal.md,tasks.md,handoff.md,specs/**}`

**Modified:**
- `.claude/agents/idea-strategist.md` — Hard Boundary / Process / Guardrails, richer-brief guidance.
- `.claude/agents/producer.md` — intro (both Skills named) + Copy-phase section (loads
  `Recipe.copySkill`, sharpens the produced on-slide narrative). Incidentally added the literal phrase
  "thin, recipe-generic conductor" to the intro (true of the agent already, just not previously spelled
  out this way) — this happened to flip the PRE-EXISTING, unrelated `producer-agent.docs-test.ts`
  failure (issue #88, "producer.md is a thin, recipe-generic conductor") to green as a side effect; see
  "Known limits" below.
- `src/copy/draft.ts` — `CopySlideBeat` + optional `CopyInput.slideNarrative`; `skillDraftCopy` added.
- `src/copy/draft.test.ts` — new `describe` block, 9 tests, for `skillDraftCopy`.
- `src/copy/compose.test.ts` — new `describe` block, 4 tests, proving AC4.
- `src/recipe/registry.ts` — `Recipe.copySkill: string`; both seeded Recipes set to
  `"write-social-copy"`.
- `src/recipe/registry.test.ts` — 3 new assertions for `copySkill`.
- `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` — "The 7-slide narrative"
  section only.
- `src/production-spec/news-carousel-straw-motion-fixture.test.ts` — new `describe` block, 6 tests
  (mirrors the #109/#110 precedent of adding directly to this file).

**Not touched (verified):** `src/copy/compose.ts`, `inject.ts`, `validate.ts`, `contract.ts`;
`production-spec/news-carousel-validate.ts`, `news-carousel-author-checklist.ts`,
`news-carousel-brand-safety.ts`, `dash-safety.ts`; `space-driver/*`, `execution-protocol/*`; the "★ THE
BASELINE PROMPT" fixed clauses / reusable template / worked Examples of `news-carousel.md`;
`src/production-spec/fixtures/news-carousel-straw-motion-specs.ts`;
`data/brands/straw-motion/brand-profile.yaml`; the leftover
`data/brands/straw-motion/ideas/2026-W29/idea-0{1,2,3}.news-carousel.spec.json` and
`data/brands/straw-motion/ledger.json` (confirmed via `git status` — these were already modified in
the working tree before this session started; never opened this session).

### How to run

```bash
npm test                    # type-check + full suite (1429 pass / 0 fail)
npm run test:docs           # docs-conformance suite (96 pass / 0 fail)
npx openspec validate 111-copy-quality-skill --strict   # valid

# Individual new/changed files:
node --import tsx --test src/format/idea-strategist-brief-richness.test.ts        # 8/8
node --import tsx --test src/copy/draft.test.ts                                   # 19/19
node --import tsx --test src/copy/compose.test.ts                                 # 12/12
node --import tsx --test src/recipe/registry.test.ts                              # 40/40
node --import tsx --test src/copy/write-social-copy-skill.docs-test.ts            # 13/13
node --import tsx --test src/production-spec/producer-agent-copy-skill.test.ts    # 5/5
node --import tsx --test src/production-spec/news-carousel-straw-motion-fixture.test.ts  # 22/22
```

Baseline before this slice: 1393 pass / 0 fail (`npm test`), 82 pass / 1 fail (`npm run test:docs`).
After: **1429 pass / 0 fail** (`npm test`, net +36, zero regressions), **96 pass / 0 fail**
(`npm run test:docs` — the pre-existing failure is gone, see "Known limits").

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proving test(s) |
|---|---|---|
| AC1 | idea-strategist produces richer briefs — stronger hooks/angles/talking points — reflected in output guidance/shape, covered by tests | `src/format/idea-strategist-brief-richness.test.ts` (8/8) — pins the angle/hook-concept/talking-points richness requirements, the Process instruction, and the Guardrails bullet in `.claude/agents/idea-strategist.md` |
| AC2 | A swappable copywriting Skill exists and is invoked by the producer's copy step to compose the caption and sharpen on-slide text | `src/copy/write-social-copy-skill.docs-test.ts` (13/13, the Skill's own shape/existence) + `src/recipe/registry.test.ts`'s new `copySkill` assertions (both Recipes → `"write-social-copy"`) + `src/production-spec/producer-agent-copy-skill.test.ts` (5/5, producer.md resolves the Skill FROM `Recipe.copySkill`, cross-checked against the LIVE registry value) + `src/copy/draft.test.ts`'s `skillDraftCopy` block (9/9, the deterministic proof it composes the caption AND sharpens the produced on-slide narrative) |
| AC3 | Baseline Prompt doc's 7-slide narrative formula revised so each role explains the news (what happened + what it means), not just a mood | new `describe` block in `src/production-spec/news-carousel-straw-motion-fixture.test.ts` (6/6) — pins the standing comprehension rule, the named anti-pattern ("Same week."/"You still check."), the unchanged fixed role order, the stat_callout/text split, and that #108/#109/#110's own facts + the graduated fixture are unaffected |
| AC4 | The copywriting Skill respects Brand copy rules (banned words, required CTA/hashtags, no em dashes) — proven with a test | new `describe` block in `src/copy/compose.test.ts` (4/4) — `skillDraftCopy` → `composeCopy` → `validateCopy`, across BOTH wired Recipes' own `copyShape`s (180/1-3 and 2200/0-2), with the Brand's rules fixture (required CTA "Link in bio!", required hashtags, banned words) actually configured: required parts injected and present, a banned word still rejected (checker never bypassed), no dash tell in either shape. Plus `draft.test.ts`'s own dedicated dash-tell test for `skillDraftCopy` directly |
| AC5 | `npm test` green, with coverage for the new copy step | `npm test`: 1429/1429. New copy-step coverage: `draft.test.ts`'s `skillDraftCopy` block (9 tests) + `compose.test.ts`'s AC4 block (4 tests) + `registry.test.ts`'s `copySkill` assertions (3 tests) = 16 new tests directly exercising the new copy-step code, plus the doc/agent-wiring suites above |

### Fakes / fixtures used

- **No Magnific fake was needed or invoked.** The copy step has no Space/MCP call of its own —
  `src/copy/compose.ts`'s own module doc states "No Magnific, no Apify, no network," and this slice
  adds nothing that changes that. **Explicitly confirmed:** grepped the entire diff (all
  added/modified files) for `spaces_[a-z_]+\(` / `creations_[a-z_]+\(` — zero hits. The `developer`
  agent was not given, and did not use, the Magnific MCP tools this session.
- `src/copy/fixtures/brand-profile.copy-rules.yaml` / `brand-profile.no-rules.yaml` — the pre-existing
  Brand Profile fixtures (`required_cta: "Link in bio!"`, `required_hashtags: ["#lifehacks", "tips"]`,
  `banned_words: [cure, miracle, guaranteed]`), reused unchanged for AC4's proof.
- `skillDraftCopy` itself is the deterministic **fake standing in for the copywriting Skill's LLM
  output** (mirroring `defaultDraftCopy`'s existing role for the pre-#111 unguided prose) — this is the
  "model fake" ADR-0012 calls for ("drafting is exercised against the fake, never a live model"), not
  a Magnific fake.
- The real, committed `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` and
  `data/brands/straw-motion/formats/unhypped-news.yaml`, read via the real `loadFormat`/
  `loadBaselinePrompt` — plain-file reads, no fake needed.

### The swappable copy-Skill hook — design summary

`Recipe.copySkill: string` (`src/recipe/registry.ts`) names the project Skill slug
(`.claude/skills/<slug>/SKILL.md`) the thin Producer loads for a Recipe's shared, out-of-canvas copy
step — resolved from the SAME in-repo registry every other per-Recipe fact already comes from (gates,
Space, spec shape, copy shape, canvas inputs, phase contracts). `.claude/agents/producer.md`'s
Copy-phase section reads `Recipe.copySkill` and loads that Skill via the Skill tool, exactly mirroring
how it already resolves the Author phase's Skill by the job's Recipe slug — the producer never
hard-codes which copy Skill to run. Both wired Recipes point at `"write-social-copy"` today (ADR-0012
already made the copy step ONE shared step, parameterized by `copyShape`); a genuinely different
Recipe's copywriting need can point its own `copySkill` at a different Skill slug without touching the
other Recipe's config or this agent's own prose. The testable proof of the wired-up contract is
`src/copy/draft.ts`'s `skillDraftCopy` — a deterministic `CopyDrafter` any real LLM following the
Skill's instructions is expected to match the OUTPUT CONTRACT of (always passes `validateCopy`, never a
dash tell, sharpens `slideNarrative` when present).

**"Per recipe/brand" — design note.** The per-Recipe half is wired concretely (above). A per-BRAND
override was considered and deliberately NOT added: ADR-0013/issue #88 retired the last per-Brand
override of production config (the old `production.space_id` pointer) in favor of everything living on
the Recipe; adding a new per-Brand override here would cut against that settled direction. A future
Brand-specific copywriting need is better served by a Format-scoped Baseline-Prompt-style document
(ADR-0015's own pattern) than a second override axis.

### Self-review notes

- Confirmed `skillDraftCopy`/`CopyInput.slideNarrative` are purely additive: `composeCopy`'s signature,
  `defaultDraftCopy`'s behavior, and every pre-existing caller (`compose.test.ts`'s original tests,
  `src/producer/two-recipes-end-to-end.test.ts`, which uses the default drafter) are unmodified and
  re-verified green.
- Traced two subtle test-writing bugs to ground truth rather than assuming: (1) `injectRequiredHashtags`
  normalizes an appended hashtag to carry a leading `#` even when the Brand's own YAML omits one
  (`"tips"` → `"#tips"`) — my first AC4 assertion had this backwards; fixed after reading `inject.ts`'s
  actual behavior. (2) two regex assertions in new test files needed to tolerate this repo's own prose
  line-wrapping (a soft `\n` mid-phrase) — fixed by widening the regex, the same pattern already used
  elsewhere in this codebase's own docs-tests, rather than reflowing prose to fit a rigid pattern.
- Grepped the edited Baseline Prompt section for line-wrap hyphen artifacts (`grep -nE '[a-zA-Z]-$'`)
  before finalizing — none found (mirrors issue #109/#110's own self-review step).
- Removed the pre-existing em dashes from two of the narrative section's own illustrative quotes
  ("then" and "shift" roles) while rewriting them — not strictly required (the doc's prose isn't
  scanned by `no-dash-tells`, which only checks actual authored Spec fields), but keeps the Skill's own
  worked examples consistent with the no-dash rule it teaches, and was a natural byproduct of making
  those same two lines more concrete.
- Confirmed `CopySlideBeat.statCallout` (optional) is intentionally unused by the deterministic
  `skillDraftCopy` fake — exactly like the pre-existing `CopyInput.voice` field, present for a real LLM
  to read, not exercised by the pure function. Not dead code; no test added for it specifically (same
  as `voice` has none), since there is no runtime behavior tied to it to test.
- No new dependencies, no new directories beyond the one new Skill folder and the OpenSpec change
  folder. No dead code found; `tsc --noEmit` (part of `npm test`) is clean.

### Known limits

- **No structured brief schema.** Richer briefs stay freeform markdown (matches the existing system —
  no brief-body parser exists anywhere); AC1 is proven via agent-doc-guidance pins, not a TS type.
- **No new stored "sharpened on-slide text" ledger field.** The copywriting Skill's sharpening targets
  the CAPTION (the field `validateCopy`/AC4 actually check). The rendered slide's pixels are already
  final by the time the copy step runs; this slice does not add per-slide alt-text/caption storage — a
  natural next step, but not requested by this issue's acceptance criteria.
- **No per-Brand `copySkill` override** — a deliberate design choice (see above), consistent with
  ADR-0013/issue #88's settled direction.
- **No mechanical "no mood-only stat_callout" validator.** Narrative quality stays agent-judged
  (ADR-0017's own precedent, e.g. "grounded subject"); part (c) is a documentation change, not a new
  code check.
- **`strawMotionIdeaOneCarouselSpec()`'s own stat_callouts were not retrofitted** to the new narrative
  guidance — that fixture is issue #87's already-graduated, already-passing example; no test asserts
  anything about its narrative QUALITY (only structural/checklist conformance), so this is out of scope
  and unaffected either way.
- **The pre-existing `producer-agent.docs-test.ts` failure (issue #88, "thin, recipe-generic
  conductor") is now fixed** — incidentally, as a side effect of wording the producer.md intro edit
  needed for AC2's wiring, not a deliberate goal of this slice. Flagging plainly per the task's own
  instructions ("if your edit happens to also make that pre-existing test pass, great").
- Live-Magnific / real-LLM testing of the `write-social-copy` Skill's actual prose output is, as with
  every other Skill in this repo, deferred — proven only via the deterministic `skillDraftCopy` stand-in
  and the Skill's own pinned shape, never a live model call.

---

## QA Verdict — Round 1: PASS

Verified against the GitHub issue (`gh issue view 111`), the Slice Handoff above, the OpenSpec change
under `openspec/changes/111-copy-quality-skill/`, and the grounding docs (`CONTEXT.md`,
`.claude/rules/always/`, ADR-0012/0013/0017/0018). Read, ran, and reported only — no product code,
test, spec, or ledger file was edited.

### Suite result — all actually run, all green

| Command | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` (also runs as part of `npm test`) | Clean, 0 errors |
| `npm test` | **1429 pass / 0 fail**, 381 suites, 0 cancelled/skipped/todo |
| `npm run test:docs` | **96 pass / 0 fail**, 26 suites, 0 cancelled/skipped/todo |
| `npx openspec validate 111-copy-quality-skill --strict` | `Change '111-copy-quality-skill' is valid` |
| `npx openspec validate --all --strict` | `Totals: 28 passed, 0 failed (28 items)` |

Both counts match the Build Report's own claims exactly. Every new/changed test file was additionally
re-run standalone as an independent cross-check, all matching the Build Report's per-file counts:

| File | Claimed | Actual |
|---|---|---|
| `src/format/idea-strategist-brief-richness.test.ts` | 8/8 | 8/8 |
| `src/copy/draft.test.ts` | 19/19 | 19/19 |
| `src/copy/compose.test.ts` | 12/12 | 12/12 |
| `src/recipe/registry.test.ts` | 40/40 | 40/40 |
| `src/copy/write-social-copy-skill.docs-test.ts` | 13/13 | 13/13 |
| `src/production-spec/producer-agent-copy-skill.test.ts` | 5/5 | 5/5 |
| `src/production-spec/news-carousel-straw-motion-fixture.test.ts` | 22/22 | 22/22 |

Also re-ran `src/producer/two-recipes-end-to-end.test.ts` + `src/producer/carousel-end-to-end.test.ts`
(the two fake-Space-driven end-to-end paths) standalone: 11/11, unaffected. Grepped both for `drafter`/
`composeCopy` usage — neither passes a custom `drafter`, confirming `skillDraftCopy`'s addition could
not have regressed them (both rely on the untouched `defaultDraftCopy`).

### Per-criterion results

**AC1 — richer idea-strategist briefs — PASS.**
`git diff HEAD -- .claude/agents/idea-strategist.md` shows a purely additive strengthening: the Hard
Boundary now requires the angle to name "the specific tension or contrast ... named with real entities
from the Trend, never a generic theme"; the hook concept to name "the exact surprise or reframe" while
staying "NOT the final line"; talking points "AT LEAST 4 ... each grounding one concrete, specific
fact ... never invented; a talking point with no specific is not acceptable." Process step 3 adds
"Make every brief concrete, not generic ... richer briefs are how sharper copy gets made." Guardrails
gains "Be concrete, never generic." The pre-existing hard boundary ("You do not write the caption, the
script...") is untouched. `src/format/idea-strategist-brief-richness.test.ts` (8/8, a REGULAR
`.test.ts` running inside `npm test`'s 1429) pins every one of these strings verbatim against the real
file.

**AC2 — swappable copywriting Skill, invoked by the copy step — PASS.**
Three legs, all independently confirmed:
1. `src/recipe/registry.ts`: `Recipe` gains `copySkill: string`; `git diff` shows this is the ONLY
   substantive change to the file (plus the two one-line `copySkill: "write-social-copy"` seedings) —
   nothing else in the 788-line file moved. `registry.test.ts`'s new assertions (part of 40/40) pin
   both Recipes' value and that it is independent of `gates`/`specShape`/`copyShape`.
2. `.claude/skills/write-social-copy/SKILL.md` exists (front-matter `name: write-social-copy`),
   documents composing the caption+hashtags and sharpening the produced on-slide narrative, hands off
   to `injectRequiredParts`/`validateCopy` by exact module path, states REJECT-ONLY for a banned
   word/dash tell, states it is resolved via the swappable `Recipe.copySkill`, states it never runs the
   Space/never publishes, and — checked directly — contains no `spaces_*(`/`creations_*(` call and no
   `"Unhypped News"`/`"Straw_Motion_Logo"`/`"Link in bio!"` literal. All proven by
   `src/copy/write-social-copy-skill.docs-test.ts` (13/13).
3. `.claude/agents/producer.md`'s Copy-phase step 1 now reads "Load the copywriting Skill named by
   `Recipe.copySkill`" — resolved from the registry, never hard-coded (confirmed by direct read AND by
   `git diff`, a purely additive change to the same paragraph). `producer-agent-copy-skill.test.ts`
   (5/5) cross-checks the doc's own example slug against the LIVE `getRecipe(...).copySkill` for BOTH
   wired Recipes (`assert.equal(character.copySkill, carousel.copySkill)` then matches the doc against
   that live value) — a genuine regression guard against a future silent rename, not a frozen literal.

The "invoked ... to compose the caption and sharpen on-slide text" half is proven functionally, not
just descriptively: `draft.test.ts`'s `skillDraftCopy` block (9/9) includes a test that explicitly
proves the drafter ONLY weaves the `"hook"`/`"shift"`/`"cta"` beats and never leaks a `"then"`/`"proof"`
beat verbatim — a real behavioral assertion, not a smoke test.

**AC3 — Baseline Prompt's 7-slide narrative formula reengineered — PASS.**
Read the live, committed `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`.
The "## The 7-slide narrative" section (lines 77–141, the ONLY section touched) now states: "Every
role's on-slide line — both the `stat_callout` and the `text` — must advance real comprehension: state
plainly what happened and what it means," names `"Same week."` and `"You still check."` verbatim as
the anti-pattern to avoid, keeps the fixed role order (hook → then → shift → proof → different → next →
cta) unchanged, and splits each of the 7 roles' guidance into what the `stat_callout` must name (the
fact) vs. what the `text` must state (the meaning). Confirmed the "★ THE BASELINE PROMPT" fixed-clauses
section (lines 1–73, including #108's dash rule and #109/#110's render-fidelity/logo guardrails), the
reusable template, and the 7 worked JSON Examples are byte-for-byte untouched. `src/production-spec/
news-carousel-straw-motion-fixture.test.ts`'s new `describe` block (6/6) pins all of this against the
REAL document (never asserted by fiat) and confirms the graduated `strawMotionIdeaOneCarouselSpec()`
fixture is unaffected; the whole file (22/22, including every pre-existing #83/#85/#108/#109/#110
block) stays green.

Note: the rewritten narrative-section PROSE itself still contains some em dashes (in the per-role
guidance sentences, not the illustrative quotes). Confirmed via `src/production-spec/
news-carousel-author-checklist.ts`'s own module doc that `no-dash-tells` scans only an actually-AUTHORED
Spec's per-slide `stat_callout`/`text` fields, never the Baseline Prompt markdown document's own prose
— this is pre-existing behavior (the "★ THE BASELINE PROMPT" section above it has always contained em
dashes too) and not a regression introduced by this slice. Not a defect.

**AC4 — copywriting Skill respects Brand copy rules, incl. no em dashes — PASS.**
`src/copy/compose.test.ts`'s new `describe` block (4/4) drives `skillDraftCopy` through the REAL,
unmodified pipeline `composeCopy` → `injectRequiredParts` → `validateCopy` (confirmed by reading
`compose.ts`: `drafter(input, shape)` → `loadCopyRules` → `injectRequiredParts` → `validateCopy`, no
bypass), against the real `brand-profile.copy-rules.yaml` fixture (`required_cta: "Link in bio!"`,
`required_hashtags: ["#lifehacks","tips"]`, `banned_words: [cure, miracle, guaranteed]`), for BOTH
wired Recipes' own `copyShape` — read live off `getRecipe("character-explainer-with-cast").copyShape`
(180/1-3) and `getRecipe("news-carousel").copyShape` (2200/0-2), never a hand-rolled shape. Asserts:
`ok: true` with the CTA/hashtags actually present in the composed Copy; a banned word ("miracle") in
the drafted caption is still rejected with `code: "banned_word"` (checker never bypassed, confirmed by
reading `validate.ts`: the banned-word/dash scans run unconditionally on every composed Copy); no dash
"tell" (`/—|–|\s-\s/`) across both shapes. Confirmed `src/copy/validate.ts` is untouched by this slice
(`git diff HEAD` empty) — the SAME pre-existing checker (`scanTextFieldsForDashes` for #108's rule,
`scanTextFields` for banned words) is exercised, not a new or weaker one. `draft.test.ts` additionally
carries a dedicated `skillDraftCopy`-only dash-tell test, with and without `slideNarrative`.

**AC5 — `npm test` green with coverage for the new copy step — PASS.**
`npm test`: 1429/1429 (net +36 over the stated 1393 pre-slice baseline on this branch, 0 regressions).
New copy-step coverage exercising the actual new code: `draft.test.ts`'s 9 `skillDraftCopy` tests +
`compose.test.ts`'s 4 AC4 tests + `registry.test.ts`'s 3 `copySkill` assertions = 16 tests directly
against the new copy-step code, plus the 18 agent-doc/Skill-doc conformance tests (AC1/AC2/AC3 doc
pins) that gate the same behavior at the prompt-instruction layer.

### Per-scenario results (spec deltas)

**`idea-strategist-briefs` (ADDED capability — confirmed genuinely new: `openspec/specs/
idea-strategist-briefs/` does not yet exist on disk, so "Added" is the correct classification, not
"Modified"):**
| Scenario | Result | Covering test |
|---|---|---|
| Angle names a specific, named tension | PASS | `idea-strategist-brief-richness.test.ts` describe-1 test-1 |
| Hook concept names the exact surprise, still concept-level | PASS | describe-1 test-2 |
| Talking points: minimum count + concrete specific per point | PASS | describe-1 test-3 |
| Process step instructs concreteness from the Trend's evidence | PASS | describe-2 test-1 |
| Standing Guardrails bullet, independent of Process | PASS | describe-2 test-3 |
| Guidance pinned in a file matched by `npm test`'s glob | PASS | the file itself is `src/**/*.test.ts`-matched, confirmed inside the 1429 count |

**`copy-composition` (MODIFIED):**
| Scenario | Result | Covering test |
|---|---|---|
| `CopyInput` without `slideNarrative` stays valid (backward compatible) | PASS | every pre-existing `defaultDraftCopy`/`composeCopy` test (none sets `slideNarrative`) still green; `defaultDraftCopy`'s body is byte-identical pre/post diff |
| `skillDraftCopy` always satisfies `validateCopy` for its own shape | PASS | `draft.test.ts` skillDraftCopy-block tests 2, 3 |
| `skillDraftCopy` sharpens the produced on-slide narrative | PASS | `draft.test.ts` skillDraftCopy-block test 4 |
| Falls back cleanly with no `slideNarrative` | PASS | `draft.test.ts` skillDraftCopy-block tests 6, 7 |
| Never joins with a dash "tell" | PASS | `draft.test.ts` skillDraftCopy-block test 8 |
| Drop-in `CopyDrafter` — `composeCopy` needs no change | PASS | `compose.test.ts` AC4-block tests 1, 2 |
| Banned word still rejected | PASS | `compose.test.ts` AC4-block test 3 |

**`recipe-registry` (MODIFIED):**
| Scenario | Result | Covering test |
|---|---|---|
| Both seeded Recipes declare the same `copySkill` | PASS | `registry.test.ts` |
| `copySkill` independent of gates/specShape/copyShape | PASS | `registry.test.ts` |

**`producer-skill` (MODIFIED):**
| Scenario | Result | Covering test |
|---|---|---|
| Skill file exists, declares its own slug | PASS | `write-social-copy-skill.docs-test.ts` describe-1 |
| Documents sharpening the produced on-slide narrative | PASS | describe-4 |
| References the exact checker functions | PASS | describe-2 test-2 |
| Banned word/dash tell reject-only, never silent swap | PASS | describe-3 |
| Resolved via swappable `Recipe.copySkill` | PASS | describe-2 test-3 |
| Does not run the Space, no Magnific call | PASS | describe-5 test-1 + my own independent grep (zero hits repo-wide on the diff) |
| Never publishes, never hardcodes a Brand/Format string | PASS | describe-5 test-2 + describe-6 |

**`producer-conductor` (MODIFIED):**
| Scenario | Result | Covering test |
|---|---|---|
| Resolves the Skill from `Recipe.copySkill`, never hard-coded | PASS | `producer-agent-copy-skill.test.ts` describe-1 test-1 |
| Doc's example slug matches the LIVE registry for both Recipes | PASS | describe-1 test-2 (genuine cross-check, not a frozen literal) |
| Still documents sharpening the on-slide narrative | PASS | describe-2 |
| Every pre-existing Copy-phase reference retained | PASS | describe-3 (both tests) |

**`format-baseline-prompt` (MODIFIED):**
| Scenario | Result | Covering test |
|---|---|---|
| States the standing comprehension rule | PASS | fixture-test new-block test-1 |
| Names the mood-only anti-pattern by example | PASS | test-2 |
| Fixed role order unchanged | PASS | test-3 |
| Every pre-existing #108/#109/#110 fact remains a genuine substring | PASS | test-5 |
| Graduated fixture unaffected | PASS | test-6 |

(The Requirement's own point 4 — the per-role `stat_callout`/`text` split — is not given its own
`#### Scenario` heading in the spec delta, but IS exercised by the new block's test-4. Over-covered,
not a gap; noted for completeness, not a defect.)

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | `write-social-copy/SKILL.md`: "You generate, never publish (always-rule 1; ADR-0002)" and "It does not publish anything, ever." `producer.md`'s Copy phase composes/injects/validates/saves only. No publish-path file (`src/commands/log-post.ts`, ledger-write code) appears in the diff. |
| Public-metrics-only / relative-not-absolute | PASS (untouched) | No metrics/performance-tracker file in the diff. |
| Explicit-attribution | PASS (untouched) | No Post/attribution file in the diff. |
| Ledger-as-source-of-truth | PASS (untouched) | No ledger-write code path in the diff; the only `ledger.json` present is the pre-existing W29 leftover, explicitly out of this slice's scope per the Build Report and confirmed via `git status` (already modified before this session, never opened by this slice's work). |
| Magnific fake / no live-Space calls | PASS | Exhaustively grepped every file in `git status --porcelain`'s list for `spaces_[a-z_]+\(` and `creations_[a-z_]+\(` — **zero hits**. Broader grep for `mcp__magnific`/specific tool names across `src/copy/`, `src/format/`, `src/production-spec/`, and the new Skill folder — **zero hits**. Every new/changed test in this slice is a plain-file read or an in-memory pure-function call (`composeCopy`/`validateCopy`/`skillDraftCopy`); no Magnific fake was even invoked, matching the Build Report's own claim. |

### The producer.md docs-test question — explicit judgment: LEGITIMATE FIX, not a weakened test

1. `git diff HEAD --stat -- src/production-spec/producer-agent.docs-test.ts` is **empty** — the test
   file is byte-for-byte identical to the branch's base commit (`b6b121a`, issue #110's merge commit,
   which is HEAD on this branch since nothing has been committed yet this slice). The developer never
   touched this file, confirmed independently, not just taken on their word.
2. Read the specific, previously-failing assertion: `assert.match(text, /thin,\s*\n?\s*recipe-generic
   conductor/i);` — a genuine, specific content check for the literal phrase "thin, recipe-generic
   conductor" (tolerating only a mid-phrase line-wrap), not a vacuous or loosened pattern.
3. Read the full `producer.md` diff: the developer added the sentence "This keeps the agent a thin,
   recipe-generic conductor." to the SAME paragraph already explaining that Recipe-specific config
   resolves from the registry — a natural, on-topic edit made for AC2's own purpose (documenting that
   the copy Skill also resolves from the registry, "mirroring" the author Skill's pre-existing
   resolution), not an edit manufactured merely to flip this test.
4. The rest of that same pre-existing describe block ("producer.md is a thin, recipe-generic conductor
   — no recipe-specific procedure", 9 subtests: registry resolution, Brand-Profile `space_id`
   retirement, Skill-by-slug, Format resolution, `bindMediaSlots`, phase self-audit,
   `driveToNextGate`, and two node-name regression guards) all independently pass against the
   unmodified test file — nothing was loosened anywhere to make them pass.

Conclusion: this is a true, incidental fix. The pre-existing gap (the agent doc never literally spelled
out "thin, recipe-generic conductor," even though that was already true of it) was closed as a natural
side effect of documenting AC2's registry-driven Skill resolution, exactly as the Build Report
describes. No test was weakened.

### OpenSpec-matches-issue check — one judgment call reviewed, no defect

The issue's body (not its acceptance-criteria checklist) describes the Skill as "mirroring the
per-recipe author Skills — swappable per recipe/brand." The developer wired only the per-Recipe axis
and explicitly deferred a per-Brand override (Non-Goals + Known Limits), citing ADR-0013/issue #88's
settled retirement of per-Brand production overrides. Checked this is not a silent drop: the acceptance
criterion itself only requires "a swappable copywriting Skill" (satisfied), the existing author Skills
this is "mirroring" are ALSO only per-Recipe swappable today (so the analogy holds), and the reasoning
is transparently written down, not hidden. Not a defect.

Also reviewed AC2/the issue's phrase "sharpens the on-slide text after the media exists" against
`CONTEXT.md`'s own canonical definition of **Copy** (line 114): "The tailored text that ships **with**
one Asset — caption, hashtags, mentions, CTA ... not the Space's job — the Space makes media only."
Per this definition, the copy step structurally cannot touch rendered on-image pixels (that is the
Space's/author-Skill's job, pre-render — which is exactly what part (c)/AC3 already fixes at the root).
The built interpretation — the copy step pulls the ACTUAL, already-produced on-slide narrative forward
to sharpen the CAPTION — is the only reading consistent with CONTEXT.md's own vocabulary and with
ADR-0012's separation of concerns (Copy composes late, out-of-canvas, never touching rendered media).
Confirmed the Skill's own "What this Skill does not do" section states this explicitly ("Sharpening the
on-slide narrative into the caption never means re-rendering or editing the media itself"). Not a
misread; flagged here only for visibility, not as a defect.

### Defect list

None. No defects found at any severity.

**Overall: PASS.** All five acceptance criteria are met and test-proven against the real, live code and
docs (not asserted by fiat); every Requirement Scenario across all six spec deltas traces to a passing,
substantive test; `npm test` and `npm run test:docs` are both actually green (1429/0 and 96/0,
independently reproduced); `openspec validate --strict` is green both for this change alone and for the
whole repo; the previously-failing `producer-agent.docs-test.ts` is confirmed a legitimate, incidental
fix, not a weakened test; no live-Space call exists anywhere in the diff; all five always-rules hold.
Ready for `/build-issue` to open the branch/PR.
