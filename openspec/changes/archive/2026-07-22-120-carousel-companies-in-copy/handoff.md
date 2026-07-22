# Slice Handoff — issue #120: thread News Carousel companies into Copy

## Build Report (developer)

### What changed

The News Carousel Recipe's Production Spec already carries a structured, checkable `companies:
string[]` per slide (`CarouselSlide.companies`), used today only for on-slide logo artwork. This slice
threads that EXISTING field one step further downstream, into the Copy step's own per-slide narrative
input, so a composed caption can name the real companies/products a Spec's slides actually record —
never a re-guess from the brief's prose, never a fabrication when a slide names none.

Three additive pieces, matching the issue's triage Agent Brief exactly:

1. **`CopySlideBeat` gains an optional `companies?: readonly string[]`** (`src/copy/draft.ts`),
   mirroring exactly how `statCallout` is already an optional, additive field on the same type.
   `CopyInput`, `CopyDrafter`'s signature, `defaultDraftCopy`, and `skillDraftCopy`'s signature are all
   unchanged — every existing caller that omits `companies` behaves exactly as before.
2. **A new, pure wiring function, `newsCarouselSlideNarrative(spec)`**
   (`src/copy/news-carousel-slide-narrative.ts`) — the ONE place a saved News Carousel Spec's `slides`
   become `CopyInput.slideNarrative`: `role`/`text` carried through verbatim, `stat_callout` renamed to
   `statCallout`, and `companies` passed through UNCHANGED, including an empty array. No I/O, no model
   call, no clock, never mutates its input. (No such wiring function existed before this slice — the
   attended production flow has the LLM producer read the saved Spec file directly; this module is the
   new, testable, decision-free "the data threads through" seam the issue's triage asked for.)
3. **`.claude/skills/write-social-copy/SKILL.md`** (the copywriting step's own instructions — an agent
   runs this Skill, it is not a fixed template) is updated to draw on `companies`: name the real
   companies/products a slide's own `companies` list actually records, wherever the Format's voice
   naturally allows it; an empty/absent `companies` field contributes NO mention — never invent or
   re-guess one. This mirrors the SAME "grounded, never invented" standard the News Carousel author
   phase's own `companies-cited` checklist item already holds the on-slide `image_prompt` to.

The deterministic drafting proof (`skillDraftCopy`) is extended with a test proving `companies` is
genuinely AVAILABLE to a drafter — mechanically provable — without asserting any specific caption
wording drew on it. "The caption reads well and names companies naturally" stays agent-judged, exactly
like the News Carousel author phase's own `grounded-subject` checklist item (`kind: "agent-judged"`,
never computed) — this slice does not attempt to mechanically grade caption prose, only to prove the
data is available to draw from.

### Files touched

**Added:**
- `src/copy/news-carousel-slide-narrative.ts` — the wiring function.
- `src/copy/news-carousel-slide-narrative.test.ts` — its tests, plus the AC4 "all-empty-companies
  changes nothing" proof.
- `openspec/changes/120-carousel-companies-in-copy/` — `proposal.md`, `tasks.md`,
  `specs/copy-composition/spec.md`, `specs/producer-skill/spec.md`, this `handoff.md`.

**Modified:**
- `src/copy/draft.ts` — `CopySlideBeat.companies?: readonly string[]` (additive).
- `src/copy/draft.test.ts` — one new test: a `companies`-carrying beat leaves `skillDraftCopy`'s
  deterministic output unchanged (byte-identical to the same narrative without the field).
- `src/copy/compose.test.ts` — one new end-to-end test: a saved Spec's mixed empty/non-empty
  `companies`, threaded via `newsCarouselSlideNarrative`, through `composeCopy`/`skillDraftCopy`/
  `validateCopy` against the News Carousel Recipe's own `copyShape`.
- `.claude/skills/write-social-copy/SKILL.md` — Inputs item 4 (`companies` named alongside
  `role`/`text`/`stat_callout`) and Steps section 1 (a new grounded-naming bullet + a note on the
  deterministic proof).
- `src/copy/write-social-copy-skill.docs-test.ts` — three new pinned assertions for the above.

**Not touched (deliberately, per the issue's own scoping):** `src/copy/compose.ts`,
`src/copy/inject.ts`, `src/copy/validate.ts`, `src/copy/contract.ts`, `src/recipe/registry.ts`,
`.claude/agents/producer.md`, `production-spec/news-carousel-contract.ts` (the `companies` field itself
— only read, never redefined), `production-spec/news-carousel-author-checklist.ts`, any Character
Explainer Recipe code, any Channel/Brand-profile/ledger code.

### How to run

```bash
# OpenSpec validation
openspec validate 120-carousel-companies-in-copy --strict

# Full unit suite (type-checks via tsc --noEmit first)
npm test

# Just the new/changed files
node --import tsx --test src/copy/news-carousel-slide-narrative.test.ts src/copy/draft.test.ts src/copy/compose.test.ts

# Docs-conformance suite (Skill-doc pins)
npm run test:docs
node --import tsx --test src/copy/write-social-copy-skill.docs-test.ts
```

Results at handoff: `npm test` — **1477 pass / 0 fail** (baseline before this slice: 1469 pass / 0
fail — net +8 tests, zero regressions). `npm run test:docs` — **111 pass / 0 fail** (baseline: 108 pass
/ 0 fail — net +3 tests, zero regressions). `openspec validate 120-carousel-companies-in-copy --strict`
— **valid**.

### Acceptance-criteria self-assessment

| # | Acceptance criterion (Agent Brief) | Proving test |
|---|---|---|
| 1 | The Copy step's slide-narrative input type carries an optional per-slide company/product list. | `src/copy/draft.ts`'s `CopySlideBeat.companies?: readonly string[]` (type-level; compiled and exercised by every test below). `src/copy/draft.test.ts` — *"accepts a slideNarrative beat carrying companies without changing drafting behavior..."* constructs beats with `companies` set and passes them through `skillDraftCopy`. |
| 2 | The step that builds that input from a saved News Carousel Spec passes each slide's `companies` array through unchanged (including empty arrays). | `src/copy/news-carousel-slide-narrative.test.ts` — *"maps all 7 slides... role/text/statCallout/companies carried through unchanged"*, *"passes a slide's companies array through UNCHANGED when non-empty"*, and *"passes a slide's EMPTY companies array through as [] — never omitted, never fabricated"*. |
| 3 | The deterministic drafting proof demonstrates the new field is available to a drafter when present, without asserting a specific caption template. | `src/copy/draft.test.ts` — *"accepts a slideNarrative beat carrying companies without changing drafting behavior — the data is available to a real drafter without dictating caption content (issue #120)"*: asserts `skillDraftCopy`'s output is `deepEqual` WITH vs. WITHOUT `companies` present (proves availability without asserting any caption wording). |
| 4 | A Spec whose slides all have empty `companies` arrays produces the same caption behavior as before this change (never a fabricated mention). | `src/copy/news-carousel-slide-narrative.test.ts` — *"skillDraftCopy's output is IDENTICAL with an all-empty-companies slideNarrative vs. no companies field at all"*: builds an all-`[]`-companies Spec, wires it through `newsCarouselSlideNarrative`, drafts it, and asserts the caption is byte-identical to drafting the SAME narrative with `companies` stripped entirely (the pre-#120 shape). |
| 5 | Existing tests for the Copy step's drafting and slide-beat wiring stay green with only additive changes (no existing field removed or renamed). | Full `npm test` run: **1477 pass / 0 fail**, zero regressions from the 1469-pass baseline — every pre-existing `draft.test.ts`/`compose.test.ts` assertion (all `role`/`text`/`statCallout`/`hashtags`/`mediaContext` behavior) is unmodified and still passing. `git diff` on `src/copy/draft.ts` shows a single additive line (`companies?: readonly string[]`) — no existing line changed or removed. |

**Also covered, from the Skill-instructions Key Interface (not a numbered AC but explicitly asked
for):** `.claude/skills/write-social-copy/SKILL.md` is updated to draw on `companies`, pinned by three
new tests in `src/copy/write-social-copy-skill.docs-test.ts` — *"names CopySlideBeat.companies as part
of the produced-narrative input"*, *"instructs naming the real companies/products from that field,
grounded in the Spec"*, and *"states an empty/absent companies field contributes NO mention — never
invented or re-guessed"*.

### Fakes / fixtures used

- **No Magnific fake was needed.** This slice's code (`src/copy/draft.ts`,
  `src/copy/news-carousel-slide-narrative.ts`) has zero Space/MCP surface of its own — mirrors
  `compose.ts`'s own module doc: "No Magnific, no Apify, no network." **No live `spaces_*`/
  `creations_*` call anywhere in this diff** — the `developer` agent was not given the Magnific MCP
  tools and did not reach for them.
- **In-memory `NewsCarouselSpec`/`CarouselSlide` fixtures**, built inline in
  `news-carousel-slide-narrative.test.ts` and `compose.test.ts` (typed literals conforming to
  `production-spec/news-carousel-contract.ts`'s real contract — not a copy/paste of the existing
  `production-spec/fixtures/news-carousel-specs.ts` fixtures, which deliberately return untyped
  `Record<string, unknown>` for validator testing; this slice's own concern is the typed
  Spec -> `CopySlideBeat[]` wiring, so a locally-typed fixture is the more direct proof).
- **`skillDraftCopy`** (`src/copy/draft.ts`) — the pre-existing deterministic, non-LLM stand-in for the
  `write-social-copy` Skill's own drafting job; used, unmodified in its own logic, as the drafter under
  test throughout.
- **The real, committed `NO_RULES_PROFILE`/`RULES_PROFILE` Brand Profile fixtures**
  (`src/copy/fixtures/`) — pre-existing, reused unchanged.

### Self-review notes

- Considered also updating `.claude/agents/producer.md`'s Copy-phase prose (which lists
  `text`/`stat_callout` as the fields it sharpens) to mention `companies` too, for full consistency.
  Deliberately left untouched: the issue's own Agent Brief scopes the instruction update to "the
  copywriting step's own instructions" — i.e., the `write-social-copy` Skill specifically — and
  producer.md's own prose was already a non-exhaustive, generic description ("the saved Production
  Spec's own per-slide narrative"), not a field-by-field contract it promises to keep in lock-step with
  `CopySlideBeat`. Touching it would have meant re-validating a large, heavily-pinned docs-test suite
  (`producer-agent.docs-test.ts`) for no acceptance-criterion gain — a judgment call favoring the
  tightest possible diff over speculative consistency.
- Considered making `newsCarouselSlideNarrative` live inside `production-spec/` instead of `copy/`
  (since it reads a `production-spec` contract type). Kept it in `src/copy/` because its OUTPUT type
  (`CopySlideBeat[]`) and its reason for existing both belong to the Copy step, and `copy/compose.ts`
  already imports from `production-spec/` (`loadCopyRules`) — so this direction of dependency is the
  established precedent, not a new one.
- Considered making `skillDraftCopy` itself literally weave `companies` into the caption body (e.g.
  appending a "(OpenAI, Anthropic)" parenthetical). Rejected: the Agent Brief is explicit that "the
  caption is genuinely well-written" stays agent-judged, and a hard-coded weave would BE a fixed
  template — exactly what the brief says not to build. Chose instead a test that proves the data
  survives unbroken through the drafter (byte-identical output with/without the field present), leaving
  actual caption composition to the LLM-run Skill, per its own updated instructions.
- Ran a final grep across the diff for `spaces_`/`creations_` literal calls and for any touch to
  `brand-profile.yaml`, the Character Explainer Recipe, or ledger-write code — none found, confirming
  the slice stayed inside its stated boundary.
- Simplify pass: reformatted one multi-line object literal in `compose.test.ts`'s new test for
  readability (no logic change); extracted a `rules` local to avoid a nested nested nested object
  literal in an `assert.equal(...)` call.

### Known limits

- **`.claude/agents/producer.md` is not updated** (see self-review notes above) — its Copy-phase prose
  still names only `text`/`stat_callout` as illustrative examples of what gets sharpened. This does not
  contradict anything (it was never an exhaustive field list), but a future reader skimming only that
  doc, not the Skill, won't see `companies` called out there.
- **No mechanical "the caption actually names the companies" check exists, by design.** Per the issue's
  own framing, "the caption reads well and names them naturally" is inherently an LLM/agent judgment —
  this slice proves the data is available and unbroken, not that any particular caption drew on it.
  This mirrors the News Carousel author phase's own precedent (`grounded-subject`,
  `kind: "agent-judged"`, `ok: null`, never computed).
- **The *Character Explainer with Cast* Recipe is untouched, as scoped.** It has no per-clip
  "companies" concept; none was added.
- **Everything else the issue's triage explicitly deferred** (multiple Channels per Brand, per-channel
  Copy variants, per-channel `CopyShape`/validation rules, LinkedIn handle lookup/tagging) is untouched
  — tracked on the still-open parent issue #120.
- **No already-produced Asset's Copy is rewritten or migrated** — this is a forward-only wiring change
  for future News Carousel runs; nothing under `data/brands/*/ideas/**` or any `ledger.json` was read
  or written by this slice's code or tests.

---

## QA Verdict — Round 1: PASS

### Suite result

All three commands were actually run in this worktree (`/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-120-carousel-companies-in-copy`, branch `120-carousel-companies-in-copy`) and confirmed green:

- `npm test` (type-checks via `tsc --noEmit` then runs the full Node test-runner suite) →
  **1477 pass / 0 fail / 0 cancelled / 0 skipped** across 395 suites. Matches the Build Report's claimed
  count exactly.
- `npm run test:docs` → **111 pass / 0 fail** across 30 suites. Matches the Build Report's claimed count.
- `npx openspec validate --all --strict` → **30 passed, 0 failed (30 items)**, including
  `✓ change/120-carousel-companies-in-copy`, `✓ spec/copy-composition`, `✓ spec/producer-skill`.
- Also ran the developer's own narrower command
  (`node --import tsx --test src/copy/news-carousel-slide-narrative.test.ts src/copy/draft.test.ts
  src/copy/compose.test.ts src/copy/write-social-copy-skill.docs-test.ts`) directly → **55 pass / 0
  fail**.

### Per-criterion results (Agent Brief acceptance criteria)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Slide-narrative input type carries an optional per-slide company/product list | PASS | `src/copy/draft.ts` `CopySlideBeat.companies?: readonly string[]` — additive, type-checks clean under strict/`exactOptionalPropertyTypes`. Exercised by `draft.test.ts`'s new "accepts a slideNarrative beat carrying companies..." test. |
| 2 | The Spec→input builder passes each slide's `companies` through unchanged, including empty arrays | PASS | `src/copy/news-carousel-slide-narrative.ts`'s `newsCarouselSlideNarrative` maps `companies: slide.companies` directly (no filtering/transform). Verified by `news-carousel-slide-narrative.test.ts`'s "maps all 7 slides..." (deep-equal per slide), "...UNCHANGED when non-empty", and "...EMPTY companies array through as [] — never omitted" tests — all ran green. |
| 3 | Deterministic drafting proof shows the field is available without asserting a caption template | PASS | `draft.test.ts`'s new test builds beats with/without `companies` and asserts `skillDraftCopy(...)` output is `deepEqual` either way — proves availability, asserts zero caption wording. Ran green. |
| 4 | All-empty-`companies` Spec produces identical caption behavior to before the change | PASS | `news-carousel-slide-narrative.test.ts`'s "skillDraftCopy's output is IDENTICAL with an all-empty-companies slideNarrative vs. no companies field at all" builds an all-`[]` Spec, wires it through, drafts it, and diffs against the same narrative with `companies` stripped — `assert.deepEqual` passes. Ran green. |
| 5 | Existing Copy-step tests stay green, only additive changes (no field removed/renamed) | PASS | Full suite 1477/1477 green, +8 over the 1469 baseline (verified independently, not just trusted). `git diff -- src/copy/draft.ts` shows one added line only; no existing line in `draft.ts`, `compose.ts`, `inject.ts`, `validate.ts`, or `contract.ts` changed. |

All 5 acceptance criteria pass, each backed by a test that was actually run and confirmed green, not merely asserted by the Build Report.

### Per-scenario results (OpenSpec spec deltas)

**`specs/copy-composition/spec.md`:**

| Scenario | Result | Covering test |
|---|---|---|
| CopyInput without slideNarrative remains valid (backward compatible) | PASS | Pre-existing `compose.test.ts`/`draft.test.ts` cases that omit `slideNarrative` entirely — unmodified, still green. |
| A CopySlideBeat's companies field is optional and purely additive | PASS | `draft.test.ts`'s new companies-availability test (byte-identical drafter output with/without the field). |
| A Spec whose slides all have empty companies arrays produces the same caption behavior as before | PASS | `news-carousel-slide-narrative.test.ts`'s AC4 byte-identical-caption test. |
| `newsCarouselSlideNarrative` — all 7 slides map through in order, every field exact | PASS | `news-carousel-slide-narrative.test.ts`'s "maps all 7 slides..." test. |
| A slide's empty companies array is carried through as `[]`, never omitted | PASS | `news-carousel-slide-narrative.test.ts`'s empty-array test (`assert.ok(then.companies !== undefined, ...)`). |
| The function never mutates its input Spec and is deterministic | PASS | `news-carousel-slide-narrative.test.ts`'s "never mutates the source Spec's slides" (via `structuredClone` diff) and "is deterministic" tests. |

**`specs/producer-skill/spec.md`:**

| Scenario | Result | Covering test |
|---|---|---|
| The Skill file exists and declares its own slug | PASS | Pre-existing `write-social-copy-skill.docs-test.ts` assertion, unmodified, still green. |
| The Skill documents sharpening the produced on-slide narrative into the caption | PASS | Pre-existing docs-test assertion, unmodified, still green. |
| The Skill names companies as part of the produced-narrative input it reads | PASS | New docs-test "names CopySlideBeat.companies as part of the produced-narrative input" — greps `SKILL.md` for `companies` + `CopySlideBeat`; both present (Inputs item 4). |
| The Skill instructs naming real companies/products from that field, grounded in the Spec | PASS | New docs-test "instructs naming the real companies/products from that field, grounded in the Spec" — matches `/real companies\/products/i` and `/grounded/i`; both present in Steps section 1. |
| The Skill states an empty or absent companies field contributes no mention | PASS | New docs-test "states an empty/absent companies field contributes NO mention" — matches the empty/absent + never-invent/fabricate phrasing; present verbatim in Steps section 1. |

All spec-delta scenarios trace to a real test, and every one was independently re-run and confirmed green (not just trusted from the Build Report).

### Scope-fidelity check (issue vs. spec deltas)

Read the issue body and the triage Agent Brief comment in full (`gh issue view 120 --repo
SandroBlunt/OrganicGrowth --comments`). The Agent Brief's "Desired behavior," "Key interfaces," and
"Acceptance criteria" map 1:1 onto the two spec deltas — no scope creep, no misread:

- The spec deltas touch exactly `CopySlideBeat` (Copy step's slide-narrative input) and the new
  `newsCarouselSlideNarrative` wiring function — the two "Key interfaces" the Brief names, nothing more.
- The `producer-skill` delta only extends the existing "shared copy step Skill" requirement with the
  companies-naming instructions — it does not touch the Skill's Channel-agnostic framing, does not
  introduce any per-channel language.
- Neither delta references Channels, LinkedIn, per-channel `CopyShape`, or the Character Explainer
  Recipe's cast/character fields — confirms the "Out of scope" boundary was respected at the spec level,
  not just in prose.
- `proposal.md`'s "Non-Goals" section explicitly enumerates the same four out-of-scope items from the
  Agent Brief, plus the additional (correct) call that `producer.md` and the Spec's own `companies`
  population logic (`news-carousel-author-checklist.ts`) are unchanged — this is a faithful, non-inflated
  read of the brief, not a spec that quietly does more or less than asked.

### Out-of-scope boundary check

Confirmed via `git status --porcelain` (full list of changed/untracked paths) and targeted `git diff`
checks:

- `.claude/agents/producer.md` — **untouched** (no diff, not in `git status`).
- Character Explainer Recipe code — **untouched**: `src/recipe/registry.ts` not in the diff; grepped the
  diff for any Character/Cast-specific addition — none found.
- Channel model / `brand-profile.yaml` / LinkedIn code — **untouched**: no such file appears in
  `git status --porcelain`; grepped all changed files for "LinkedIn", "Channel" — the only "Channel"-free
  file set confirms no touch.
- `production-spec/news-carousel-contract.ts` (the `companies` field's own definition/population) —
  **untouched** — confirmed no diff; the new wiring function only imports the type, does not modify it.

Only these five files were modified and three new files added, exactly matching the Build Report's
"Files touched" list: `.claude/skills/write-social-copy/SKILL.md`, `src/copy/compose.test.ts`,
`src/copy/draft.test.ts`, `src/copy/draft.ts`, `src/copy/write-social-copy-skill.docs-test.ts` (modified);
`src/copy/news-carousel-slide-narrative.ts`, `src/copy/news-carousel-slide-narrative.test.ts`, and the
`openspec/changes/120-carousel-companies-in-copy/` directory (added). **PASS — no scope creep.**

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | No publish-path code touched; the Skill doc's own "What this Skill does not do" section (unmodified prose, still present) states it never publishes; the new `companies` guidance only affects caption wording, not the publish gate. |
| Public-metrics-only | PASS | No metrics/Apify code touched by this diff at all — `git status --porcelain` shows only Copy-step and Skill-doc files. |
| Relative-not-absolute | N/A / not implicated | This slice touches caption composition, not scoring/comparison logic; nothing in the diff computes or compares a score against a baseline, so this rule is not exercised either way — no violation. |
| Explicit-attribution | PASS | No Post/attribution/`log-post` code touched. |
| Ledger-as-source-of-truth | PASS | No ledger-write code path touched; confirmed no `readFile`/`writeFile`/`data/brands`/`data/queue.json` reference anywhere in the new or changed source/test files (`grep -nE "data/brands|data/queue.json|readFile|writeFile|process.cwd"` across all new/changed files returned nothing). |
| Never-fabricate (defensive posture) | PASS | This is the crux of the slice: `newsCarouselSlideNarrative` passes `companies` through unchanged including `[]`; `news-carousel-slide-narrative.test.ts`'s dedicated test asserts the empty array is preserved as `[]`, not omitted, not turned into an invented name; the AC4 test proves an all-empty Spec produces a byte-identical caption to the pre-#120 shape (no accidental fabrication introduced by merely wiring the field through). The `SKILL.md` instructions explicitly tell the LLM agent: "A beat whose `companies` is empty or absent contributes NO company/product mention — never invent or re-guess one," pinned by a docs-test. |
| Magnific fake / no live-Space calls | PASS | Grepped every new/changed file for `spaces_*`/`creations_*` calls: the only matches are prose stating the Skill/step *never* calls them (`SKILL.md` line 112: "does not run the Space... or call any `spaces_*`/`creations_*` tool"; `write-social-copy-skill.docs-test.ts` lines 117-118: `assert.doesNotMatch(text, /spaces_[a-z_]+\(/...)`). No actual tool invocation anywhere. This slice's code (`draft.ts`, `news-carousel-slide-narrative.ts`) has no I/O of any kind — pure functions over in-memory fixtures — so there is no Space surface to fake in the first place, consistent with the Build Report's "No Magnific fake was needed" claim. |

### Defect list

None. No defects found in this round.

**Verdict: PASS.** All acceptance criteria and spec-delta scenarios are proven by tests that were
independently re-run and confirmed green in this session (not merely trusted from the Build Report); the
out-of-scope boundary (Character Explainer Recipe, Channel model, `producer.md`, LinkedIn/multi-channel
code) was fully respected; no live-Space calls and no touches to `data/brands/**` or `data/queue.json`
exist anywhere in the diff or its tests; the always-rules hold, with the never-fabricate posture being
the explicit, well-tested point of this slice. Ready for branch + PR.
