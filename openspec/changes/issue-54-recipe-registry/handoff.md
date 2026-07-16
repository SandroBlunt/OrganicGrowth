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
