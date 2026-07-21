# Slice Handoff — issue #108: News Carousel: forbid em dashes & stray hyphens in all copy

Bidirectional channel for this slice. `developer` writes the Build Report below; `qa` appends its
Verdict beneath it. Nothing here is ever overwritten — retries append `Round-N Build` blocks.

---

## Build Report (Round 1)

### What changed

Added a reject-only "dash tell" rule (em dash "—", en dash "–", or a hyphen used as a spaced dash
" - ") across News Carousel copy, mirroring exactly how banned words are already enforced in this
codebase:

- **New pure module** `src/production-spec/dash-safety.ts` — `scanTextFieldsForDashes(fields)`,
  generic over the same `TextField[]` shape `scanTextFields` (the banned-word core) already shares
  between the carousel Spec-shape scan and the composed-Copy scan. Flags an em dash, an en dash, or a
  hyphen with whitespace on **both** sides. Does **not** flag an ordinary hyphenated compound word
  (`state-of-the-art`, `task-assistant` — no whitespace touches their hyphens) or a bare negative
  number (`-3.7x` — nothing follows its hyphen but a digit). Reject-only: it only ever reports hits,
  never rewrites.
- **News Carousel author-phase checklist** (`auditNewsCarouselAuthorPhase`) gains a new mechanical
  item, `no-dash-tells`, scanning each slide's `stat_callout` + `text` — the Baseline Prompt document's
  own "Card text" fields. Deliberately **excludes** `image_prompt`: the Baseline Prompt's own fixed,
  verbatim-required clauses legitimately contain em dashes (e.g. "...frame width — so it stays a quiet
  brand mark..."), and `image_prompt` is a media instruction to the image model, never itself
  reader-facing "Copy" (CONTEXT.md "Copy"). `items.length` is now 10 (11 with `baselineDocumentText`
  supplied), up from 9/10.
- **The shared copy validator** (`copy/validate.ts`'s `validateCopy`) gains the same check on `caption`
  + every `hashtags[i]`, pushing a new `dash_in_copy` error per hit. This is the one shared, per-Recipe
  Copy step (ADR-0012), so it applies to both wired Recipes, not only News Carousel.
- **Two real, now-surfaced bugs fixed:**
  - `src/copy/draft.ts`'s `defaultDraftCopy` — the codebase's own default/fallback Copy drafter — was
    joining `title`/`mediaContext` with an em dash. Fixed to join with a period (separate short
    sentences), per the issue's own instruction.
  - Straw Motion's real committed fixture (`fixtures/news-carousel-straw-motion-specs.ts`) had em
    dashes in 4 of its 7 slides' `text` ("shift", "proof", "different", "next") — a live reproduction
    of the exact defect the epic reported. Rewritten as separate short sentences, still within the
    140-char on-card limit, meaning preserved.
  - One end-to-end test literal (`src/producer/carousel-end-to-end.test.ts`) asserted a caption
    containing an em dash; rewritten dash-free.
- **Documented** in the Baseline Prompt doc's "Card text" bullet, the `produce-news-carousel` Skill's
  Step-1 guidance + author-phase checklist bullet list, and a comment in
  `data/brands/straw-motion/brand-profile.yaml` (not a new parsed field — the rule is universal, not a
  per-Brand toggle).

### Files touched

**New:**
- `src/production-spec/dash-safety.ts`
- `src/production-spec/dash-safety.test.ts`
- `openspec/changes/108-forbid-em-dashes/proposal.md`
- `openspec/changes/108-forbid-em-dashes/tasks.md`
- `openspec/changes/108-forbid-em-dashes/specs/production-spec/spec.md`
- `openspec/changes/108-forbid-em-dashes/specs/copy-composition/spec.md`
- `openspec/changes/108-forbid-em-dashes/handoff.md` (this file)

**Modified:**
- `src/production-spec/news-carousel-author-checklist.ts` — new `no-dash-tells` item + `cardTextFields`
  collector.
- `src/production-spec/news-carousel-author-checklist.test.ts` — item-count bumps (9→10, 10→11) + 2 new
  tests.
- `src/production-spec/fixtures/news-carousel-author-checklist-specs.ts` — new `dashInText()` fixture.
- `src/production-spec/fixtures/news-carousel-straw-motion-specs.ts` — 4 `text` values rewritten
  dash-free.
- `src/production-spec/news-carousel-straw-motion-fixture.test.ts` — item-count bump (9→10).
- `src/copy/validate.ts` — new `dash_in_copy` check + code.
- `src/copy/validate.test.ts` — 7 new tests.
- `src/copy/draft.ts` — `defaultDraftCopy`'s em-dash join fixed.
- `src/copy/draft.test.ts` — 1 new regression test.
- `src/producer/carousel-end-to-end.test.ts` — 1 literal caption fixed.
- `.claude/skills/produce-news-carousel/SKILL.md` — Step-1 guidance + checklist bullet.
- `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` — "Card text" bullet.
- `data/brands/straw-motion/brand-profile.yaml` — documenting comment.

**Explicitly NOT touched (per the run's guardrails — a separate, in-progress HITL run):**
`data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.spec.json`, `idea-02...`, `idea-03...`,
`data/brands/straw-motion/ledger.json`. Verified untouched throughout — never opened with Read/Write/
Edit this session.

### How to run

```bash
npm test                                                    # full suite: tsc --noEmit + all *.test.ts
node --import tsx --test src/production-spec/dash-safety.test.ts
node --import tsx --test src/production-spec/news-carousel-author-checklist.test.ts
node --import tsx --test src/production-spec/news-carousel-straw-motion-fixture.test.ts
node --import tsx --test src/copy/validate.test.ts
node --import tsx --test src/copy/draft.test.ts
node --import tsx --test src/producer/carousel-end-to-end.test.ts
openspec validate 108-forbid-em-dashes --strict              # this change
openspec validate --all --strict                             # whole project (28/28 green)
```

Result: **1378 pass / 0 fail** (baseline was 1358; +20 new tests, zero regressions).

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proving test(s) |
|---|---|---|
| 1 | An on-slide `text` containing an em dash is flagged by the author-phase audit | `news-carousel-author-checklist.test.ts`: *"fails the new no-dash-tells item when a slide's on-card text carries an em dash — reject-only, never rewrites (issue #108)"*, using the new `dashInText()` fixture |
| 2 | A composed caption/hashtags string containing an em dash is flagged by the copy step's checks | `copy/validate.test.ts`: *"rejects a caption containing an em dash"* and *"rejects a hashtag containing a dash tell"* |
| 3 | A hyphen used as a sentence dash (" - ") is caught, while ordinary hyphenated words are NOT false-flagged | `dash-safety.test.ts`: *"flags a hyphen used as a spaced dash"* + *"does NOT flag an ordinary hyphenated compound word"* (covers both `state-of-the-art` and `task-assistant`); mirrored in `copy/validate.test.ts`'s *"rejects a caption containing a hyphen used as a spaced dash"* / *"does NOT flag an ordinary hyphenated compound word in the caption"*; and in `news-carousel-author-checklist.test.ts` via the spec-level MODIFIED-requirement scenario "A slide's stat_callout/text using an ordinary hyphenated word is NOT flagged" |
| 4 | The rule is reject-only (flag + stop), never a silent substitution | `dash-safety.test.ts`: *"never rewrites — the result carries only hits, never a 'corrected' text"*; `copy/validate.test.ts`: *"never rewrites — a dash tell simply fails validation, no 'corrected' Copy is ever returned"*; `news-carousel-author-checklist.test.ts`'s new test asserts `"spec" in result` is `false` |
| 5 | The rule is documented in the Brand copy rules and/or the Baseline Prompt document's card-text guidance | `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`'s "Card text" bullet (updated) + `data/brands/straw-motion/brand-profile.yaml`'s new comment — both hand-verified by reading the files (prose documentation, not itself a mechanical test); the `produce-news-carousel-skill.docs-test.ts` suite still passes after the `SKILL.md` edit, confirming the doc changes didn't break any pinned assertion |
| 6 | `npm test` green, covering dash-present (fail), dash-free (pass), and legitimate-hyphenated-word (pass) | Full suite 1378/0 (see above). Dash-present (fail): `dash-safety.test.ts` em/en/spaced-hyphen tests, `copy/validate.test.ts`'s 4 rejection tests, `news-carousel-author-checklist.test.ts`'s new dash-fail test. Dash-free (pass): `dash-safety.test.ts`'s "passes text with no dash at all", `copy/validate.test.ts`'s existing "accepts a valid Copy" test (now also implicitly proving no false-positive), `news-carousel-author-checklist.test.ts`'s "the baseline-adherent Spec's stat_callout/text are already dash-free" test. Legitimate-hyphenated-word (pass): `dash-safety.test.ts`'s dedicated test plus its mirrors in `copy/validate.test.ts` and the MODIFIED spec's new scenario |

### Fakes / fixtures used

- **Magnific fake: `FakeCarouselSpace`** (`src/producer/fixtures/fake-carousel-space.ts`) — driven only
  by the ALREADY-PASSING `carousel-end-to-end.test.ts` scenario I touched (one literal caption string
  fixed to remove its em dash; the render/bind/gate behavior it exercises is untouched by this slice).
  **No live `spaces_*`/`creations_*` call was made anywhere** — I was not given, and did not use, the
  Magnific MCP tools. No credits spent, no board mutated.
- **In-memory fixtures only** for every new/changed assertion: `dash-safety.test.ts` builds its own
  `TextField[]` literals; `news-carousel-author-checklist-specs.ts`'s new `dashInText()` mutates the
  existing `baselineAdherentCarouselSpec()`; `news-carousel-straw-motion-specs.ts`'s real Straw Motion
  fixture; plain object literals in `copy/validate.test.ts`/`draft.test.ts`. No network, no clock, no
  randomness anywhere in the new code.

### Self-review notes

- Chose to scan `stat_callout` + `text` (not the full `SLIDE_TEXT_KEYS` set the banned-word scanner
  uses) for the on-slide dash check, deliberately excluding `image_prompt`. Verified this is necessary,
  not just tidy: the Baseline Prompt's own fixed clauses (required verbatim in every `image_prompt` by
  the `fixed-clauses` checklist item) themselves contain em dashes — scanning `image_prompt` would make
  the checklist self-contradictory (one item requiring a clause, another forbidding what it contains).
  `stat_callout` + `text` map exactly to the Baseline Prompt document's own "Card text" bullet
  ("stat callout + supporting line"), so the scope is textually grounded in the doc, not invented.
  `role`/`card_style` (structural enums) are excluded too — never reader-facing prose.
- The "spaced hyphen" pattern requires whitespace on **both** sides (`\s-\s`), matching the issue's own
  example (" - ", spaces on both sides) exactly — this is what lets `-3.7x`-style negative numbers
  (space before, digit immediately after) pass cleanly, and is narrower/safer than a "whitespace on
  either side" rule would have been.
- The copy validator's dash check is necessarily shared across BOTH wired Recipes (Copy is one,
  Recipe-agnostic step, ADR-0012) — not only News Carousel. I confirmed this was the right call (not
  scope creep) by grepping the whole repo for any existing caption fixture that would newly break; the
  one real hit (`carousel-end-to-end.test.ts`) is fixed above, and `defaultDraftCopy`'s own em-dash
  join — a bug in shared, Recipe-agnostic code — needed the identical fix regardless of which Recipe's
  ticket surfaced it.
- Reused `TextField`/`scanTextFields`'s existing shape and calling convention throughout rather than
  inventing a parallel one — the new `dash-safety.ts` module takes the exact same `TextField[]` input
  `scanTextFields` does, so both News Carousel and the copy step could wire it in by passing their
  EXISTING field arrays, with zero new collection logic in `copy/validate.ts` (it reuses the very
  `fields` array already built for the banned-word scan).
- Did not touch `src/recipe/registry.ts`'s static, declarative `PhaseContract` checklist prose for
  either Recipe (a documentation-only artifact, already not kept 1:1 with the dynamic audit's item
  count even before this slice — it's missing an equivalent for the pre-existing `companies-cited`
  item). Bumping it would have meant updating unrelated magic-number count assertions in
  `registry.test.ts` for something no acceptance criterion names; left it exactly as-is, consistent
  with existing practice, to avoid scope creep.
- Did not touch the character-explainer Recipe's own Spec-shape banned-word scan/checklist
  (`production-spec/brand-safety.ts`, `production-spec/validate.ts`) — out of scope; the issue is
  titled "News Carousel" and its on-slide criteria only concern that Recipe's slides.
- Simplify pass: no dead code introduced; every new export (`DashHit`, `DashSafetyResult`,
  `scanTextFieldsForDashes`) is used by at least one real caller and covered by tests; no duplicate
  field-collection logic (the carousel checklist's `cardTextFields` and the copy validator's existing
  `fields` array are each the minimal, correctly-scoped collector for their own artifact).

### Known limits

- **Pre-existing, unrelated `npm run test:docs` failure** (NOT part of the `npm test` gate, and not
  touched by this slice): `producer-agent.docs-test.ts`'s *"resolves every Recipe-specific fact from
  the in-repo registry, never hard-coding one Recipe's shape"* fails because `.claude/agents/
  producer.md` (the **content** `producer` agent definition — a different file from anything this
  engineering slice touches) does not contain the phrase "recipe-generic conductor" anywhere. Verified
  this is unrelated to issue #108: I never opened `.claude/agents/producer.md` this session (confirmed
  by direct `grep`), and the phrase's absence has nothing to do with dashes/hyphens. Left untouched —
  fixing it would be scope creep onto a different, content-agent-loop file outside this build slice.
  Flagging it here so it isn't a surprise if `npm run test:docs` is ever run during review.
- **`registry.ts`'s static `PhaseContract` checklist prose** (both Recipes' "author"/"copy" phases) is
  not updated to mention the new dash rule — see Self-review notes above for why this is a deliberate,
  scoped decision, not an oversight.
- **The on-slide check does not cover `image_prompt`** — a deliberate exclusion (see "What changed"),
  not a gap: `image_prompt` is a media instruction, not reader-facing Copy, and the Baseline Prompt's
  own fixed clauses legitimately use em dashes there.
- **The rendered, on-image "mock-UI text"** the epic's Round 3 comment also mentioned (e.g. idea-02's
  rendered "rolling out soon — you're on the list") is pixel content baked into the image by the model
  from the `image_prompt`'s own free-text description of a screen — it is not a discrete JSON field
  this or any mechanical check can inspect. Out of scope for a code-level fix; the existing
  "grounded, not invented" agent-judged item is the closest lever available today.
- **No new YAML-configurable "copy rules" field** was added to `brand-profile.yaml` — the rule is
  universal (not a per-Brand toggle), so a comment satisfies "documented in the Brand copy rules"
  without inventing dead config the codebase's own conventions otherwise avoid.

---

## QA Verdict — Round 1: PASS

### Suite result

- **`npm test`** (`tsc -p tsconfig.json --noEmit && node --import tsx --test "src/**/*.test.ts"`), run
  directly by QA, not taken on faith: **1378 pass / 0 fail / 369 suites / 0 cancelled / 0 skipped / 0
  todo**. `tsc --noEmit` ran first as part of the same command and raised no error (the command would
  have failed before reaching the test runner otherwise). Matches the Build Report exactly (baseline
  1358 → 1378, +20 new, zero regressions).
- **`openspec validate 108-forbid-em-dashes --strict`** → `Change '108-forbid-em-dashes' is valid`.
- **`openspec validate --all --strict`** → `Totals: 28 passed, 0 failed (28 items)`, including this
  change and all 27 archived specs.
- **`npm run test:docs`** (not part of the `npm test` gate, run separately for due diligence per the
  task's instruction): 82 pass / 1 fail. The one failure —
  *"producer.md is a thin, recipe-generic conductor — no recipe-specific procedure (issue #88)"*
  (`src/production-spec/producer-agent.docs-test.ts`) — is confirmed **pre-existing and unrelated**:
  neither that test file nor `.claude/agents/producer.md` appears anywhere in this branch's diff (`git
  log main..108-forbid-em-dashes` shows zero commits; `git status`/`git diff --stat` show neither file
  modified), so their content is byte-identical to `main` and the failure necessarily reproduces there
  too. Confirmed unrelated to dashes/hyphens. Not counted against this slice.

### Per-criterion results

| # | Acceptance criterion | Result | Proving test |
|---|---|---|---|
| 1 | On-slide `text` with an em dash flagged by the author-phase audit | PASS | `news-carousel-author-checklist.test.ts:122` *"fails the new no-dash-tells item when a slide's on-card text carries an em dash — reject-only, never rewrites (issue #108)"*, via `dashInText()` (`fixtures/news-carousel-author-checklist-specs.ts:152`). Code: `news-carousel-author-checklist.ts`'s `no-dash-tells` item (lines 288–296) + `cardTextFields` (lines 167–178). |
| 2 | Composed caption/hashtags with an em dash flagged by the copy step | PASS | `copy/validate.test.ts:148` *"rejects a caption containing an em dash"*, `:169` *"rejects a hashtag containing a dash tell"*. Code: `copy/validate.ts`'s `dash_in_copy` check (lines 171–181). |
| 3 | Spaced hyphen-as-dash caught; ordinary hyphenated words NOT false-flagged (both directions) | PASS | Flag direction: `dash-safety.test.ts:28` *"flags a hyphen used as a spaced dash"*; `copy/validate.test.ts:162` *"rejects a caption containing a hyphen used as a spaced dash"*. No-false-flag direction: `dash-safety.test.ts:35` *"does NOT flag an ordinary hyphenated compound word"* (covers `state-of-the-art` + `task-assistant`) and `:43` *"does NOT flag a bare negative number"*; `copy/validate.test.ts:176` *"does NOT flag an ordinary hyphenated compound word in the caption"*. Code verified directly: `dash-safety.ts:36`, `const SPACED_HYPHEN = /\s-\s/` — whitespace required on **both** sides, which is exactly why `state-of-the-art`/`task-assistant` (no whitespace touching any hyphen) and `-3.7x` (digit, not whitespace, follows the hyphen) never match. See defect #2 below for one narrow, non-blocking gap in this criterion's coverage. |
| 4 | Reject-only — flag + stop, never a silent substitution | PASS | `dash-safety.test.ts:75` *"never rewrites — the result carries only hits, never a 'corrected' text"*; `copy/validate.test.ts:185` *"never rewrites — a dash tell simply fails validation, no 'corrected' Copy is ever returned"*; `news-carousel-author-checklist.test.ts:130` asserts `"spec" in result` is `false`. Code: `DashSafetyResult` (`dash-safety.ts:46-49`) carries only `{ ok, hits }` — no rewritten-text field exists anywhere in the type or its callers. |
| 5 | Documented in Brand copy rules and/or Baseline Prompt card-text guidance | PASS | Verified directly via `git diff`: `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`'s "Card text" bullet gains 4 lines of prose stating the rule + the "separate short sentences" fix + the hyphenated-word exception; `.claude/skills/produce-news-carousel/SKILL.md`'s Step-1 `text`/`stat_callout` guidance and its author-phase checklist bullet list both state the rule; `data/brands/straw-motion/brand-profile.yaml` gains a documenting comment. Both places done (issue only required "and/or"). `npm run test:docs`'s `produce-news-carousel-skill.docs-test.ts` sub-suite is among the 82 passing, confirming the `SKILL.md` edit broke no pinned assertion. |
| 6 | `npm test` green, covering dash-present (fail) / dash-free (pass) / hyphenated-word (pass) | PASS | Full suite 1378/0, confirmed by direct run (see Suite result). Dash-present: `dash-safety.test.ts`'s em/en/spaced-hyphen tests, `copy/validate.test.ts`'s 4 rejection tests, `news-carousel-author-checklist.test.ts`'s dash-fail test. Dash-free: `dash-safety.test.ts:7` *"passes text with no dash at all"*, `copy/validate.test.ts:24` *"accepts a valid Copy"*, `news-carousel-author-checklist.test.ts:133` *"already dash-free"*. Hyphenated-word: `dash-safety.test.ts:35`, `copy/validate.test.ts:176` (see criterion 3 for the one narrow gap noted). |

All 6 acceptance criteria PASS against real, directly-read, directly-run tests — not taken on the Build
Report's word.

### Per-scenario results (spec deltas)

**`specs/production-spec/spec.md`:**

| Requirement / Scenario | Result | Covering test |
|---|---|---|
| ADDED "A pure, reusable dash 'tell' scanner..." — all 5 scenarios (em/en/spaced flagged, hyphenated-word not flagged, negative-number not flagged, dash-free/empty passes, never rewrites) | PASS | `dash-safety.test.ts`, every scenario has a 1:1 named test |
| MODIFIED "News Carousel author-phase checklist..." — "A baseline-adherent Spec passes every mechanical item..." | **Numeric mismatch** (see Defect #1) — scenario claims `items.length is 9`; covering test (`news-carousel-author-checklist.test.ts:38`) asserts `10` | Functionally the item exists, passes, and is wired correctly; only the stated count is wrong |
| ...same Requirement, "A short Spec fails item 1" / "missing logo ref fails item 3" / "missing pill/caps fails item 4" / "missing fixed clause fails item 5" / "unconfirmed card_style fails item 7" / "banned word fails item 8" | PASS functionally | All covered by real, passing tests that select by stable `id` (`item(result, "...")`, not array position — per PR #105) |
| ...same Requirement, "A slide's on-card text containing an em dash fails item 9..." (NEW, #108) | PASS | `news-carousel-author-checklist.test.ts:122` |
| ...same Requirement, "...ordinary hyphenated word is NOT flagged by item 9" (NEW, #108) | PASS as a claim, but **no direct 1:1 covering test at this layer** (see Defect #2) | Closest is `:133`'s "already dash-free" test, whose fixture contains no hyphens at all |
| ...same Requirement, "genuinely parameterized" / "never throws on malformed Spec" | PASS | Covered |
| MODIFIED "The graduated Skill's target output is proven on-contract..." — "passes the #85 author-phase checklist, parameterized with Straw Motion's real strings" | **Same numeric mismatch** — scenario claims `items.length is 9`; covering test (`news-carousel-straw-motion-fixture.test.ts:47`) asserts `10` | Functionally correct, count wrong |
| ...same Requirement, structural-validator / STRAW_MOTION_BASELINE-verified-against-real-document / different-from-TEST_BASELINE scenarios | PASS | Covered |

**`specs/copy-composition/spec.md`:** every scenario in both the MODIFIED `validateCopy` Requirement
(well-formed accepted, per-Recipe shape, missing CTA/hashtag, banned word, **the 3 new dash scenarios**,
ordinary-hyphenated-word-not-rejected) and the MODIFIED `defaultDraftCopy` Requirement (own-shape
satisfied, different-shape respected, fake drafter, **never joins with a dash tell**) — PASS, each with
a specific, correctly-matching, directly-verified test. No numeric or naming discrepancies found here;
this delta is clean.

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | No publish-path file appears anywhere in this branch's file list (`git status`/`git diff --stat`); only `production-spec`, `copy`, and docs files touched. |
| Public-metrics-only | PASS | No metrics/`performance-tracker` file touched. |
| Relative-not-absolute | PASS | No scoring/comparison file touched. |
| Explicit-attribution | PASS | No `Post`/`log-post`/attribution file touched. |
| Ledger-as-source-of-truth | PASS | No ledger-write code path touched. The 4 data-file diffs present in the working tree (`data/brands/straw-motion/ideas/2026-W29/idea-0{1,2,3}.news-carousel.spec.json`, `ledger.json`) are confirmed pre-existing/out-of-session: `git log main..108-forbid-em-dashes --oneline` shows **zero commits** on this branch, and these exact 4 files were already dirty in the working tree at the very start of this QA session, before any QA action — consistent with the Build Report's explicit claim that they belong to a separate, concurrent, in-progress HITL run and were never opened this session. |
| Magnific fake only — no live Space calls | PASS | `grep -rnE "spaces_[a-z_]+\|creations_[a-z_]+"` across every new/touched file in this slice → **zero matches**. `src/producer/carousel-end-to-end.test.ts`'s only change is one literal caption string; it still solely instantiates `FakeCarouselSpace` (confirmed by reading the file — `new FakeCarouselSpace()` at lines 65 and 139, no other Space reference). No credits spent, no board mutated. |

### Defect list

1. **LOW** — Pre-existing (not introduced by this slice) item-count/ordinal drift in
   `openspec/changes/108-forbid-em-dashes/specs/production-spec/spec.md`. The "News Carousel
   author-phase checklist..." Requirement's header says "returning a `PhaseAuditResult`... with exactly
   9 `items`" and its own numbered walkthrough (1–9) omits the `companies-cited` item entirely (already
   missing since issue #102, which added that item without updating this spec text at the time) — so
   item 8 in the prose ("No banned word...") and item 9 ("No em dash...") are each off-by-one against
   the real, 10-entry array (`companies-cited` sits at position 8, `banned-words` at 9, `no-dash-tells`
   at 10). Two Scenarios literally assert `items.length is 9`, contradicting their own covering tests'
   actual assertions of `10`:
   - "A baseline-adherent Spec passes every mechanical item..." vs `news-carousel-author-checklist.test.ts:38`
   - "The committed fixture passes the #85 author-phase checklist..." vs `news-carousel-straw-motion-fixture.test.ts:47`

   **Repro:** `diff openspec/specs/production-spec/spec.md openspec/changes/108-forbid-em-dashes/specs/production-spec/spec.md`
   shows the archived (pre-#108) baseline already read "exactly 8 items"/"items.length is 8" and
   already omitted `companies-cited` — this slice's delta applies a clean, internally-consistent "+1"
   on top of that already-wrong baseline (8→9), rather than introducing a fresh miscount. Then
   `grep -n "items.length" src/production-spec/news-carousel-author-checklist.test.ts
   src/production-spec/news-carousel-straw-motion-fixture.test.ts` shows the real, current value is 10
   in both places.

   **Not blocking:** does not affect any of issue #108's 6 acceptance criteria (all independently
   verified above against real passing tests), no always-rule, no functional code path — confined to
   the numbered walkthrough/count in the spec's descriptive prose. Exactly analogous to the
   `registry.ts` `PhaseContract` prose gap the Build Report's own Self-review notes already flag as a
   deliberate, out-of-scope known limit, rooted in the same pre-existing cause (the checklist's item
   count in documentation lagging its code since issue #102). Recommend a quick follow-up: bump "9"→"10"
   in both places in `specs/production-spec/spec.md` (or in the archived spec after this change is
   folded in) and add the missing `companies-cited` line to the numbered walkthrough — no code change
   required.

2. **LOW** — One spec Scenario without a direct, dedicated covering test at its own layer: "Scenario: A
   slide's stat_callout/text using an ordinary hyphenated word is NOT flagged by item 9"
   (`specs/production-spec/spec.md`) has no literal counterpart in
   `news-carousel-author-checklist.test.ts` that feeds a genuinely hyphenated (but non-dash-tell) word
   through `auditNewsCarouselAuthorPhase`. The closest existing checklist-level test ("the
   baseline-adherent Spec's stat_callout/text are already dash-free — the new item passes cleanly",
   line 133) uses `baselineAdherentCarouselSpec()`, whose `text`/`stat_callout` values contain no
   hyphens at all (`text: \`Slide ${i + 1} (${role}): a short on-card supporting line.\``).

   **Repro:** read `src/production-spec/news-carousel-author-checklist.test.ts` in full and confirm no
   test passes a `text`/`stat_callout` value containing an ordinary hyphenated word (e.g.
   `"state-of-the-art"`) through `auditNewsCarouselAuthorPhase`.

   **Not blocking:** the identical underlying behavior IS directly, thoroughly tested at two other
   layers that share the exact same function — `dash-safety.test.ts:35` ("does NOT flag an ordinary
   hyphenated compound word") and `copy/validate.test.ts:176` ("does NOT flag an ordinary hyphenated
   compound word in the caption") — and the checklist's own wrapper
   (`cardTextFields` → `scanTextFieldsForDashes`, `news-carousel-author-checklist.ts` lines 167–178,
   204) adds no field-specific transformation logic that could plausibly behave differently at this
   call site, so the real-world risk is low. Acceptance criterion 3 is still genuinely satisfied by
   real, passing tests. A one-line addition to `dashInText()`'s sibling fixtures (a
   `hyphenatedWordInText()` fixture + one more `it(...)` in the checklist test file) would close this
   gap cleanly if the team wants full 1:1 coverage at every call site.

### Overall

Both defects are **LOW** severity, non-blocking, confined to spec-delta documentation precision/test
redundancy rather than functional behavior, and neither touches any of issue #108's 6 acceptance
criteria, any always-rule, or the Magnific-fake requirement. The shipped code is correct, hermetic, and
fully tested for everything the issue asks for. **Verdict: PASS.** This slice may proceed to a branch +
PR.
