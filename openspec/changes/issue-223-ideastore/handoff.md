# Slice Handoff — issue #223: IdeaStore, the Idea finally gets a store

Bidirectional document. developer's Build Report is below; qa appends its Verdict beneath, in a new
section — nothing here is overwritten.

## Build Report (Round 1)

### What changed

This is the "deep, genuinely new" second half of #202 (the "wide, mechanical" first half, #222, merged
and is this ticket's foundation). It gives Idea a real, typed SQL store for the first time — the entity
CONTEXT.md/epic #195 name as the one agents still hand-edit as JSON — plus a small, scoped `TrendStore`
that #202's own acceptance criteria names alongside it (Trend's `source_urls`/`platform`/`is_paywalled`).

`IdeaStore` (`src/idea/store.ts`) is genuinely new and `{ db }`-only, following the SAME plain
`(db: DatabaseSync, ...)` positional-argument convention #222's other genuinely-new stores established
(`src/brand/store.ts`, `src/channel/store.ts`, `src/copy/store.ts`) — not the overload-bridge shape
`AssetStore`/`FormatStore` use, because there is no pre-existing `{ ledgerPath }`-taking "Idea store" to
keep compiling. `src/ledger/ledger.ts` (the file the real production pipeline actually reads/writes
today) is completely untouched.

It gives four operations, matching the AC's own words exactly:
- **Creation** — `createIdea`, which validates `hookType`/`theme` against the closed vocabularies
  (`isHookType`/`isTheme`) at the store boundary, throwing a named `IdeaValidationError` (not a raw
  SQLite FK error) before any write, and always creates the row `status: 'suggested'`.
- **Review** (the two outcomes) — `acceptIdea`/`rejectIdea`, each guarding "the Idea must currently be
  `suggested`" and each throwing a clear, named error otherwise; `rejectIdea` requires a non-blank
  `rejectionReason`.
- **Recipe selection** — `selectIdeaRecipes`, writing one `idea_recipe` row per OFFERED Recipe (chosen,
  or declined with a required reason) inside ONE transaction (`withTransaction`, #222), proven atomic
  against a mid-batch failure.

`TrendStore` (`src/trend/store.ts`) is minimal and read-oriented on purpose: `createTrend`/`getTrend`/
`listTrendsForRun`/`listBriefableTrends`. `listBriefableTrends` is the literal "make an unbriefable
Trend **visible**" ask — a `WHERE is_paywalled = 0` read, not an enforcement gate. I deliberately did
NOT make `createIdea` refuse a paywalled Trend's id; that decision is argued explicitly in
`proposal.md`'s "What Changes" section (the AC's own wording says "enforced by data", never "blocked",
and the editorial call already lives as Operator-approved prose in `idea-strategist.md`).

### Files touched

New:
- `src/idea/store.ts` (+`.test.ts`) — `IdeaStore`: `createIdea`/`getIdea`/`listIdeasForRun`/
  `acceptIdea`/`rejectIdea`/`selectIdeaRecipes`/`listIdeaRecipes`, plus `IdeaValidationError`.
- `src/trend/store.ts` (+`.test.ts`) — `TrendStore`: `createTrend`/`getTrend`/`listTrendsForRun`/
  `listBriefableTrends`.
- `openspec/changes/issue-223-ideastore/` (this change).

Modified:
- `.claude/rules/always/organicgrowth-rules.md` — rule 7 gains "Idea" and "Trend" to the list of
  `{ db }`-backed stores, and the forward-pointer now names issue #204 (the one-shot importer) instead
  of re-stating "issue #223" (this ticket).
- `src/db/adr.docs-test.ts` — its Rule 7 assertions updated to match the corrected wording, plus one new
  assertion for the corrected forward-pointer.
- `openspec/project.md` — the "Tech stack" paragraph, stale since #222 merged (verified: `git log --
  openspec/project.md` shows no commit touched it after issue #201), corrected to state which stores are
  now SQL-backed and that no production caller has switched over yet.
- `CONTEXT.md` — two small, ADR/issue-cited, additive clarifications, no new terms: Trend's entry gains
  one sentence naming the `is_paywalled`/`platform`/`source_urls` data fact and the Operator rule it
  encodes; Fit Score's entry gains one sentence naming its three recorded explanatory components
  (`relevance`/`momentum`/`brand_fit`). Neither touches the closed-vocabulary bullet lists
  `context-md.docs-test.ts` pins.

Untouched (deliberately, and verified by `git status`/`git diff`):
- `src/db/schema.ts`, `src/db/migrate.ts` — MIGRATION_1/MIGRATION_2 stay byte-for-byte frozen; this
  ticket adds no new migration.
- `src/ledger/ledger.ts` and its full test suite — zero changes, zero new callers.
- Every real production module (`track-performance.ts`, `export-schedule.ts`,
  `schedule-via-zoho-mcp.ts`, `upload-camera-hub-scripts.ts`, `report.ts`, `pick-cast.ts`, and others).
- Every store #222 already shipped (`src/asset/store.ts`, `src/brand/store.ts`, `src/channel/store.ts`,
  `src/copy/store.ts`, `src/format/store.ts`, `src/brand-asset/store.ts`, `src/production-spec/store.ts`).

### How to run

```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-223-ideastore
npx tsc -p tsconfig.json --noEmit
npm test                                        # 2987 / 762 suites / 0 fail (baseline: 2956 / 753 / 0 fail)
npx openspec validate issue-223-ideastore --strict
npx openspec validate --all --strict            # 52 passed, 0 failed (baseline: 49)
```

To run just this ticket's new suites:
```
node --import tsx --test src/idea/store.test.ts src/trend/store.test.ts src/db/adr.docs-test.ts \
  src/vocabulary/context-md.docs-test.ts
```

### Acceptance-criteria self-assessment

- **"`IdeaStore` exists and is the only route for Idea creation, Review, acceptance and Recipe
  selection."** `src/idea/store.ts` exists and exposes exactly these four capabilities:
  `createIdea` (creation, `src/idea/store.test.ts`'s `"createIdea — inserts one idea row..."` describe
  block), `acceptIdea`/`rejectIdea` (the two Review outcomes, `"acceptIdea / rejectIdea — the two Review
  outcomes..."` describe block), `selectIdeaRecipes` (Recipe selection, `"selectIdeaRecipes /
  listIdeaRecipes — Recipe selection, atomic"` describe block). `src/ledger/ledger.ts` — the only other
  place any Idea-shaped data lives today — is untouched (verified by `git diff`), so no second route to
  the SAME table exists; "only route" is true by construction (nothing else writes to `idea`/
  `idea_recipe`).
- **"An Idea records `hook_type` and `theme` as required fields at creation — not nullable
  conveniences — validated against the closed vocabularies at the store boundary."** Both are
  non-optional in `IdeaInput`'s TypeScript type (compile-time), AND independently runtime-validated:
  `"rejects an out-of-vocabulary hookType BEFORE any write, naming every legal value"` and the theme
  sibling test (both assert `IdeaValidationError`, the exact invalid value named, every legal value
  listed, AND `listIdeasForRun` returns `[]` afterward — proving no row was written).
  `"accepts 'unclassified' for both hookType and theme, like any other closed-vocabulary member"` proves
  issue #219's sentinel value is treated as a real, legal member, never rejected or special-cased.
- **"An Idea records `relevance`, `momentum` and `brand_fit` alongside `fit_score`..."**
  `"stores every optional field when given, including a real trendId"` round-trips all four
  (`fitScore: 0.82, relevance: 0.7, momentum: 0.9, brandFit: 0.6`) verbatim through `createIdea` →
  `getIdea`.
- **"An Idea records its own `source_urls`. A Trend records its source URLs, platform and an
  `is_paywalled` flag..."** Idea's half: same test above, `sourceUrls: ["https://example.com/a",
  "https://example.com/b"]` round-trips. Trend's half: `src/trend/store.test.ts`'s `"stores every
  optional field when given"` round-trips `sourceUrls`/`platform`/`isPaywalled: true`. The
  data-not-prose half of this AC is `listBriefableTrends`, proven by `"excludes paywalled-only Trends"`
  and `"returns [] when every Trend for a Run is paywalled"`.
- **"`idea_recipe` records which Recipes were offered, which were chosen, and the decline reason for the
  rest."** `"writes one row per offered item, chosen and declined together"` — one `idea_recipe` row per
  OFFERED Recipe (both the `chosen: true` and the `chosen: false, declineReason: "..."` item), read back
  via `listIdeaRecipes`.
- **"Writes run in transactions, so a partial write cannot land."** Two direct proofs, tied to this
  ticket's own concrete write shapes (mirroring #222's own two Copy/Asset proofs): `"rejects a declined
  item with no declineReason, BEFORE any row is written"` (the pre-check path — nothing is written at
  all) and `"rolls back the WHOLE batch when an unwired recipe_slug appears partway through"` (the
  `withTransaction`-wrapped path — a real 2-item batch where item 1 would individually succeed and item
  2 fails on the schema's own FK; `listIdeaRecipes` returns `[]`, proving item 1 did NOT survive).
- **"No caller above the store boundary changes shape."** Verified by `git status`/`git diff`: zero
  changes to `src/ledger/ledger.ts`, its test suite, or any real production module. `IdeaStore`/
  `TrendStore` are two entirely NEW files; nothing existing was edited to accommodate them.

### Fakes / fixtures used

- `src/db/test-support.ts`'s `withTempDb` — a real, throwaway SQLite file per test, mkdtemp'd and
  removed in a `finally`, exactly as #201/#222 established. No `:memory:` anywhere in this slice.
- No fixture data files added; every test seeds its own minimal Brand/Format/Run chain directly via
  `createBrand`/`createFormat` (issue #222's own stores) plus a raw `run` INSERT (no `RunStore` exists
  or is asked for — mirrors `schema.test.ts`'s/`src/asset/db-store.test.ts`'s own established
  fixture-seeding convention for tables a test needs but does not itself own).
- **The Magnific fake is not used and not needed.** This slice never touches Space-facing code
  (`src/space-driver/`, `src/producer/`) — confirmed by `git status`: no file under either directory is
  touched. No live `spaces_*`/`creations_*` MCP call is possible from anything this ticket added.

### Self-review notes

- Started `createIdea`'s failing-value tests with hardcoded invalid string literals
  (`hookType: "not_a_real_hook_type"`) — TypeScript correctly rejected them at COMPILE time, since
  `IdeaInput.hookType`/`theme` are typed as the closed literal unions `HookType`/`Theme`. That is
  actually the right static behavior (mirrors #222's own "a compile-time TypeScript error, not a
  runtime silent no-op" pattern for `DbAssetPatch`), but it meant the RUNTIME guard — the thing a real
  caller with only a plain `string` (an Operator-typed value, or a future Brief-import script) actually
  needs — was untested as written. Added two tiny `asHookType`/`asTheme` test-only casts, documented
  inline as simulating exactly that real caller, rather than loosening `IdeaInput`'s own type to `string`
  (which would have weakened the store's actual compile-time guarantee for every other caller).
- Considered making `selectIdeaRecipes`/`acceptIdea` one combined atomic call (CONTEXT.md: "At Review the
  Operator accepts an Idea and chooses its Recipes" — a single conversational action). Kept them as two
  separate, independently-transactional functions instead, matching the AC's own four-way listing
  ("creation, Review, acceptance and Recipe selection" as four things) and the established store
  granularity (`setPrimaryChannel` is its own atomic op, separate from `createChannel`; `writeAsset` is
  separate from `addAssetMediaBatch`) — a caller that wants them together can simply call both inside its
  own orchestration, without this store dictating that ordering.
- Removed a first-draft `updateIdea`/general-purpose Trend CRUD (`updateTrend`, `listTrends` across every
  Run) — neither is named by any AC, and epic #195's own tracked issue list (#197-#212, checked via
  `gh issue list`) names no ticket that would need them; kept `TrendStore` to exactly what `IdeaStore`'s
  own tests and AC4 require.

### Known limits

- **No range/shape validation on `fit_score`/`relevance`/`momentum`/`brand_fit`.** `src/db/schema.ts`
  (frozen from #201) declares these four columns plain nullable `REAL` with no `CHECK`; adding one needs
  a new migration, not asked for by any AC, and CONTEXT.md itself states Fit Score's computation is "an
  open decision". `IdeaStore` stores whatever `number` it is given.
- **`createIdea` does not refuse a paywalled-only Trend.** A DELIBERATE, argued call (see "What
  changed" above and `proposal.md`) — `listBriefableTrends` makes the fact queryable; deciding whether to
  actually brief a paywalled-only Trend stays idea-strategist's editorial judgment, not a hard DB
  constraint. **Flag for the Operator**: if the intent was a hard block, that is a small follow-up (an
  explicit guard in `createIdea`, still no new migration needed), not a re-read of this ticket.
- **No `RunStore` is built** — `idea`/`trend` both require a real `run_id`; tests seed it via raw SQL,
  same convention #222's own `schema.test.ts`/`db-store.test.ts` already established. No tracked issue
  names a Run store.
- **No caller above the store boundary is wired.** Exactly #222's own finding, restated because it still
  holds: no SQL table holds real production data (the one-shot importer, #204, has not run), so there is
  nothing to migrate and no production caller that could legally be pointed at `IdeaStore`/`TrendStore`
  yet. That is #204's job.
- **No classification happens here.** Every `hookType`/`theme` value `createIdea` is given — including
  `unclassified` — is validated only against "is this one of the closed set", never guessed or upgraded.
  The backfill of the 51 readable Briefs is #206's job, untouched by this ticket.
