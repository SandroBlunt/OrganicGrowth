## Why

Issue #202 ("every store swaps files for SQL, and the Idea finally gets one") was split at triage into
two tickets of very different shape: #222 (merged — the wide, mechanical file-to-`{ db }` substitution
across six already-existing stores, plus the shared `withTransaction` helper) and this one, #223 — the
deep, genuinely new half. Idea is where agents hand-edit JSON today, and it is the entity all three of
epic #195's questions are actually about. Two of its fields are what make those questions answerable at
all: `hook_type`/`theme` stop being free prose (today: two different spellings of a "Hook concept"
markdown heading across two Brands), and an Idea records **why** its Fit Score prediction was what it
was — `relevance`, `momentum`, `brand_fit` alongside the composite `fit_score`, so a wrong prediction can
be inspected, not just observed.

## What Changes

- **A brand-new `IdeaStore` (`src/idea/store.ts`), `{ db }`-only from the start** — there is no
  pre-existing `{ ledgerPath }`-taking "Idea store" to bridge via an overload (unlike `AssetStore` in
  #222): `src/ledger/ledger.ts`'s existing Idea reads/writes stay exactly as they are, untouched, and
  remain the one real production callers actually use. `IdeaStore` follows the SAME plain
  `(db: DatabaseSync, ...)` positional-argument convention #222's other genuinely-new stores established
  (`src/brand/store.ts`, `src/channel/store.ts`, `src/copy/store.ts`) — not the overload-bridge shape,
  which only exists where a real prior `{ ledgerPath }` API had to keep compiling.
  - `createIdea` — requires `hookType` and `theme`, validated against the closed vocabularies
    (`isHookType`/`isTheme`, `src/vocabulary/`) **before** any write, throwing a clear
    `IdeaValidationError` naming every legal value — not merely relying on the schema's own FK to reject
    a bad value with a raw SQLite error. `unclassified` passes this check like any other closed-vocabulary
    member (issue #219): the store enforces "is this ONE OF the eleven/ten values", not "is this a real,
    classified value" — that second, stronger judgment belongs to the classifier (#206), never to this
    store. Always creates the Idea at `status: 'suggested'` (CONTEXT.md: an Idea is always suggested
    before Review).
  - `getIdea`/`listIdeasForRun` — null-for-unknown / `[]`-for-none reads, never throw.
  - `acceptIdea`/`rejectIdea` — the two Review outcomes (CONTEXT.md "Review": "the gate between a
    `suggested` and an `accepted` Idea"). Both guard the CURRENT status is `suggested` (an Idea already
    decided cannot be re-decided through this path) and throw a clear, named error otherwise, changing
    nothing. `rejectIdea` requires a non-blank `rejectionReason` (CONTEXT.md "Rejection Reason" — always
    captured, logged verbatim).
  - `selectIdeaRecipes` — the Recipe-selection half of Review, writing every OFFERED Recipe's
    `idea_recipe` row (chosen or declined) inside ONE transaction (`withTransaction`, #222): a declined
    item without a non-blank `declineReason` is rejected before any row is written; an unwired
    `recipe_slug` is rejected by the schema's own FK (same convention `AssetStore`'s `{ db }` branch
    already uses for `recipe_slug`, #222). A failure on any item in the batch leaves NOTHING behind —
    proven directly, mirroring `upsertCopyVariants`'/`addAssetMediaBatch`'s own atomicity proofs.
  - `listIdeaRecipes` — reads every offered-Recipe row for one Idea back.
- **A brand-new, minimal `TrendStore` (`src/trend/store.ts`), `{ db }`-only** — #202's own acceptance
  criteria names Trend's `source_urls`/`platform`/`is_paywalled` fields directly alongside Idea's, and no
  other ticket in the epic (#197–#212, audited via `gh issue list`) claims a Trend store; `idea.trend_id`
  also needs a real row to reference in any test that exercises it. Minimal and read-oriented:
  `createTrend`, `getTrend`, `listTrendsForRun` (ordered `momentum DESC` then `created_at ASC` — SQLite's
  own NULL-sorts-first-in-ASC rule puts a momentum-less Trend last in DESC order, with no special-casing
  needed), and `listBriefableTrends` (`WHERE is_paywalled = 0`) — the literal "make an unbriefable Trend
  **visible**" ask: a caller can now select the openly-readable subset by a WHERE clause instead of
  re-deriving the Operator's 2026-08-11 paywall rule from memory every time (`.claude/agents/trend-
  scout.md`/`idea-strategist.md`'s existing prose versions of the same rule are untouched — this ticket
  makes the fact queryable, it does not touch or duplicate the agents' own wording).
- **A considered, DELIBERATE non-decision, stated explicitly**: `createIdea` does NOT block/refuse when
  given a paywalled Trend's id. The AC's own sentence — "a Trend records ... an `is_paywalled` flag, so
  the openly-readable-source rule is enforced by data rather than by prose" — reads, on the most literal
  parse, as "the DATA (the flag) is what makes enforcement POSSIBLE", not "this store must itself refuse
  the write". The ticket's own follow-up section asks only to make an unbriefable Trend **visible**, the
  word actually used, never "blocked" or "rejected". Deciding whether/when to actually brief a paywalled-
  only Trend is idea-strategist's editorial judgment (already documented Operator prose,
  `idea-strategist.md` line 70), not a hard database constraint this store would need a NEW migration
  (MIGRATION_1's `idea` table carries no CHECK tying `trend_id` to `trend.is_paywalled`) to enforce.
  `listBriefableTrends` gives any future caller (idea-strategist, or #204's importer) the query it needs
  to honor the rule without the store dictating editorial policy.
- **Rule 7** (`.claude/rules/always/organicgrowth-rules.md`) and its docs-conformance check
  (`src/db/adr.docs-test.ts`) gain "Idea" to the list of `{ db }`-backed stores, and the forward-pointer
  to "issue #223 and later" is corrected to point at the one thing that is genuinely still later: #204's
  one-shot importer, which is what will actually wire a real production caller onto SQL. `ledger.json`
  stays the source of truth the live pipeline reads/writes — this ticket does not change that.
- **`openspec/project.md`'s "Tech stack" section** (stale since #222 merged, verified by `git log`: #222
  never touched this file) is corrected to state accurately that six stores were already SQL-backed
  before this ticket, and Idea/Trend are added by it — a small, low-risk factual fix while in the
  neighborhood, not new scope.

## Known gaps, decided, not dropped

- **No caller above the store boundary changes shape.** `src/ledger/ledger.ts` (`loadIdeas`, `findIdea`,
  `applyIdeaRecipeSelection`, `writeIdeaRecipeSelection`, `loadReport`, `loadBaseline`/`writeBaseline`)
  is completely untouched — verified by `git status`/`git diff` showing zero changes to that file or its
  test suite. No SQL table holds real production data (the one-shot importer, #204, has not run — #222's
  own QA verdict already confirmed this same fact holds for the six stores it landed), so there is
  nothing to migrate and no production caller that could legally be rewired onto `IdeaStore` yet: doing
  so would either point a real command at an empty `idea` table or force an unwanted half-migrated
  dual-write nobody asked for. Wiring real callers over is #204's job, not a side effect of this one.
- **No `RunStore` is built.** `idea`/`trend` both carry a required `run_id` FK, but no ticket in the epic
  names a Run store, and this ticket's own tests seed a `run` row directly via raw SQL — the SAME
  fixture-seeding convention `src/db/schema.test.ts` and #222's `src/asset/db-store.test.ts` already
  established for `run`/`format`/`brand` rows a test needs but does not itself own.
- **No range/shape validation on `fit_score`/`relevance`/`momentum`/`brand_fit`.** `src/db/schema.ts`
  (frozen from #201) declares these four columns as plain nullable `REAL`, with no `CHECK` — adding one
  would need a new migration, which is out of this ticket's brief (no AC asks for it), and CONTEXT.md
  itself states "How it's computed is an open decision" for Fit Score. `IdeaStore` stores whatever
  `number` it is given, same as `createChannel`/`createBrand` store their own untyped-beyond-TypeScript
  numeric/string fields today.
- **No classification happens here.** Every `hookType`/`theme` value `createIdea` is given — including
  `unclassified` — is validated only against "is this one of the closed set's members", never guessed or
  upgraded. The backfill of the 51 readable Briefs' real Hook Type/Theme is #206's job.

## Capabilities

### Added Capabilities

- `idea-store`: `src/idea/store.ts`'s SQL-backed `idea`/`idea_recipe` CRUD — genuinely new, the entity
  epic #195 names as never having had a real store.
- `trend-store`: `src/trend/store.ts`'s SQL-backed `trend` table CRUD, including the paywall-visibility
  read (`listBriefableTrends`) — genuinely new, minimal, scoped to what `IdeaStore`'s own tests and AC4
  need.

## Impact

- **New code:** `src/idea/store.ts` (+`.test.ts`), `src/trend/store.ts` (+`.test.ts`),
  `openspec/changes/issue-223-ideastore/` (this change).
- **Modified code:** `.claude/rules/always/organicgrowth-rules.md`, `src/db/adr.docs-test.ts`,
  `openspec/project.md`, `CONTEXT.md` (two small, additive, ADR/issue-cited clarifications: Fit Score's
  three explanatory components, and Trend's `is_paywalled` data-level fact — see the spec deltas'
  Scenarios for the exact substrings pinned).
- **Untouched (deliberately):** `src/db/schema.ts`, `src/db/migrate.ts` (MIGRATION_1/MIGRATION_2 stay
  byte-for-byte frozen — this ticket adds no new migration), `src/ledger/ledger.ts` and its test suite,
  every real production module that reads/writes `ledger.json`, `src/production-queue/**` (issue #203),
  every store #222 already shipped.
- **Hermetic, no live Space or Zoho MCP calls.** Every new test opens a REAL, empty, throwaway SQLite
  file per test (`src/db/test-support.ts`'s `withTempDb`, never `:memory:`), mirroring #201/#222's own
  Testing Decisions. No `magnific`/Zoho MCP tool is imported or called by anything this slice touches —
  neither `src/idea/` nor `src/trend/` goes near `src/space-driver/`/`src/producer/`.
- **Always-rules upheld:** this slice touches no content-generation, publication, or metrics code —
  generate-never-publish/public-metrics-only/relative-not-absolute are untouched by construction.
  Explicit-attribution is unaffected (Post/attribution stay on `src/asset`/`post`, not touched here).
  Ledger-as-source-of-truth is explicitly PRESERVED: `ledger.json` stays the one thing every real
  production command actually reads/writes; `IdeaStore`/`TrendStore` are additive and unused by any of
  them until #204.
