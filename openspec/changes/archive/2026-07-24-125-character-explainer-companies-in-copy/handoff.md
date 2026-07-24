# Slice Handoff — issue #125: Thread Character Explainer's company/product mentions into Copy

This is the one bidirectional Slice Handoff document for this slice. The `developer` agent's Build
Report is below; `qa` appends its Verdict beneath it (nothing here is ever overwritten — retries add
new `Round-N Build` blocks).

## Build Report (Round 1)

### What changed

Mirrors PR #122 (which threaded the News Carousel Recipe's per-slide `companies` field into its Copy
step), for the *Character Explainer with Cast* Recipe — but this Recipe starts from a different
position: unlike News Carousel, its Production Spec had **no** structured companies/products field at
all before this slice.

1. **Contract.** `src/production-spec/contract.ts`'s `ProductionSpec` gains a new, OPTIONAL, TOP-LEVEL
   field: `companies?: readonly string[]`. Chosen **per-Asset (top-level), not per-clip** — this
   Recipe's 3 clips render one continuous narrative about the SAME picked Character (unlike News
   Carousel's 7 independently-labeled slides), and `thumbnails` already sets the "not everything is
   per-clip" precedent on this contract.
2. **Validation.** `src/production-spec/validate.ts` accepts a Spec with no `companies` field at all
   (never required); when the field IS present, it must be an array of non-empty strings (may be
   empty) — a new `"companies_shape"` `ValidationCode` names the one new failure mode.
3. **Author phase (mechanical proof).** `src/production-spec/generate.ts`'s `Brief` gains a matching
   optional `companies` field, carried through UNCHANGED onto the generated Spec (present when named,
   omitted when not — never invented). This is the deep-module, deterministic stand-in's own proof,
   mirroring how `newsCarouselSlideNarrative` proved its own carry-through mechanically for #120.
4. **Author phase (real Skill).** `.claude/skills/produce-character-explainer/SKILL.md` gains a new
   step (step 4, renumbering self-audit/emit to 5/6): read the Idea brief for real companies/products;
   author the TOP-LEVEL `companies` field when it names any; OMIT it entirely when it names none —
   never invented. A matching self-audit checklist bullet and updated emit-step shape description.
5. **Copy-step wiring.** New pure module `src/copy/character-explainer-companies.ts` exports
   `characterExplainerCompanies(spec): readonly string[]` — the ONE place a saved Character Explainer
   Spec's `companies` becomes the Copy step's input, normalized to `[]` when absent. Mirrors
   `newsCarouselSlideNarrative`'s wiring pattern exactly.
6. **CopyInput.** `src/copy/draft.ts`'s `CopyInput` gains a new optional, Recipe-agnostic field,
   `companies?: readonly string[]` — the WHOLE-Asset-grain sibling of `CopySlideBeat.companies`'s
   per-slide/per-beat grain, for a single-media Recipe with no beats to attach a company list to.
   Purely additive: neither `defaultDraftCopy` nor `skillDraftCopy`'s deterministic output changes
   because of its presence, emptiness, or absence.
7. **write-social-copy Skill.** Updated to draw on `CopyInput.companies` for the Character Explainer
   Recipe the SAME way it already draws on `CopySlideBeat.companies` for News Carousel: name the real
   companies/products the data records, grounded, never invented; empty/absent — at either grain —
   contributes no mention.

### Files touched

Added:
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy/src/copy/character-explainer-companies.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy/src/copy/character-explainer-companies.test.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy/openspec/changes/125-character-explainer-companies-in-copy/proposal.md`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy/openspec/changes/125-character-explainer-companies-in-copy/tasks.md`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy/openspec/changes/125-character-explainer-companies-in-copy/specs/production-spec/spec.md`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy/openspec/changes/125-character-explainer-companies-in-copy/specs/copy-composition/spec.md`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy/openspec/changes/125-character-explainer-companies-in-copy/specs/producer-skill/spec.md`
- this `handoff.md`

Modified:
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy/src/production-spec/contract.ts` — `ProductionSpec.companies?: readonly string[]` (additive).
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy/src/production-spec/validate.ts` — optional-shape check + `"companies_shape"` code (additive).
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy/src/production-spec/validate.test.ts` — new tests (additive).
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy/src/production-spec/fixtures/specs.ts` — new fixtures (additive; `validSpec()` itself unchanged).
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy/src/production-spec/generate.ts` — `Brief.companies?`, carried through unchanged (additive).
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy/src/production-spec/generate.test.ts` — new tests (additive).
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy/src/production-spec/compose.test.ts` — new end-to-end tests (additive).
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy/src/copy/draft.ts` — `CopyInput.companies?: readonly string[]` (additive).
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy/src/copy/draft.test.ts` — new test (additive).
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy/src/copy/compose.test.ts` — new end-to-end test (additive).
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy/.claude/skills/write-social-copy/SKILL.md` — Inputs item 4 + Steps section 1 generalized to cover both companies grains (the ORIGINAL #120 phrasing pattern was deliberately kept intact so the pre-existing #120 docs-test assertion — `companies…empty or absent` — keeps passing unmodified).
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy/src/copy/write-social-copy-skill.docs-test.ts` — new `describe` block (additive; every pre-#125 test unmodified and still green).
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy/.claude/skills/produce-character-explainer/SKILL.md` — Inputs item 2, new step 4, self-audit checklist bullet, emit-step shape description, bottom checklist summary.
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy/src/production-spec/produce-character-explainer-skill.docs-test.ts` — new `describe` block (additive; every pre-#125 test unmodified and still green).

**Deliberately NOT touched** (verified via `git diff --stat`): `src/recipe/registry.ts` (no change to
`CHARACTER_EXPLAINER_PHASES`'s pinned checklist-item counts — see AC6 below), `src/production-spec/
brand-safety.ts` (no company-name banned-word scanning added — mirrors News Carousel's own
`SLIDE_TEXT_KEYS` precedent of not scanning `companies`), `src/production-spec/news-carousel-*.ts`,
`src/copy/compose.ts`, `src/copy/inject.ts`, `src/copy/validate.ts`, `src/copy/contract.ts`,
`.claude/agents/producer.md`, any ledger/Asset-storage code, any Channel/Brand-profile code.

### How to run

```bash
cd /Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy

# Full suite (type-checks via tsc --noEmit, then runs every src/**/*.test.ts)
npm test

# Docs-conformance suite (every src/**/*.docs-test.ts, incl. both Skills' pinned assertions)
npm run test:docs

# OpenSpec validation for this change specifically
npx openspec validate 125-character-explainer-companies-in-copy --strict

# OpenSpec validation for the whole repo (confirms no regression elsewhere)
npx openspec validate --all --strict

# Just this slice's new/changed test files
node --import tsx --test \
  src/production-spec/validate.test.ts \
  src/production-spec/generate.test.ts \
  src/production-spec/compose.test.ts \
  src/copy/character-explainer-companies.test.ts \
  src/copy/draft.test.ts \
  src/copy/compose.test.ts \
  src/copy/write-social-copy-skill.docs-test.ts \
  src/production-spec/produce-character-explainer-skill.docs-test.ts
```

Results at handoff time: `npm test` → **1517 pass / 0 fail** (baseline was 1498 pass / 0 fail — +19 net
new tests, zero regressions). `npm run test:docs` → **122 pass / 0 fail** (baseline 116 pass / 0 fail —
+6 net new tests, zero regressions). `npx openspec validate --all --strict` → **31/31 passed** (baseline
30/30 — +1 for this change).

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #125) | Proving test(s) |
|---|---|---|
| AC1 | Character Explainer's Production-Spec contract carries a structured companies/products list alongside its existing fields | `src/production-spec/contract.ts`'s `ProductionSpec.companies?: readonly string[]` (type-level); `src/production-spec/validate.test.ts` — "validate — companies is OPTIONAL, top-level (issue #125)" (5 tests: accepts absent / non-empty / empty; rejects non-array; rejects blank entry) |
| AC2 | The author phase populates this field from the Idea brief when real companies/products are named; leaves it empty when none apply (never invented) | **Deep-module proof:** `src/production-spec/generate.test.ts` — "generate — companies is carried through UNCHANGED from the Brief, never invented (issue #125)" (3 tests) and `src/production-spec/compose.test.ts` — "composeSpec — companies threads through the WHOLE pipeline unchanged (issue #125)" (2 tests, full Brief→disk round-trip). **Real-Skill proof (agent-judged prose, mechanically pinned):** `src/production-spec/produce-character-explainer-skill.docs-test.ts` — "produce-character-explainer Skill — authors a structured companies/products list, grounded, never invented (issue #125)" (3 tests) |
| AC3 | The Copy step's narrative input for this Recipe carries the field through unchanged, mirroring `CopySlideBeat.companies`'s wiring for News Carousel | `src/copy/character-explainer-companies.test.ts` (7 tests: non-empty/empty/absent carried through, never mutates, deterministic, plus the AC5 byte-identical-caption proof below); `src/copy/compose.test.ts` — "composes a valid Copy through the FULL wiring — a saved Character Explainer Spec's companies threaded via characterExplainerCompanies into skillDraftCopy (issue #125)" (full pipeline: Spec → `characterExplainerCompanies` → `CopyInput.companies` → `composeCopy` → `validateCopy`, all green) |
| AC4 | `write-social-copy`'s instructions are updated to draw on this field for the Character Explainer Recipe, the same way they already do for News Carousel | `src/copy/write-social-copy-skill.docs-test.ts` — "write-social-copy Skill — draws on the Character Explainer Recipe's own companies field too, the SAME way it already does for News Carousel (issue #125)" (3 tests: names `CopyInput.companies`/`characterExplainerCompanies`/the file path; names the Recipe by name; instructs "at either grain") |
| AC5 | A Spec with no companies produces the same caption behavior as before this change (no fabricated mention) | `src/copy/character-explainer-companies.test.ts` — "characterExplainerCompanies — an absent-companies Spec changes nothing about drafting (issue #125 AC5)" (2 tests: byte-identical caption with a wired-through absent-companies field vs. no `companies` field at all; byte-identical whether a non-empty companies list is present or absent); `src/production-spec/compose.test.ts`'s "a Brief naming no companies writes a Spec with no companies field" proves the absence propagates all the way from the Brief |
| AC6 | Existing Character Explainer tests stay green with only additive changes | Every pre-existing test file's ORIGINAL tests re-ran unmodified and green (`validate.test.ts`'s 12 original tests, `generate.test.ts`'s 9 original, `compose.test.ts` ×2 files' originals, `draft.test.ts`'s 20 original, `write-social-copy-skill.docs-test.ts`'s 16 original, `produce-character-explainer-skill.docs-test.ts`'s 15 original, `src/recipe/registry.test.ts`'s pinned "author-phase checklist has exactly 3 items" assertion — deliberately left untouched by NOT adding a mechanical checklist item to `CHARACTER_EXPLAINER_PHASES` in `registry.ts`); full-suite delta is 1498→1517 (net +19, all NEW) and 116→122 docs (net +6, all NEW), zero modified assertions, zero regressions |

### Fakes / fixtures used

- **The Magnific fake: NOT NEEDED.** This slice's code touches only the Production-Spec contract/
  validator/generator and the Copy step — none of which call the Space or any `spaces_*`/`creations_*`
  tool (`src/production-spec/compose.ts`'s own module doc: "No Magnific, no Apify, no network"; this is
  unchanged by this slice). Confirmed via `git diff -- src/copy src/production-spec .claude/skills |
  grep -iE "spaces_|creations_"` → no matches. The `developer` agent was not given the Magnific MCP
  tools and did not reach for them.
- **`skillDraftCopy`** (`src/copy/draft.ts`) — the deterministic, non-LLM stand-in for the
  `write-social-copy` Skill, used throughout to prove the wiring mechanically without a live model call.
- **`generate()`** (`src/production-spec/generate.ts`) — the deterministic, non-LLM stand-in for the
  `produce-character-explainer` Skill's author phase, extended with `Brief.companies` for the same
  reason.
- New fixtures: `specWithCompanies`/`specWithEmptyCompanies`/`companiesNotArray`/`companiesBlankEntry`
  (`src/production-spec/fixtures/specs.ts`), plus locally-scoped typed `ProductionSpec` samples in
  `character-explainer-companies.test.ts` and `copy/compose.test.ts` (mirroring the existing precedent
  in `news-carousel-slide-narrative.test.ts`/`copy/compose.test.ts`).

### Self-review notes

- Chose **per-Asset (top-level)** over per-clip for `ProductionSpec.companies`, per the issue's own
  "whichever fits the Recipe's existing shape" framing — recorded the reasoning in three places
  (contract.ts's module doc, the proposal's Non-Goals, and the Skill's step 4) so a future reader never
  has to re-derive it.
- Deliberately did **not** add a mechanical `companies`-related checklist item to
  `src/recipe/registry.ts`'s `CHARACTER_EXPLAINER_PHASES` — `registry.test.ts` pins that Recipe's
  author-phase checklist at exactly 3 items (2 mechanical + 1 agent-judged); adding a 4th would have
  been a change to an EXISTING, passing assertion, violating AC6's "additive changes only." The
  equivalent guidance instead lives as agent-judged prose in the Skill itself (mirroring the
  `grounded-subject`/News-Carousel precedent for judgment calls that aren't mechanically checkable).
- Deliberately did **not** add `companies` to `brand-safety.ts`'s banned-word scan — mirrored News
  Carousel's own `news-carousel-brand-safety.ts`'s `SLIDE_TEXT_KEYS`, which also excludes `companies`
  (proper nouns, not banned-word material); kept the two Recipes' precedent consistent rather than
  inventing a new rule only one of them would have.
- Caught and fixed one regex-matching risk during the self-review pass: my first draft of the
  `write-social-copy/SKILL.md` edit reordered "empty or absent `companies`" to "companies … empty or
  absent" and back, which would have silently broken the PRE-EXISTING #120 docs-test assertion
  (`/companies.{0,20}(is )?empty or absent/i`). Reworded to `` `companies` being empty or absent `` so
  the original regex still matches — verified by re-running the untouched #120 describe block before
  adding any new one.
- No dead code introduced; `character-explainer-companies.ts` is a single one-line function (mirrors
  `newsCarouselSlideNarrative`'s own minimal shape); no unused imports (`ProductionSpec` type-only
  imports use `import type`, consistent with `verbatimModuleSyntax`).

### Known limits (deferred, matching the proposal's Non-Goals)

- No per-clip `companies` variant — per-Asset was judged the better fit for this Recipe's shape (see
  Self-review notes above). Not deferred as a gap; a deliberate design choice within the issue's own
  stated flexibility.
- No News-Carousel-style mechanical `companies-cited` checklist item (verifying every named company is
  cited verbatim in an `image_prompt`) — this Recipe's `companies` field carries no image-rendering role
  (unlike News Carousel's per-slide logo row); it exists purely to reach the Copy step. The equivalent
  guidance is agent-judged prose only.
- Multiple Channels per Brand, per-channel Copy variants/validation, LinkedIn handle lookup/tagging —
  unrelated to this slice, tracked on parent epic #120 (which stays open).
- No ledger/Asset migration — forward-only; no already-produced Spec or Copy is touched or rewritten.
- `.claude/agents/producer.md` left untouched, mirroring #120/#122's own precedent of scoping the
  instruction update to the Skill level, not the conductor doc.

## QA Verdict — Round 1: PASS

### Suite result

All commands run exactly as specified in the Build Report's "How to run" section, from the worktree
root (`/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-125-companies-copy`):

- `npm test` → **1517 pass / 0 fail** (0 cancelled, 0 skipped). Matches the Build Report exactly.
- `npm run test:docs` → **122 pass / 0 fail**. Matches the Build Report exactly.
- `npx openspec validate --all --strict` → **31/31 passed, 0 failed**, including
  `✓ change/125-character-explainer-companies-in-copy`.
- `npx openspec validate 125-character-explainer-companies-in-copy --strict` → `Change
  '125-character-explainer-companies-in-copy' is valid`.
- The slice's own 8 new/changed test files run standalone (`node --import tsx --test ...`) →
  **114 pass / 0 fail**.

All green, actually run (not assumed).

### Per-criterion results

| # | Acceptance criterion | Result | Evidence |
|---|---|---|---|
| AC1 | Production-Spec contract carries a structured companies/products list alongside existing fields | PASS | `src/production-spec/contract.ts`: `ProductionSpec.companies?: readonly string[]`, doc-commented top-level/optional. `src/production-spec/validate.ts` adds the matching optional-shape check + `"companies_shape"` `ValidationCode`. Proven by `validate.test.ts`'s "validate — companies is OPTIONAL, top-level (issue #125)" (5 tests, all pass): absent accepted, non-empty accepted, explicit `[]` accepted, non-array rejected, blank entry rejected. |
| AC2 | Author phase populates the field from the Idea brief when real companies/products are named; leaves it empty when none apply; never invented | PASS | Deep-module (mechanical) proof: `generate.ts`'s `Brief.companies?` carried through unchanged onto the Spec, verified by `generate.test.ts` (3 tests) and `compose.test.ts`'s full Brief→disk round-trip (2 tests: named companies survive to disk; no companies → no field on disk). Real-Skill (prose) proof: `.claude/skills/produce-character-explainer/SKILL.md`'s new step 4 instructs reading the brief, authoring `companies` when real ones are named, and omitting it entirely — never inventing — otherwise; pinned by `produce-character-explainer-skill.docs-test.ts`'s 3 new assertions, all passing. |
| AC3 | Copy step's narrative input carries the field through unchanged, mirroring `CopySlideBeat.companies` | PASS | New pure function `src/copy/character-explainer-companies.ts`'s `characterExplainerCompanies(spec)` reads `spec.companies` and returns it unchanged, normalizing absence to `[]` — never mutates, deterministic (verified by `character-explainer-companies.test.ts`, 5 structural tests). `src/copy/draft.ts`'s `CopyInput.companies?` is the Asset-grain sibling of the existing `CopySlideBeat.companies`. Full pipeline proven end-to-end by `src/copy/compose.test.ts`'s new "composes a valid Copy through the FULL wiring" test: a saved Spec's `companies` → `characterExplainerCompanies` → `CopyInput.companies` → `composeCopy`/`skillDraftCopy` → `validateCopy` all green. |
| AC4 | `write-social-copy`'s instructions updated to draw on this field for Character Explainer, same as News Carousel | PASS | `.claude/skills/write-social-copy/SKILL.md`'s Inputs item 4 and Steps section 1 now name `CopyInput.companies`, `characterExplainerCompanies`, `character-explainer-companies.ts`, and the *Character Explainer with Cast* Recipe by name, and instruct grounded/never-invented naming "at either grain". Pinned by 3 new assertions in `write-social-copy-skill.docs-test.ts`'s "draws on the Character Explainer Recipe's own companies field too" describe block, all passing. |
| AC5 | A Spec with no companies produces the same caption behavior as before this change (no fabricated mention) | PASS | `character-explainer-companies.test.ts`'s dedicated AC5 describe block proves `skillDraftCopy`'s output is byte-identical (`assert.deepEqual`) whether `CopyInput.companies` is wired through as `[]` or omitted entirely, and whether a non-empty `companies` list is present or absent — since neither deterministic drafter reads `companies` at all (confirmed by inspecting `draft.ts`: `companies` appears only in doc comments and the type, never in `defaultDraftCopy`'s or `skillDraftCopy`'s function bodies). `compose.test.ts`'s "a Brief naming no companies writes a Spec with no companies field" extends the same guarantee back to the Brief→Spec boundary. |
| AC6 | Existing Character Explainer tests stay green with only additive changes | PASS | `git diff --stat` confirms every touched file is a net-additive diff (14 files, +345/-23 — the `-23` is import-list/renumbering lines inside otherwise-additive edits, not deleted assertions). `src/recipe/registry.ts` was NOT touched — its `registry.test.ts` pinned "author-phase checklist has exactly 3 items" assertion (line 130) still holds unmodified. Full-suite delta 1498→1517 (+19, all new) and docs 116→122 (+6, all new), 0 regressions, confirmed by actually running the suite (see Suite result above), not merely trusting the Build Report's claimed counts. |

### Per-scenario results (OpenSpec spec deltas)

**`specs/production-spec/spec.md`** (MODIFIED Requirement: Production Spec validation + Compose/persist)

| Scenario | Result | Covering test |
|---|---|---|
| A well-formed Spec is accepted | PASS (pre-existing) | `validate.test.ts` |
| Wrong number of character_concepts / clips rejected | PASS (pre-existing) | `validate.test.ts` |
| Missing / nested thumbnails rejected | PASS (pre-existing) | `validate.test.ts` |
| post_copy no longer part of the contract | PASS (pre-existing) | `validate.test.ts` |
| A DIFFERENT Recipe's validator reuses the same shape | PASS (pre-existing) | `validate.test.ts` |
| A Spec with no companies field at all is accepted | PASS | `validate.test.ts` — "accepts a well-formed Spec with no companies field at all" |
| A Spec with a non-empty companies list is accepted | PASS | `validate.test.ts` — "accepts a well-formed Spec whose companies list is non-empty" |
| A Spec with an explicit empty companies list is accepted | PASS | `validate.test.ts` — "accepts a well-formed Spec whose companies list is explicitly empty" |
| A companies field present but not an array is rejected | PASS | `validate.test.ts` — "rejects a Spec whose companies field is present but not an array" |
| A companies array containing a blank entry is rejected | PASS | `validate.test.ts` — "rejects a Spec whose companies array contains a blank entry" |
| Composing an accepted Idea writes a valid, Recipe-segmented Spec | PASS (pre-existing) | `compose.test.ts` |
| Two Recipes of one Idea each get their own Spec file | PASS (pre-existing) | `compose.test.ts` |
| A failing Spec is refused, not written | PASS (pre-existing) | `compose.test.ts` |
| A Brief naming real companies writes a Spec whose companies survive to disk | PASS | `compose.test.ts` — "a Brief naming real companies writes a Spec whose companies list survives to disk" |
| A Brief naming no companies writes a Spec with no companies field | PASS | `compose.test.ts` — "a Brief naming no companies writes a Spec with no companies field — never fabricated" |

**`specs/copy-composition/spec.md`** (ADDED Requirements: CopyInput.companies + characterExplainerCompanies)

| Scenario | Result | Covering test |
|---|---|---|
| CopyInput without companies remains valid (backward compatible) | PASS | `draft.test.ts` (existing callers unaffected) + full suite green |
| CopyInput.companies is optional and purely additive, at every state | PASS | `draft.test.ts`'s new test: `withCompanies`/`withEmptyCompanies`/`withoutCompaniesField` all byte-identical for `skillDraftCopy` and `defaultDraftCopy` |
| An absent-companies Spec produces the same caption behavior as before | PASS | `character-explainer-companies.test.ts`'s AC5 block |
| A non-empty companies list is carried through unchanged | PASS | `character-explainer-companies.test.ts` — "carries a non-empty companies list through UNCHANGED" |
| An explicit empty companies list is carried through as [] | PASS | `character-explainer-companies.test.ts` — "carries an explicit empty companies list through as []" |
| An absent companies field normalizes to [] — never fabricated, never throws | PASS | `character-explainer-companies.test.ts` — "normalizes an ABSENT companies field to []" |
| The function never mutates its input Spec and is deterministic | PASS | `character-explainer-companies.test.ts` — "never mutates" + "is deterministic" |

**`specs/producer-skill/spec.md`** (MODIFIED Requirements: both Skills)

| Scenario | Result | Covering test |
|---|---|---|
| The Skill file exists and declares its own slug (both Skills) | PASS (pre-existing) | both docs-test files |
| The Skill references exact contract/validator/checklist/store modules | PASS (pre-existing) | `produce-character-explainer-skill.docs-test.ts` |
| The Skill states it does not run the Space / pin the Character / compose Copy | PASS (pre-existing) | `produce-character-explainer-skill.docs-test.ts` |
| The Skill treats a banned word as reject-only and never publishes | PASS (pre-existing) | `produce-character-explainer-skill.docs-test.ts` |
| The Skill names the TOP-LEVEL companies field it authors | PASS | `produce-character-explainer-skill.docs-test.ts` — "names the TOP-LEVEL companies field on ProductionSpec" |
| The Skill instructs populating companies from the brief, grounded, never invented | PASS | `produce-character-explainer-skill.docs-test.ts` — "instructs populating it from the Idea brief..." |
| The Skill instructs omitting companies entirely when the brief names none | PASS | `produce-character-explainer-skill.docs-test.ts` — "instructs omitting it entirely..." |
| The write-social-copy Skill documents sharpening the produced narrative | PASS (pre-existing) | `write-social-copy-skill.docs-test.ts` |
| The Skill names companies as part of the produced-narrative input | PASS (pre-existing, #120) | `write-social-copy-skill.docs-test.ts` |
| The Skill instructs naming real companies/products, grounded | PASS (pre-existing, #120) | `write-social-copy-skill.docs-test.ts` |
| The Skill states empty/absent companies contributes no mention | PASS (pre-existing, #120) | `write-social-copy-skill.docs-test.ts` |
| The Skill names CopyInput.companies and characterExplainerCompanies for Character Explainer | PASS | `write-social-copy-skill.docs-test.ts` — "names CopyInput.companies and characterExplainerCompanies..." |
| The Skill instructs naming real companies/products at either grain | PASS | `write-social-copy-skill.docs-test.ts` — "instructs naming real companies/products from CopyInput.companies too, grounded, at either grain" |

### OpenSpec-vs-issue faithfulness check (job c)

Read the issue's five sentences against the proposal/spec deltas line by line:

- "Add a structured companies/products list to the Character Explainer Production-Spec contract,
  per-clip or per-Asset, whichever fits the Recipe's existing shape" → the spec delta chose per-Asset
  (top-level), and both `contract.ts`'s module doc and the proposal's Non-Goals record the reasoning
  (all 3 clips render one continuous narrative about the same picked Character, unlike News Carousel's
  independently-labeled slides; mirrors `thumbnails`'s own top-level precedent). This is a genuine,
  documented design choice within the issue's own stated flexibility, not an unstated narrowing — no
  misread here.
- "have the author phase populate it from the Idea brief when real companies/products are named" →
  both the mechanical Brief→Spec carry-through (`generate.ts`) and the real Skill's new step 4 do
  exactly this; the Skill text is explicit that it is reading the SAME Idea brief the rest of the
  author phase already reads, not a new/different input.
- "thread it into the Copy step's narrative input the same way News Carousel's `CopySlideBeat.companies`
  already works" → `CopyInput.companies` is deliberately Recipe-agnostic and additive on the SAME
  `CopyInput` interface `CopySlideBeat.companies` lives on, not a parallel/incompatible mechanism.
- "`write-social-copy`'s instructions should draw on it for this Recipe too" → confirmed in the Skill
  file diff and pinned by new docs-test assertions.
- "An empty/absent list must never fabricate a mention" → this is the single most safety-critical
  clause in the issue, and it is the one most thoroughly tested: `validate()` never requires the field,
  `generate()` never invents it, `characterExplainerCompanies` normalizes absence to `[]` without
  throwing, and — the strongest proof — neither deterministic drafter's OUTPUT changes at all based on
  `companies`' presence/absence/emptiness, verified by byte-identical `assert.deepEqual` caption
  comparisons in two separate test files.

No misread found. No scenario in the spec deltas contradicts CONTEXT.md, the ADRs, or PRD #1. The
spec's own Non-Goals (no per-clip variant, no mechanical `companies-cited` checklist item, no
`producer.md` edit, no banned-word scan of `companies`) are each independently justified against an
existing precedent already established by #120/#122, not invented reasoning — checked against
`src/production-spec/news-carousel-brand-safety.ts`'s `SLIDE_TEXT_KEYS` (confirmed it also excludes
`companies`) and `src/recipe/registry.test.ts` (confirmed the pinned "exactly 3 items" assertion that
would break if a 4th mechanical checklist item were added).

The parent epic #120's own issue body was also read to confirm #125 is a faithful, correctly-scoped
child slice of it (the "company/product extraction... needs a home" open question #120 raised is
exactly what #125 answers for this one Recipe) — not a slice that quietly expands or contracts #120's
own ask.

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | `git diff --stat` confirms `.claude/agents/producer.md` and every ledger/Asset-storage file are untouched; no publish-path code touched. |
| Public-metrics-only | PASS | No file under `src/performance/`, `src/apify/`, or any metrics path appears in the diff (`git diff --stat` — 14 files touched, all under `src/production-spec/`, `src/copy/`, or `.claude/skills/`). |
| Relative-not-absolute | PASS | No scoring/comparison code touched; irrelevant to this slice's scope, confirmed by the diff's file list. |
| Explicit-attribution | PASS | No Post/attribution/ledger code touched (`src/asset/`, `src/commands/log-post.ts` etc. absent from the diff). |
| Ledger-as-source-of-truth | PASS | No `data/brands/*/ledger.json`-writing code path touched; `saveSpec`/`specPathFor` (the Spec store) are referenced only by name in the Skill's prose, unchanged in code. |
| Never-fabricate (companies specifically) | PASS | Verified at every layer by direct code reading, not just trusting the Build Report: `validate.ts` never requires `companies` (grep-confirmed: the only place `companies_shape` fires is when the key IS present and malformed); `generate.ts`'s spread (`...(brief.companies !== undefined ? { companies: brief.companies } : {})`) omits the key entirely rather than writing `undefined` or `[]` when the Brief has nothing to say; `characterExplainerCompanies` reads `spec.companies ?? []` — never synthesizes a company name; both Skill files' new prose explicitly says "never invented" / "never a generic placeholder standing in for a real company." Confirmed by running the actual tests (`validate.test.ts`, `generate.test.ts`, `compose.test.ts`, `character-explainer-companies.test.ts`) — all pass. |
| Magnific fake / no live Space calls | PASS | `git diff -- src/copy src/production-spec .claude/skills \| grep -iE "spaces_\|creations_"` run directly by QA → **no matches** (exit code 1 / empty output). This slice's touched modules (`production-spec/`, `copy/`) have no Space/MCP dependency at all — confirmed by reading `src/production-spec/compose.ts`'s own module doc ("No Magnific, no Apify, no network"), which this slice does not modify. No `spaces_*`/`creations_*` tool call anywhere in the diff; no credits spent; no board mutated. |

### Defect list

None. No defects found in this round.

### Verdict rationale

Every acceptance criterion maps to a real, currently-passing test that actually exercises it (verified
by reading the test bodies directly, not just the Build Report's claims about them). Every OpenSpec
Scenario across all three touched spec deltas traces to a passing test. The spec deltas faithfully
match issue #125's own wording, including its one safety-critical clause ("An empty/absent list must
never fabricate a mention"), and are a correctly-scoped, non-drifting child of parent epic #120. The
chosen per-Asset (vs. per-clip) design is a documented, justified choice within the issue's own stated
flexibility, not a misread. All always-rules hold; no live Magnific/Space call exists anywhere in the
diff. Full test suite (`npm test`), docs suite (`npm run test:docs`), and `openspec validate --all
--strict` were all re-run by QA directly and are genuinely green (1517/1517, 122/122, 31/31) — this is
not a fabricated pass.

**This slice is ready to proceed to a PR.**
