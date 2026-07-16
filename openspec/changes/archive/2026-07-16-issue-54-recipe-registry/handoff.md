# Slice Handoff — issue-54-recipe-registry

> Bidirectional developer ⇄ qa channel for this slice. The developer writes the Build Report; qa appends
> a Verdict; retries append Round-N blocks. Nothing is overwritten.

## Build Report (developer)

### What changed

Slice 2 of the multi-format epic (#53–#60): introduced the **in-repo Recipe registry** (ADR-0009,
ADR-0010) — the brand-agnostic, typed definition every downstream slice (per-Asset ledger #55,
Recipe-aware queue #56, generic driver #57, per-Recipe Spec/copy #58) keys off — and wired
`/review-ideas` to pre-fill, offer, and log declines against it.

- **`Recipe` type + registry keyed by slug** (`src/recipe/registry.ts`): each Recipe declares its
  ordered **gate list**, its **Production-Spec shape** (a description plus the validator function that
  enforces it), its **copy shape** (length/emoji constraints), and its **Space target** (id + name)
  **plus the on-canvas node names it touches** (Spec-input node, pinned-reference node, cast/clip
  run-point names). `getRecipe(slug)`/`listRecipes()`/`listWiredRecipeSlugs()`/`isWiredRecipe(slug)` are
  the read API — `isWiredRecipe` is the **single, sole gate** for whether a Recipe is ever offered.
- **Seeded with exactly ONE entry — "Character Explainer with Cast"** — reproducing today's wired path
  byte-for-byte: its `specShape.validate` **is** (reference equality) `production-spec/validate.ts`'s
  `validate`; its `copyShape` constants **are** `production-spec/contract.ts`'s
  `MAX_POST_COPY_CHARS`/`MIN_POST_COPY_EMOJIS`/`MAX_POST_COPY_EMOJIS`; its Space node names **are**
  `space-driver/driver.ts`'s `JSON_MASTER_NODE_NAME`/`CHARACTER_NODE_NAME`; its cast/clip run-point
  names are read from the SAME `execution-protocol/protocol.ts`'s `canonicalProtocol()` the driver
  already runs. Nothing is duplicated/re-typed — every fact the Recipe declares is a reference to (or
  value-equal to) the existing, already-tested source of truth, so the registry cannot silently drift
  from what actually runs. **No existing production module was modified**: `contract.ts`, `validate.ts`,
  `generate.ts`, `compose.ts`, `protocol.ts`, `parse.ts`, `driver.ts`, `queue.ts`, `scheduler.ts`,
  `store.ts` (production-queue) are all byte-for-byte unchanged (confirmed by `git diff --stat`, zero
  lines).
- **Pure Recipe-offering/selection module** (`src/recipe/offer.ts`): `offeredRecipes(defaultRecipes)`
  filters a Format's `default_recipes` down to WIRED slugs only; `resolveRecipeSelection(defaultRecipes,
  requested)` resolves the Operator's final conversational choice into `{ chosen, declined,
  ignoredUnwired }` — an unwired Recipe is never added to `chosen`, even on explicit request.
- **Ledger gains `recipes` / `declined_recipes` on the Idea record** (`src/ledger/ledger.ts`):
  `applyIdeaRecipeSelection` (pure) + `writeIdeaRecipeSelection` (thin write shell), mirroring the
  existing `applyIdeaCast`/`writeIdeaCast` shape exactly. `declined_recipes` reasons are stored
  **verbatim** — mirrors `rejection_reason` (logged only, v1 does not auto-apply it).
- **`/review-ideas` wired** (`.claude/commands/review-ideas.md`): at ACCEPT, loads the Idea's Format,
  pre-fills the offered (wired-only) Recipes from its `default_recipes`, lets the Operator trim/extend
  conversationally (an unwired Recipe is refused even on explicit request), resolves the final
  selection, logs every declined Recipe's reason verbatim, THEN proceeds with `status: accepted` +
  `enqueueOnAccept` **exactly as before** — that call is stated as byte-for-byte unchanged and is only
  skipped in the brand-new edge case where the Operator declines every offered Recipe and names no
  replacement (nothing to produce yet; not a regression of today's always-one-Recipe reality, since that
  state could not exist before this slice).

### Files touched

**New:**
- `src/recipe/registry.ts` — the `Recipe` type + seeded registry.
- `src/recipe/registry.test.ts` — 10 tests (registry lookups; the seeded Recipe's gates/spec-shape/
  copy-shape/Space-target/node-names, each asserted against the REAL source-of-truth constant/function).
- `src/recipe/offer.ts` — `offeredRecipes`/`resolveRecipeSelection` (pure).
- `src/recipe/offer.test.ts` — 11 tests (offering, pre-fill/keep/decline, unwired-request handling,
  dedup, an unwired default is never "declined" since it was never offered).
- `src/recipe/review-docs.test.ts` — 12 tests pinning the `/review-ideas` Recipe-offering requirements
  (a regular `.test.ts`, not `.docs-test.ts` — mirrors `format-docs.test.ts`'s precedent: this behavior
  IS the acceptance criterion, not incidental doc conformance).
- `openspec/changes/issue-54-recipe-registry/{proposal.md,tasks.md,handoff.md,specs/recipe-registry/spec.md}`.

**Modified:**
- `src/ledger/ledger.ts` (+`ledger.test.ts`, +7 tests) — additive `LedgerDeclinedRecipe`,
  `LedgerIdeaWithRecipes`, `applyIdeaRecipeSelection`, `writeIdeaRecipeSelection`. Every pre-existing
  export is untouched.
- `.claude/commands/review-ideas.md` — step 3 (presentation) now mentions the pre-filled Recipe(s);
  step 5 (ACCEPT) gains the pre-fill/offer/trim-extend/decline/write sequence ahead of the pre-existing
  `status: accepted` + `enqueueOnAccept` call; the Guardrails section restates "only wired Recipes are
  ever offered" and "declined Recipes are logged verbatim".
- `src/format/store.ts` — one doc-comment update on `FormatFile.defaultRecipes` (no type/behavior
  change): now says the registry exists and filters offers at `offer.ts`'s offer time, not that the
  registry is unwired.
- `data/brands/mundotip/formats/life-hacks.yaml`, `data/brands/straw-motion/formats/unhypped-news.yaml`
  — matching one-line comment update above `default_recipes:` (the YAML values themselves are
  unchanged).

**Not touched (see proposal.md's Non-Goals):** `src/production-spec/**`, `src/execution-protocol/**`,
`src/space-driver/**`, `src/production-queue/**`, the ledger's pre-existing
`applyIdeaCast`/`writeIdeaCast`/`applyIdeaAsset`/`writeIdeaAsset`/status-write functions, `producer.md`,
`CLAUDE.md`, `CONTEXT.md` (already documents the target Recipe model from PR #61).

### How to run

```bash
npm test                     # tsc -p tsconfig.json --noEmit  +  node --import tsx --test "src/**/*.test.ts"
npm run build                # tsc -p tsconfig.build.json (exit 0)
npx openspec validate issue-54-recipe-registry --strict

# just this slice:
node --import tsx --test "src/recipe/*.test.ts"
node --import tsx --test "src/ledger/ledger.test.ts"
node --import tsx --test "src/format/*.test.ts"   # confirms issue #53's suite is unaffected
```

Full suite: **795 tests / 236 suites, all passing** (was 755/226 before this slice — +40 tests: 10 in
`registry.test.ts`, 11 in `offer.test.ts`, 12 in `review-docs.test.ts`, 7 new in `ledger.test.ts`).
Type-check (`tsc --noEmit`) and `npm run build` both exit 0. `openspec validate --strict` → valid.

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proven by |
|---|---|---|
| 1 | A `Recipe` type + registry keyed by slug; each Recipe declares gates + spec-shape + copy-shape + Space target (+ node names) | `src/recipe/registry.ts` (`Recipe`, `RecipeSpaceTarget`, `RecipeSpaceNodes`, `RecipeSpecShape`, `RecipeCopyShape`); `registry.test.ts`'s "The seeded Recipe declares gates + spec-shape + copy-shape + Space target" describe block (6 tests) |
| 2 | Seeded with exactly ONE entry — "Character Explainer with Cast" — reproducing today's behaviour exactly (zero behaviour change; spec shape + protocol + cast/clip gates unchanged) | `registry.test.ts`'s "registers exactly one Recipe" test (`listWiredRecipeSlugs()` deep-equals a 1-element array); the 6 AC1 tests assert the Recipe's `specShape.validate`/Space node names/run-point names are the SAME (reference/value equality) as the real `validate.ts`/`driver.ts`/`protocol.ts` exports — proving no drift; `git diff --stat -- src/production-spec/ src/execution-protocol/ src/space-driver/ src/production-queue/` → **0 lines changed**, confirming zero behaviour change to the wired path |
| 3 | `/review-ideas` pre-fills the Idea's Format `default_recipes`; the Operator trims/extends; only wired recipes are offered; declined recipes are logged verbatim | `src/recipe/offer.test.ts` (pure pre-fill/trim/extend/decline logic, 11 tests); `src/recipe/review-docs.test.ts`'s "pre-fills Recipes..." (3 tests) and "logs declined Recipes verbatim..." (3 tests) describe blocks pin the prompt text; `src/ledger/ledger.test.ts`'s `writeIdeaRecipeSelection` "declined reasons are stored VERBATIM" test proves the write path |
| 4 | An unwired Recipe is never offered | `offer.test.ts`'s "never offers an unwired slug" / "an Operator request for an unwired Recipe is never added to chosen" / "requesting ONLY an unwired Recipe..." tests (AC4 directly); `registry.test.ts`'s "getRecipe returns null for an unregistered slug" / "isWiredRecipe is true only for the seeded slug"; `review-docs.test.ts`'s "offers only WIRED Recipes" describe block (4 tests) pins that the prompt refuses an unwired Recipe even on explicit request |
| 5 | Built test-first against the fake; single-recipe path green; strict validate + suite green | Every new module was written test-first (tests committed alongside the implementation, run red→green during development — see Self-review notes); `git diff --stat` shows zero changes to any Magnific-fake-backed module (`space-driver/**`, `production-spec/**`, `production-queue/**`) — those suites are untouched and still pass as part of the 795; `npx openspec validate issue-54-recipe-registry --strict` → valid; `npm test` → 795/795 |

Every task in `tasks.md` is checked off with the test(s) that satisfy it named inline.

### Fakes / fixtures used

- **The Magnific fake is NOT invoked by this slice at all.** No code added or changed here touches
  `src/space-driver/**`'s `FakeSpace`/`SpaceMcpPort`, and no test in `src/recipe/**` or the
  `ledger.test.ts` additions constructs one. `grep -rn "spaces_\|creations_\|FakeSpace\|MagnificSpace"
  src/recipe/` → no matches. The registry only *references* exported constants/functions from
  `production-spec`/`execution-protocol`/`space-driver` (e.g. `JSON_MASTER_NODE_NAME`,
  `canonicalProtocol()`) — it never calls a live or fake Space operation. No live `spaces_*`/
  `creations_*` calls, no credits, no board mutation anywhere in this slice's diff.
- The existing Magnific-fake-backed suites (`space-driver/**`, `production-spec/**`,
  `production-queue/**`, 263+ tests) are unchanged (0-line diff) and still pass as part of the 795-test
  full suite — proving "the single-recipe path stays green."
- Filesystem fixtures: `mkdtemp`/temp directories for the new `ledger.test.ts` `applyIdeaRecipeSelection`/
  `writeIdeaRecipeSelection` describe blocks (mirrors the existing `writeIdeaCast` test convention).
  `production-spec/fixtures/specs.ts`'s `validSpec()` fixture is reused (not duplicated) to exercise the
  seeded Recipe's `specShape.validate` in `registry.test.ts`.
- `src/recipe/review-docs.test.ts` reads the real `.claude/commands/review-ideas.md` file (plain
  markdown text, no Space involvement) — mirrors `src/format/format-docs.test.ts`'s established pattern.

### Self-review notes

- Chose **reference equality** (`specShape.validate === validateProductionSpec`, node-name string
  equality against the driver's own exported constants, run-point names read from the SAME
  `canonicalProtocol()` call) over re-typing any of these facts as independent literals on the Recipe.
  This was the single most important design decision for the "zero behaviour change / byte-for-byte"
  bar: it makes drift between the registry's description and the actual wired path a *type/test-checked
  impossibility* rather than a discipline to maintain by hand.
- Considered validating a Format's `default_recipes` against the registry INSIDE `FormatStore` (parse
  time) instead of only at offer time (`offer.ts`). Deliberately did NOT: `FormatStore` is a dumb,
  defensive YAML parser with no dependency on `recipe/registry.ts` today, and coupling parse-time
  validation to the registry would mean a Format file could suddenly "fail to parse" if a Recipe is
  ever removed from the registry — worse than the current design, where an unwired default is simply
  filtered out (never offered) without erroring. Kept the two concerns separate, as `store.ts`'s own
  updated doc comment now states.
- Considered adding a `saveFormat`-style ledger check that blocks `/review-ideas` from re-offering an
  already-declined Recipe on a later Review pass — out of scope (there is no "re-review" flow in v1;
  each Idea is reviewed once at acceptance).
- Kept `declined_recipes`'s reason a plain string (mirrors `rejection_reason`), not a structured taxonomy
  — matches the existing Rejection Reason precedent exactly (rule 6: logged verbatim, v1 does not
  auto-apply it).
- Ran `npm test`/`npm run build`/`openspec validate --strict` after every file addition (not just once
  at the end) to catch a regression as early as possible; all green throughout.
- No dead code found to remove — every exported function/type is exercised by at least one test or is
  the intentional public read-API surface (`listRecipes`, matching the "registry keyed by slug" AC's
  implicit enumeration capability, exercised by `registry.test.ts`).

### Known limits (explicit Non-Goals — see `proposal.md`)

- **The registry is descriptive, not yet load-bearing for the driver.** `src/space-driver/driver.ts`
  still hard-codes its own node-name constants and does not read them from the Recipe; the generic
  run-until-gate driver that would actually source its behavior from a Recipe's `gates`/`space.nodes`
  is issue #57. This slice proves the registry's description matches what the driver does today
  (via reference/value equality tests) — it does not yet make the driver consume the registry.
- **`producer.md` (the attended, live-Space agent) is untouched** and still resolves its Space via
  `brand-profile.yaml`'s `production.space_id`, not the registry's `space.id` (which records the same
  value redundantly today). Re-pointing it is deferred — it is untestable without the live Space and
  is not part of this slice's zero-behaviour-change bar.
- **`FormatStore`'s `default_recipes` stays free-text/unvalidated at parse time.** Filtering to
  wired-only happens at OFFER time (`offer.ts`), not at Format-file-parse time — a hand-edited Format
  file with a stale/unwired Recipe slug parses fine; it is simply never offered at Review.
- **No per-Recipe Asset/queue grain yet.** `recipes`/`declined_recipes` sit on the Idea record (today's
  grain); the per-Recipe Asset list (ADR-0011) is issue #55, and the queue stays Idea-keyed
  (Recipe-unaware) until issue #56.
- **The registry stays seeded with exactly one entry.** A second real Recipe is issue #60.
- **`gates`/`space` model a single-gate, single-Space Recipe.** CONTEXT.md's "a Recipe drives one (or
  more) Spaces" is not exercised — `space` is a single `RecipeSpaceTarget`, matching the one seeded
  Recipe; generalizing to multiple Spaces per Recipe is deferred until a real multi-Space Recipe exists.

---

## QA Verdict — Round 1: PASS

### Suite result

- `npm test` (= `tsc -p tsconfig.json --noEmit` + `node --import tsx --test "src/**/*.test.ts"`) →
  **795 tests / 236 suites, 0 failures.** Matches the developer's claimed count; baseline before this
  slice was 755/226 (verified via `git diff --stat d96d980 f659a1e` — see below — the diff is purely
  additive, four new test files with 10+11+12+7=40 tests, so 755+40=795 checks out arithmetically).
- `npm run build` (`tsc -p tsconfig.build.json`) → **exit 0.**
- `npx openspec validate issue-54-recipe-registry --strict` → **`Change 'issue-54-recipe-registry' is valid`.**
- All three commands were actually run by qa in this session, on the checked-out branch
  `issue-54-recipe-registry` at commit `f659a1e`, working tree clean.

### Per-criterion results (issue #54 acceptance criteria)

| # | Criterion | Result | Proving test(s) |
|---|---|---|---|
| 1 | A `Recipe` type + registry keyed by slug; each Recipe declares gates + spec-shape + copy-shape + Space target (+ node names) | **PASS** | `src/recipe/registry.ts` defines `Recipe`/`RecipeSpaceTarget`/`RecipeSpaceNodes`/`RecipeSpecShape`/`RecipeCopyShape` and a `Map`-backed `REGISTRY`; `registry.test.ts`'s "declares gates + spec-shape + copy-shape + Space target" block (6 tests, lines 47-84) exercises every declared field |
| 2 | Seeded with exactly ONE entry — "Character Explainer with Cast" — reproducing today's behaviour exactly (zero behaviour change) | **PASS** | `registry.test.ts` "registers exactly one Recipe" (`listWiredRecipeSlugs()` deep-equals `["character-explainer-with-cast"]`); independently re-verified by qa: `git diff --stat d96d980 f659a1e -- src/production-spec/ src/execution-protocol/ src/space-driver/ src/production-queue/` produced **no output** (zero lines changed); `src/ledger/ledger.ts`'s diff is `76 insertions(+), 0 deletions(-)` (purely additive — no pre-existing export touched). The registry references (not duplicates) `validateProductionSpec`, `JSON_MASTER_NODE_NAME`, `CHARACTER_NODE_NAME`, and reads run-point names from a live `canonicalProtocol()` call — confirmed by reading `src/recipe/registry.ts` lines 35-48, 123-141 and cross-checking `space-driver/driver.ts:28,37` and `execution-protocol/protocol.ts:83-85` |
| 3 | `/review-ideas` pre-fills the Format's `default_recipes`; Operator trims/extends; only wired recipes offered; declined recipes logged verbatim | **PASS** | `src/recipe/offer.test.ts` (pure logic, 11 tests) + `src/recipe/review-docs.test.ts` (12 tests pinning `.claude/commands/review-ideas.md`'s actual prompt text — read in full by qa, confirms step 5 genuinely implements pre-fill → trim/extend → resolve → log-verbatim → write → enqueue-as-before) + `src/ledger/ledger.test.ts`'s "declined reasons are stored VERBATIM, never altered or summarized" test (writes a long free-text reason and asserts it round-trips unchanged) |
| 4 | An unwired Recipe is never offered | **PASS** | Genuinely enforced in code, not just documented — see "Particular attention" section below for the full trace. `offer.test.ts`'s "never offers an unwired slug" / "an Operator request for an unwired Recipe is never added to chosen" / "requesting ONLY an unwired Recipe..." |
| 5 | Built test-first against the fake; single-recipe path green; strict validate + suite green | **PASS** | `tasks.md` shows a write-tests-first task per module (1.1/1.2 before 1.3, 2.1/2.2 before 2.3, 3.1/3.2 before 3.3, 4.1 before 4.2); the Magnific-fake-backed suites (`space-driver/**`, `production-spec/**`, `production-queue/**`) are byte-for-byte unchanged and still pass as part of the 795; `openspec validate --strict` and `npm test` independently re-run green by qa (see Suite result) |

### Per-scenario results (`openspec/changes/issue-54-recipe-registry/specs/recipe-registry/spec.md`)

| Requirement | Scenario | Result | Covering test |
|---|---|---|---|
| A Recipe is a typed, in-repo registry entry keyed by slug | getRecipe returns the seeded Recipe by slug | PASS | `registry.test.ts:27-32` |
| " | getRecipe returns null for an unregistered slug, never throws | PASS | `registry.test.ts:34-38` |
| " | isWiredRecipe is the sole registration predicate | PASS | `registry.test.ts:40-44` |
| The registry is seeded with exactly one Recipe reproducing today's wired path unchanged | spec-shape validator is the real validator, not a re-implementation | PASS | `registry.test.ts:70-73` (`assert.equal(recipe.specShape.validate, validateProductionSpec)`) |
| " | Space node names match the driver's own constants | PASS | `registry.test.ts:54-60` |
| " | run-point names come from the real canonical protocol | PASS | `registry.test.ts:62-68` |
| An unwired Recipe is never offered at Review | A Format default that is not wired is filtered out of the offer | PASS | `offer.test.ts:16-20` / `28-32` |
| " | An Operator request for an unwired Recipe is never added to chosen | PASS | `offer.test.ts:49-53` |
| default_recipes are pre-filled at Review; declined Recipes logged verbatim | Keeping the pre-filled default results in nothing declined | PASS | `offer.test.ts:36-41` |
| " | Declining the only offered Recipe logs it, reason stored verbatim | PASS | `ledger.test.ts:540-558` |
| " | writeIdeaRecipeSelection preserves unrelated ledger fields | PASS | `ledger.test.ts:500-538` (asserts sibling Idea `idea-B` and target's `title`/`baseline.note` unchanged) |
| The wired production path is unchanged by this slice | Accepting an Idea with the default Recipe kept enqueues exactly as before | PASS | `review-docs.test.ts:94-98` (prompt-conformance: pins that `enqueueOnAccept` is called byte-for-byte unchanged) — qa notes this scenario is proven at the **prompt-conformance** level, not by an executable integration test, because `/review-ideas` has no compiled TS runtime (consistent with the rest of the slice's approach and with issue #53's precedent) |
| " | Declining every offered Recipe accepts the Idea without enqueueing production | PASS | `review-docs.test.ts:100-104` (prompt-conformance, same caveat as above) |

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | `grep -rn "publish\|Facebook" src/recipe/` → no matches; no production/publish code touched (confirmed by the zero-diff on `production-spec/`, `execution-protocol/`, `space-driver/`, `production-queue/`) |
| Public-metrics-only | PASS | This slice touches no Apify/metrics code path; not applicable, nothing to violate |
| Relative-not-absolute | PASS | Not touched; no scoring/comparison code in this slice |
| Explicit-attribution | PASS | Not touched; Post↔Idea `post_url` attribution code untouched |
| Ledger-as-source-of-truth | PASS | `applyIdeaRecipeSelection`/`writeIdeaRecipeSelection` (`src/ledger/ledger.ts:351-401`) mirror `applyIdeaCast`/`writeIdeaCast`'s exact shape: load full ledger → map only the target Idea → preserve every other field → atomic write. `declined_recipes` is written but never read back anywhere else in the codebase (`grep -rn "declined_recipes\|declinedRecipes" src --include="*.ts"` shows only definition/write-site references, confirming it is genuinely logged-only, never influencing future offers) |
| Magnific fake used / no live-Space calls | PASS | `grep -rn "spaces_\|creations_\|FakeSpace\|MagnificSpace" src/recipe/ src/ledger/ledger.ts src/ledger/ledger.test.ts` → no matches; independently re-ran across the FULL slice diff: `git diff d96d980 f659a1e --name-only \| xargs grep -l "spaces_\|creations_"` → only doc prose in `handoff.md`/`proposal.md` (describing the rule, not calling anything), zero code matches. No `spaces_*`/`creations_*` MCP call, no credits, no board mutation anywhere in this slice |

### Particular-attention checks (per qa's brief)

**Zero-behaviour-change bar** — independently verified, not taken on the developer's word:
`git diff --stat d96d980 f659a1e -- src/production-spec/ src/execution-protocol/ src/space-driver/ src/production-queue/`
produced no output at all (zero files, zero lines). `src/ledger/ledger.ts`'s diff is `76 insertions(+),
0 deletions(-)` — purely additive, every pre-existing export (`applyIdeaCast`, `writeIdeaCast`,
`applyIdeaAsset`, `writeIdeaAsset`, `writeIdeaStatus`, etc.) is byte-for-byte untouched. The registry
genuinely *references* the real source of truth rather than duplicating it: `specShape.validate` is
literally the same function object as `production-spec/validate.ts`'s exported `validate` (proven by
`===` reference equality in `registry.test.ts:71`, not just value-equality); `space.nodes.specInput`/
`pinnedReference` are the same string constants `space-driver/driver.ts` exports
(`JSON_MASTER_NODE_NAME`/`CHARACTER_NODE_NAME`, confirmed at `driver.ts:28,37`); `castRunPoint`/
`clipRunPoint` are read from a live call to `canonicalProtocol()` (`execution-protocol/protocol.ts`) at
module-load time rather than re-typed as string literals — so the registry structurally cannot drift.

**"Only wired recipes offered" / "an unwired Recipe is never offered"** — genuinely enforced in code,
not merely documented. Traced the full call path:
- `isWiredRecipe(slug)` (`registry.ts:207-209`) is a pure `REGISTRY.has(slug)` check — the single
  source of truth for "is this a real Recipe."
- `offeredRecipes(defaultRecipes)` (`offer.ts:32-43`) partitions a Format's `default_recipes` into
  `offered` (wired) and `unwired` — an unwired slug is *structurally excluded* from `offered`, not
  filtered by convention.
- `resolveRecipeSelection(defaultRecipes, requested)` (`offer.ts:71-92`) re-checks `isWiredRecipe` on
  every entry of the Operator's `requested` list too — so even if the Operator explicitly asks for an
  unwired slug by name, it is routed to `ignoredUnwired` and never reaches `chosen`. This closes the
  gap a weaker implementation might have (trusting `requested` without re-validation).
- **What happens when a Format's `default_recipes` names a slug not in the registry:** it is **dropped
  silently** (appears in `offeredRecipes(...).unwired`, never in `.offered`) — it does NOT throw or
  error. qa confirms this is the right behaviour per the issue: AC4 says "never offered," not "the
  system errors" — a hand-edited or stale Format file should degrade gracefully (skip the unavailable
  Recipe) rather than break the whole Review flow for an Idea. The developer's self-review notes
  (handoff.md, "Self-review notes") explicitly considered and rejected parse-time validation for the
  same reason. This matches ADR-0010's framing of `isWiredRecipe`/`getRecipe` as "never throw."
- The `/review-ideas.md` prompt-level enforcement is additionally pinned by `review-docs.test.ts`
  (asserts the literal guardrail text and the refusal-on-explicit-request language exist in the
  shipped prompt) — qa read `.claude/commands/review-ideas.md` in full and confirms the prompt text
  genuinely implements the offer.ts contract (step 5.1-5.3) rather than merely asserting a claim in
  prose disconnected from the underlying pure functions.

**Declined recipes logged verbatim** — confirmed the reason string is stored unmodified: `applyIdeaRecipeSelection`
/`writeIdeaRecipeSelection` copy `declinedRecipes` entries via `{ ...d }` (`ledger.ts:362,392`) with no
transformation, and `ledger.test.ts:540-558` proves a realistic multi-sentence reason round-trips
byte-for-byte through a real file write/read. Confirmed **logged-only**: `declined_recipes` is written
in exactly two places (`applyIdeaRecipeSelection`, `writeIdeaRecipeSelection`) and read in zero
production code paths — `offeredRecipes`/`resolveRecipeSelection` never consult the ledger's
`declined_recipes` history, so a previously-declined Recipe is offered again on a later Idea/Run exactly
as any other wired Recipe would be (the developer's self-review notes explicitly flag this as an
intentional v1 limitation, consistent with always-rules #6's "v1 does not auto-apply").

**Ledger writes (`applyIdeaRecipeSelection`/`writeIdeaRecipeSelection`) vs `applyIdeaCast`/`writeIdeaCast`
conventions** — read both pairs side by side (`ledger.ts:351-401` vs `425-463`): identical shape —
a pure `applyX` that maps only the target Idea and passes every other record through unchanged, plus a
thin `writeX` shell that reads the raw JSON, patches only the matching record via `isObject(record) &&
record.id === ideaId`, no-ops for an unknown id (`if (!changed) return`), and writes back with
`writeFileAtomic` preserving all other top-level fields (`{ ...raw, ideas }`). This is a faithful mirror,
not a reinvention, and correctly preserves ledger-as-source-of-truth.

### Faithfulness to the issue and ADR-0009/ADR-0010

Read the issue, both ADRs, and the OpenSpec change (`proposal.md`, `tasks.md`,
`specs/recipe-registry/spec.md`) side by side. The spec deltas trace cleanly back to the issue text and
to ADR-0009/0010's decisions (Recipe = in-repo, brand-agnostic, keyed by slug, owns gates/spec-shape/
copy-shape/Space-target+nodes; seeded with exactly one entry; `/review-ideas` pre-fills/offers/logs
declines). No misread or self-consistent-but-wrong spec found — the change does not encode anything the
issue did not ask for, and does not drop or contradict a required criterion. `CONTEXT.md` already
documents the target end-state (from PR #61) and this slice's incremental scope (single Recipe, Idea-grain
ledger fields, driver not yet Recipe-consuming) is explicitly and honestly called out as Non-Goals rather
than silently glossed over — consistent with issue #53's precedent for incremental multi-format slices.

One paperwork inconsistency found (see Defect list, low severity, non-blocking): `tasks.md` line 60
says "ADDED `recipe-registry`, MODIFIED `brand-commands`" but no `brand-commands` spec delta file exists
in this change, and `proposal.md`'s Capabilities section correctly explains why (`brand-commands` has no
dedicated Requirement for `/review-ideas`' Recipe behavior to modify) — the actual change is internally
consistent and `openspec validate --strict` passes; only the stray `tasks.md` line is stale.

### Defect list

| # | Severity | What's wrong | Repro |
|---|---|---|---|
| 1 | low | `tasks.md` line 60 ("5.1 Author proposal.md, this tasks.md, and spec deltas: ADDED `recipe-registry`, MODIFIED `brand-commands`.") claims a MODIFIED `brand-commands` spec delta that was never authored — no `openspec/changes/issue-54-recipe-registry/specs/brand-commands/` directory exists, and `proposal.md`'s own Capabilities section explains `brand-commands` is deliberately NOT modified. This is a stale/inaccurate line in `tasks.md`, not a functional defect — `openspec validate --strict` passes regardless (validation only checks delta files that exist) and no code or spec behaviour is affected. | Read `openspec/changes/issue-54-recipe-registry/tasks.md` line 60 and compare against `find openspec/changes/issue-54-recipe-registry/specs -type d` (only `recipe-registry` exists) and `proposal.md`'s "Capabilities" section (states `brand-commands` is NOT modified). |

No other defects found. This single low-severity documentation nit does not block the pass verdict —
it is a leftover line from drafting, not a functional or spec-faithfulness problem, and does not affect
any acceptance criterion, always-rule, or the zero-behaviour-change bar.

### Verdict rationale

All three jobs are satisfied: (a) the full suite, build, and strict validate are actually green,
independently re-run by qa on the checked-out commit; (b) every acceptance criterion maps to a real,
passing test that genuinely exercises it (AC4 in particular is enforced in code at two independent
choke points — `offeredRecipes` and `resolveRecipeSelection` — not merely asserted in prose); (c) the
OpenSpec change faithfully matches the issue and ADR-0009/ADR-0010, with only one low-severity stale doc
line found. The zero-behaviour-change bar is independently confirmed via `git diff --stat` on the
protected directories (empty output) and reference-equality tests against the real source-of-truth
exports. No live Magnific Space calls anywhere in the diff. All five always-rules hold.

**QA Verdict — Round 1: PASS.**
