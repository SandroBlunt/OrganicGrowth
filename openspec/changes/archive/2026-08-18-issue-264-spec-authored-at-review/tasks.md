# Tasks — issue #264: Production Spec authored at Review

Test-first throughout: write the failing test, then the code that passes it. All Space interaction goes
through the existing Magnific fakes (`FakeCarouselSpace`, `FakeSpace`) — never the live Space.

## 1. Recipe registry gains a typed `producerSkill` field

- [x] Add `producerSkill: string` to the `Recipe` interface (`src/recipe/registry.ts`), documented
      alongside the existing `copySkill` field.
- [x] Set it on all three registry entries: `character-explainer-with-cast` ->
      `"produce-character-explainer"`, `news-carousel` -> `"produce-news-carousel"`,
      `news-short-script` -> `"produce-news-short-script"` (matching the real `.claude/skills/produce-*`
      directories already on disk).
- [x] Set it on the throwaway, NOT-wired `SPACE_LESS_TEST_RECIPE` fixture
      (`src/recipe/fixtures/space-less-recipe.ts`) so the type stays satisfied.
- [x] Extend `src/recipe/registry.test.ts` to assert each wired Recipe's `producerSkill`.

## 2. Deterministic Spec authors — one per wired Recipe

- [x] `src/production-spec/news-carousel-generate.ts`: `generateNewsCarouselSpec(brief): NewsCarouselSpec`
      — deterministic (no model call, no I/O, no clock), always produces exactly 7 slides in fixed role
      order that pass `validateNewsCarouselSpec`. Test-first: `news-carousel-generate.test.ts`.
- [x] `src/production-spec/news-short-script-generate.ts`:
      `generateNewsShortScriptSpec(brief): NewsShortScriptSpec` — deterministic, hook -> 1 story beat ->
      cta, total word count inside `[MIN_TOTAL_WORDS, MAX_TOTAL_WORDS]`, passing
      `validateNewsShortScriptSpec`. Test-first: `news-short-script-generate.test.ts`.
- [x] Reuse the existing `src/production-spec/generate.ts`'s `generate` unchanged as the
      `character-explainer-with-cast` Recipe's default author (it already satisfies `validate.ts`).

## 3. `authorSpecForRecipe` — author + self-check in one call

- [x] `src/production-spec/author-at-review.ts`: `SpecAuthor` type (mirrors `CopyDrafter`),
      `DEFAULT_SPEC_AUTHORS` map (recipe slug -> deterministic author), and `authorSpecForRecipe(recipe,
      brief, bannedWords, authors?)` — authors a candidate Spec then runs the EXISTING
      `auditAuthorPhase` (`src/recipe/phase-contract.ts`) against it, returning `{ ok: true, spec, audit
      }` or `{ ok: false, audit }`. Never throws for an unregistered author — returns a failed audit
      instead (defensive; every wired Recipe has one by construction, checked by a test). Test-first:
      `author-at-review.test.ts` — covers all three Recipes' happy path AND a forced banned-word failure.

## 4. Command surface: the Production Spec's SQL write + its generated file view

- [x] `src/command-surface/production-spec.ts`: `saveAssetSpec(db, assetId, spec, now?)` (wraps
      `production-spec/store.ts`'s SQL-backed `saveProductionSpec` — its first production caller) and
      `refreshSpecFile(db, assetId, path)` (reads the Spec back off SQL via `loadProductionSpec`, then
      writes it to `path` via the file-backed `saveSpec` — a GENERATED VIEW, never independently
      authored). Both live inside `src/command-surface/`, so the store-write-boundary guard needs no new
      allow-list entry. Export both from `src/command-surface/index.ts`. Test-first:
      `production-spec.test.ts`.

## 5. `acceptIdeaCommand` authors before either queue is written

- [x] For each chosen Recipe, BEFORE calling `enqueueOnAccept`: build a minimal `Brief` from the ledger
      Idea's own `run`/`title`, load the Brand's banned words (`loadBannedWords`), and call
      `authorSpecForRecipe`. A failing Recipe is reported loudly in the returned message and dropped from
      the set passed to `enqueueOnAccept` — never enqueued into `data/queue.json` or the SQL `job` table.
      The Idea's full chosen Recipe set (per the Operator's actual decision) is still recorded on the
      ledger via the unchanged `writeIdeaRecipeSelection` call.
- [x] After `enqueueOnAccept` returns a `result.sql` (SQL sync succeeded), for each newly-enqueued
      Recipe: persist its authored Spec via `saveAssetSpec`, then regenerate the on-disk file view via
      `refreshSpecFile` at `specPathFor(...)` (cadence resolved best-effort from the Idea's Format,
      defaulting to `"weekly"` — never blocking the accept over a Format-file read problem).
- [x] Extend `src/commands/accept-idea.test.ts`: the existing regression tests stay green unmodified
      (proves this is additive, not a behavior break for the already-covered paths); new tests cover a
      successful authored accept (SQL asset carries the Spec, the file view matches it byte-for-byte),
      and a forced authorship failure (banned word in the Idea's title) blocking that Recipe's accept —
      loud message, zero jobs enqueued in either queue, ledger still records the Idea `accepted`.

## 6. `.claude/agents/producer.md` — Producer reads, never authors

- [x] Rewrite the "Author phase" section: remove the instruction to load a Recipe's producer Skill and
      author a Spec; replace it with reading the Spec Review already saved for this (Idea, Recipe) — via
      the SQL-backed `loadProductionSpec` for the unattended worker's own path (unchanged code) and the
      file-backed Spec for the attended Producer's own path — then proceeding straight to Bind/Watermark/
      Drive-the-canvas. `auditAuthorPhase` still runs, as defense-in-depth confirmation that the Spec
      Review produced is well-formed, never as the primary authorship-catch.
- [x] Update `src/production-spec/producer-agent.docs-test.ts` so its assertions match the rewritten
      prose (the "runs the Recipe's own producer Skill... never authoring prompts itself" framing no
      longer applies to the Producer; `producerSkill`/ADR-0031 are cited instead).

## 7. `.claude/commands/review-ideas.md` — documents the new accept-time authorship

- [x] Add a short note (without touching any of the existing pinned strings `review-docs.test.ts`
      asserts on) that accepting now authors + self-checks each chosen Recipe's Spec as part of the SAME
      `npm run accept-idea` call, and that a failed authorship check is relayed to the Operator verbatim,
      exactly like a SQL sync failure already is — no job is enqueued for that Recipe.

## 8. End-to-end proof: accept -> unattended `drainQueue` -> produced, zero attended session

- [x] A new test (`src/commands/accept-to-produced-e2e.test.ts` or similar) that: seeds a throwaway SQL
      database (Brand, Format, Brand Asset `brand-logo`), calls the REAL `acceptIdeaCommand` for the
      zero-gate News Carousel Recipe, then drives the SQL job queue purely through the REAL
      `drainQueue` (`src/commands/run-worker.ts`) against `FakeCarouselSpace` — never calling `runOneJob`
      by hand — asserting the job reaches `done` and the Asset reaches `produced`, with its media and
      Copy Variant saved. The test's own console/log output (or an explicit transcript captured in the
      test) is pasted into the Build Report as the required proof.
- [x] A companion test proves the *Character Explainer with Cast* Recipe (one declared gate) still parks
      at `awaiting_pick` through the SAME `acceptIdeaCommand` -> `drainQueue` path — never rendering past
      its Cast gate.
- [x] A companion test proves the attended Producer's own path (`runOneJob`/`driveToNextGate` driven
      directly, mirroring `carousel-end-to-end.test.ts`) completes correctly reading a Spec that
      `acceptIdeaCommand` already authored — never authoring its own, and its result is unaffected by a
      Spec already existing when it starts.
- [x] A test deliberately breaks authorship (a banned word forced into the Idea's title) and proves the
      failure is loud and visible at accept time (a matched message in the returned string), never a
      silently empty/partial Spec reaching the queue.

## 9. Close out

- [x] `openspec validate --strict` green.
- [x] Full suite (`npm test`) green.
- [x] Self-review / simplify pass — dead code removed, module boundaries tight, every acceptance
      criterion mapped to a specific test.
- [x] Write the Build Report into `handoff.md`.
