# Slice Handoff — issue #109: News Carousel: render fidelity — real product names, bigger body font, full-bleed, soft vignette

Bidirectional channel for this slice. `developer` writes the Build Report below; `qa` appends its
Verdict beneath it. Nothing here is ever overwritten — retries append `Round-N Build` blocks.

---

## Build Report (Round 1)

### What changed

Strengthened Straw Motion's "Unhypped News" **Baseline Prompt document**
(`data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`) with four render-fidelity
guardrails (epic #106 items 8, 10, 11, 12) — a **documentation + fixture** change; no production code
path (validator, checklist, driver, Skill, registry) changes behavior. Applied at all three layers of
the document (the top "confirmed answer" bullets, the reusable swappable template, and all 7 worked
JSON examples), since the `produce-news-carousel` Skill "starts from the document's own worked example
for the `card_style` you chose" (SKILL.md step 2) — leaving any layer with the old, weaker wording would
have let a real run pick it up anyway:

1. **(8) Real names over fine fake-UI text.** The `Photo`/`Subject` bullets, the template's
   `[SUBJECT: ...]` bracket, name the exact failure mode (fine invented UI text renders as misspelled
   gibberish, e.g. "ChaGPT Work" for "ChatGPT Work") and instruct keeping on-screen text minimal (or the
   screen unreadable/out of focus) where no real screen can be shown.
2. **(10) Bigger body text.** The `Card text` bullet, the template's card-text clause, and all 7 worked
   examples now state the supporting line renders at a minimum of roughly 13-14px equivalent, never a
   "small caption-sized afterthought."
3. **(11) Full-bleed, no letterboxing — every card style, including the top card.** The `Photo` and
   `Card style` bullets, the template's photo-crop bracket (both graduated styles), and the relevant
   worked examples (the full-width crop, the top-card placement, the small-badge placement) each now
   explicitly say "edge to edge"/"no black margins" for their own photo region.
4. **(12) Soft vignette, never a solid box.** The `Logo` bullet, the template's logo-vignette sentence,
   the template's `[CARD CLAUSE]` bracket, and the floating-card vignette sentence (worked examples 2, 4,
   7) now explicitly forbid "a hard-edged solid black bar or filled box."

Composed with #108's already-landed em-dash rule and "Card text" bullet — neither removed nor
conflicted with; the new supporting-line-size sentence was appended to the SAME bullet #108 added to.

The graduated Straw Motion fixture (`src/production-spec/fixtures/news-carousel-straw-motion-specs.ts`)
was kept byte-for-byte in sync with the ONE pinned clause that changed (the logo-vignette sentence,
`FIXED_CLAUSES[2]`), and its `photoClause()`/`cardClause()`/`cardTextClause()` helpers were updated in
parallel (a self-review consistency pass, not required by any test) so the graduated idea-01 example
genuinely demonstrates the strengthened document.

A **new, automated pin** (`src/production-spec/news-carousel-straw-motion-fixture.test.ts`) reads the
REAL committed document and asserts each of the four new instructions is present, plus that the
graduated fixture's vignette clause stays in sync with the doc — per the issue's own instruction to
"guard the prose clause changes with docs-tests wherever the repo pins Baseline Prompt content."

**AC2 (canvas output/aspect-ratio setting) resolved to: purely live-Space, nothing in-repo to correct**
— see "Canvas-setting finding" below. No code change results from this; the in-repo clause (item 3
above) is what's covered instead, exactly as AC2 itself anticipates.

### Canvas-setting finding (AC2)

Verified, not assumed:

- The News Carousel Recipe's Space has an "Image Generator #21" node whose own settings are
  `mode: imagen-nano-banana-2-flash`, `aspectRatio: "3:4"`, `resolution: "1k"`
  (`src/space-driver/fixtures/live-captures/carrousel/00-spaces_show.fullboard.json` +
  its README; mirrored read-only in `src/producer/fixtures/fake-carousel-space.ts`'s
  `CARROUSEL_IMAGE_GENERATOR_SETTINGS`, whose own comment states: "the fake's port surface does not
  itself model generation settings (the port has no such primitive)").
- A repo-wide grep for `setAspectRatio`/`setResolution`/`aspectRatio` outside that read-only fixture and
  capture finds nothing — `src/space-driver/port.ts`'s `SpaceMcpPort` interface has no primitive to
  read or write an image generator's aspect ratio/resolution.
- `src/recipe/registry.ts`'s `RecipeSpaceTarget`/`RecipeCanvasInputs` types carry node NAMES only (spec
  input, pinned reference, run-points, media slots, watermark node) — no aspect-ratio/output field for
  either wired Recipe.
- `.claude/skills/produce-news-carousel/SKILL.md` already states, in its own words: **"Aspect ratio and
  model are the canvas's own settings — never write them into the prompt."** — an existing, in-repo,
  authoritative confirmation this is out of the Producer's (and this document's) control.
- The capture README additionally records the Operator's own 2026-07-18 decision: "Model = flash, kept
  ... No canvas change."

**Conclusion: there is no in-repo output/aspect-ratio setting to verify or correct.** Per AC2's own
instruction ("If the setting is purely live-Space and not in-repo, say so explicitly ... and cover the
in-repo clause instead"), this slice covers the in-repo clause — the reinforced full-bleed/
no-letterboxing Baseline Prompt prose (item 3 above) — instead.

### Files touched

**New:**
- `openspec/changes/109-render-fidelity/proposal.md`
- `openspec/changes/109-render-fidelity/tasks.md`
- `openspec/changes/109-render-fidelity/specs/format-baseline-prompt/spec.md`
- `openspec/changes/109-render-fidelity/handoff.md` (this file)

**Modified:**
- `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` — the four render-fidelity
  instructions, reinforced across the top bullets, the reusable template, and all 7 worked examples.
- `src/production-spec/fixtures/news-carousel-straw-motion-specs.ts` — `FIXED_CLAUSES[2]` (logo-vignette
  sentence) updated to the document's new wording verbatim; `photoClause()`, `cardClause()`'s
  floating-toast branch, and `cardTextClause()` updated to match; two fragile line-number comments
  replaced with durable bullet-name references.
- `src/production-spec/news-carousel-straw-motion-fixture.test.ts` — factored the repeated
  blockquote-normalizing logic into a shared `normalizeBaselineProse` helper; added a new `describe`
  block (5 tests) pinning the four render-fidelity clauses + the doc/fixture vignette-sync check.

**Explicitly NOT touched (per this run's guardrails — a separate, in-progress HITL run):**
`data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.spec.json`, `idea-02...`, `idea-03...`,
`data/brands/straw-motion/ledger.json`. Never opened with Read/Write/Edit this session — confirmed by
`git status` showing them identically modified (same diff) as at session start.

**Also NOT touched (see Non-Goals in `proposal.md`):** `.claude/skills/produce-news-carousel/SKILL.md`,
`src/recipe/registry.ts`, any production code path (`production-spec/validate.ts`,
`news-carousel-author-checklist.ts`, `news-carousel-validate.ts`, `news-carousel-brand-safety.ts`,
`dash-safety.ts`, `copy/*`, `space-driver/*`, `producer/*`), `data/brands/straw-motion/brand-profile.yaml`,
the live Magnific canvas.

### How to run

```bash
npm test                                                              # full suite: tsc --noEmit + all *.test.ts
node --import tsx --test src/production-spec/news-carousel-straw-motion-fixture.test.ts
openspec validate 109-render-fidelity --strict                       # this change
openspec validate --all --strict                                     # whole project (28/28 green)
npm run test:docs                                                    # separate from the npm test gate; confirms no NEW failure
```

Result: **1383 pass / 0 fail / 370 suites** (baseline was 1378; +5 new tests, zero regressions).
`npm run test:docs`: **82 pass / 1 fail** — the one failure is the same pre-existing, unrelated
`producer-agent.docs-test.ts` case (see Known limits).

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proving test(s) / evidence |
|---|---|---|
| 1 | The Baseline Prompt document instructs: real names over fine fake-UI text; supporting-line minimum ~13-14px; full-bleed edge-to-edge for every card style; soft-vignette-never-solid-box backing | `news-carousel-straw-motion-fixture.test.ts`'s new `describe("news-carousel.md instructs the four render-fidelity guardrails (issue #109)")` — 4 dedicated tests, each loading the REAL committed document via `loadFormat`/`loadBaselinePrompt` and asserting the specific instruction is a normalized substring: *"(8) prefers real, recognizable products/screens..."*, *"(10) the supporting line has a readable minimum size..."*, *"(11) every card style, including the top card, fills its photo region edge to edge..."*, *"(12) the logo/text backing is always a soft gradient vignette..."* |
| 2 | The canvas output/aspect-ratio setting is verified to produce full-bleed renders; corrected if it was causing letterboxing; if purely live-Space, say so and cover the in-repo clause instead | Resolved to **purely live-Space, not in-repo** — see "Canvas-setting finding" above (grep evidence: no `SpaceMcpPort` primitive, no registry field, SKILL.md's own "never write them into the prompt" line). No test proves an absence-of-code-path; the evidence is the grep/read trail cited above. The in-repo clause (full-bleed reinforcement) is covered instead — proven by criterion 1's own "(11)" test |
| 3 | Any pinned-baseline docs-tests are updated to match the new clause text and stay green | `news-carousel-straw-motion-fixture.test.ts`'s PRE-EXISTING test *"loadFormat + loadBaselinePrompt resolve the real document, and every STRAW_MOTION_BASELINE string is a real substring of its prose"* still passes, because `FIXED_CLAUSES[2]` in `news-carousel-straw-motion-specs.ts` was updated to the document's new wording verbatim; the new test *"every strawMotionIdeaOneCarouselSpec() slide still carries the UPDATED vignette clause verbatim"* additionally proves the doc and the graduated fixture were updated TOGETHER, not independently |
| 4 | `npm test` green | Full suite run directly: **1383 pass / 0 fail** (see "How to run" above) |

### Fakes / fixtures used

- **No Magnific fake was invoked by this slice.** This is a pure documentation + fixture + plain-file
  test change — no `FakeCarouselSpace`, no `FakeSpace`, no `space-driver` file touched, opened, or run.
  No live `spaces_*`/`creations_*` call was made anywhere; I was not given, and did not use, the
  Magnific MCP tools. No credits spent, no board mutated. (Flagging explicitly per the pipeline's own
  instruction, even though this slice's nature means the flag is "not applicable/not used," not "used
  safely.")
- **Real-file + in-memory fixtures only:**
  - The real, committed `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`,
    read via the real `loadFormat("straw-motion", "unhypped-news")` +
    `loadBaselinePrompt(..., "news-carousel")` — a plain-file read, no network, no Space.
  - `STRAW_MOTION_BASELINE` / `strawMotionIdeaOneCarouselSpec()` — an in-memory fixture built from
    constants that mirror the document's own verbatim clauses.
  - The separate, deliberately-different stand-in `TEST_BASELINE`
    (`news-carousel-author-checklist-specs.ts`) is untouched and unaffected — confirmed by inspection;
    it references no real document content.

### Self-review notes

- Factored the repeated blockquote-normalizing logic (strip `"> "`, join lines, collapse whitespace)
  into one shared `normalizeBaselineProse` helper in the test file, used by both the pre-existing test
  and the five new ones — removes duplicated logic that would otherwise have been copy-pasted five
  times.
- Caught and fixed a line-wrap bug my own edit introduced: the reusable template's photo-crop bracket
  had "full-width" split across a manual line break with the hyphen landing at the line's end
  ("full-\nwidth"), which a markdown blockquote renderer joins with a single space — producing a stray
  "full- width" when read as rendered prose. No test would have caught this (nothing asserts the
  literal string "full-width"); found by a full re-read proofread and confirmed fixed via
  `grep -nE '[a-zA-Z]-$'` finding zero remaining hits.
- Updated `photoClause()`/`cardClause()`'s floating-toast branch/`cardTextClause()` in the TS fixture to
  mirror the document's new wording even though no test requires the exact literal match at that
  layer (only `FIXED_CLAUSES` + `pillText`/`logoReferenceName`/`neverAllCapsInstruction` are
  cross-checked against the doc) — done so the graduated idea-01 fixture is genuinely representative
  of the strengthened document end-to-end, not merely still-passing on stale wording.
- Replaced two already-stale, fragile line-number code comments ("news-carousel.md line 63" /
  "line 72-73") with durable bullet-name references — these were wrong even before this slice (the doc
  had already moved since whatever revision those numbers were written against), and any future edit
  will re-break a line-number pointer but not a bullet-name one.
- Confirmed via `grep -rln "variation_id" src` (zero hits) that no test parses the worked JSON examples
  directly, so strengthening their prose freely could not silently break a hidden assertion.
- Considered expanding the code-level `CardStyle` union (`full_width`/`floating_toast`) to a third,
  graduated "top card" style, since AC1 explicitly names "the top-card placement." Decided against it:
  the issue's own framing ("the clause + canvas-setting changes are what's verifiable in the build")
  and the fact that the document's "Card style" bullet already treats all 7 placements (including the
  top card) as "confirmed, working options" the Skill can start from directly (SKILL.md step 2, "Start
  from the document's own worked example for the card_style you chose") means the prose-level
  reinforcement fully satisfies the acceptance criterion without a materially larger, unrequested
  code/architecture change. Documented as a Non-Goal in `proposal.md`.
- Confirmed no acceptance criterion or always-rule required touching
  `.claude/skills/produce-news-carousel/SKILL.md`, `src/recipe/registry.ts`'s static Phase Contract
  prose, or `data/brands/straw-motion/brand-profile.yaml` — left untouched, mirroring #108's own
  Non-Goals precedent for the same files.

### Known limits

- **Pre-existing, unrelated `npm run test:docs` failure** (NOT part of the `npm test` gate, and not
  touched by this slice): `producer-agent.docs-test.ts`'s *"producer.md is a thin, recipe-generic
  conductor — no recipe-specific procedure"* fails because `.claude/agents/producer.md` does not
  contain a phrase that test expects. Neither that test file nor `producer.md` appears anywhere in
  this slice's diff — reproduces identically on `main`/pre-slice state, per the task's own framing.
- **`format-baseline-prompt`'s pre-existing, already-stale byte-length/SHA-256 Scenario**
  (`openspec/specs/format-baseline-prompt/spec.md`, "The committed document is byte-identical to the
  locked prototype it was imported from") is NOT repaired by this change. Its covering test was already
  removed BEFORE this slice — `src/format/baseline-prompt.test.ts`'s own comment: *"That edit has now
  happened (2026-07-21 dry run: Subject rules, per-role narrative formulas, all 7 card styles
  confirmed) ... a byte-for-byte pin no longer makes sense to keep."* This change adds a NEW Requirement
  to the same capability for the four render-fidelity clauses rather than attempting to fix the
  already-stale one — exactly analogous to the item-count drift QA flagged (non-blocking) in #108's own
  spec delta, and out of this issue's scope.
- **No third, code-graduated `CardStyle`** was added for "top card" — see Self-review notes above; the
  top-card placement's full-bleed reinforcement lives in prose (the top bullets + worked Examples 3/6),
  not in a new code enum value.
- **The render effect itself is unverifiable in this hermetic build** — as the issue's own closing note
  states, "the render effect only fully shows in a live render; the clause + canvas-setting changes are
  what's verifiable in the build." This slice proves the document instructs the four guardrails and
  that the graduated fixture stays in sync; it cannot prove a live Magnific render actually looks
  correct, by design (no live Space in this pipeline).
- **AC2's canvas setting**: confirmed there is no in-repo setting to change (see "Canvas-setting
  finding"); nothing was corrected in-repo because nothing in-repo controls it.

---

## QA Verdict — Round 1: PASS

### Suite result

- **`npm test`** (`tsc -p tsconfig.json --noEmit && node --import tsx --test "src/**/*.test.ts"`):
  **1383 pass / 0 fail / 370 suites / 0 cancelled / 0 skipped / 0 todo.** Baseline before this slice was
  1378 pass; this run is +5, matching the new `describe("news-carousel.md instructs the four
  render-fidelity guardrails (issue #109)")` block (5 tests). `tsc --noEmit` is the first, hard
  prerequisite step of this exact command (confirmed in `package.json`'s `"test"` script) — the suite
  running to completion at all proves zero type errors, not merely an assumption.
- **`npm run test:docs`** (`node --import tsx --test "src/**/*.docs-test.ts"`): **82 pass / 1 fail / 20
  suites.** The one failure is `producer-agent.docs-test.ts`'s pre-existing *"producer.md is a thin,
  recipe-generic conductor — no recipe-specific procedure (issue #88)"* case. Confirmed pre-existing and
  unrelated to this slice: `git diff --name-only HEAD` (the #109 slice's own uncommitted diff, isolated
  from branch `109-render-fidelity`'s already-committed #108 work via `git diff --stat HEAD`) has zero
  hits for `producer-agent.docs-test.ts` or `.claude/agents/producer.md` — neither file is touched
  anywhere in this slice. No NEW docs-test failure was introduced.
- **`openspec validate 109-render-fidelity --strict`**: **valid.**
- **`openspec validate --all --strict`**: **28 passed, 0 failed** (28/28 specs, including this open
  change).

### Per-criterion results

| # | Acceptance criterion | Result | Proving evidence |
|---|---|---|---|
| 1 | Baseline Prompt document instructs: real names over fine fake-UI text; supporting-line minimum ~13-14px; full-bleed edge-to-edge for every card style; soft-vignette-never-solid-box backing | **PASS** | Read the real, committed `news-carousel.md` directly (not just the tests): all 4 clauses present in the top bullets (`Photo`, `Subject`, `Logo`, `Card text`, `Card style`), the reusable template, and — where the proposal claims — all 7 worked JSON examples. Independently walked all 7 examples' own photo-region clause and confirmed each carries "edge to edge"/"no black margins" phrasing (examples 1/5: "cropped to the top ~70%... filling its own region edge to edge with no black margins"; 2/4/7: "filling the entire frame edge to edge with no black margins" — 4 was previously "filling nearly the entire frame", now tightened; 3/6 [top-card]: "filling the remaining ~70-75% of the frame edge to edge with no black margins on any side"), the 13-14px phrase in all 7, the logo-vignette "never a hard-edged solid black bar or box" sentence in all 7, and the floating-card vignette sentence in exactly 2/4/7 (the only examples with a floating/badge card, consistent with the proposal's own scoping). 4 dedicated tests in `news-carousel-straw-motion-fixture.test.ts`'s new `describe` block load the REAL document via `loadFormat`/`loadBaselinePrompt` and assert each clause as a normalized substring — all 4 green. |
| 2 | The canvas output/aspect-ratio setting is verified to produce full-bleed renders; corrected if it was causing letterboxing; if purely live-Space, say so and cover the in-repo clause instead | **PASS** | Independently re-derived the developer's claim rather than trusting it. `grep -rn "aspectRatio\|setAspectRatio\|setResolution" src/` → hits ONLY in two read-only artifacts: `fake-carousel-space.ts`'s `CARROUSEL_IMAGE_GENERATOR_SETTINGS` (own comment: "the fake's port surface does not itself model generation settings — the port has no such primitive") and the live-capture JSON/READMEs. Read `src/space-driver/port.ts`'s `SpaceMcpPort` interface in full: exactly 7 methods (`readState`, `edit`, `editStatus`, `run`, `runStatus`, `fetchCreations`, `verifyPinned`) — none reads/writes an aspect ratio or resolution. `grep -n "aspectRatio\|resolution\|outputSetting\|canvasOutput" src/recipe/registry.ts` → zero hits. Checked every OTHER "resolution" hit in `src/` individually (`bind-media.ts`, `execution-protocol/parse.ts`, `run-pipeline.ts`, `format/store.ts`, `format/brief-path.ts`) — each is an unrelated sense of the word (media-slot/path/brand "resolution"), none is a canvas setting. `.claude/skills/produce-news-carousel/SKILL.md:97` states verbatim: "Aspect ratio and model are the canvas's own settings — never write them into the prompt." **Independently confirmed: no in-repo setting exists to correct.** AC2 is satisfied via the in-repo full-bleed clause (criterion 1's item 11) exactly as AC2's own text anticipates — not a defect. |
| 3 | Any pinned-baseline docs-tests are updated to match the new clause text and stay green | **PASS** | `FIXED_CLAUSES[2]` in `news-carousel-straw-motion-specs.ts` updated verbatim to the doc's new logo-vignette sentence; the pre-existing cross-check test ("every STRAW_MOTION_BASELINE string is a real substring of its prose") still passes against it (confirmed running). A new test ("every strawMotionIdeaOneCarouselSpec() slide still carries the UPDATED vignette clause verbatim") additionally proves doc+fixture stayed in sync, not independently edited. Searched EVERY `.docs-test.ts` file in the repo (6 files: `report.docs-test.ts`, `run-pipeline.docs-test.ts`, `track-performance.docs-test.ts`, `produce-character-explainer-skill.docs-test.ts`, `produce-news-carousel-skill.docs-test.ts`, `producer-agent.docs-test.ts`) for any other pin on this document's prose — only `produce-news-carousel-skill.docs-test.ts` references it at all, and it only asserts the Skill markdown *points at* the `format/baseline-prompt.ts` loader module path (`assert.match(text, /format\/baseline-prompt\.ts/)`), never pinning literal clause prose — so nothing else needed updating, and nothing else is stale. |
| 4 | `npm test` green | **PASS** | 1383 pass / 0 fail / 370 suites, run directly (see Suite result above). |

### Per-scenario results (`openspec/changes/109-render-fidelity/specs/format-baseline-prompt/spec.md`)

| Scenario | Result | Covering test |
|---|---|---|
| The document instructs preferring real names over fine fake-UI text | **PASS** | `news-carousel-straw-motion-fixture.test.ts` → `"(8) prefers real, recognizable products/screens over fine invented UI text..."` |
| The document instructs a minimum, readable supporting-line size | **PASS** | → `"(10) the supporting line has a readable minimum size (~13-14px equivalent)..."` |
| The document instructs full-bleed, edge-to-edge, no black margins, for every card style including the top card | **PASS** | → `"(11) every card style, including the top card, fills its photo region edge to edge with no black margins or letterboxing"` |
| The document instructs a soft vignette and explicitly forbids a hard-edged solid box | **PASS** | → `"(12) the logo/text backing is always a soft gradient vignette, never a hard-edged solid black bar or box"` |
| The graduated Straw Motion fixture's vignette clause stays in sync with the document's updated wording | **PASS** | → `"every strawMotionIdeaOneCarouselSpec() slide still carries the UPDATED vignette clause verbatim..."` |

All 5 Scenarios map 1:1 to a named, passing test — verified by reading both the assertion and the real
document, not taken on the Build Report's word.

### Composition-with-#108 check (stated guardrail, not a formal AC)

**PASS.** Read the doc directly: #108's "Card text" bullet ("Never an em dash ('—'), an en dash ('–'),
or a hyphen used as a sentence dash...") is untouched, word-for-word, and the new 13-14px sentence was
appended to the END of that SAME bullet, not a competing new one. Confirmed the new prose does not
violate the rule where it actually applies: `dash-safety.ts`'s own header comment explicitly scopes the
no-dash-tell rule to each slide's `stat_callout`/`text` fields ("Card text") ONLY, and explicitly
EXCLUDES `image_prompt` ("a media instruction fed to the image-generation model, never itself
reader-facing Copy... the Baseline Prompt document's own FIXED, verbatim-required clauses legitimately
contain em dashes"). All four new render-fidelity sentences live in instructional prose / the template /
`image_prompt`-composing text — never in a slide's literal `stat_callout`/`text` value. Verified via the
actual diff (`git diff HEAD -- .../news-carousel.md`) that no worked example's quoted on-card
`stat_callout` or supporting-line string was altered by this slice — only the surrounding `image_prompt`
instructional prose changed. A full per-line grep of the committed document for `—`/`–` confirms every
hit sits in instructional prose (bullets, the template, "placement" labels, narrative-formula
illustrations under "The 7-slide narrative"), never inside a literal on-card quoted string. Separately
confirmed `IDEA_01_AUTHORED_SLIDES.text` values in the TS fixture (the actual per-slide on-card copy)
remain dash-free and unchanged by this slice (`grep -nE '[a-zA-Z]-$'` on the doc also confirms zero stray
line-wrap hyphen artifacts, addressing the developer's own self-review note).

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | **PASS** | No publish-path file touched — diff is limited to `news-carousel.md` + `news-carousel-straw-motion-specs.ts` + `news-carousel-straw-motion-fixture.test.ts` (confirmed via `git diff --name-only HEAD`). |
| Public-metrics-only | **PASS (N/A)** | No metrics code touched. |
| Relative-not-absolute | **PASS (N/A)** | No scoring/comparison code touched. |
| Explicit-attribution | **PASS (N/A)** | No Post/attribution code touched. |
| Ledger-as-source-of-truth | **PASS** | `data/brands/straw-motion/ledger.json` and the three `2026-W29/idea-0{1,2,3}.news-carousel.spec.json` files ARE modified in the working tree, but their diffs (`git diff HEAD --`) show new `asset_url`s, new `produced_at` timestamps, and rewritten `copy`/`image_prompt` content consistent with a separate, concurrent, live content-loop production run — not this engineering slice, and not touched by this QA pass either (guardrail honored). |
| Magnific fake / no live Space | **PASS** | `grep -n "spaces_\|creations_\|FakeSpace\|FakeCarouselSpace\|SpaceMcpPort"` across all 3 files this slice touches → zero hits. This slice touches no `space-driver/*`, `producer/*`, or MCP-adjacent code at all — a pure markdown-document + in-memory-fixture + plain-file-read test change, exactly as the Build Report discloses. No credits spent, no board mutated, no live call anywhere. |

### Non-blocking pre-existing note (not a new defect, disclosed by the developer)

`openspec/specs/format-baseline-prompt/spec.md`'s existing Scenario "The committed document is
byte-identical to the locked prototype it was imported from" has no covering test any more (removed in
an earlier slice, per `src/format/baseline-prompt.test.ts`'s own comment, confirmed untouched by this
diff). Pre-existing, out of this issue's scope, already flagged non-blocking on #108's own QA pass per
the same pattern — carried forward here for visibility, not held against this slice.

### Defect list

None.

