# Slice Handoff — issue #170: ADR-0021 space-less Recipe support

Bidirectional channel between `developer` and `qa` for this slice. Developer writes the Build Report
below; `qa` appends its Verdict beneath it. Nothing here is overwritten; a retry appends a new
`Round-N Build` block.

## Build Report (Round 1)

### What changed

ADR-0021 decided a Recipe's Space target becomes optional (a Recipe whose Asset is written words plus
collected media drives no Magnific Space at all). This slice builds that support **generically**:

- `Recipe.space` and `Recipe.canvasInputs` (`src/recipe/registry.ts`) both widen to **optional** —
  absent together for a Space-less Recipe. Every other Recipe field (`gates`, `specShape`, `copyShape`,
  `copySkill`, `phases`) stays required, exactly as ADR-0021 says.
- `bindMediaSlots` (`src/producer/bind-media.ts`) and `auditBindMediaPhase`
  (`src/recipe/phase-contract.ts`) now read `recipe.canvasInputs?.mediaSlots ?? {}` — an absent
  `canvasInputs` is treated as zero declared media slots, hitting the SAME already-tested vacuous
  `ok: true` path any Recipe with an empty slot map already takes, rather than crashing.
- A new pure predicate, `usesSpace(recipe)` (`src/producer/uses-space.ts`) — `recipe.space !==
  undefined` — is the single Recipe-generic signal the thin Producer should check before doing ANY
  canvas work (binding media slots, driving a run-point, setting the watermark `@handle`).
- A throwaway, **NOT-wired** test fixture Recipe, `SPACE_LESS_TEST_RECIPE`
  (`src/recipe/fixtures/space-less-recipe.ts`): zero gates, no `space`, no `canvasInputs`, a minimal
  Spec shape (`script` + `shot_list`) with its own validator/banned-word scanner, and all six Phase
  Contracts in order — its Space-bound phases (`bind-media`, `gate`, `render`) declare **empty**
  checklists, the same pattern the zero-gate News Carousel Recipe's own `gate` phase already uses. It
  is never added to the real `REGISTRY` — Review's offered-Recipe set and the Production Queue are
  untouched.
- A new end-to-end test (`src/producer/space-less-recipe-end-to-end.test.ts`) drives that fixture
  through author → bind-media (no-op) → gate (no-op) → copy → save, writing a `produced` Asset that
  carries `spec_path`/`copy` but **no** `asset_url`/`asset_paths`/`pending_gate`.
- The registry's doc comment now cites ADR-0021 explicitly (`docs/adr/0021-space-less-recipe-script-assets.md`).
- ~20 existing read sites (`recipe.space.x`/`recipe.canvasInputs.x`) that only ever run against the two
  WIRED Recipes (both of which still always populate both fields) got a non-null assertion (`!`) to
  satisfy the widened type — a type-checker-only change, zero behavior change.

The **actual** News Short Script Recipe (its real Spec contract, Skill, and registry entry) is
explicitly deferred to a follow-up slice, per the issue's own "Why" section.

### Files touched

New:
- `src/recipe/fixtures/space-less-recipe.ts` (+ `.test.ts`)
- `src/producer/uses-space.ts` (+ `.test.ts`)
- `src/producer/space-less-recipe-end-to-end.test.ts`
- `openspec/changes/issue-170-space-less-recipe/` (proposal.md, tasks.md, handoff.md, specs/{recipe-registry,phase-contracts,producer-conductor}/spec.md)

Modified:
- `src/recipe/registry.ts` — widened `Recipe.space`/`Recipe.canvasInputs` to optional; ADR-0021 doc
  reference.
- `src/producer/bind-media.ts` — `bindMediaSlots` treats absent `canvasInputs` as zero slots.
- `src/recipe/phase-contract.ts` — `auditBindMediaPhase` treats absent `canvasInputs` as zero slots.
- `src/producer/bind-media.test.ts`, `src/recipe/phase-contract.test.ts` — new space-less-Recipe cases.
- `src/recipe/registry.test.ts` — non-null assertions at existing `.space`/`.canvasInputs` reads, plus
  one new explicit "both wired Recipes still populate both fields" test.
- `src/producer/two-recipes-end-to-end.test.ts`, `src/producer/carousel-end-to-end.test.ts`,
  `src/producer/cast-candidates-end-to-end.test.ts`, `src/production-spec/producer-agent.docs-test.ts`
  — same non-null-assertion fix, no behavior change.

Not touched: `src/space-driver/**` (its primitives take explicit params, never a whole `Recipe`),
`.claude/agents/producer.md` (no wired Space-less Recipe exists yet to document — see Known limits),
`CONTEXT.md`/`CLAUDE.md` (already accurate — CONTEXT.md's "Recipe" entry already documents ADR-0021's
Space-less shape from the ADR-authoring commit; this slice wires no new Recipe).

### How to run

```
npm test              # tsc --noEmit + full suite (node:test)
npm run test:docs      # docs-conformance suite
openspec validate issue-170-space-less-recipe --strict
openspec validate --strict --all   # confirm nothing else regressed
```

Single files:
```
node --import tsx --test src/recipe/fixtures/space-less-recipe.test.ts
node --import tsx --test src/producer/uses-space.test.ts
node --import tsx --test src/producer/space-less-recipe-end-to-end.test.ts
```

**Result:** `npm test` → 1996 tests, 1996 pass, 0 fail. `npm run test:docs` → 192 tests, 192 pass, 0
fail. `openspec validate --strict --all` → 39/39 passed (including this change).

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proving test(s) |
|---|---|---|
| 1 | A Recipe with no Space target can be registered and passes the import-time guards | `src/recipe/fixtures/space-less-recipe.ts` itself runs `declaresAllPhasesInOrder` as an import-time guard (mirrors `registry.ts`'s own defensive throws) — importing it without throwing IS the guard passing. `src/recipe/fixtures/space-less-recipe.test.ts`'s `"is registrable in a slug-keyed Map, mirroring REGISTRY's own construction"` and `"declares all six phases, in PHASE_ORDER's exact order — the SAME shape guard every wired Recipe runs"` |
| 2 | The Producer runs a zero-gate, Space-less test Recipe end-to-end (author → copy → save) with zero Magnific calls, test-first against fakes | `src/producer/space-less-recipe-end-to-end.test.ts`'s `"author -> bind-media (no-op) -> gate (no-op) -> copy -> save, producing a valid ledger Asset with no rendered media"` — the file imports NEITHER a `SpaceMcpPort` NOR any Magnific fake, which is itself the zero-Magnific-calls proof; its sibling test asserts `usesSpace(SPACE_LESS_TEST_RECIPE) === false` up front |
| 3 | Both existing Recipes' behavior is byte-identical (full suite green) | Full suite green (1996/1996) — every pre-existing wired-Recipe test (`registry.test.ts`, `two-recipes-end-to-end.test.ts`, `carousel-end-to-end.test.ts`, `cast-candidates-end-to-end.test.ts`, `driver.test.ts`, `phase-contract.test.ts`, `bind-media.test.ts`) passes unmodified in behavior — only non-null assertions were added at existing read sites. Plus the new explicit test `registry.test.ts`'s `"both wired Recipes still populate BOTH space and canvasInputs..."` and `uses-space.test.ts`'s two `"is true for the wired ... Recipe"` cases |
| 4 | ADR-0021 referenced from the registry's doc comment | `src/recipe/registry.ts`'s top-of-file doc comment, new section `"--- A Recipe's Space target is OPTIONAL — a Space-less Recipe (ADR-0021, issue #170) ---"`, citing `docs/adr/0021-space-less-recipe-script-assets.md` by path; also referenced inline on the `space`/`canvasInputs` field doc comments |

### Fakes / fixtures used

- **Magnific fake: none used, and none needed.** The whole point of this slice is that a Space-less
  Recipe never reaches the Magnific boundary — `src/producer/space-less-recipe-end-to-end.test.ts`
  imports no `SpaceMcpPort`, no `FakeSpace`, no `FakeCarouselSpace`; there is no Space-interaction code
  path for it to exercise. **No live `spaces_*`/`creations_*` call, no credits, no board mutation** —
  confirmed by the absence of any Magnific import in the new test files. The two wired Recipes' own
  existing end-to-end tests keep using their existing fakes (`FakeSpace`, `FakeCarouselSpace`) exactly
  as before, untouched by this slice.
- `src/recipe/fixtures/space-less-recipe.ts`'s `SPACE_LESS_TEST_RECIPE` — a throwaway, NOT-wired test
  fixture Recipe (never registered).
- The real, committed `data/brands/straw-motion/brand-profile.yaml` — read-only, for Copy composition
  in the end-to-end test (mirroring `two-recipes-end-to-end.test.ts`'s own precedent).

### Self-review notes

- Considered a discriminated `Recipe` union (`kind: "space-driven" | "space-less"`) instead of two
  independent optional fields, per the issue's "or a discriminated Recipe kind" alternative. Chose
  plain optional widening: it keeps both existing Recipes' literal object shape completely unchanged,
  requires no restructuring of `REGISTRY`'s existing two entries, and the only real fallout — a handful
  of read sites needing a non-null assertion — is bounded and mechanical. A discriminated union would
  have required the same narrowing at every one of those sites anyway, for no extra safety (both
  wired Recipes are known, by construction, to always carry a Space).
- `validSpaceLessTestSpec()` returns `Record<string, unknown>` rather than the more specific
  `SpaceLessTestSpec` interface, mirroring `strawMotionIdeaOneCarouselSpec()`'s own precedent
  (`production-spec/fixtures/news-carousel-straw-motion-specs.ts`) — needed so it feeds
  `production-spec/store.ts`'s `saveSpec` directly without a cast; the `SpaceLessTestSpec`/
  `SpaceLessTestSpecBeat` interfaces are kept for documentation of the shape.
- Found and fixed one real bug of my own making during the test-first loop: the end-to-end test's
  `mediaContext` string originally used an em dash, which `copy/validate.ts`'s dash-ban check (issue
  #108) correctly rejected — confirms that rule still holds for a Space-less Recipe's Copy too. Fixed
  by rewording, not by weakening any check.
- Confirmed `bindMediaSlots`/`auditBindMediaPhase`'s existing "empty slot map" path already handled
  this case correctly in spirit; the fix was purely widening the read (`?? {}`) to not crash on
  `undefined`, never touching the STOP-on-missing-required-slot logic itself.
- No dead code left behind: every new export (`usesSpace`, `SPACE_LESS_TEST_RECIPE`,
  `validateSpaceLessTestSpec`, `scanSpaceLessTestSpecForBannedWords`, `validSpaceLessTestSpec`) is
  exercised by at least one test.

### Known limits

- `.claude/agents/producer.md` is **not** updated in this slice — there is no wired Space-less Recipe
  yet for it to document (the issue's own "Why" defers the real News Short Script Recipe to a
  follow-up slice). The generic support is proven entirely at the code layer (registry types,
  `bindMediaSlots`/`auditBindMediaPhase`, `usesSpace`, and the fixture-driven end-to-end test). The
  follow-up slice that registers the real Recipe should update producer.md's prose to actually branch
  on `usesSpace`.
- The fixture's `render` Phase Contract checklist is deliberately empty — ADR-0021's own "collect the
  Shot List's media (best-effort download, video preferred, a marked link fallback)" render step is
  explicitly out of scope here (issue's own "Why": "the actual recipe is a follow-up slice").
- `SPACE_LESS_TEST_RECIPE`'s Spec shape (`script` + `shot_list`) is a minimal stand-in chosen only to
  exercise the generic plumbing — it is NOT the real News Short Script Production-Spec contract, and
  is never intended to become one.

## QA Verdict — Round 1: PASS

### Suite result

- `npm test` (tsc --noEmit + full `node:test` suite): **1996 tests, 1996 pass, 0 fail, 0 skipped** —
  actually run, confirmed green.
- `npm run test:docs` (docs-conformance suite): **192 tests, 192 pass, 0 fail** — actually run, confirmed
  green.
- `openspec validate --strict --all`: **39/39 passed**, including `change/issue-170-space-less-recipe`.

All three commands match the Build Report's claimed counts exactly.

### Per-criterion results

| # | Acceptance criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | A Recipe with no Space target can be registered and passes the import-time guards | **PASS** | `src/recipe/fixtures/space-less-recipe.ts` lines 235–243 runs the SAME `declaresAllPhasesInOrder` defensive throw pattern `registry.ts` uses at import time for both wired Recipes; `src/recipe/fixtures/space-less-recipe.test.ts` (`"is registrable in a slug-keyed Map..."`, `"declares all six phases, in PHASE_ORDER's exact order..."`) proves the guard passes and the fixture registers cleanly in a slug-keyed Map. Verified by reading both files directly. |
| 2 | The Producer runs a zero-gate, Space-less test Recipe end-to-end (author → copy → save) with zero Magnific calls, test-first against fakes | **PASS** | `src/producer/space-less-recipe-end-to-end.test.ts` drives author → bind-media (no-op) → gate (no-op) → copy → save via `auditAuthorPhase`/`specPathFor`/`saveSpec`/`bindMediaSlots`/`auditBindMediaPhase`/`composeCopy`/`auditCopyPhase`/`writeAsset`/`loadIdeaAssets`, asserting `asset_url`/`asset_paths`/`pending_gate` are all `undefined`. Confirmed by grep: the file contains no `SpaceMcpPort`/`FakeSpace`/`FakeCarouselSpace`/`spaces_*`/`creations_*` reference anywhere except inside its own doc comment explaining their absence. Test-first ordering is documented in `tasks.md` §5 and matches the git history shape (fixture + test added together, task 5.2 confirms the fail-then-pass sequence). |
| 3 | Both existing Recipes' behavior is byte-identical (full suite green) | **PASS** | Full suite green (1996/1996), including every pre-existing wired-Recipe test file unmodified in assertions (only `!` non-null-assertions added at 4 test files + 2 source files, confirmed by reading each diff — every diff hunk is a pure `.space` → `.space!` / `.canvasInputs` → `.canvasInputs!` substitution with zero logic change). `registry.test.ts` diff also adds one new explicit test confirming both wired Recipes still populate BOTH `space` and `canvasInputs`. |
| 4 | ADR-0021 referenced from the registry's doc comment | **PASS** | `src/recipe/registry.ts` lines 68–80: a new top-of-file doc-comment section titled "A Recipe's Space target is OPTIONAL — a Space-less Recipe (ADR-0021, issue #170)" citing `docs/adr/0021-space-less-recipe-script-assets.md` by path; also referenced inline on the `space` (line 258) and `canvasInputs` (line 279) field doc comments. |

### Per-scenario results (OpenSpec spec deltas)

**`recipe-registry` capability:**

| Scenario | Verdict | Covering test |
|---|---|---|
| getRecipe returns seeded Character Explainer with Cast Recipe by slug | PASS (pre-existing, unaffected) | `registry.test.ts` |
| getRecipe returns seeded News Carousel Recipe by slug | PASS (pre-existing, unaffected) | `registry.test.ts` |
| getRecipe returns null for unregistered slug, never throws | PASS (pre-existing, unaffected) | `registry.test.ts` |
| isWiredRecipe true for both seeded, false for unregistered | PASS (pre-existing, unaffected) | `registry.test.ts` |
| Each Recipe's canvasInputs media-slot map keyed/typed correctly | PASS (pre-existing, unaffected) | `registry.test.ts` |
| Every wired Recipe declares all six phases in PHASE_ORDER | PASS (pre-existing, unaffected) | `registry.test.ts` |
| A phase's checklist item is mechanical or agent-judged | PASS (pre-existing, unaffected) | `registry.test.ts` |
| Both wired Recipes still populate BOTH space and canvasInputs, unchanged by this slice | PASS | `registry.test.ts` new test, "both wired Recipes still populate BOTH space and canvasInputs..." |
| A Recipe with no Space target can be registered and passes the import-time guard | PASS | `space-less-recipe.test.ts` — "is registrable in a slug-keyed Map...", `declaresAllPhasesInOrder` import-time throw |
| A Space-less Recipe's space and canvasInputs are both actually absent | PASS | `space-less-recipe.test.ts` — "has no Space target and no canvas inputs" |
| A Space-less Recipe still declares gates, a spec shape, a copy shape, and a copySkill | PASS | `space-less-recipe.test.ts` — "still declares zero gates, a spec shape, a copy shape, and a copySkill" |
| A Space-less Recipe's bind-media, gate, and render Phase Contracts declare empty checklists | PASS | `space-less-recipe.test.ts` — "its bind-media, gate, and render Phase Contracts declare EMPTY checklists" |

**`phase-contracts` capability:**

| Scenario | Verdict | Covering test |
|---|---|---|
| auditAuthorPhase passes/fails (character + carousel Recipes) | PASS (pre-existing, unaffected) | `phase-contract.test.ts` |
| auditBindMediaPhase fails when required slot unbound | PASS (pre-existing, unaffected) | `phase-contract.test.ts` |
| auditBindMediaPhase passes when every required slot bound | PASS (pre-existing, unaffected) | `phase-contract.test.ts` |
| auditBindMediaPhase passes vacuously for a Recipe with no canvasInputs at all (ADR-0021) | PASS | `phase-contract.test.ts` new test, "passes vacuously for a Space-less Recipe with no canvasInputs at all (ADR-0021, issue #170)" — asserts `ok: true`, `items: []` |
| auditCopyPhase enforces each Recipe's own copy shape | PASS (pre-existing, unaffected) | `phase-contract.test.ts` |

**`producer-conductor` capability:**

| Scenario | Verdict | Covering test |
|---|---|---|
| A found brand-asset/idea-pick slot binds | PASS (pre-existing, unaffected) | `bind-media.test.ts` |
| A missing required slot STOPs with the store's own message / a generic ADR-0016 message | PASS (pre-existing, unaffected) | `bind-media.test.ts` |
| A Space-less Recipe with no canvasInputs always binds ok, with nothing bound (ADR-0021) | PASS | `bind-media.test.ts` new test, "a Space-less Recipe (no canvasInputs at all) always binds ok, with nothing bound (ADR-0021, issue #170)" |
| usesSpace is true for both wired Recipes | PASS | `uses-space.test.ts` — both "is true for the wired ... Recipe" cases |
| usesSpace is false for a Space-less Recipe | PASS | `uses-space.test.ts` — "is false for a Space-less test fixture Recipe" |
| The fixture Recipe's author, copy, and save phases produce a valid, ledger-recorded Asset | PASS | `space-less-recipe-end-to-end.test.ts` — main e2e test, asserts `status: "produced"`, `spec_path` set, `copy.caption` within `copyShape.maxChars` |
| The saved Asset carries no asset_url, no asset_paths, and no pending_gate | PASS | `space-less-recipe-end-to-end.test.ts` — same test, explicit `assert.equal(..., undefined)` for all three |
| The bind-media phase resolves with nothing bound, never a crash on the absent canvas | PASS | `space-less-recipe-end-to-end.test.ts` — same test, `bindResult.bound` deepEqual `[]`, `boundSlotNames.size === 0`, `bindAudit.items` deepEqual `[]` |

### OpenSpec change faithfulness (job c)

Read `proposal.md`, `tasks.md`, and all three spec-delta files against issue #170 and ADR-0021 directly.
No misread found:

- The proposal's "What Changes" section matches the issue's "Scope" line-for-line: optional
  `Recipe.space`/`Recipe.canvasInputs`, `bindMediaSlots`/`auditBindMediaPhase` treating absent
  `canvasInputs` as zero slots, `usesSpace` as the generic signal, and empty checklists on the
  Space-bound phases mirroring News Carousel's zero-gate `gate` phase — exactly the pattern the issue
  names.
- The proposal's "Non-Goals" section correctly scopes out the real News Short Script Recipe (contract,
  Skill, registry entry), matching the issue's own "the actual recipe is a follow-up slice" line and
  ADR-0021's consequences section.
- The spec deltas' new Requirement ("A Recipe's Space target and canvas inputs are optional — a
  Space-less Recipe (ADR-0021)") is a faithful restatement of ADR-0021's Decision section — "Everything
  else a Recipe owns is unchanged and still required" is preserved verbatim in spirit and enforced by
  both the fixture (`space-less-recipe.ts`) and its test.
- No dropped acceptance criterion: all four issue ACs map 1:1 onto scenarios in the three spec-delta
  files (recipe-registry for AC1/AC4, producer-conductor for AC2, and the full-suite-green claim plus
  registry.test.ts's new scenario for AC3).
- No contradiction with CONTEXT.md/ADRs/PRD found: CONTEXT.md's "Recipe" entry (lines 114–163, checked
  directly) already documents the Space-less shape from the ADR-authoring commit, and this slice adds no
  new prose there — consistent with the proposal's "Impact" section claiming `CONTEXT.md` is untouched.
- Review offering (`isWiredRecipe`) and the Production Queue are genuinely untouched — confirmed by
  reading `registry.ts`'s full diff (only the type widening + doc comment; `getRecipe`,
  `listRecipes`, `listWiredRecipeSlugs`, `isWiredRecipe` function bodies are byte-identical) and by
  `git diff --stat` showing no changes under `src/production-queue/` or any Review-flow command file.

**Verdict: the OpenSpec change faithfully matches the issue.** No misread, no scope creep, no dropped
criterion, no contradiction with grounding docs.

### Always-rules + Magnific-fake checks

| Rule | Verdict | Evidence |
|---|---|---|
| Generate-never-publish | PASS | No publish-path code touched (`git diff --stat` shows nothing under any publish/schedule command); the new fixture's Asset is written via the same unmodified `writeAsset` (no diff to `src/asset/store.ts`) and nothing in the new code calls out to Facebook/Zoho. |
| Public-metrics-only | PASS | No metrics code touched — `git diff --stat -- src/performance/ src/commands/track-performance.ts` is empty. |
| Relative-not-absolute | PASS | No scoring/baseline code touched — this slice is registry-typing + producer-plumbing only. |
| Explicit-attribution | PASS | No `/log-post` code touched — `git diff --stat -- src/commands/log-post.ts` is empty. |
| Ledger-as-source-of-truth | PASS | The new end-to-end test writes the Asset through the SAME, unmodified `writeAsset`/`loadIdeaAssets` (`src/asset/store.ts`, zero diff) every wired Recipe already uses — no second, parallel store was introduced. |
| Magnific fake used, no live-Space calls | PASS | `grep -rn "spaces_\|creations_\|SpaceMcpPort\|FakeSpace\|FakeCarouselSpace"` across all new files (`uses-space.ts`, `uses-space.test.ts`, `space-less-recipe-end-to-end.test.ts`, `space-less-recipe.ts`, `space-less-recipe.test.ts`) returns exactly one hit — a doc-comment sentence in `space-less-recipe-end-to-end.test.ts` explaining the absence of those imports, not an actual usage. The two wired Recipes' own existing end-to-end tests (`carousel-end-to-end.test.ts`, `cast-candidates-end-to-end.test.ts`, `two-recipes-end-to-end.test.ts`) are diff-confirmed to only receive mechanical `!` assertions, still using their pre-existing `FakeSpace`/`FakeCarouselSpace` fakes exactly as before. No live `spaces_*`/`creations_*` MCP call, no credits spent, no board mutation anywhere in this slice. |

### Defect list

None. No defects found in Round 1.

### Overall

**PASS.** All four acceptance criteria are met and each maps to a real, passing test. The OpenSpec
change (proposal + spec deltas) faithfully matches issue #170 and ADR-0021, with no misread or scope
drift. The full suite (1996 tests), the docs suite (192 tests), and `openspec validate --strict --all`
(39 items) are all green, run directly by QA (not merely claimed). No live-Space calls anywhere in the
new code or tests — the Magnific-fake/hermetic-build requirement holds (trivially, since a Space-less
Recipe has no Space-interaction code path at all). All five always-rules hold. This slice is cleared to
proceed to a PR.
