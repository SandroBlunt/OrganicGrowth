# Slice Handoff — issue-58-per-recipe-spec-copy

This is the one bidirectional Slice Handoff document. `developer` writes the Build Report below; `qa`
appends its Verdict beneath it. Nothing here is ever overwritten; retries append `Round-N Build` blocks.

---

## Build Report (Round 1)

### What changed

Implements ADR-0012 end-to-end: **Copy leaves the Space and the Production Spec entirely** and becomes a
separate, per-Recipe-parameterized, out-of-Space step.

1. **`post_copy` removed from the Production-Spec contract + validator, in one change.**
   `ProductionSpec` no longer has a `post_copy` field (media instructions only); `validate()` drops its
   four `post_copy_*` checks/codes; `generate()` drops `buildPostCopy`; the global
   `MAX_POST_COPY_CHARS`/`MIN_POST_COPY_EMOJIS`/`MAX_POST_COPY_EMOJIS` constants are deleted.
   `composeSpec` still writes a valid, brand-safe Spec (proven unchanged, just re-targeted off the
   retired field).
2. **A new `src/copy/` module composes Copy, split into WRITING and CHECKING** (ADR-0012):
   - `contract.ts` — the `Copy` (`{ caption, hashtags }`) and `CopyShape`
     (`{ maxChars, minEmojis, maxEmojis }`) types.
   - `draft.ts` — the injectable `CopyDrafter` seam + a deterministic `defaultDraftCopy` (no model call,
     respects an ARBITRARY `CopyShape`, can fold in `mediaContext` — proving copy composes LATE).
   - `inject.ts` — deterministic `required_cta`/`required_hashtags` injection: append if absent, dedupe
     (case/`#`-agnostic) if present.
   - `validate.ts` — the PURE, hermetic, per-Recipe checker: length, emoji count, required CTA/hashtags
     present, and a banned-word scan (reject-only, never rewrites).
   - `compose.ts` — wires draft → inject → validate into `composeCopy`, returning a Copy only once it
     actually validates.
3. **The banned-word scan is re-pointed onto composed Copy.** `production-spec/brand-safety.ts`'s
   matching loop is factored into a shared, exported `scanTextFields(fields, bannedWords)`; the Spec-shape
   scan (`scanForBannedWords`) and `src/copy/validate.ts`'s Copy-shape scan both build on it — and the
   Spec-shape scan no longer reads a `post_copy` field.
4. **`required_cta`/`required_hashtags` are brought live.** `production-spec/brand-profile.ts` gains
   `requiredCtaFrom`, `requiredHashtagsFrom`, and `loadCopyRules` (bundles all three composed-Copy rules
   in one read), mirroring the existing `bannedWordsFrom`/`loadBannedWords`.
5. **The seeded Recipe's copy shape is now its own literal params.** `src/recipe/registry.ts` declares
   `CHARACTER_EXPLAINER_COPY_MAX_CHARS`/`_MIN_EMOJIS`/`_MAX_EMOJIS` (180/1/3 — unchanged values, just no
   longer a shared global) directly on the Recipe, rather than importing the now-deleted Spec-contract
   constants.
6. **Copy is stored structured on the Asset, and surfaced verbatim at Publish.**
   `LedgerAssetRecord.copy` (`src/asset/asset.ts`) is now `Copy | undefined` (was a bare string), with a
   new defensive `parseCopy`. `/run-pipeline`'s Gate-3 message now prints each produced Asset's
   `copy.caption`/`copy.hashtags` verbatim, alongside a Recipe-explicit `/log-post` hint (this also fixed
   a pre-existing staleness — the hint was missing the required `<recipe>` argument since issue #56).
7. **The watermark stays a Space parameter, never copy.** `Copy` has no watermark/handle field
   (asserted in tests); `producer.md` is updated to document the new copy-composition step in Phase B and
   restate the watermark boundary.

### Files touched

New:
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/copy/contract.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/copy/draft.ts` + `draft.test.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/copy/inject.ts` + `inject.test.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/copy/validate.ts` + `validate.test.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/copy/compose.ts` + `compose.test.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/copy/fixtures/brand-profile.copy-rules.yaml`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/copy/fixtures/brand-profile.no-rules.yaml`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/production-spec/brand-profile.test.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/openspec/changes/issue-58-per-recipe-spec-copy/` (this change)

Modified:
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/production-spec/contract.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/production-spec/validate.ts` + `validate.test.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/production-spec/generate.ts` + `generate.test.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/production-spec/brand-safety.ts` + `brand-safety.test.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/production-spec/brand-profile.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/production-spec/compose.test.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/production-spec/fixtures/specs.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/production-spec/fixtures/brand-profile.banned.yaml`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/recipe/registry.ts` + `registry.test.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/asset/asset.ts` + `asset.test.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/commands/run-pipeline.ts` + `run-pipeline.test.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/agents/producer.md`

### How to run

```bash
# Type-check + full unit suite (994 tests, all hermetic)
npm test

# Build (emits dist/ via tsconfig.build.json)
npm run build

# OpenSpec validation
npx openspec validate issue-58-per-recipe-spec-copy --strict

# Just the new/changed modules
node --import tsx --test src/copy/*.test.ts src/production-spec/*.test.ts \
  src/recipe/registry.test.ts src/asset/asset.test.ts src/commands/run-pipeline.test.ts
```

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proven by |
|---|---|---|
| 1 | `post_copy` removed from the Spec contract + validator in the same change; Spec shape selected per Recipe; compose still writes a valid Spec | `src/production-spec/validate.test.ts` — describe "validate — post_copy is retired from the contract (ADR-0012)" (2 tests); `src/production-spec/generate.test.ts` — "places thumbnails at the TOP level (not in clips), and never emits post_copy"; `src/recipe/registry.test.ts` — "the Spec no longer carries post_copy — copy is composed separately", "declares a spec-shape whose validator IS the real production-spec validator (zero drift)"; `src/production-spec/compose.test.ts` — "composeSpec — happy path" (writes a Spec that passes `validate()`), plus the brand-safety/validation gate tests (unchanged behavior, re-targeted off `post_copy`) |
| 2 | A pure, hermetic, per-Recipe copy validator (length/emoji/required-parts) runs in the unit suite; 180/1-3-emoji are the wired Recipe's own params, not global constants | `src/copy/validate.test.ts` — describes "caption length (per-Recipe shape, not a global constant)" and "caption emoji count (per-Recipe shape)" (asserts a DIFFERENT shape enforces DIFFERENT bounds on the SAME caption); `src/copy/draft.test.ts` — "respects a DIFFERENT Recipe's shape — the bounds are the Recipe's own params, not a global 180/1-3"; `src/recipe/registry.test.ts` — "declares a copy-shape of its OWN — 180 chars, 1-3 emojis — no longer sourced from a shared Spec-contract constant" |
| 3 | `required_cta`/`required_hashtags` loaded + injected deterministically (append if absent, dedupe if present); banned-word scan re-pointed onto composed copy (reject-only) | `src/production-spec/brand-profile.test.ts` — full suite (`requiredCtaFrom`, `requiredHashtagsFrom`, `loadCopyRules`); `src/copy/inject.test.ts` — full suite (append-if-absent, dedupe-if-present, case/`#`-agnostic); `src/copy/validate.test.ts` — describe "banned words re-pointed onto the composed Copy (ADR-0012, reject-only)" (4 tests, including "never rewrites — a banned word simply fails validation"); `src/copy/compose.test.ts` — "injects the required CTA and required hashtags deterministically...", "dedupes when the fake drafter ALREADY included...", "REFUSES a fake-drafted Copy containing a banned word — never rewritten, never returned" |
| 4 | Copy stored structured on the Asset and surfaced at Publish; watermark stays a Space parameter, not copy | `src/asset/asset.test.ts` — describe "parseCopy — structured Copy, defensive (ADR-0012, issue #58)" + the updated "parses every optional field when present and well-typed" round-trip; `src/commands/run-pipeline.test.ts` — "surfaces the composed Copy verbatim at Gate 3, and names the Recipe in the /log-post hint (ADR-0012)"; `src/copy/compose.test.ts` — "never folds a watermark/@handle into the composed Copy (ADR-0012: watermark stays a Space param)" |
| 5 | Built test-first against the fake; single-recipe path green; strict validate + suite green | `src/copy/compose.test.ts` IS the single-recipe path: every test reads `getRecipe("character-explainer-with-cast")!.copyShape` from the REAL registry (never a hand-rolled shape) and drives `composeCopy` against a deterministic fake drafter (`fakeDrafter`, explicitly documented as standing in for the producer's LLM job — never a live model); `npx openspec validate issue-58-per-recipe-spec-copy --strict` → "valid" (shown above); `npm test` → 994/994 green (up from the 929 baseline) |

### Fakes / fixtures used

- **Magnific fake: NOT NEEDED / NOT TOUCHED by this slice.** Copy leaves the Space entirely (ADR-0012),
  so no test in `src/copy/` (or anywhere else changed by this slice) drives `SpaceMcpPort`/`FakeSpace` at
  all. Confirmed by grep: no `spaces_*`/`creations_*` string appears anywhere in this slice's diff. The
  pre-existing `FakeSpace` (`src/space-driver/fixtures/fake-space.ts`) is untouched and its own tests
  (driver.test.ts etc.) remain green, unaffected by this slice.
- **`fakeDrafter` (`src/copy/compose.test.ts`)** — a deterministic in-memory `CopyDrafter` standing in for
  the producer's LLM drafting job in tests. It ignores `shape` on purpose, so the tests prove
  `composeCopy`'s inject/validate stages do their own work regardless of what "the model" drafted. Never
  a live model call.
- **Brand Profile YAML fixtures:** `src/copy/fixtures/brand-profile.copy-rules.yaml` (all three composed-
  Copy rules configured), `brand-profile.no-rules.yaml` (the real profile's default — nothing configured);
  `src/production-spec/fixtures/brand-profile.banned.yaml` (extended with `required_cta`/
  `required_hashtags` so `brand-profile.test.ts`'s `loadCopyRules` test has one realistic fixture to read).
- Temp directories (`mkdtemp`) for `run-pipeline.test.ts` and `production-spec/compose.test.ts`, as before
  this slice.

### Self-review notes

- Extracted a shared `scanTextFields(fields, bannedWords)` core in `brand-safety.ts` rather than letting
  `src/copy/validate.ts` re-implement the word-boundary/case-insensitivity regex — the two banned-word
  scans (Spec-shape, Copy-shape) can now never drift.
- Kept `CopyShape` (`src/copy/contract.ts`) structurally independent of `recipe/registry.ts`'s
  `RecipeCopyShape` (same 3 fields) rather than importing across modules — TypeScript's structural typing
  means `recipe.copyShape` passes straight through with zero conversion, and `src/copy/` carries no
  dependency on the registry.
- Removed `buildPostCopy`/`countEmojis`/`POST_COPY_EMOJI_TAIL` from `production-spec/generate.ts` and the
  four `post_copy_*` checks + local `countEmojis` from `production-spec/validate.ts` entirely, rather than
  leaving them as unused dead code.
- Co-located `BrandCopyRules` with its loader in `production-spec/brand-profile.ts` per ADR-0012's
  explicit instruction ("Load them in brand-profile.ts"), imported by `src/copy/*` rather than duplicated.
- Fixed a small pre-existing staleness while touching the Gate-3 message: the `/log-post` hint was
  missing the (already-required, since issue #56) `<recipe>` argument — now names it explicitly, which
  also happens to be necessary for the Operator to know which Asset's Copy they're looking at when an
  Idea has more than one Recipe.

### Known limits

- Only one Recipe is wired (*Character Explainer with Cast*); a second Recipe declaring a DIFFERENT copy
  shape is deferred (issue #60/HITL, matching issue #56/#57's precedent). This slice proves genericity at
  the deep-module layer instead — `draft.ts`/`validate.ts` are exercised against both the real wired
  Recipe's `180/1/3` shape AND a deliberately different one.
- `composeCopy` is not wired into a code-level "commit the finished Asset" orchestrator. Production is
  attended (ADR-0008): the `producer` content agent composes Copy in the Operator's own session (Phase B,
  `producer.md`, updated this slice), using `src/copy/`'s deep modules as its checker/injector — exactly
  how it already composes the Production Spec today. There is no such orchestrator for the Spec side
  either (confirmed: no caller of `AssetStore.writeAsset` writes `asset_url`/`produced_at` anywhere in the
  codebase), so this is consistent with the existing shape, not a gap introduced by this slice.
- `Copy` covers `caption` (the required CTA folded in) + `hashtags`; a dedicated `mentions` field is not
  modeled — not required by the issue's acceptance criteria.
- Pre-existing, NOT introduced by this slice: `npm run test:docs` (excluded from `npm test`'s glob) has 3
  failing doc-conformance subtests against `producer.md`/`run-pipeline.md` that pre-date this slice
  (confirmed on `main` before any change here) and are explicitly owned by issue #59 per issue #57's own
  handoff. This slice's `producer.md` edits are additive and do not affect those specific failing
  assertions either way.

---

## QA Verdict — Round 1: PASS

### Suite result

- `npm test` (`tsc -p tsconfig.json --noEmit && node --import tsx --test "src/**/*.test.ts"`) → **994/994
  pass, 283 suites, 0 fail** on branch `issue-58-per-recipe-spec-copy` @ `241faa5`. Verified by running it
  myself (not taking the Build Report's word for it).
- `npm run build` (`tsc -p tsconfig.build.json`) → clean, no errors.
- `npx openspec validate issue-58-per-recipe-spec-copy --strict` → `Change 'issue-58-per-recipe-spec-copy'
  is valid`.
- `npx openspec validate --all --strict` → `Totals: 18 passed, 0 failed (18 items)`, including
  `✓ change/issue-58-per-recipe-spec-copy`.
- Baseline check: ran `npm test` on a clean `git worktree` of `main` (`ce3211f`, issue-57 merged) →
  **929/929 pass**. Confirms the Build Report's "994/994, up from the 929 baseline" claim exactly (65 new
  tests, 0 regressions, 0 removed).
- `npm run test:docs` comparison (isolated `git worktree`, no working-tree mutation):
  - On branch: `# tests 23 / # pass 20 / # fail 3` — failing suites `command surface — final and matches
    the shipped Producer feature` (1 subtest), `C2: run-pipeline.md is honest that unattended production
    is not yet wired` (1 subtest), `producer agent definition` (1 subtest, "is honest that production past
    Spec composition is not yet wired (audit C2)").
  - On `main` worktree (`ce3211f`): **identical** — same 3 suites, same subtest names, same 20/3 split.
  - **Confirmed: issue-58's `producer.md` edit introduced NO new docs-test failures.** The pre-existing
    3-subtest failure set (owned by issue #59, stale "audit C2" wiring-honesty strings) is unchanged. Not
    a defect for this slice.

### Per-criterion results

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | `post_copy` removed from Spec contract + validator in the same change; Spec shape selected per Recipe; compose still writes a valid Spec | PASS | `src/production-spec/contract.ts` — `ProductionSpec` interface has no `post_copy` field; `MAX_POST_COPY_CHARS`/`MIN_POST_COPY_EMOJIS`/`MAX_POST_COPY_EMOJIS` deleted (grep confirms zero remaining definitions, only a historical comment in `registry.ts`). `src/production-spec/validate.ts` — `ValidationCode` union has no `post_copy_*` codes; `validate()` never reads `spec.post_copy`. Proven by `validate.test.ts` "validate — post_copy is retired from the contract (ADR-0012)" (2 tests: accepts a Spec with none, ignores a stray one). `composeSpec` (`production-spec/compose.ts`) unmodified except tests re-targeted; `production-spec/compose.test.ts` "composeSpec — happy path" still green. **Grepped the whole `src/` tree for `post_copy`/`postCopy`: every remaining hit is either a doc comment documenting the retirement, or a test asserting the field's ABSENCE/being-ignored — zero live readers remain.** |
| 2 | Pure, hermetic, per-Recipe copy validator (length/emoji/required-parts) in the unit suite; 180/1-3-emoji are the wired Recipe's params, not globals | PASS | `src/copy/validate.ts`'s `validateCopy` is pure (no imports of `fs`/`node:fs`, no network, no clock — confirmed by reading the file top to bottom: only imports are `scanTextFields` (pure) and types). `src/recipe/registry.ts` declares `CHARACTER_EXPLAINER_COPY_MAX_CHARS/_MIN_EMOJIS/_MAX_EMOJIS` (180/1/3) as **local `const`s on the Recipe file**, not imported from `production-spec/contract.ts` (which no longer exports any such constant — confirmed by grep). `validate.test.ts`'s "caption length (per-Recipe shape, not a global constant)" and "caption emoji count (per-Recipe shape)" describe blocks assert a DIFFERENT `CopyShape` enforces DIFFERENT bounds on the identical caption — genuinely parameterized, not hard-coded. |
| 3 | `required_cta`/`required_hashtags` loaded + injected deterministically (append if absent, dedupe if present); banned-word scan re-pointed onto composed copy, reject-only | PASS | `production-spec/brand-profile.ts` — `requiredCtaFrom`/`requiredHashtagsFrom`/`loadCopyRules` read straight from parsed YAML, pure/defensive. `src/copy/inject.ts` — `injectRequiredCta`/`injectRequiredHashtags` verified by reading the code: append-if-absent + case/`#`-agnostic dedupe-if-present, confirmed by `inject.test.ts` ("dedupes: leaves the caption unchanged when the CTA is already present", "dedupes a required hashtag already present WITH its #" / "WITHOUT a #"). Banned-word scan: `src/copy/validate.ts` builds `TextField[]` from `caption`+`hashtags[i]` and calls the SHARED `scanTextFields` (same core `production-spec/brand-safety.ts` now exports) — confirmed reject-only: `validate.test.ts` "never rewrites the Copy — a banned word simply fails validation (reject-only)" asserts the result object never carries a `copy` field, only errors; `compose.test.ts` "REFUSES a fake-drafted Copy containing a banned word — never rewritten, never returned" confirms `composeCopy` never silently strips/edits it, only rejects. |
| 4 | Copy stored structured on the Asset and surfaced at Publish; watermark stays a Space parameter, not copy | PASS | `src/asset/asset.ts` — `LedgerAssetRecord.copy?: Copy` (structured `{ caption, hashtags }`, not a string), with defensive `parseCopy` (returns `null` on missing/blank caption or non-object; degrades `hashtags` to `[]` on non-array — never throws). `src/commands/run-pipeline.ts` lines 813-834 — Gate 3 prints `asset.copy.caption` and `asset.copy.hashtags.join(" ")` VERBATIM for each produced Asset, proven by `run-pipeline.test.ts` "surfaces the composed Copy verbatim at Gate 3...". Watermark: `Copy` interface (`src/copy/contract.ts`) has exactly two fields, `caption`/`hashtags` — no watermark/handle field, confirmed both by reading the interface and by `compose.test.ts` "never folds a watermark/@handle into the composed Copy" (asserts `"watermark" in result.copy!` and `"handle" in result.copy!` are both `false`). `producer.md` explicitly documents the watermark as a Space parameter set via `replace_text` in step 1, separate from the copy-composition step 2. |
| 5 | Built test-first against the fake; single-recipe path green; strict validate + suite green | PASS | `src/copy/compose.test.ts` reads `getRecipe("character-explainer-with-cast")!.copyShape` from the REAL registry (never hand-rolled) in every test, and every drafting call goes through the injectable `CopyDrafter` seam — either `defaultDraftCopy` (deterministic, no I/O) or the test's own `fakeDrafter` (explicitly documented as standing in for the producer's LLM job, never a live model). `npx openspec validate issue-58-per-recipe-spec-copy --strict` and `npm test` both verified green by me directly (see Suite result above), not merely accepted from the Build Report. |

### Per-scenario results (spec deltas vs. issue/ADR-0012)

All spec-delta files pass `openspec validate --strict`, and every `### Requirement:` header in each
MODIFIED capability (`production-spec`, `recipe-registry`, `asset-store`, `run-pipeline-conductor`)
exactly matches a `### Requirement:` header already present in the corresponding base
`openspec/specs/<capability>/spec.md` — spot-checked by grepping both files for every MODIFIED capability;
no header drift, so the archive step folding these deltas into `openspec/specs/` will not break.

| Capability | Scenario | Result | Covering test |
|---|---|---|---|
| copy-composition (ADDED) | Copy has no watermark/handle field | PASS | `compose.test.ts` "never folds a watermark/@handle into the composed Copy" |
| copy-composition | The default drafter always satisfies its own shape | PASS | `draft.test.ts` "always satisfies validateCopy for the SAME shape it was drafted for" |
| copy-composition | The default drafter respects a shape different from the wired Recipe's 180/1-3 | PASS | `draft.test.ts` "respects a DIFFERENT Recipe's shape..." |
| copy-composition | A fake drafter stands in for the producer's LLM job in tests | PASS | `compose.test.ts`'s `fakeDrafter`, used throughout the suite |
| copy-composition | A well-formed Copy is accepted | PASS | `validate.test.ts` "accepts a valid Copy with no errors" |
| copy-composition | The 180-char/1-3-emoji bounds are the wired Recipe's own params, not a global | PASS | `validate.test.ts` "caption length (per-Recipe shape...)" describe block |
| copy-composition | A missing required CTA or required hashtag is rejected | PASS | `validate.test.ts` "required CTA"/"required hashtags" describe blocks |
| copy-composition | A banned word in the caption or hashtag is rejected, never rewritten | PASS | `validate.test.ts` "banned words re-pointed onto the composed Copy" describe block (4 tests) |
| copy-composition | A missing required CTA is appended / an already-present one is not duplicated | PASS | `inject.test.ts` "appends the required CTA when absent" / "dedupes: leaves the caption unchanged..." |
| copy-composition | A missing required hashtag is appended; an already-present one is not duplicated | PASS | `inject.test.ts` "dedupes a required hashtag already present WITH its #" / "WITHOUT a #" |
| copy-composition | required_cta/required_hashtags load from the Brand Profile, defensively | PASS | `brand-profile.test.ts` (full suite, new file) |
| copy-composition | A fake-drafted Copy missing required parts is composed successfully once injected | PASS | `compose.test.ts` "injects the required CTA and required hashtags deterministically..." |
| copy-composition | A fake-drafted Copy containing a banned word is refused, never returned | PASS | `compose.test.ts` "REFUSES a fake-drafted Copy containing a banned word..." |
| production-spec (MODIFIED) | post_copy is no longer part of the contract | PASS | `validate.test.ts` "a stray post_copy field present on the Spec is simply ignored" |
| production-spec | A stray post_copy field is not scanned (brand-safety) | PASS | `brand-safety.test.ts` "no longer scans a post_copy field even if one is present" |
| recipe-registry (MODIFIED) | The seeded Recipe's copy-shape is its own literal param, not a Spec-contract constant | PASS | `registry.test.ts` "declares a copy-shape of its OWN — 180 chars, 1-3 emojis..." |
| asset-store (MODIFIED) | A structured Copy parses onto the Asset / a malformed copy value never crashes the parse | PASS | `asset.test.ts` "parseCopy — structured Copy, defensive" describe block |
| run-pipeline-conductor (MODIFIED) | Gate 3 surfaces the composed Copy verbatim, and the /log-post hint names the Recipe | PASS | `run-pipeline.test.ts` "surfaces the composed Copy verbatim at Gate 3, and names the Recipe in the /log-post hint" |

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | `composeCopy`/`validateCopy`/`injectRequiredParts` only compose and check text; nothing in `src/copy/` or the touched `run-pipeline.ts` code path calls a publish/post API. Gate 3 in `run-pipeline.ts` pauses (`yield { ...prompt: "Press Enter when you have published and logged the Post URL..." }`) — publication stays a human action via `/log-post`. |
| Public-metrics-only | PASS (unaffected) | This slice touches no metrics/Apify code path. |
| Relative-not-absolute | PASS (unaffected) | This slice touches no scoring/comparison code path. |
| Explicit-attribution | PASS | The Gate-3 `/log-post` hint names both the Idea id AND the Asset's Recipe explicitly (`run-pipeline.test.ts` asserts the exact hint string with `<recipe>`); nothing in this slice infers attribution. |
| Ledger-as-source-of-truth | PASS | `Copy` is stored on `LedgerAssetRecord.copy` (`src/asset/asset.ts`), parsed defensively via `parseCopy`, and is the value `run-pipeline.ts` reads back to surface at Gate 3 — the ledger is the only place Copy is read from for display. (Note: as the Build Report's "Known limits" section honestly states, no code-level orchestrator yet calls `AssetStore.writeAsset` with a composed Copy — that gap pre-dates this slice on the Spec side too and is consistent with the attended-production model (ADR-0008), not a regression introduced here.) |
| Banned-word hard filter, reject-only (rule 9) | PASS | `src/copy/validate.ts`'s banned-word check only ever adds a `banned_word` error; `validate.test.ts` "never rewrites the Copy — a banned word simply fails validation" explicitly asserts no `copy` field is ever present alongside a banned-word failure. `compose.test.ts` "REFUSES a fake-drafted Copy containing a banned word — never rewritten, never returned" confirms end-to-end. |
| Magnific fake (hermetic build, no live Space) | PASS | `git diff ce3211f 241faa5 -- src .claude` grepped for `spaces_*`/`creations_*`/`magnific` — zero hits except one comment line ("No Magnific, no Apify, no network"). No test in `src/copy/*.test.ts` imports `SpaceMcpPort`/`FakeSpace`/anything from `space-driver/`. Drafting in tests goes through the injectable `CopyDrafter` seam (`defaultDraftCopy` — deterministic, no model call; or `fakeDrafter` in `compose.test.ts` — a hand-written deterministic function) — never a live model or live Space call. |

### Defect list

None. No defects found in this round.

### Notes for the record

- Verified the acceptance criterion's exact test counts myself rather than trusting the Build Report:
  994/994 on this branch, 929/929 on a clean `main` worktree — exactly the delta the Build Report claims
  (65 new tests, 0 regressions).
- Verified the `npm run test:docs` pre-existing-failure claim by diffing an isolated `main` worktree
  against this branch rather than assuming — the 3 failing subtests are byte-for-byte identical on both
  (same suite names, same subtest names, same 20-pass/3-fail split). This slice's `producer.md` edit did
  not touch any of the specific assertions those 3 subtests check.
- Read every file in `src/copy/` in full (not just the diff) to confirm the checker (`validate.ts`) is
  genuinely side-effect-free and the drafting seam is genuinely injectable, per the task's explicit
  instruction to verify this rather than take it on trust.
- Cross-checked every MODIFIED-capability spec-delta header against the corresponding base spec file by
  grep, per the task's explicit instruction — all four match exactly, so the eventual archive (folding
  these deltas into `openspec/specs/`) will not break on a header mismatch.

**Overall: PASS. This slice is ready for a PR.**
