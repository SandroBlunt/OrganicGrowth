# Slice Handoff — issue-85-phase-contracts

Bidirectional channel between `developer` and `qa`. Developer writes the Build Report below; `qa`
appends its Verdict beneath it. Retries append `Round-N Build` blocks — nothing here is overwritten.

## Build Report (Round 1)

### What changed

Built ADR-0017's **Phase Contracts** model: a Recipe run moves through six ordered phases — `author`
(the prompt) -> `bind-media` -> `gate` -> `render` -> `copy` -> `save` — and each phase declares a
checklist of what a valid output looks like. This slice:

1. Added the generic Phase-Contract vocabulary (`PhaseName`, `ChecklistItem`, `PhaseContract`,
   `declaresAllPhasesInOrder`) and gave `Recipe` an ordered `phases` field. **Both wired Recipes**
   (`character-explainer-with-cast`, `news-carousel`) now populate all six phases.
2. Added three small generic auditors — `auditAuthorPhase`, `auditBindMediaPhase`, `auditCopyPhase` —
   plus a single dispatcher `auditPhase(recipe, request)`. Each is generic across **any** wired Recipe
   because the fields they read (`Recipe.specShape`, `Recipe.copyShape`,
   `Recipe.canvasInputs.mediaSlots`) are already uniform, per-Recipe fields from issue #81. Tested
   against BOTH Recipes with the SAME function calls.
3. Graduated the map-ticket-#77 prototype (`check-carousel-spec.mjs`) into tested, parameterized
   production code: `auditNewsCarouselAuthorPhase` (`production-spec/news-carousel-author-checklist.ts`)
   runs the News Carousel Recipe's full 8-item author-phase checklist as code. The prototype's
   hardcoded pill text / logo reference name are now a `NewsCarouselBaselineParams` argument — nothing
   is a literal inside the checked module.
4. `gate`/`render`/`save` phases are DECLARED (a checklist per Recipe) but have no generic code
   auditor yet — an honest, documented limit (see below), matching the issue's own scope (only the
   carousel **author**-phase checklist was required to run as code).

### Files touched

**New:**
- `src/recipe/phase-contract.ts` — `PHASE_ORDER`, `PhaseName`, `ChecklistItem`
  (`MechanicalChecklistItem`/`AgentJudgedChecklistItem`), `PhaseContract`, `declaresAllPhasesInOrder`,
  `ChecklistItemAudit`, `PhaseAuditResult`, `auditAuthorPhase`, `auditBindMediaPhase`,
  `auditCopyPhase`, `auditPhase`.
- `src/recipe/phase-contract.test.ts`
- `src/production-spec/news-carousel-author-checklist.ts` — `NewsCarouselBaselineParams`,
  `auditNewsCarouselAuthorPhase`.
- `src/production-spec/news-carousel-author-checklist.test.ts`
- `src/production-spec/fixtures/news-carousel-author-checklist-specs.ts` — `TEST_BASELINE`,
  `baselineAdherentCarouselSpec`, and 6 focused broken-variant builders.
- `openspec/changes/issue-85-phase-contracts/` — `proposal.md`, `tasks.md`,
  `specs/phase-contracts/spec.md` (new capability), `specs/recipe-registry/spec.md` (modified),
  `specs/production-spec/spec.md` (modified), this `handoff.md`.

**Modified:**
- `src/recipe/registry.ts` — `Recipe` gains `phases: readonly PhaseContract[]`;
  `CHARACTER_EXPLAINER_PHASES` (6 phases) wired onto `CHARACTER_EXPLAINER_WITH_CAST`;
  `NEWS_CAROUSEL_PHASES` (6 phases) wired onto `NEWS_CAROUSEL`; two import-time
  `declaresAllPhasesInOrder` guards (mirroring the existing `CAST_RUN_POINT`/`CLIP_RUN_POINT`
  pattern); a short doc addendum explaining the addition.
- `src/recipe/registry.test.ts` — new assertions per Recipe: all six phases present in order; the
  character Recipe's `author` checklist is 2 mechanical + 1 agent-judged; the carousel Recipe's
  `author` checklist is 7 mechanical + 1 agent-judged; the carousel's `gate` checklist is empty; both
  Recipes' `bind-media`/`copy` checklists are 1 mechanical item each; every mechanical item across
  every phase carries a non-empty `reference`.

### How to run

```bash
# type-check + full unit suite (what `npm test` runs)
npx tsc -p tsconfig.json --noEmit
npm test

# just this slice's new/changed test files
node --import tsx --test src/recipe/phase-contract.test.ts src/recipe/registry.test.ts \
  src/production-spec/news-carousel-author-checklist.test.ts

# docs tests (unaffected — no docs/agent files touched this slice)
npm run test:docs

# OpenSpec
openspec validate issue-85-phase-contracts --strict
openspec validate --all --strict
```

All green: `npx tsc --noEmit` clean; `npm test` — **1285/1285 pass**; `npm run test:docs` —
**38/38 pass**; `openspec validate --all --strict` — **24/24 pass** (23 specs + this change).

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #85) | Proving test(s) |
|---|---|---|
| 1 | The Recipe type declares an ordered phase list with a checklist per phase; both wired Recipes populate them. | `src/recipe/phase-contract.test.ts`: `"is exactly author -> bind-media -> gate -> render -> copy -> save"`, `"both wired Recipes declare all 6 phases, in order (issue #85 AC1)"`. `src/recipe/registry.test.ts`: `"declares all six Phase Contracts, in PHASE_ORDER's exact order (issue #85 AC1)"` (both `describe` blocks). |
| 2 | The carousel author-phase checklist runs as code against a candidate spec, with Brand/Format-specific strings parameterised from the inputs. | `src/production-spec/news-carousel-author-checklist.test.ts`: the whole suite (13 tests) exercises `auditNewsCarouselAuthorPhase` as a plain function call against candidate Specs. Parameterization specifically proven by `"is genuinely parameterized — DIFFERENT (Brand x Format) strings fail a Spec authored for TEST_BASELINE's strings"` (swapping `NewsCarouselBaselineParams` values flips the same Spec from pass to fail) and the per-field isolation tests (`"fails the logo-reference item..."`, `"...pill-text/caps-guard item..."`, `"...fixed-baseline-clauses item..."`, `"...card-style item..."`). |
| 3 | Existing mechanical checks are referenced from the checklists, not duplicated. | `src/recipe/registry.test.ts`: `"every mechanical checklist item across every phase carries a non-empty reference (issue #85 AC3: referenced, not duplicated)"`. Reference equality of the underlying functions is additionally proven pre-existing (`registry.test.ts`'s issue-#81 tests: `specShape.validate`/`specShape.scanBannedWords` `===` the real modules) and newly for `auditNewsCarouselAuthorPhase`'s referenced items in `news-carousel-author-checklist.test.ts` (e.g. `"fails the '7 slides, roles in order' item on a short Spec — REFERENCES validateNewsCarouselSpec, does not duplicate it"`). Structurally: `news-carousel-author-checklist.ts` imports and calls `validateNewsCarouselSpec`/`scanNewsCarouselForBannedWords` directly rather than re-deriving their rules (see its module doc). |
| 4 | Tests show a QA pass can answer "does this run satisfy the contract of the phase it is in" for ANY wired Recipe. | `src/recipe/phase-contract.test.ts`: `auditAuthorPhase`/`auditBindMediaPhase`/`auditCopyPhase` are each called against **both** `character-explainer-with-cast` and `news-carousel` with pass AND fail fixtures (e.g. `"passes the news-carousel Recipe's author phase... — the SAME auditor function"`). The `auditPhase` dispatcher describe block proves the single entry point (`"dispatches 'author' to auditAuthorPhase, identically"`, etc. — `assert.deepEqual` against the direct call). |
| 5 | Built test-first; strict validate + full suite green. | Every new module has its test file written alongside it (see task list); `openspec validate --all --strict` → 24/24; `npm test` → 1285/1285; `npx tsc --noEmit` clean. |

### Fakes / fixtures used

- **No Magnific fake was needed.** This slice touches zero driver/Space-interaction code
  (`src/space-driver/**`, `src/execution-protocol/**` are read-only referenced, never modified) — every
  new module is a pure, deterministic deep module. **No live `spaces_*`/`creations_*` call anywhere; no
  credits spent; no board mutation.** The `developer` agent was not given the Magnific MCP tools for
  this slice and never reached for them.
- Fixtures used/added:
  - `src/production-spec/fixtures/specs.ts` (existing) — `validSpec()`, `twoClips()` for the character
    Recipe's `auditAuthorPhase` tests.
  - `src/production-spec/fixtures/news-carousel-specs.ts` (existing) — `validCarouselSpec()`,
    `sixSlides()`, `rolesOutOfOrder()`, `textTooLong()` for the referenced-validator items.
  - `src/production-spec/fixtures/news-carousel-author-checklist-specs.ts` (**new**) — `TEST_BASELINE`
    (a stand-in Baseline Prompt's strings, deliberately different from Straw Motion's real
    `"Unhypped News"`/`"Brand_Logo"`) plus a baseline-adherent Spec builder and six focused
    broken-variant builders, one per new mechanical check.

### Self-review notes

- Chose a single dispatcher (`auditPhase`) over three unrelated free functions once it became clear
  AC4's literal phrasing ("an auditor can take a saved artifact + its phase and get a pass/fail")
  wanted one entry point — added it, with tests proving it's byte-identical to calling the underlying
  function directly (no behavior fork to maintain).
- Deliberately did **not** try to force `gate`/`render`/`save` into a fake mechanical auditor just to
  hit a uniform shape — their checklist items stay honest `agent-judged` prose (`gate` for
  `news-carousel` is an empty array, since it has zero gates). Fabricating a check with nothing real
  behind it would have been worse than declaring the limit.
- The registry's checklist `reference` strings are plain description text (never a callable) —
  deliberately decoupling `registry.ts` from `news-carousel-author-checklist.ts` at the value-import
  level (avoids growing the import graph for a documentation-only pointer). The REAL executable check
  is `auditNewsCarouselAuthorPhase`, imported directly by its own test file and available to any real
  caller (a future QA script or the producer Skill).
- Verified (by reading, and by the full suite passing without any "before initialization" errors) that
  `phase-contract.ts`'s `import type { Recipe } from "./registry.ts"` and `registry.ts`'s value import
  of `declaresAllPhasesInOrder` from `phase-contract.ts` do **not** form a runtime import cycle — the
  type-only import is fully erased under `verbatimModuleSyntax`.
- Added a short doc addendum to `registry.ts`'s top-of-file comment so the Phase Contracts addition is
  discoverable from the same place the file's other design notes live, instead of only in the new
  modules' own docstrings.

### Known limits (explicitly deferred)

- **`gate`/`render`/`save` phases have no generic code auditor** in this slice — only `author`,
  `bind-media`, and `copy` do. Driving/saving a second Recipe end-to-end (which would give these
  phases something real to audit against) is issues #57/#87/#88. Their checklists are declared as
  honest prose today, not a fabricated mechanical check.
- **`NewsCarouselBaselineParams` is accepted as an input, not derived end-to-end.** This slice's
  checker takes the pill text / logo reference name / fixed clauses / confirmed card styles as a
  parameter and tests supply them directly. Actually parsing these out of a Format's real Baseline
  Prompt document is the producer Skill's job (issue #87/#88) — explicitly out of scope here, per the
  issue's own text ("How those values are ultimately sourced end-to-end from the document is
  downstream — #87/#88").
- **No production code calls any of these auditors at runtime yet.** This slice ships the checkable
  contract + its auditors; the Producer actually self-auditing against them during a live run, and a
  real QA pass re-running them against saved artifacts from an actual production, are both later work
  (issue #87/#88). `CONTEXT.md`'s "Phase Contract" and related glossary entries are therefore left
  marked `(Decided in map #70; build pending.)` — the *checkable contract* is now built, but the
  *self-auditing producer loop* ADR-0017 ultimately wants is still pending, mirroring the precedent set
  by issue #81 (which left "today one Recipe is wired" in place until the second Recipe is actually
  drivable, not just registry-wired).

---

## QA Verdict — Round 1: PASS

### Suite result

All commands were run directly by `qa` (not taken on the developer's word):

| Command | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | clean, exit 0 |
| `npm test` | **1285/1285 pass**, 0 fail, 348 suites, 3762ms |
| `npm run test:docs` | **38/38 pass**, 0 fail, 7 suites |
| `openspec validate --all --strict` | **24/24 passed, 0 failed** (23 pre-existing specs + `change/issue-85-phase-contracts`) |
| `node --import tsx --test src/recipe/phase-contract.test.ts src/recipe/registry.test.ts src/production-spec/news-carousel-author-checklist.test.ts` | **68/68 pass** (this slice's own new/changed test files, isolated) |

All green, verified by actually executing each command (not accepted on the Build Report's claim alone).

### Per-criterion results (issue #85 acceptance criteria)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Recipe type declares an ordered phase list (`author → bind-media → gate → render → copy → save`) with a checklist per phase; both wired Recipes populate them. | **PASS** | `src/recipe/phase-contract.ts`'s `PHASE_ORDER` constant and `PhaseContract` interface; `Recipe.phases: readonly PhaseContract[]` in `src/recipe/registry.ts`; `CHARACTER_EXPLAINER_PHASES`/`NEWS_CAROUSEL_PHASES` both declare all 6 phases in order, each guarded at import time by `declaresAllPhasesInOrder(...)` (throws at module load if violated — read and confirmed in `registry.ts` lines 434-440 and 676-679). Proven by `phase-contract.test.ts`'s `"both wired Recipes declare all 6 phases, in order (issue #85 AC1)"` and `registry.test.ts`'s two `"declares all six Phase Contracts..."` tests (one per Recipe) — all pass. |
| 2 | Carousel author-phase checklist runs as code; enforces all #77-validated items (7 slides fixed order; text ≤140 chars; image_prompt references logo name; pill text + never-all-caps; fixed baseline clauses; confirmed card_style; non-empty stat_callout; banned word REJECT-only); grounded-subject is agent-judged prose, not code-checked. | **PASS** | Read `src/production-spec/news-carousel-author-checklist.ts` line-by-line: all 8 checklist items present in the documented order, items 1/2/8 read `validateNewsCarouselSpec`'s error codes and `scanNewsCarouselForBannedWords`'s hits (never re-deriving the rule), items 3/4/5/7 are new parameterized checks, item 6 ("grounded subject") is `kind: "agent-judged", ok: null` — never computed, never blocks overall `ok`. Confirmed by `news-carousel-author-checklist.test.ts`'s 13 tests, each isolating one item (`missingLogoReference`, `missingPillText`, `missingCapsGuardrail`, `missingFixedClause`, `unconfirmedCardStyle`, `bannedWordInText`) plus the baseline-adherent pass case. All pass. |
| 2a (CRITICAL — parameterisation) | Pill text / logo reference name are parameters from inputs, not hardcoded literals; a test swaps different strings and flips the same spec pass↔fail. | **PASS** | Read the full module: `NewsCarouselBaselineParams` is a required 3rd argument to `auditNewsCarouselAuthorPhase`; grepped the module body — no `"Unhypped News"` or `"Brand_Logo"` literal anywhere inside `news-carousel-author-checklist.ts` (only present in the test-fixture's own doc comment, describing what it deliberately is NOT). The exact required test exists and passes: `"is genuinely parameterized — DIFFERENT (Brand x Format) strings fail a Spec authored for TEST_BASELINE's strings"` — a Spec built against `TEST_BASELINE`'s stand-in strings (`"Test_Brand_Logo"`/`"Test Wire"`) is re-checked against Straw Motion's real strings (`"Brand_Logo"`/`"Unhypped News"`) and the result flips from `ok: true` to `ok: false`. This is the strongest possible proof against a baked-in literal. |
| 3 | Existing mechanical checks are referenced, not duplicated. | **PASS** | `news-carousel-author-checklist.ts` imports `validateNewsCarouselSpec` and `scanNewsCarouselForBannedWords` directly and reads their own result codes/hits rather than re-implementing slide-count/order/length/banned-word logic. `phase-contract.ts`'s three generic auditors call `recipe.specShape.validate`/`scanBannedWords`/`copyShape` + `validateCopy` — all pre-existing functions, imported by reference. `registry.test.ts`'s `"every mechanical checklist item across every phase carries a non-empty reference..."` asserts every mechanical item's `reference` string is non-empty across both Recipes' all 6 phases. No mechanical check's logic (word-boundary matching, length caps, role-order, count) is re-derived anywhere in the new code — confirmed by reading `brand-safety.ts`/`news-carousel-validate.ts`/`news-carousel-brand-safety.ts` (all untouched, `git diff HEAD` confirms zero changes to those files). |
| 4 | A QA-style pass can answer "does this run satisfy the contract of the phase it is in" for ANY wired Recipe — generic auditor/dispatcher works against BOTH wired Recipes. | **PASS** | `auditAuthorPhase`, `auditBindMediaPhase`, `auditCopyPhase` are each exercised in `phase-contract.test.ts` against BOTH `character-explainer-with-cast` and `news-carousel` (pass and fail fixtures for each). The single dispatcher `auditPhase(recipe, request)` is tested against both Recipes and proven `assert.deepEqual` to the direct call for `"author"` (character Recipe), `"bind-media"` (carousel Recipe), and `"copy"` (carousel Recipe) — i.e. one entry point, works for either Recipe, byte-identical to the underlying function. |
| 5 | No new validation framework introduced. | **PASS** | `package.json`/`package-lock.json` diff against `HEAD` is empty — no new runtime dependency. Grepped every new file's imports: only existing internal modules (`../copy/validate.ts`, `./news-carousel-validate.ts`, `./news-carousel-brand-safety.ts`, `../production-spec/brand-profile.ts`, `./registry.ts`) are imported — no external schema/validation library (no zod, ajv, etc.). The new types (`PhaseContract`, `ChecklistItem`, `PhaseAuditResult`) are plain TypeScript interfaces + three small pure functions, matching ADR-0017's explicit "no new per-phase code framework" decision. |
| 6 | Built test-first; strict validate + full suite green. | **PASS** | `tasks.md` documents a test-first order for every module (write failing tests, then implement) and every new module has a co-located `.test.ts`. `openspec validate --all --strict` → 24/24 (re-run by qa, not accepted from the Build Report). `npm test` → 1285/1285 (re-run by qa). `npx tsc --noEmit` clean (re-run by qa). |

### Per-scenario results (spec deltas → Requirements/Scenarios)

**`specs/phase-contracts/spec.md` (new capability) — all traced to issue #85 and ADR-0017, all pass:**

| Requirement / Scenario | Result | Covering test |
|---|---|---|
| PHASE_ORDER is exactly the six ADR-0017 phases, in order | PASS | `phase-contract.test.ts`: `"is exactly author -> bind-media -> gate -> render -> copy -> save"` |
| declaresAllPhasesInOrder true/false (complete, short, out-of-order) | PASS | `phase-contract.test.ts`: 3 `declaresAllPhasesInOrder` tests |
| A mechanical item's reference names an existing module/function | PASS | `registry.test.ts`: `"every mechanical checklist item across every phase carries a non-empty reference..."` |
| An agent-judged item carries no reference, never auto-computed | PASS | `news-carousel-author-checklist.test.ts`: `"a baseline-adherent Spec passes every mechanical item; the agent-judged item is flagged, not failed"` (asserts `ok: null`, description matches `/grounded subject/i`) |
| auditAuthorPhase/auditBindMediaPhase/auditCopyPhase generic across ANY wired Recipe | PASS | `phase-contract.test.ts`'s three `describe` blocks, each exercising both Recipes |
| auditPhase is the single dispatcher, identical to direct calls | PASS | `phase-contract.test.ts`'s `auditPhase` describe block, 3 tests, all `assert.deepEqual` |

**`specs/recipe-registry/spec.md` (modified) — all traced to issue #85/#81, all pass:**

| Requirement / Scenario | Result | Covering test |
|---|---|---|
| Recipe declares phases; declaresAllPhasesInOrder true for every registered Recipe | PASS | `registry.test.ts`: both `"declares all six Phase Contracts..."` tests |
| Every wired Recipe declares all six phases, in order | PASS | same as above |
| A phase's checklist item is mechanical (referenced) or agent-judged (prose) | PASS | `registry.test.ts`: reference-non-empty test; `phase-contract.test.ts` type-level enforcement (TS discriminated union — `AgentJudgedChecklistItem` has no `reference` field, confirmed by reading the interface) |
| Seeded Character Recipe's author-phase checklist: 1 mechanical `specShape.validate` + 1 mechanical `specShape.scanBannedWords` + 1 agent-judged | PASS | `registry.test.ts`: `"its author-phase checklist has exactly 3 items: 2 mechanical... + 1 agent-judged"` |
| Seeded Character Recipe's copy-phase checklist: 1 mechanical referencing validateCopy | PASS | `registry.test.ts`: `"its bind-media-phase and copy-phase checklists each have exactly 1 mechanical item"` |
| News Carousel Recipe's author-phase checklist: 8 items, 7 mechanical + 1 agent-judged | PASS | `registry.test.ts`: `"its author-phase checklist has exactly 8 items..."` |
| News Carousel Recipe's gate-phase checklist is empty (zero gates) | PASS | `registry.test.ts`: `"its gate-phase checklist is EMPTY..."` |

**`specs/production-spec/spec.md` (modified) — all traced to issue #85/#77, all pass:**

| Requirement / Scenario | Result | Covering test |
|---|---|---|
| auditNewsCarouselAuthorPhase returns 8 items in documented order, `ok` true iff structural validator passes + no item false | PASS | `news-carousel-author-checklist.test.ts`: baseline-adherent-pass test asserts `items.length === 8` and per-kind pass |
| Short Spec fails item 1 by referencing validateNewsCarouselSpec | PASS | `"fails the '7 slides, roles in order' item on a short Spec..."` |
| Missing parameterized logo reference fails item 3 only | PASS | `"fails the logo-reference item..."` (isolates: item 4 still `ok: true`) |
| Missing pill text or never-all-caps instruction fails item 4 | PASS | `"fails the pill-text/caps-guard item..."` (2 tests, one per sub-cause) |
| Missing one fixed baseline clause fails item 5 | PASS | `"fails the fixed-baseline-clauses item..."` |
| Unconfirmed card_style fails item 7 | PASS | `"fails the card-style item..."` |
| Banned word fails item 8, reject-only, names the word, never rewrites | PASS | `"fails the banned-word item, reject-only, and names the word and field — never rewrites the Spec"` |
| Genuinely parameterized — different (Brand x Format) strings change the outcome | PASS | `"is genuinely parameterized..."` |
| Never throws on malformed/non-object Spec | PASS | `"never throws on a malformed / non-object Spec, and fails cleanly"` |

### OpenSpec-change-vs-issue faithfulness (job c)

Read `proposal.md`, `tasks.md`, and all three spec-delta files in full and cross-checked against the
issue #85 body and ADR-0017 (`docs/adr/0017-phase-contracts-self-auditing-producer.md`):

- The six-phase order (`author → bind-media → gate → render → copy → save`), the "written checklist,
  mechanical-stays-code, agent-judged-is-prose" shape, and "no new per-phase code framework" are all
  taken verbatim from ADR-0017 — no misread found.
- The proposal's "Non-Goals" section explicitly matches the issue's own scoping language ("How those
  values are ultimately sourced end-to-end from the document is downstream — #87/#88") — the
  spec-delta does not silently drop the parameterisation requirement, it correctly narrows the *build*
  boundary (accept params) vs. the *sourcing* boundary (parse from doc, deferred), which is exactly
  what the issue itself asked for.
- The `production-spec` spec delta's 8-item order matches the issue's bullet list verbatim (7-slides/
  order → text-length → logo-reference → pill-text+caps → fixed-clauses → grounded-subject
  (agent-judged) → card_style/stat_callout → banned-word). No item was reordered, dropped, or added
  beyond what the issue specified.
- No self-consistent-but-wrong spec found: every Requirement's Scenarios trace back to either the
  issue text or ADR-0017, not to invented behavior.

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | No publish/post code touched (`git diff HEAD --stat` shows only `recipe/registry.ts`/`.test.ts` modified plus new files under `recipe/` and `production-spec/`; no `post-attribution`/publish path touched). |
| Public-metrics-only | N/A (not touched) | No metrics/Apify code touched by this slice. |
| Relative-not-absolute | N/A (not touched) | No scoring/comparison code touched by this slice. |
| Explicit-attribution | N/A (not touched) | No Post/attribution code touched by this slice. |
| Ledger-as-source-of-truth | PASS (referenced only, not weakened) | The `save` phase's checklist item (both Recipes) cites "ledger-as-source-of-truth, always-rule 7" as prose; no ledger-write code path is touched by this slice (confirmed no `production-queue`/ledger-store files in the diff). |
| Banned-word = REJECT, never silent swap | PASS | Read `news-carousel-author-checklist.ts`'s item 8 and `phase-contract.ts`'s `auditAuthorPhase`/`auditCopyPhase` banned-word items: each only sets `ok: false` + a `detail` string naming the hit — no code path ever mutates/rewrites the candidate Spec or Copy. Confirmed by test: `"fails the banned-word item, reject-only, and names the word and field — never rewrites the Spec"` explicitly asserts `"spec" in result === false` (the audit result never carries a rewritten spec). |
| Magnific fake used, no live Space calls | PASS | `grep -inE "spaces_|creations_|magnific" <every new/modified file>` → only 2 hits, both plain doc-comment prose ("Which Magnific Space a Recipe drives...", "The Magnific Space's id...") in `registry.ts` — no `spaces_*`/`creations_*` MCP call anywhere. No new dependency on any Magnific SDK/client. This slice touches zero `src/space-driver/**`/`src/execution-protocol/**` files (confirmed via `git diff HEAD --stat`), so no fake was even required — the developer's own claim that "no Magnific fake was needed" is verified true, not just asserted. |

### Defect list

None. No defects found in this round.

### Overall

**QA Verdict — Round 1: PASS.** All acceptance criteria are met by code exercised by real, passing
tests (not just claimed); the OpenSpec change faithfully matches issue #85 and ADR-0017 with no misread
or scope drift; the parameterisation requirement (the CRITICAL item) is proven by a real test that
swaps in different (Brand x Format) strings and flips the same Spec from pass to fail; existing
mechanical checks are referenced, never duplicated; no new validation framework was introduced; no
live-Space calls anywhere in the diff; all always-rules that are in scope for this slice hold. The
suite is genuinely green: `npm test` 1285/1285, `npm run test:docs` 38/38, `openspec validate --all
--strict` 24/24 — all re-run directly by `qa`, not accepted on the Build Report's word.

This slice may proceed to a PR.
