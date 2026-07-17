# Slice Handoff — issue-88-thin-recipe-generic-producer

Bidirectional channel between `developer` and `qa`. Developer writes the Build Report below; `qa`
appends its Verdict beneath it. Retries append `Round-N Build` blocks — nothing here is overwritten.

## Build Report (Round 1)

### What changed

The Producer becomes a **thin, recipe-generic conductor** (ADR-0018), and the wired *Character
Explainer with Cast* Recipe's own authoring craft moves out into its own Skill — closing the last gap
ADR-0010/0016/0017/0018 left open after issues #81/#82/#85/#87 built every supporting piece. Concretely:

1. **Fixed the one real bug blocking genericity**: `injectSpec`/`DriveLegInput`'s first leg were
   hard-coded to inject into `"JSON Master"` — the News Carousel Recipe's prompt node is `"Slides
   Prompts"`, so the "generic" driver could never actually have driven it. `injectSpec(port, spec,
   promptNode, poll)` and `DriveLegInput.first.promptNode` now take the Recipe's OWN prompt node
   (`Recipe.canvasInputs.promptNode`) as a required parameter — the wired Recipe passes the SAME
   literal `"JSON Master"` value it always did (byte-identical behaviour, proven by the untouched
   assertions in `driver.test.ts`), while the carousel Recipe now correctly passes `"Slides Prompts"`.
2. **Added `bindMediaAsset`/`bindMediaGoal`** (`src/space-driver/driver.ts`) — binds a Brand Asset's
   local media file into a named canvas reference node via the Fallback Protocol, REUSING the exact
   `port.edit`/`port.verifyPinned` primitives `pinPick` already uses. No new `SpaceMcpPort` method, no
   live-adapter/transport change.
3. **New `src/producer/` package** — the thin conductor's own deep modules: `resolveIdeaFormat`
   (resolves an Idea's Format from the ledger, STOPping cleanly when absent — the field `format?:
   string` is new on `LedgerIdea`) and `bindMediaSlots` (resolves a Recipe's declared media slots,
   STOPping the whole bind the instant a REQUIRED one is missing — ADR-0016, never a half-bound
   Asset).
4. **A second, purpose-built Magnific fake** (`FakeCarouselSpace`) proves the News Carousel Recipe runs
   **gate-free, end-to-end**, against the fake: bind the found Brand Logo, inject the real committed
   Straw Motion Spec fixture (from issue #87) into `"Slides Prompts"`, run the sole run-point, and
   FINISH with the rendered Asset — no pause anywhere, since this Recipe declares zero gates. A
   companion test proves a MISSING required Brand Asset STOPs before any Space call at all (the fake's
   edit/run call counts stay at zero).
5. **`.claude/skills/produce-character-explainer/SKILL.md`** — the wired Recipe's authoring craft (3
   character concepts, 3 Pixar-3D clips ending in the exact 9:16 line, 3 top-level thumbnails),
   extracted **behaviour-identical** from what `producer.md` did inline: same contract, same
   validator/banned-word scan, same author-phase checklist.
6. **`.claude/agents/producer.md` rewritten as a thin, recipe-generic conductor.** It now holds NO
   recipe-specific procedure — it resolves a job's Recipe from the registry, resolves the Idea's Format,
   runs that Recipe's Skill BY SLUG for authoring, binds media (STOPping on a missing required asset),
   drives the canvas via the (already-generic) `driveToNextGate` pausing ONLY at that Recipe's own
   declared gates, composes Copy out-of-canvas, self-audits every phase (ADR-0017), and saves the Asset
   (ledger grain unchanged). The canvas id comes ONLY from `Recipe.space.id` — no Brand Profile field is
   ever read for it.
7. **Retired `production.space_id`/`production.space_url`** from
   `data/brands/mundotip/brand-profile.yaml`, with a migration-note comment. Grep-verified repo-wide:
   every remaining mention is historical ADR prose, this change's own migration note, or a test's own
   assertion string — never a live read.

### Files touched

**New:**
- `src/producer/resolve-format.ts` + `resolve-format.test.ts`
- `src/producer/bind-media.ts` + `bind-media.test.ts`
- `src/producer/fixtures/fake-carousel-space.ts` — the **second Magnific fake** (see below)
- `src/producer/carousel-end-to-end.test.ts`
- `.claude/skills/produce-character-explainer/SKILL.md`
- `src/production-spec/produce-character-explainer-skill.docs-test.ts`
- `openspec/changes/issue-88-thin-recipe-generic-producer/` — `proposal.md`, `tasks.md`,
  `specs/producer-conductor/spec.md` (new capability), `specs/generic-gate-driver/spec.md` (modified),
  `specs/producer-skill/spec.md` (modified), `specs/docs-conformance/spec.md` (modified), this
  `handoff.md`.

**Modified:**
- `src/space-driver/driver.ts` — `injectGoal`/`injectSpec` take `promptNode`; `DriveLegInput.first`
  gains `promptNode: string`; `driveToNextGate` threads it through; `json_master_missing` renamed
  `prompt_node_missing`; new `bindMediaGoal`/`bindMediaAsset` + 2 new `DriverErrorCode`s
  (`media_bind_edit_failed`/`media_bind_unconfirmed`).
- `src/space-driver/driver.test.ts` — 8 `DriveLegInput` "first" literals + 4 direct `injectSpec`/
  `injectGoal` calls updated to pass `JSON_MASTER_NODE_NAME` explicitly (same value — mechanical only,
  every removed line is a call site, zero assertions removed/weakened); new `bindMediaGoal`/
  `bindMediaAsset` describe blocks (success + 2 failure modes) via a small local stub port.
- `src/space-driver/live/driver-over-live.test.ts` — same mechanical `promptNode` threading (3 sites);
  the live adapter itself is untouched (`bindMediaAsset` needed no new port method).
- `src/space-driver/port.ts` — `verifyPinned`'s doc comment generalized (parameter renamed
  `character` -> `value`; no signature/behaviour change) to reflect its reuse for both a Character pin
  and a Brand Asset bind.
- `src/ledger/ledger.ts` — `LedgerIdea` gains `format?: string`; `loadIdeas` parses it defensively
  (mirrors the existing `recipes` field's omit-if-absent/garbled convention).
- `src/ledger/ledger.test.ts` — 3 new tests for `format` parsing (present / old-record-absent / garbled).
- `src/recipe/registry.ts` — doc-comment-only updates: the two places describing
  `production.space_id` as still read "today" now describe it as retired (issue #88); no type or
  behaviour change.
- `.claude/agents/producer.md` — full rewrite (thin conductor; see "What changed" above).
- `src/production-spec/producer-agent.docs-test.ts` — kept every pre-existing assertion (model opus,
  generate-never-publish, Magnific, Cast mentioned, ADR-0008/attended, `recipe`/`awaiting_pick` fields,
  no `awaiting_cast`); added a new describe block (8 tests) proving genericity: resolves via
  `getRecipe(job.recipe)`, never reads `production.space_id`, runs a Recipe's Skill by slug, resolves
  Format via `resolveIdeaFormat`, binds media via `bindMediaSlots`, self-audits via the three
  `phase-contract.ts` auditors, drives via `driveToNextGate` pausing only at `Recipe.gates`, and never
  hard-codes the wired Recipe's own canvas node names.
- `data/brands/mundotip/brand-profile.yaml` — `production.space_id`/`space_url` removed; migration
  note added.

### How to run

```bash
# type-check + full unit suite (what `npm test` runs)
npx tsc -p tsconfig.json --noEmit
npm test

# just this slice's new/changed test files
node --import tsx --test \
  src/producer/resolve-format.test.ts src/producer/bind-media.test.ts \
  src/producer/carousel-end-to-end.test.ts \
  src/ledger/ledger.test.ts \
  src/space-driver/driver.test.ts src/space-driver/live/driver-over-live.test.ts

# docs tests (producer.md + 2 new Skill docs-tests changed this slice)
npm run test:docs
node --import tsx --test \
  src/production-spec/producer-agent.docs-test.ts \
  src/production-spec/produce-character-explainer-skill.docs-test.ts

# build
npm run build

# OpenSpec
npx openspec validate issue-88-thin-recipe-generic-producer --strict
npx openspec validate --all --strict
```

All green: `npx tsc --noEmit` clean; `npm test` — **1312/1312 pass** (357 suites); `npm run test:docs`
— **77/77 pass** (19 suites); `npm run build` clean; `openspec validate --all --strict` —
**26/26 pass** (25 pre-existing specs + this change).

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #88) | Proving test(s) |
|---|---|---|
| 1 | The Producer doc holds no recipe-specific procedure; everything resolves from the registry + the Recipe's Skill. | `src/production-spec/producer-agent.docs-test.ts`'s new describe block: `"resolves every Recipe-specific fact from the in-repo registry..."`, `"never hard-codes the wired Recipe's own canvas node names..."` (asserts absence of `"Character Variants Generator"`/`"Selected Character"`), `"runs the Recipe's own producer Skill BY SLUG..."`. |
| 2 | The character path behaves exactly as today via its extracted Skill (existing fake-Space tests stay green). | The FULL pre-existing `src/space-driver/driver.test.ts` suite (the wired-Recipe `driveToNextGate` describe blocks, `injectSpec`, `pinPick`, C9/C10) passes with the SAME assertions, mechanically updated only to pass the explicit `promptNode: JSON_MASTER_NODE_NAME` argument (the identical literal value used internally before this change) — proven by `git diff`'s removed lines being 100% call-site-only, zero assertion logic changed. `src/production-spec/produce-character-explainer-skill.docs-test.ts` (15 tests) additionally proves the extracted Skill references the SAME contract/validator/checklist modules by exact name. |
| 3a | A carousel job runs gate-free end-to-end against the fake. | `src/producer/carousel-end-to-end.test.ts`: `"has ZERO declared gates..."`, `"author phase: the real Straw Motion Spec self-audits ok..."`, `"bind-media phase + render: binds the found Brand Logo, then drives the gate-free canvas to a finished Asset"` (asserts `outcome.kind === "finished"`, never `"paused"`, with exact edit/run call counts), `"copy phase: a valid caption/hashtags pair self-audits ok..."`. |
| 3b | A missing required Brand Asset STOPs with a clear message. | `src/producer/carousel-end-to-end.test.ts`: `"bind-media STOPs with a clear message naming the slot; the fake is never touched"` — asserts `bindMediaSlots` returns `ok:false` naming `"Brand Logo"` with the store's own message, AND that a fresh `FakeCarouselSpace`'s `editGoals`/`runs` are both empty (proving the STOP happens before any Space call). `src/producer/bind-media.test.ts` (6 tests) proves the same STOP rule in isolation for both slot kinds. |
| 4 | No code or agent doc reads `production.space_id` from a Brand Profile any more. | Repo-wide grep for `production.space_id` (re-run by the developer just before this report) — zero remaining hits outside historical ADR prose (`docs/adr/0008`/`0016`), this change's own migration-note comment (`registry.ts`, `brand-profile.yaml`), and this change's own OpenSpec/handoff/test-assertion strings. `producer-agent.docs-test.ts`'s `"never reads production.space_id from a Brand Profile any more"` test asserts `.claude/agents/producer.md` itself contains no `production.space_id` match (confirmed separately: `grep -c "space_id" .claude/agents/producer.md` → 0). |
| 5 | Producer docs-tests updated; built test-first; strict validate + both suites green. | Every task in `tasks.md` is checked off test-first (test written/updated to fail against the OLD code, then the code changed to pass). `openspec validate --all --strict` → 26/26. `npm test` → 1312/1312. `npm run test:docs` → 77/77. `npx tsc --noEmit` clean. `npm run build` clean. |

### Fakes / fixtures used

- **The Magnific fake — TWO of them, both flagged.** (1) The EXISTING character-Recipe `FakeSpace`
  (`src/space-driver/fixtures/fake-space.ts`) — completely UNTOUCHED behaviourally (only its CALLERS in
  `driver.test.ts` gained an explicit `promptNode` argument of the identical value it always used
  internally). (2) A NEW, independent `FakeCarouselSpace`
  (`src/producer/fixtures/fake-carousel-space.ts`), purpose-built for the News Carousel Recipe's
  genuinely different canvas shape — never reusing the character fake's hard-coded node names. **No
  live `spaces_*`/`creations_*` call anywhere; no credits spent; no board mutation.** The `developer`
  agent was not given the Magnific MCP tools for this slice and never reached for them.
- `src/production-spec/fixtures/news-carousel-straw-motion-specs.ts` (existing, from issue #87) —
  `STRAW_MOTION_BASELINE` and `strawMotionIdeaOneCarouselSpec()`, Straw Motion's REAL committed
  Baseline Prompt strings and a validated 7-slide Spec, reused directly (not re-derived) to prove the
  end-to-end run against a genuinely real (Brand × Format) artifact, not an invented one.
- A small local `MediaBindConfirmingSpace` stub in `driver.test.ts` (mirrors the pre-existing
  `PinConfirmingSpace` pattern) isolates `bindMediaAsset`'s own success/failure paths from the fuller
  fakes.

### Self-review notes

- **Found and fixed a real gap, not just a documentation problem.** `injectSpec` being hard-coded to
  `"JSON Master"` meant the "generic" driver could never actually have driven the News Carousel
  Recipe — this was the load-bearing fix the whole slice needed; everything else (the thin conductor
  doc, the extracted Skill) would have been hollow without it.
- **Deliberately did NOT add a new `SpaceMcpPort` method for the Brand Asset upload.** The obvious
  design (a dedicated `uploadMedia`) would have forced a matching, unverified addition to
  `LiveMcpTransport`/`LiveSpaceAdapter` with no captured live-response shape to ground it against —
  against this repo's own established rigor (every existing adapter method is reverse-engineered from
  an actual capture). Reusing `edit`/`verifyPinned` (exactly how `pinPick` already works) needed zero
  port/adapter changes and stays honest about what is and isn't verified.
- **Kept the physical bind-target node name as a caller-supplied value, not a new Recipe-registry
  field.** The News Carousel Recipe's logo reference node name is genuinely per-(Brand × Format) data
  (Straw Motion's real Baseline Prompt names it `"Straw_Motion_Logo"`) — hard-coding it onto the
  brand-agnostic Recipe registry would have been wrong given "one shared canvas per Recipe for every
  Brand" (ADR-0013). `bindMediaAsset`/`bindMediaSlots` both take it as a parameter; resolving that
  parameter from the Format's Baseline Prompt document is prose in `producer.md`, matching the
  established #85/#87 pattern (an LLM Skill reads the document; code never parses it).
- **Renamed `json_master_missing` -> `prompt_node_missing`** rather than leaving a misleading code
  name once the missing node can genuinely be `"Slides Prompts"` — verified zero existing test asserted
  the old name before renaming.
- **Kept the character Skill narrowly scoped to authoring only** (mirroring `produce-news-carousel`'s
  own shape exactly) — it does not drive the canvas, pin the Character, or compose Copy; all three
  already lived in the GENERIC driver/copy step, so duplicating them into the Skill would have
  re-introduced recipe-specific logic into what's supposed to be shared, generic code.
- Re-read every new/changed module once more for dead code and drifted docstrings; removed no code
  (no dead code was introduced — every new export is exercised by its own test).

### Known limits (explicitly deferred)

- **Driving the News Carousel Recipe live** is still unverified — this slice proves the wiring against
  the fake only, matching the hermetic build boundary (no Magnific MCP tools held).
- **Resolving a brand-asset slot's physical canvas node name from the Format's Baseline Prompt document
  is not automated.** `bindMediaAsset` takes the target node name as a parameter; an attended Producer
  is expected to read it off the already-loaded Baseline Prompt document (the SAME one the author-phase
  Skill reads) — no document-parser was added, matching the #85/#87 precedent.
- **`gate`/`render`/`save` phase auditors still have no generic mechanical check** (issue #85's own
  documented limit, unchanged by this slice).
- **The live adapter (`LiveSpaceAdapter`/`LiveMcpTransport`) was not extended** — `bindMediaAsset`
  needed no new port method, so the live path is exactly as complete (and exactly as deferred) as it
  was before this slice.

---

## QA Verdict — Round 1: FAIL

### Suite result (independently run, all green)

- `npx tsc -p tsconfig.json --noEmit` → clean, zero errors.
- `npm test` → **1312/1312 pass, 357 suites, 0 fail**.
- `npm run test:docs` → **77/77 pass, 19 suites, 0 fail**.
- `npx openspec validate --all --strict` → **26/26 pass** (25 pre-existing specs + `change/issue-88-thin-recipe-generic-producer`).
- `npm run build` → clean (`tsc -p tsconfig.build.json`, no output, exit 0).

All four commands were actually executed by `qa` (not assumed) and match the Build Report's claimed
counts exactly.

### Per-criterion results

| # | Acceptance criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Producer doc holds no recipe-specific procedure; everything resolves from registry + Skill. | **PASS** | Read `.claude/agents/producer.md` in full: resolves gates/canvas/shapes/phase-contracts via `getRecipe(job.recipe)`; runs `produce-character-explainer`/`produce-news-carousel` by slug; no hard-coded node names except as illustrative examples in parentheses (`e.g. "JSON Master"`), never as procedure. `grep -n "Character Variants Generator\|Selected Character" .claude/agents/producer.md` → zero hits. `producer-agent.docs-test.ts`'s 8-test describe block passes. |
| 2 | Character path behaves EXACTLY as today via its extracted Skill (fake-Space tests stay green). | **FAIL (partial)** | The Spec-authoring extraction and the driver's `promptNode` threading are genuinely behaviour-identical — independently confirmed (see below): every removed line in `driver.test.ts`/`driver-over-live.test.ts` is a call-site-only addition of the same `JSON_MASTER_NODE_NAME` literal, zero assertions weakened or removed. **However**, the rewritten `producer.md` silently DROPS the watermark-handle-setting step (`replace_text` on the `"Watermark instructions"` node, setting the Brand's `@handle`) that the pre-#88 `producer.md` explicitly instructed as part of rendering the wired Recipe's Asset (Phase B, step 1) — and that the live Space's own captured `Producer Protocol` (`src/space-driver/fixtures/live-captures/02-spaces_get_nodes.keynodes.txt`) genuinely contains as a real step. See Defect QA-1. |
| 3a | A carousel job runs gate-free end-to-end against the fake. | **PASS** | `src/producer/carousel-end-to-end.test.ts` — `NEWS_CAROUSEL.gates` is `[]`; `driveToNextGate` returns `outcome.kind === "finished"` (never `"paused"`) with exact edit/run call counts (1 bind edit + 1 inject edit + 1 run). |
| 3b | A missing required Brand Asset STOPs with a clear message. | **PASS** | `src/producer/carousel-end-to-end.test.ts`'s `"bind-media STOPs..."` test and `src/producer/bind-media.test.ts` (6 tests) both prove `bindMediaSlots` returns `ok:false` naming the slot, with a fresh `FakeCarouselSpace` recording zero edits/runs — the STOP happens before any Space call. |
| 4 | No code or agent doc reads `production.space_id` from a Brand Profile any more. | **PASS** | Independently re-ran the grep (see below) — every hit outside this change's own migration-note/test/OpenSpec prose is historical ADR text. `producer.md` itself: zero hits. |
| 5 | Producer docs-tests updated; built test-first; strict validate + both suites green. | **PASS** | `tasks.md` shows test-first ordering throughout; all 4 suite commands independently confirmed green (see Suite result above). |

### Independent confirmations requested

**(a) Character path unchanged?** Mostly, with one real gap. The CODE path (`driveToNextGate`,
`injectSpec`, `pinPick`) is byte-identical in observable behaviour — confirmed by diffing
`driver.test.ts`/`driver-over-live.test.ts` against `main`: every removed line is a call-site addition
of the literal `JSON_MASTER_NODE_NAME` argument; zero assertions were removed or weakened; the live
adapter (`src/space-driver/live/adapter.ts`, `transport.ts`) is untouched. But the DOC path (what the
attended interactive Producer is instructed to do) is not fully unchanged: `producer.md` no longer
instructs setting the Brand's watermark `@handle` on the `"Watermark instructions"` node before
rendering — see Defect QA-1.

**(b) `production.space_id` fully retired?**  Yes.
`grep -rn "space_id" src .claude/agents .claude/skills .claude/commands data openspec/specs docs` (worktree
`.claude/worktrees/skills-install` excluded — that is a separate, git-ignored worktree checked out at an
older commit, not part of this branch) returns hits ONLY in: (1) historical ADR prose
(`docs/adr/0008`, `0010`, `0013`, `0016`) describing the design decision; (2) `src/recipe/registry.ts`'s
own doc comment noting the field is "now-retired"; (3) `data/brands/mundotip/brand-profile.yaml`'s
migration-note comment; (4) this change's own `producer-agent.docs-test.ts` assertion strings and
OpenSpec/handoff prose. No live code path and no agent-doc instruction reads it. `producer.md` itself:
zero hits.

### Per-scenario results

**`producer-conductor/spec.md`** (new capability):
| Scenario | Verdict | Covering test |
|---|---|---|
| An Idea with a recorded Format resolves ok | PASS | `resolve-format.test.ts` |
| An Idea with no Format recorded STOPs, never crashes | PASS | `resolve-format.test.ts` |
| loadIdeas carries format through / omits missing-or-garbled | PASS | `ledger.test.ts` (3 new tests: present / absent / garbled — both non-string and blank-string cases) |
| A found brand-asset slot binds | PASS | `bind-media.test.ts` |
| A found idea-pick slot binds | PASS | `bind-media.test.ts` |
| A missing REQUIRED brand-asset slot STOPs with the store's own message | PASS | `bind-media.test.ts` |
| A REQUIRED slot with no resolution supplied STOPs with a generic ADR-0016 message | PASS | `bind-media.test.ts` |
| A gate-free News Carousel job runs straight through to a finished Asset | PASS | `carousel-end-to-end.test.ts` |
| A missing required Brand Asset STOPs before any Space call | PASS | `carousel-end-to-end.test.ts` |

**`generic-gate-driver/spec.md`** (modified):
| Scenario | Verdict | Covering test |
|---|---|---|
| injectSpec injects into a Recipe-supplied prompt node other than JSON Master | PASS (indirect) | Exercised end-to-end via `carousel-end-to-end.test.ts`'s `driveToNextGate` call with `promptNode: "Slides Prompts"` against `FakeCarouselSpace`; no isolated unit test calls `injectSpec("Slides Prompts", ...)` directly in `driver.test.ts`, but the integration path proves it. Minor: consider adding an isolated unit test too (low severity, not blocking). |
| The wired Character Explainer Recipe's behaviour is byte-identical | PASS | Full pre-existing `driver.test.ts` suite, mechanically updated call sites only |
| A missing prompt node for readback fails with prompt_node_missing | **UNTESTED** (pre-existing gap, not a regression) | No test asserts this code path either before (`json_master_missing`) or after this slice — confirmed via `git show main` grep. Safe rename, but the Scenario itself has zero covering test in either state. Low severity. |
| bindMediaAsset issues one edit and confirms via port.verifyPinned | PASS | `driver.test.ts`'s `MediaBindConfirmingSpace` describe block |
| bindMediaAsset fails media_bind_edit_failed | PASS | same |
| bindMediaAsset fails media_bind_unconfirmed | PASS | same |

**`producer-skill/spec.md`** (modified): all 4 scenarios PASS —
`produce-character-explainer-skill.docs-test.ts` (15 tests) checks existence, slug, exact
module/name references, STOP semantics, and the "does not run Space / pin Character / compose Copy /
never publish" boundary.

**`docs-conformance/spec.md`** (modified): all 4 scenarios PASS —
`producer-agent.docs-test.ts`'s new 8-test describe block, independently re-read against the actual
`producer.md` text.

### Always-rules + Magnific-fake checks

| Rule | Verdict | Evidence |
|---|---|---|
| Generate-never-publish | PASS | `producer.md` states "generate the Asset, never publish it" in its role description and Hard Boundary section; no publish/post code path exists anywhere in the diff. |
| Public-metrics-only | PASS (unaffected) | No metrics/performance code touched (`git diff main --stat` shows no `performance-tracker`/Apify files in this slice). |
| Relative-not-absolute | PASS (unaffected) | No scoring/baseline code touched. |
| Explicit-attribution | PASS (unaffected) | No Post/attribution code touched (`src/asset/`, `src/production-queue/` untouched — confirmed via `git diff --stat`). |
| Ledger-as-source-of-truth | PASS | `src/ledger/ledger.ts`'s only change is an additive, optional `format?: string` field with defensive parsing (present/absent/garbled all tested); Asset save shape (`asset/asset.ts`) untouched. |
| Magnific fake (hermetic) | PASS | `grep -rn "mcp__magnific\|spaces_[a-z]*(\|creations_[a-z]*(" src` → zero hits. Two fakes used: the untouched `FakeSpace` and the new, independent `FakeCarouselSpace` (in-memory only, no MCP transport). The only `mcp__magnific__*` string in the whole diff is `producer.md`'s own front-matter `tools:` list (the CONTENT Producer's declared runtime tools — expected and unrelated to the hermetic build/test requirement, which governs the `developer`'s build/test process, not the shipped agent's tool grant). |

### Defect list

**QA-1 (severity: high).** The rewritten `producer.md` silently drops the watermark-`@handle` step for
the wired Character Explainer Recipe, violating "the character path behaves exactly as today."

- **What's wrong:** The pre-#88 `producer.md` (Phase B, step 1) explicitly instructed: *"`replace_text`:
  in `Watermark instructions`, replace ONLY the `@handle` with `production.watermark_handle` from the
  Brand Profile; leave the rest of the prompt untouched."* This is a real, live step — the actual
  captured `Producer Protocol` JSON from the live Space
  (`src/space-driver/fixtures/live-captures/02-spaces_get_nodes.keynodes.txt`) contains exactly this
  `{"action": "replace_text", "node": "Watermark instructions", "replace_only": "@handle"}` step. The new
  `producer.md`'s "Drive the canvas" section only narrates injecting the Spec and pinning the picked
  Character via the generic `driveToNextGate`/`pinPick` — it never mentions the watermark handle, the
  `"Watermark instructions"` node, or `production.watermark_handle` anywhere. `grep -n -i "watermark"
  .claude/agents/producer.md .claude/skills/produce-character-explainer/SKILL.md` → **zero hits** (vs.
  multiple hits in `main`'s `producer.md`). The Brand Profile's `watermark_handle` field itself is
  correctly retained (`data/brands/mundotip/brand-profile.yaml` still carries it — only `space_id`/
  `space_url` were retired) — but nothing in the rewritten doc tells the Producer to apply it to the
  canvas any more. This was not caught by the developer's self-review (no mention in "Self-review
  notes" or "Known limits"), not caught by any test (the existing `FakeSpace` never modelled a
  `"Watermark instructions"` node, so this step was never exercised by code — it lived purely as prose
  for the attended interactive agent), and not flagged as an intentional Non-Goal in the proposal.
  Net effect: if the live attended Producer follows only the new doc, every rendered Character Explainer
  video would ship without the Brand's watermark handle applied — a real regression against AC2 ("the
  character path behaves exactly as today") and against the Brand-wide hard rule CLAUDE.md itself lists
  (`brand-profile.yaml` — "banned words, required CTA/hashtags, watermark handle, Channel/platform").
- **Repro steps:**
  1. `git show main:.claude/agents/producer.md | grep -n -i watermark` — shows the pre-#88 instruction
     (Phase B step 1: `replace_text` on `Watermark instructions`, plus the `production.watermark_handle`
     reference and the "watermark @handle is NOT copy" note).
  2. `grep -n -i watermark .claude/agents/producer.md .claude/skills/produce-character-explainer/SKILL.md`
     on this branch — zero hits.
  3. `grep -n -i watermark src/space-driver/fixtures/live-captures/02-spaces_get_nodes.keynodes.txt` —
     shows the real, captured live Producer Protocol still contains the `replace_text`/`Watermark
     instructions`/`@handle` step, confirming this is a genuine still-live production step, not stale
     prose about a since-removed canvas feature.
  4. Confirm `data/brands/mundotip/brand-profile.yaml` still carries `production.watermark_handle` (the
     value the now-missing instruction would have consumed).
- **Fix guidance (for the developer, not prescriptive):** restore an explicit instruction in `producer.md`
  (or, if intentionally moved, in the render/bind phase prose) that the Producer sets the Brand's
  `watermark_handle` onto the wired Recipe's `"Watermark instructions"` node before running the final
  render — and add a docs-test assertion pinning it, mirroring how the other Phase-B facts are pinned.
  If this was a deliberate, in-scope simplification, the proposal/Build Report needs to say so explicitly
  and justify why dropping a live Brand-compliance step is safe — it currently does not.

**QA-2 (severity: low, informational — not blocking).** Two Scenarios in the spec deltas have thin or
no isolated test coverage:
- `generic-gate-driver/spec.md`'s "injectSpec injects into a Recipe-supplied prompt node other than JSON
  Master" is proven only indirectly (via the carousel end-to-end integration test), not by an isolated
  `injectSpec("Slides Prompts", ...)` unit test in `driver.test.ts`.
- `generic-gate-driver/spec.md`'s "A missing prompt node for readback fails with prompt_node_missing" has
  **zero** covering test, in this slice or before it (the pre-existing `json_master_missing` code path
  was never tested either — confirmed via `git show main` grep). Not a regression, but the Scenario as
  written in the spec delta overstates the actual test coverage.
These do not block the round on their own but are worth a quick tidy-up alongside the QA-1 fix.

### Verdict

**FAIL** — on Defect QA-1. The engineering rework itself (thin conductor, generic driver, Recipe
registry, both Magnific fakes, hermetic build, `production.space_id` retirement) is solid and every
other acceptance criterion genuinely holds against real, passing tests. But acceptance criterion 2 is
explicit and load-bearing for this slice ("the character path behaves exactly as today"), and the
rewritten `producer.md` silently drops a real, still-live production step (the watermark `@handle`) with
no test, no self-review note, and no explicit Non-Goal covering it. Per the QA charter, green-on-itself
is not green-on-the-issue — this is exactly that gap. Handing back to `developer` for a fix; no PR, no
merge this round.

---

## Round-2 Build

Fixes QA-1 (high, blocker) and QA-2 (low, informational) from the Round 1 Verdict above. Nothing above
this section was edited — this is an append-only addendum.

### QA-1 fix — the watermark-`@handle` step, restored generically

**Diagnosis, matching QA's own framing:** the watermark handle is a Brand-wide hard rule applied
BEFORE rendering — a generic pre-render step, not the wired Recipe's own hard-coded procedure. So it
was fixed as REAL, generic, tested plumbing (not just restored prose):

1. **`src/recipe/registry.ts`** — `RecipeSpaceNodes` gains an OPTIONAL `watermarkNode?: string` field
   (mirrors how `pinnedReference`/`castRunPoint` are already optional, issue #81). The seeded
   *Character Explainer with Cast* Recipe sets it to the real, captured node name
   (`WATERMARK_NODE_NAME`, from `src/space-driver/driver.ts`); the *News Carousel* Recipe leaves it
   absent (its canvas genuinely has no watermark node) — the step is a no-op for any Recipe that
   doesn't declare one. Also added a matching checklist item to the character Recipe's `render`-phase
   Phase Contract (agent-judged, mirroring that phase's existing pattern).
2. **`src/space-driver/driver.ts`** — new `WATERMARK_NODE_NAME` constant (`"Watermark instructions"`,
   verified against the real live capture QA cited) plus two new, STANDALONE functions:
   `watermarkGoal(handle, nodeName)` and `setWatermarkHandle(port, handle, nodeName, poll)`. This
   mirrors `injectSpec`'s exact shape (one `edit`, poll to terminal, read back `nodeName`, confirm the
   text now includes `handle`) with its own 3 new `DriverErrorCode` variants
   (`watermark_edit_failed`/`watermark_node_missing`/`watermark_unconfirmed`). **Zero existing
   function was touched** — `driveToNextGate`, `injectSpec`, `pinPick`, `bindMediaAsset` are
   byte-for-byte unchanged from the Round-1 state QA already cleared (confirmed: `grep -i watermark
   src/space-driver/driver.ts` shows the new pieces live entirely in their own constant/type-union
   entries/functions, never inside the existing functions' bodies).
3. **`src/production-spec/brand-profile.ts`** — new `watermarkHandleFrom(raw)`/
   `loadWatermarkHandle(path)`, reading `production.watermark_handle` (mirrors `requiredCtaFrom`'s
   defensive shape: a missing/blank/malformed value degrades to `""`, never throws).
4. **`.claude/agents/producer.md`** — a new "Watermark step" section (placed before "Drive the
   canvas"): check whether the Recipe declares a `watermarkNode`; if so, read the Brand's handle via
   `loadWatermarkHandle`, skip cleanly if blank, otherwise call `setWatermarkHandle` BEFORE that leg's
   render. States explicitly this is generic (only a Recipe that declares a `watermarkNode` runs it)
   and that the handle is NOT part of the Asset's Copy (ADR-0012). Also added a matching Guardrails
   bullet.
5. **Ordering note (why this is still behaviour-identical):** the real captured protocol's literal
   step order is pin-Character → watermark-replace → run-clip. `driveToNextGate`'s resumed leg already
   pins-then-runs atomically and was NOT modified (per this round's instructions). The watermark write
   and the Character pin touch two INDEPENDENT nodes with no data dependency between them — so calling
   `setWatermarkHandle` BEFORE invoking `driveToNextGate` (which pins, then renders) yields an
   identical rendered result to the original order (pin, then watermark, then render): both writes
   land before the render either way. This is called out explicitly in `producer.md` itself.

**The regression guard QA asked for:** a new docs-test describe block in
`producer-agent.docs-test.ts` (5 tests) pins: the doc mentions "watermark" at all (the literal Round-1
regression was zero hits); it's described as GENERIC (`watermarkNode`, `Recipe.space.nodes.
watermarkNode`, the word "generic"); it names the exact primitives (`setWatermarkHandle`,
`loadWatermarkHandle`) and their modules; it states the blank-handle skip; it states the
NOT-part-of-Copy boundary (ADR-0012). This can never silently regress again without a test failing.

### QA-2 fix — isolated test coverage for the two thin/untested Scenarios

1. **"injectSpec injects into a Recipe-supplied prompt node other than JSON Master"** — added an
   ISOLATED unit test in `driver.test.ts` (`PromptNodeSpace`, a minimal stub whose sole node is named
   `"Slides Prompts"` — no `"JSON Master"` node exists at all) calling
   `injectSpec(space, validCarouselSpec(), "Slides Prompts", FAST)` directly and asserting success,
   exactly one edit naming `"Slides Prompts"`, and that the edit goal does NOT mention
   `"JSON Master"` — no longer relying only on the carousel integration test.
2. **"A missing prompt node for readback fails with prompt_node_missing"** — the SAME `PromptNodeSpace`
   stub, configured to drop its target node entirely from `readState()`, proves
   `injectSpec` returns `{ ok: false, error: { code: "prompt_node_missing" } }` — this Scenario now has
   real, isolated coverage (previously zero, in this slice or before it).

### Files touched (Round 2, on top of Round 1)

**Modified:**
- `src/space-driver/driver.ts` — `WATERMARK_NODE_NAME`; 3 new `DriverErrorCode` variants;
  `watermarkGoal`/`setWatermarkHandle`.
- `src/space-driver/driver.test.ts` — `WatermarkConfirmingSpace` + 5 tests (`watermarkGoal` +
  `setWatermarkHandle` success/edit-fail/unconfirmed/node-missing); `PromptNodeSpace` + 2 isolated
  `injectSpec` tests (QA-2); new imports (`setWatermarkHandle`, `watermarkGoal`,
  `validCarouselSpec`).
- `src/recipe/registry.ts` — `RecipeSpaceNodes.watermarkNode?: string`; wired onto the character
  Recipe; a new render-phase checklist item; doc updates.
- `src/recipe/registry.test.ts` — 2 new tests (character Recipe declares `watermarkNode`; carousel
  Recipe declares none).
- `src/production-spec/brand-profile.ts` — `watermarkHandleFrom`/`loadWatermarkHandle`.
- `src/production-spec/brand-profile.test.ts` — 5 new tests.
- `.claude/agents/producer.md` — new "Watermark step" section + a Guardrails bullet.
- `src/production-spec/producer-agent.docs-test.ts` — new 5-test describe block (the regression
  guard).
- `openspec/changes/issue-88-thin-recipe-generic-producer/specs/generic-gate-driver/spec.md` — added
  the `setWatermarkHandle` Requirement + 4 Scenarios.
- `openspec/changes/issue-88-thin-recipe-generic-producer/specs/docs-conformance/spec.md` — added the
  watermark-restoration Requirement + 3 Scenarios.
- `openspec/changes/issue-88-thin-recipe-generic-producer/handoff.md` — this Round-2 block.

**New:**
- `openspec/changes/issue-88-thin-recipe-generic-producer/specs/recipe-registry/spec.md` — the
  `watermarkNode` field Requirement + 2 Scenarios (this capability wasn't touched in Round 1).
- `openspec/changes/issue-88-thin-recipe-generic-producer/specs/production-spec/spec.md` — the
  `watermarkHandleFrom`/`loadWatermarkHandle` Requirement + 3 Scenarios (ditto).

### How to run (Round 2)

```bash
npx tsc -p tsconfig.json --noEmit
npm test
npm run test:docs
npm run build
npx openspec validate issue-88-thin-recipe-generic-producer --strict
npx openspec validate --all --strict

# just the Round-2 new/changed test files
node --import tsx --test \
  src/space-driver/driver.test.ts \
  src/recipe/registry.test.ts \
  src/production-spec/brand-profile.test.ts \
  src/production-spec/producer-agent.docs-test.ts
```

All green: `npx tsc --noEmit` clean; `npm test` — **1326/1326 pass** (362 suites, +14 vs Round 1: 7 in
`driver.test.ts`, 2 in `registry.test.ts`, 5 in `brand-profile.test.ts`); `npm run test:docs` —
**82/82 pass** (20 suites, +5, the new regression-guard describe block); `npm run build` clean;
`openspec validate --all --strict` — **26/26 pass** (25 pre-existing specs + this change, now with 2
more capability deltas touched: `recipe-registry`, `production-spec`).

### Re-confirmed: character path still byte-identical

Re-ran the same verification Round 1 used: `grep -i watermark src/space-driver/driver.ts` shows every
new watermark-related token lives in a NEW constant, 3 NEW `DriverErrorCode` union members, or 2 NEW,
entirely standalone functions placed after `bindMediaAsset` — none of it inside `driveToNextGate`,
`injectSpec`, `pinPick`, or `bindMediaAsset`'s own bodies. Diffed this round's `driver.test.ts` changes
against what existed at the end of Round 1: every change is a NEW `describe` block or a NEW class; zero
existing assertions were edited or removed. The full pre-existing wired-Recipe `driveToNextGate` suite
(from Round 1, already QA-cleared) still passes unmodified.

### Known limits (unchanged from Round 1, plus one new note)

All Round-1 known limits still stand (see above). One addition: the watermark step's ORDERING relative
to the Character pin is now DIFFERENT from the literal captured protocol's step sequence (watermark
called before `driveToNextGate` instead of between the pin and the render) — argued above to be
behaviourally equivalent since the two writes are independent and both complete before the render either
way, but this is a real, disclosed design choice, not an oversight.

---

## QA Verdict — Round 2: PASS

### Suite result (independently run, all green)

All four commands were actually executed by `qa` in this round (not assumed):

- `npx tsc -p tsconfig.json --noEmit` → clean, zero errors.
- `npm test` → **1326/1326 pass, 362 suites, 0 fail** (matches the Build Report's claimed count
  exactly — verified by running the full suite, and separately running each Round-2-touched file
  individually: `driver.test.ts` 42/19, `registry.test.ts` 36/3, `brand-profile.test.ts` 15/5,
  `producer-agent.docs-test.ts` 17/3 — all green, summing consistently).
- `npm run test:docs` → **82/82 pass, 20 suites, 0 fail**.
- `npx openspec validate --all --strict` → **26/26 pass** (25 pre-existing specs +
  `change/issue-88-thin-recipe-generic-producer`); also re-ran
  `npx openspec validate issue-88-thin-recipe-generic-producer --strict` alone → `Change
  'issue-88-thin-recipe-generic-producer' is valid`.
- `npm run build` → clean (`tsc -p tsconfig.build.json`, no output, exit 0).

### QA-1 re-verification — watermark step: FIXED, and genuinely generic

- `grep -n -i "watermark" .claude/agents/producer.md` → 6 hits: a new "Watermark step" section (before
  "Drive the canvas") plus a Guardrails bullet. Read the full section: it (a) checks whether the
  Recipe declares `watermarkNode` (`Recipe.space.nodes.watermarkNode`) — a no-op for a Recipe that
  doesn't (News Carousel); (b) reads the Brand's handle via `loadWatermarkHandle`
  (`src/production-spec/brand-profile.ts`), skipping cleanly when blank; (c) calls
  `setWatermarkHandle(port, handle, recipe.space.nodes.watermarkNode, poll)`
  (`src/space-driver/driver.ts`) BEFORE that leg's render; (d) states explicitly the handle is NOT
  part of the Asset's Copy (ADR-0012). This restores the pre-#88 behaviour: same source
  (`brand-profile.yaml`'s `production.watermark_handle`, confirmed unchanged by `git diff main --
  data/brands/mundotip/brand-profile.yaml` — only `space_id`/`space_url` were removed), same target
  node (`"Watermark instructions"`, `WATERMARK_NODE_NAME`), same timing (before the final render), and
  Copy stays untouched.
- **Generic, registry-driven, not hardwired:** `src/recipe/registry.ts`'s `RecipeSpaceNodes` gains an
  OPTIONAL `watermarkNode?: string` (line 125); the wired *Character Explainer with Cast* Recipe sets
  it to `WATERMARK_NODE_NAME` (line 422); the *News Carousel* Recipe's `nodes` block (lines 658-663)
  correctly has NO `watermarkNode` field at all — confirmed by reading both Recipe literals directly.
  `registry.test.ts` asserts both directions (`recipe.space.nodes.watermarkNode === WATERMARK_NODE_NAME`
  for the character Recipe; `=== undefined` for the carousel Recipe) — both pass.
  `setWatermarkHandle`/`watermarkGoal` in `src/space-driver/driver.ts` are two new, standalone
  functions (verified by reading the full file) — no Recipe-specific branching inside them; the
  Recipe-specific decision (whether to call them at all, and with which node) lives entirely in the
  registry + the calling doc, exactly the generic-primitive pattern `pinPick`/`bindMediaAsset` already
  use.
- **Regression guard confirmed real, not hollow.** Read
  `producer-agent.docs-test.ts`'s new 5-test describe block: it asserts the doc matches `/watermark/i`
  (the literal thing that was zero-hit in Round 1), `/watermarkNode/`,
  `/Recipe\.space\.nodes\.watermarkNode/`, `/generic/i`, the exact primitive/module names
  (`setWatermarkHandle`, `src/space-driver/driver.ts`, `loadWatermarkHandle`,
  `src/production-spec/brand-profile.ts`), the blank-skip behaviour, and the ADR-0012 NOT-Copy
  boundary. These are real string/regex assertions against the actual shipped doc text (not tautologies
  against the test's own fixture) — if the watermark section were removed again, "mentions the
  watermark step at all" would fail immediately, exactly reproducing the Round-1 regression as a test
  failure.
- **No previously-cleared code regressed.** Read the full, current `src/space-driver/driver.ts`
  top-to-bottom: `driveToNextGate` (lines 652-700), `injectSpec` (260-291), `pinPick` (361-383), and
  `bindMediaAsset` (407-433) are identical in structure/logic to what Round 1 already cleared — every
  watermark-related addition (the `WATERMARK_NODE_NAME` constant, 3 new `DriverErrorCode` union
  members, `watermarkGoal`, `setWatermarkHandle`) lives in its own new lines, placed AFTER
  `bindMediaAsset` (lines 435-491), never inside any of the four functions' bodies. Cross-checked
  `driver.test.ts`'s describe-block list (`grep -n "^describe(\|^class "`): every Round-1 describe
  block (`injectSpec — inject into JSON Master...`, both `driveToNextGate` wired-Recipe blocks,
  `pinPick`, `bindMediaAsset`, `candidates_empty`, C9, C10) is still present unmodified; the only new
  blocks are the two Round-2 additions (`PromptNodeSpace`'s `injectSpec` generalization tests, and
  `WatermarkConfirmingSpace`'s `watermarkGoal`/`setWatermarkHandle` tests).

### QA-2 re-verification — isolated Scenario coverage: FIXED

- **"injectSpec injects into a Recipe-supplied prompt node other than JSON Master"** — read the new
  `PromptNodeSpace` stub (`driver.test.ts` lines 199-233): its sole node is named `"Slides Prompts"`;
  no `"JSON Master"` node exists on the stub at all. The new test (line 236) calls
  `injectSpec(space, validCarouselSpec(), "Slides Prompts", FAST)` directly (no carousel end-to-end
  integration involved), asserts `ok:true`, exactly one edit issued naming `"Slides Prompts"`, and that
  the edit goal does NOT mention `"JSON Master"`. This is genuine isolated unit coverage, not a
  disguised integration test.
- **"A missing prompt node for readback fails with prompt_node_missing"** — the same `PromptNodeSpace`
  stub, constructed with `dropTargetNode: true` (so `readState()` returns zero nodes), proves
  `injectSpec` returns `{ ok: false, error: { code: "prompt_node_missing" } }` (line 247-253). This
  Scenario now has real, isolated coverage where it previously had none (confirmed: this exact failure
  path was untested both before and during Round 1).
- Ran both new tests directly: `node --import tsx --test src/space-driver/driver.test.ts` → all 42
  tests pass, including these two.

### Per-criterion results (issue #88 acceptance criteria, re-verified from scratch)

| # | Acceptance criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | The Producer doc holds no recipe-specific procedure; everything resolves from the registry + the Recipe's Skill. | **PASS** | Re-read `.claude/agents/producer.md` in full: every Recipe-specific fact (gates, Space id/nodes, Spec/copy shape, media slots, watermark node, phase contracts, authoring craft) resolves from `getRecipe(job.recipe)` + that Recipe's Skill by slug. `grep -n "Character Variants Generator\|Selected Character" .claude/agents/producer.md` → zero hits. `producer-agent.docs-test.ts`'s genericity describe block (8 tests) + the new watermark-genericity assertions all pass. |
| 2 | The character path behaves exactly as today via its extracted Skill (existing fake-Space tests stay green). | **PASS** (Round-1 gap closed) | The full pre-existing `driver.test.ts` wired-Recipe suite (`driveToNextGate` cast/resumed blocks, `injectSpec`, `pinPick`, C9/C10) still passes unmodified. The watermark step — the one real Round-1 gap — is now restored generically, test-guarded, and confirmed to use the same Brand-Profile source, target node, and pre-render timing as `main`. `produce-character-explainer-skill.docs-test.ts` (15/15) still proves the extracted Skill is behaviour-identical for authoring. |
| 3a | A carousel job runs gate-free end-to-end against the fake. | **PASS** | `src/producer/carousel-end-to-end.test.ts` re-run: 5/5 pass, `outcome.kind === "finished"`, never `"paused"`, exact edit/run call counts; unaffected by Round 2 (carousel Recipe declares no `watermarkNode`, confirmed absent). |
| 3b | A missing required Brand Asset STOPs with a clear message. | **PASS** | Same test file, `"bind-media STOPs..."` + `bind-media.test.ts` (6/6) — unaffected by Round 2, re-confirmed green. |
| 4 | No code or agent doc reads `production.space_id` from a Brand Profile any more. | **PASS** | `grep -rn "space_id" src .claude/agents .claude/skills .claude/commands data openspec/specs docs` → every hit is historical ADR prose or this change's own migration-note/test-assertion strings (re-run fresh this round, same result as Round 1). |
| 5 | Producer docs-tests updated; built test-first; strict validate + both suites green. | **PASS** | `tasks.md` (Round 1) + the Round-2 Build block's own test-first narrative (failing stub written before the fix in each case, confirmed by reading the actual test/stub shapes above). `openspec validate --all --strict` → 26/26. `npm test` → 1326/1326. `npm run test:docs` → 82/82. `npx tsc --noEmit` clean. `npm run build` clean. |

### Per-scenario results (re-verified; only deltas from Round 1 detailed below — everything Round-1-PASS stays PASS, independently re-run)

**`producer-conductor/spec.md`**: unaffected by Round 2 — all 9 Scenarios re-run and still PASS
(`resolve-format.test.ts`, `ledger.test.ts`, `bind-media.test.ts`, `carousel-end-to-end.test.ts`).

**`generic-gate-driver/spec.md`** (modified again this round):
| Scenario | Verdict | Covering test |
|---|---|---|
| injectSpec injects into a Recipe-supplied prompt node other than JSON Master | **PASS (now isolated)** | `driver.test.ts`'s new `PromptNodeSpace` describe block — direct unit test, no longer only indirect. |
| The wired Character Explainer Recipe's behaviour is byte-identical | PASS | Full pre-existing suite, unmodified. |
| A missing prompt node for readback fails with prompt_node_missing | **PASS (now covered)** | `driver.test.ts`'s `PromptNodeSpace` `dropTargetNode` test — previously untested in either state, now genuinely isolated-unit-tested. |
| bindMediaAsset issues one edit and confirms via port.verifyPinned | PASS | unaffected, re-confirmed. |
| bindMediaAsset fails media_bind_edit_failed / media_bind_unconfirmed | PASS | unaffected, re-confirmed. |
| setWatermarkHandle issues one edit and confirms via readback (NEW, ADDED Requirement) | **PASS** | `driver.test.ts`'s `WatermarkConfirmingSpace` describe block, first test. |
| setWatermarkHandle fails watermark_edit_failed (NEW) | **PASS** | same describe block, second test. |
| setWatermarkHandle fails watermark_unconfirmed (NEW) | **PASS** | same describe block, third test. |
| setWatermarkHandle fails watermark_node_missing (NEW) | **PASS** | same describe block, fourth test. |

**`producer-skill/spec.md`**: unaffected, all 4 Scenarios re-run and still PASS (15/15 in
`produce-character-explainer-skill.docs-test.ts`).

**`docs-conformance/spec.md`** (modified again this round):
| Scenario | Verdict | Covering test |
|---|---|---|
| producer.md resolves every Recipe-specific fact from the registry (existing) | PASS | unaffected, re-confirmed. |
| producer.md never reads production.space_id (existing) | PASS | unaffected, re-confirmed. |
| producer.md never hard-codes the wired Recipe's own canvas node names (existing) | PASS | unaffected, re-confirmed. |
| producer.md describes running a Recipe's producer Skill by slug (existing) | PASS | unaffected, re-confirmed. |
| producer.md describes the watermark step, generically, naming the exact primitives (NEW) | **PASS** | `producer-agent.docs-test.ts`'s new watermark describe block, tests 2-3. |
| producer.md states the watermark step is skipped cleanly when blank (NEW) | **PASS** | same describe block, test 4. |
| producer.md states the watermark @handle is not part of the Asset's Copy (NEW) | **PASS** | same describe block, test 5. |

**`recipe-registry/spec.md`** (NEW capability delta this round):
| Scenario | Verdict | Covering test |
|---|---|---|
| The wired Character Explainer Recipe declares its real, captured watermarkNode | **PASS** | `registry.test.ts` line 78-80. |
| The News Carousel Recipe declares NO watermarkNode | **PASS** | `registry.test.ts` line 175-177. |

**`production-spec/spec.md`** (NEW capability delta this round):
| Scenario | Verdict | Covering test |
|---|---|---|
| watermarkHandleFrom reads a configured handle, trimmed | **PASS** | `brand-profile.test.ts` line 80-83. |
| watermarkHandleFrom returns '' for the default shape and any malformed input | **PASS** | `brand-profile.test.ts` lines 84-94. |
| loadWatermarkHandle reads '' for a missing Brand Profile file | **PASS** | `brand-profile.test.ts` lines 97-100. |

### Always-rules + Magnific-fake checks (re-verified this round)

| Rule | Verdict | Evidence |
|---|---|---|
| Generate-never-publish | PASS | `producer.md`'s Hard Boundary and role description still state "generate the Asset, never publish it"; the new Watermark step is explicitly a pre-render canvas parameter, never a publish action. |
| Public-metrics-only | PASS (unaffected) | No metrics/performance code touched this round. |
| Relative-not-absolute | PASS (unaffected) | No scoring/baseline code touched. |
| Explicit-attribution | PASS (unaffected) | No Post/attribution code touched. |
| Ledger-as-source-of-truth | PASS (unaffected) | No ledger/Asset-save-shape code touched this round. |
| Magnific fake (hermetic) | PASS | `grep -rn "mcp__magnific\|spaces_[a-z]*(\|creations_[a-z]*(" src` → zero hits (re-run fresh). The new `WatermarkConfirmingSpace`/`PromptNodeSpace` stubs are in-memory `SpaceMcpPort` implementations only — no MCP transport, no credits, no board mutation. |

### Defect list

None. Both Round-1 defects (QA-1 high, QA-2 low) are genuinely fixed:
- QA-1: the watermark-`@handle` step is restored as real, generic, registry-driven plumbing
  (`RecipeSpaceNodes.watermarkNode`, `setWatermarkHandle`, `loadWatermarkHandle`), matches the
  pre-#88 source/target/timing exactly, is correctly absent for the News Carousel Recipe, and is now
  guarded by a docs-test that would fail immediately if the step disappeared again.
- QA-2: both previously thin/untested Scenarios (`injectSpec` into a non-JSON-Master node;
  `prompt_node_missing`) now have genuine isolated unit tests via the new `PromptNodeSpace` stub.

No previously-cleared code (`driveToNextGate`, `injectSpec`, `pinPick`, `bindMediaAsset`) regressed —
confirmed by direct inspection of the current file plus a describe-block-list diff against Round 1.

### Verdict

**PASS.** All four suite commands independently re-run and green (`tsc --noEmit` clean; `npm test`
1326/1326; `npm run test:docs` 82/82; `openspec validate --all --strict` 26/26; `npm run build`
clean). Every acceptance criterion of issue #88 maps to a real, passing test. Every Requirement Scenario
in the (now six-capability) spec delta traces to a genuine covering test. The always-rules hold,
including generate-never-publish for the newly-added watermark step (a pre-render canvas parameter,
never folded into Copy, never a publish action). No live Magnific call anywhere — the fake (now three
of them: `FakeSpace`, `FakeCarouselSpace`, plus the small stubs `WatermarkConfirmingSpace`/
`PromptNodeSpace`/`MediaBindConfirmingSpace`) is used throughout. This slice is ready for a branch + PR.
