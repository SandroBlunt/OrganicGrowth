# Slice Handoff — issue #238: retire the dormant Production Spec composer

## Build Report (developer)

### What changed

Dead-code removal + stale-doc reconciliation, no behavior change (per the re-triaged Agent Brief):

1. Deleted `src/production-spec/compose.ts` (the `composeSpec` orchestration shell) and its dedicated
   `src/production-spec/compose.test.ts` — a module that predates the Recipe/multi-format model, is not
   Recipe-aware, and has had zero production callers since it was written. ADR-0031 (issue #264) moved
   Spec authorship to Review at accept time via a completely different path
   (`author-at-review.ts`'s `authorSpecForRecipe` + `command-surface/production-spec.ts`'s
   `saveAssetSpec`/`refreshSpecFile`), so nothing in the current design will ever call `composeSpec`.
2. Removed `src/store-write-boundary/allow-list.ts`'s `compose.ts` entry (and its dedicated doc-comment
   block), and trimmed the file's top comment so it no longer cites the now-deleted module as the live
   example of its "file-backed write's own orchestration shell" category.
3. Fixed a stale doc-comment line in `src/production-spec/store.ts` that still named `compose.ts` as
   where the persistence gate lives; it now names the real, current gate
   (`authorSpecForRecipe` + `auditAuthorPhase`, at accept time).
4. Reconciled the `production-spec` OpenSpec capability: REMOVED the "Compose and persist a Production
   Spec beside the Brief, segmented by Recipe" Requirement (with Reason + Migration), ADDED a new,
   actor-neutral "The file-backed Production Spec is located and persisted beside its Brief, segmented by
   Recipe" Requirement carrying forward the still-true, still-tested facts (`specPathFor`'s Recipe
   segmentation and cadence-aware nesting; `generate()`'s `Brief.companies` passthrough), and MODIFIED the
   "Producer agent definition" Requirement so its prose no longer claims the Producer generates the Spec.
5. Reconciled the `store-write-boundary-guard` OpenSpec capability: MODIFIED the "a tracked store's
   file-backed write function..." Requirement so its "not flagged" example scenario uses a hypothetical
   module instead of the now-deleted `compose.ts`.

Nothing about how a Spec is actually authored, validated, or persisted in production changed —
`generate.ts`, `validate.ts`, `brand-safety.ts`, `store.ts`'s `specPathFor`/`saveSpec`,
`author-at-review.ts`, `accept-idea.ts`, and `command-surface/production-spec.ts` are all byte-for-byte
untouched, with their own existing tests unmodified and still green.

### Files touched

Code:
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/production-spec/compose.ts` — deleted
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/production-spec/compose.test.ts` — deleted
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/store-write-boundary/allow-list.ts` — entry + doc
  comment removed/trimmed
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/production-spec/store.ts` — one stale doc-comment
  sentence fixed (top-of-file comment only; no functional change)

OpenSpec change:
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/openspec/changes/issue-238-retire-dormant-spec-composer/proposal.md`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/openspec/changes/issue-238-retire-dormant-spec-composer/tasks.md`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/openspec/changes/issue-238-retire-dormant-spec-composer/specs/production-spec/spec.md`
  (REMOVED + ADDED + MODIFIED)
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/openspec/changes/issue-238-retire-dormant-spec-composer/specs/store-write-boundary-guard/spec.md`
  (MODIFIED)
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/openspec/changes/issue-238-retire-dormant-spec-composer/handoff.md`
  (this file)

### How to run

```bash
cd /Users/CaxtonTaylor/Developer/OrganicGrowth

# OpenSpec
openspec validate issue-238-retire-dormant-spec-composer --strict
openspec validate --specs --strict     # confirm the pre-existing spec set is still untouched/green

# Full suite (type-checks via tsc --noEmit first, then runs node:test)
npm test

# Build (tsconfig.build.json)
npm run build

# Docs-conformance suite (separate glob, *.docs-test.ts)
npm run test:docs
```

All four commands are green as of this build:
- `openspec validate issue-238-retire-dormant-spec-composer --strict` → `Change 'issue-238-retire-dormant-spec-composer' is valid`
- `npm test` → `4066 pass, 0 fail` (baseline was 4072; `compose.test.ts`'s own 6 tests are the entire
  delta — no other test count moved)
- `npm run build` → clean, no errors
- `npm run test:docs` → `351 pass, 0 fail` (unaffected — `producer-agent.docs-test.ts`'s own assertions
  are coarse substring checks against `.claude/agents/producer.md`, which this slice did not touch; that
  file was already rewritten by issue #264)

### Acceptance-criteria self-assessment

- [x] **A fresh repo-wide search confirms the dormant composer's exported types/function are referenced
  nowhere outside its own module and test, before removal** — proven by two greps run before any edit:
  `grep -rn "composeSpec" src --include='*.ts'` (every hit was inside `compose.ts`/`compose.test.ts`
  themselves) and `grep -rln "ComposeResult\|ComposeOptions\|ComposeFailureReason" src --include='*.ts'`
  (only `compose.ts` itself). Re-run again after deletion (`grep -rn "production-spec/compose\|composeSpec"`
  across `src`) to confirm zero remaining references outside the explicitly out-of-scope `src/copy/`
  module (a different, unrelated composer sharing the generic name — untouched per the Agent Brief).
- [x] **The dormant composer module and its test file are removed** — `git status` shows both deleted
  (`src/production-spec/compose.ts`, `src/production-spec/compose.test.ts`); `ls src/production-spec/compose*`
  now returns no matches.
- [x] **The store-write-boundary allow-list no longer names it, and the guard's own exactness test still
  passes with no new entry required** — proven by `npm test`'s green run of
  `src/store-write-boundary/store-write-guard.test.ts` (part of the full suite) against the edited
  `allow-list.ts` with zero replacement entry. Additionally hand-verified the "half the change" failure
  mode the Agent Brief calls out as the acceptance mechanism: with only the allow-list entry removed and
  `compose.ts`/`compose.test.ts` temporarily restored from git history, running
  `node --import tsx --test src/store-write-boundary/store-write-guard.test.ts` directly FAILED, naming
  `src/production-spec/compose.ts::src/production-spec/store.ts::saveSpec` as a new, un-audited violation
  — confirming the guard genuinely catches an unpaired half of this change, exactly as designed. The
  temporary files were removed immediately after and the real store.ts edit (briefly stashed during the
  experiment) was restored via `git stash pop`; `git status` and a fresh `npm test` run confirm the
  working tree is back to exactly the intended diff.
- [x] **The full test suite is green** — `npm test`: 4066/4066 pass, 0 fail (see "How to run" above for
  the exact count reconciliation).
- [x] **The live Production Spec specification's Requirement describing the Producer as the Spec's
  composer is updated or removed so it no longer contradicts ADR-0031's accept-time authoring model** —
  the `production-spec` spec delta REMOVES "Compose and persist a Production Spec beside the Brief,
  segmented by Recipe" (the Requirement literally titled around composing, whose scenarios directly
  invoked `composeSpec`) with a Reason/Migration note, ADDS a replacement carrying forward only the
  still-true technical facts under actor-neutral framing, and MODIFIES "Producer agent definition" so its
  prose no longer claims the Producer generates the Spec. (`openspec validate --strict` proves the delta
  is well-formed; the archive step that folds these into `openspec/specs/production-spec/spec.md` happens
  after a qa pass, per this repo's pipeline — not part of this build.)
- [x] **`openspec validate --strict` passes for the touched specs** —
  `openspec validate issue-238-retire-dormant-spec-composer --strict` → valid; `openspec validate --specs
  --strict` → 72/72 passed (confirms the pre-existing, un-archived spec set is unaffected by this change,
  as expected — the delta only lands in `openspec/changes/`, not `openspec/specs/`, until archive).

### Fakes / fixtures used

None needed. This slice touches no Magnific Space code, no Apify code, and no runtime pipeline path at
all — it deletes a module with zero production callers and updates documentation/allow-list bookkeeping.
**No live Space call was made anywhere in this build** (there is nothing in this slice's scope that could
reach the Space); the `magnific` MCP tools were never invoked and are not available to this agent by
design. The one live-code interaction in this build was the deliberate, temporary "half the change"
experiment described above, run entirely against the local filesystem/test runner (no network, no Space,
no credits) and reverted before finishing.

### Self-review notes

- Initially considered fully MODIFYING the "Compose and persist..." Requirement in place rather than
  REMOVE+ADD, but the repo's own recorded gotcha (a MODIFIED Requirement's header must be byte-identical
  to the base spec's for the archive fold to match it — "the MODIFIED-header archive trap") made REMOVE
  (old title) + ADD (new title) the safer, established pattern for a Requirement whose title itself no
  longer describes reality ("Compose and..." when nothing composes via that path anymore). The two small,
  genuinely in-place edits ("Producer agent definition", the store-write-boundary-guard Requirement) kept
  their exact original titles and used MODIFIED correctly.
- Caught and fixed a self-authored bug during drafting: the `store-write-boundary-guard` MODIFIED delta
  initially, in error, carried a fourth scenario ("a namespace import...") that actually belongs to a
  DIFFERENT, untouched Requirement in the base spec — removed it before finalizing, since a MODIFIED
  delta replaces a Requirement's full body and must not silently absorb an unrelated Requirement's
  scenario.
- Caught and fixed an `openspec validate --strict` failure: the CLI's SHALL/MUST check reads only the
  FIRST LINE of a requirement's body (up to the first newline in the source markdown), not the full
  joined paragraph — my first ADDED Requirement's opening line described two function signatures before
  reaching its SHALL clause on line 2, which the validator flagged. Restructured the opening sentence so
  SHALL appears within the first source line.
- Considered also touching `openspec/specs/recipe-registry/spec.md` (which lists `compose.ts` among a
  historical roster of unmodified module names) and `openspec/specs/copy-composition/spec.md` (which
  cites `production-spec/compose.ts` once, by analogy, as a design precedent for the UNRELATED
  `src/copy/compose.ts`). Left both untouched: neither describes Spec-authorship ownership or contradicts
  ADR-0031, and the Agent Brief's out-of-scope section explicitly excludes `src/copy/`'s domain — editing
  either would be scope creep with no acceptance-criterion benefit.
- Left `src/store-write-boundary/scan.test.ts`'s two comments mentioning `compose.ts`'s "exact shape"
  untouched — they are historical/descriptive text on synthetic, unaffected in-memory fixtures (not
  real imports of the deleted file), so they stay technically accurate as design-rationale prose even
  after the deletion; editing them would be cosmetic, not correctness-bearing.
- Left `docs/audits/codebase-audit-2026-07-07.md`'s three mentions of `compose.ts`/`composeSpec`
  untouched — it is a dated, point-in-time audit artifact, not living documentation.

### Known limits

- The archive step (folding this change's spec deltas into `openspec/specs/production-spec/spec.md` and
  `openspec/specs/store-write-boundary-guard/spec.md`, then moving this change folder to
  `openspec/changes/archive/`) is deliberately NOT done in this build — per this repo's pipeline, that
  rides inside the same PR `/build-issue` opens after a qa pass, not before.
- No behavior changed anywhere; there is nothing new to smoke-test beyond the full suite already covering
  every surviving code path (`specPathFor`/`saveSpec`/`generate`/`authorSpecForRecipe`/`acceptIdeaCommand`
  all keep their own, unmodified test coverage).
- Two other stale-but-harmless mentions of `production-spec/compose.ts` remain in the repo by deliberate
  choice (see Self-review notes above): `recipe-registry/spec.md`'s historical module-name list and
  `copy-composition/spec.md`'s design-precedent analogy. Neither asserts current Spec-authorship behavior
  or contradicts ADR-0031, so leaving them was a scope judgment call, not an oversight — flagging here in
  case qa weighs it differently.

## QA Verdict — Round 1: PASS

Independently re-verified every claim in the Build Report against the actual working tree (branch
`issue-238-retire-dormant-spec-composer`, uncommitted changes as expected pre-PR). Nothing was taken on
trust; every command below was re-run fresh by qa.

### Suite result

- `openspec validate --all --strict` → `Totals: 73 passed, 0 failed (73 items)` (72 specs + this change).
- `openspec validate --specs --strict` → `Totals: 72 passed, 0 failed (72 items)` — matches the Build
  Report's claim that the pre-existing, un-archived spec set is unaffected (archive happens inside the
  PR, not this build).
- `openspec validate issue-238-retire-dormant-spec-composer --strict` → `Change
  'issue-238-retire-dormant-spec-composer' is valid`.
- `npm test` → **4066 pass, 0 fail, 0 cancelled, 0 skipped**. Sanity-checked the count math myself:
  `git show HEAD:src/production-spec/compose.test.ts | grep -c "^\s*it("` → exactly 6 tests in the
  deleted file; main was 4072 (confirmed via `git log`/repo history context); 4072 − 6 = 4066. Matches
  exactly.
- `npm run test:docs` → **351 pass, 0 fail** — matches the Build Report exactly, confirming
  `producer-agent.docs-test.ts` (coarse substring checks) is unaffected.
- Also ran the two touched-guard test files directly: `node --import tsx --test
  src/store-write-boundary/store-write-guard.test.ts src/store-write-boundary/scan.test.ts` →
  **29 pass, 0 fail**.
- `npm run build` was NOT run by qa (out of qa's scoped tool grant — `npm test`/`npm run test:docs`/
  `openspec validate`/read-only git/gh only). The diff is comment-only in `store.ts` and a pure array-
  entry removal in `allow-list.ts`, and `npm test`'s own `tsc --noEmit` pre-check passed, so this is not
  treated as an open risk — noting the scope limit for the record, not as a defect.

### Per-criterion results

| # | Acceptance criterion | Result | Evidence |
|---|---|---|---|
| 1 | Fresh repo-wide search confirms the dormant composer's exported types/function are referenced nowhere outside its own module and test, before removal | PASS | Re-ran myself post-deletion: `grep -rn "composeSpec" src --include='*.ts'` → **zero hits anywhere in `src/`** (the module and its test are already gone from disk, so even the self-references are gone). Ran `grep -rn "composeSpec\|ComposeSpecOptions\|ComposeSpecResult\|production-spec/compose" src openspec` → hits are confined to (a) a code comment in `scan.test.ts` describing the historical import shape as a synthetic fixture string (not a real import), (b) `allow-list.ts`'s own removal doc-comment, (c) `copy/draft.ts` and `copy/compose.ts`'s design-precedent comments about the unrelated, explicitly out-of-scope Copy module, and (d) archived/historical OpenSpec change folders (expected, immutable history) plus this slice's own change folder. No live code path references the deleted module. |
| 2 | The dormant composer module and its test file are removed | PASS | `git status --porcelain` shows both `D  src/production-spec/compose.ts` and `D  src/production-spec/compose.test.ts`; `ls src/production-spec/compose*` (implicit via grep above) returns nothing. |
| 3 | The store-write-boundary allow-list no longer names it, and the guard's own exactness test still passes with no new entry required | PASS | Read `src/store-write-boundary/allow-list.ts` in full — no `compose.ts` entry, no replacement entry added. `store-write-guard.test.ts`'s "finds exactly the allow-listed set" test passes (run directly, see Suite result). `git status` shows no leftover artifacts from the developer's claimed revert-and-verify experiment (working tree matches exactly the intended diff: 2 deletions, 2 modifications, 1 untracked openspec folder — nothing else). |
| 4 | The full test suite is green | PASS | `npm test` → 4066/4066, 0 fail (see Suite result; count independently reconciled). |
| 5 | The live Production Spec specification's Requirement describing the Producer as the Spec's composer is updated or removed so it no longer contradicts ADR-0031's accept-time authoring model | PASS (delta-level, correctly scoped) | The change's own delta at `openspec/changes/issue-238-retire-dormant-spec-composer/specs/production-spec/spec.md` REMOVES the "Compose and persist a Production Spec beside the Brief, segmented by Recipe" Requirement (title byte-identical to the live one at `openspec/specs/production-spec/spec.md`, confirmed by direct comparison) with a Reason/Migration, ADDS an actor-neutral replacement, and MODIFIES "Producer agent definition" (title byte-identical to the live one, confirmed) so it no longer claims the Producer generates the Spec. Verified the Migration note's citations are real: `acceptIdeaCommand authors and self-checks each chosen Recipe's Production Spec before either queue is written (ADR-0031)`, `A Recipe's authored Spec is persisted through the SQL-backed writer and regenerated as the human-readable file view` (both in `openspec/specs/accept-idea-command/spec.md`), and `Review is the single authorship point...` (in `openspec/specs/spec-authored-at-review/spec.md`) all exist verbatim. Per this repo's own pipeline (CLAUDE.md: "The OpenSpec archive... rides inside this same PR"), the live `openspec/specs/production-spec/spec.md` is NOT expected to be updated until archive — confirmed this is process, not a gap, since `openspec validate --specs --strict` staying at 72/72 unchanged is the expected/correct state pre-archive. |
| 6 | `openspec validate --strict` passes for the touched specs | PASS | `openspec validate issue-238-retire-dormant-spec-composer --strict` → valid; `openspec validate --all --strict` → 73/73 (72 specs + this change), 0 failed. |

### Per-scenario results (spec deltas)

`production-spec` capability:
- REMOVED "Compose and persist a Production Spec beside the Brief, segmented by Recipe" — reason/migration read and cross-checked against real, existing Requirements (see criterion 5 above). PASS.
- ADDED "The file-backed Production Spec is located and persisted beside its Brief, segmented by Recipe", with 5 scenarios (two-Recipes-two-files, cadence-omitted byte-identical, daily-cadence nesting, companies-present, companies-absent) — each maps onto real, unmodified, still-green tests: `store.test.ts` (`specPathFor` scenarios) and `generate.test.ts` (companies scenarios), both part of the green 4066. PASS.
- MODIFIED "Producer agent definition" — scenario now asserts the producer.md doc "describes reading an already-authored Production Spec (ADR-0031)"; `producer-agent.docs-test.ts` (part of the green 351 `test:docs` run) covers this via coarse substring checks against `.claude/agents/producer.md`, which issue #264 already rewrote — confirmed unaffected/still-passing. PASS.

`store-write-boundary-guard` capability:
- MODIFIED "a tracked store's file-backed write function..." — the "not flagged" scenario now uses a hypothetical module instead of the deleted `compose.ts`; the two other scenarios in this Requirement (`STORE_WRITE_FUNCTIONS` naming both `saveProductionSpec`/`saveSpec`, and a hypothetical-import detection) are unchanged and still map onto `scan.test.ts`. `store-write-guard.test.ts`'s real exactness test (not hypothetical) independently proves the "not flagged" behavior for real, since the allow-list now holds zero entries in this category — PASS, and a stronger proof than the hypothetical scenario alone.

### Always-rules + Magnific-fake checks

- **Generate-never-publish**: PASS (trivial) — diff touches no publish path; `grep -iE "spaces_|creations_|magnific"` against the full diff → zero hits.
- **Public-metrics-only**: PASS (trivial) — diff touches no metrics/Apify code.
- **Relative-not-absolute**: PASS (trivial) — diff touches no scoring code.
- **Explicit-attribution**: PASS (trivial) — diff touches no attribution code.
- **Ledger-as-source-of-truth**: PASS (trivial) — diff touches no ledger/command-surface write path; `git diff HEAD -- src/production-spec/store.ts src/store-write-boundary/allow-list.ts` shows every added line is a doc-comment, and the one removed line in `allow-list.ts` is a data-array entry removal (no function bodies touched).
- **Magnific fake / no live Space calls**: PASS — `git show HEAD:src/production-spec/compose.ts | grep -iE "spaces_|creations_|magnific|fetch\(|http"` finds only the deleted module's own doc-comment ("No Magnific, no Apify, no network"). The diff introduces zero new code (comment-only + one array-entry removal), so there is nothing that could reach a live Space. `qa` made no `spaces_*`/`creations_*` MCP calls itself.

### Defect list

None. No defects found in this round.

### Notes for the record (not defects)

- The developer's Build Report flags two deliberately-left stale mentions of `production-spec/compose.ts` (`openspec/specs/recipe-registry/spec.md`'s historical module-name roster, and `openspec/specs/copy-composition/spec.md`'s design-precedent analogy for the unrelated `src/copy/compose.ts`). qa read both directly: neither asserts current Spec-authorship behavior, neither claims the Producer composes the Spec, and neither contradicts ADR-0031 — they are historical/analogical prose only. This is a reasonable scope judgment consistent with the Agent Brief's explicit "out of scope: the unrelated Copy composition module" carve-out. Not a defect.
- `npm run build` was outside qa's scoped tool grant and was not independently re-run; `npm test`'s own `tsc --noEmit` pre-check (part of the green run) covers the same TypeScript compilation surface for the modules actually changed, so this is a low-risk, documented scope limit rather than an unverified claim.
