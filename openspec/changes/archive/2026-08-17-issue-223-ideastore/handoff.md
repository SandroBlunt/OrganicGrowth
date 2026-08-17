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

## QA Verdict — Round 1: PASS

Verified in worktree `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-223-ideastore`, branch
`issue-223-ideastore`, HEAD `6dd2af3`, on top of `main` `a6ba473`. Nothing under
`/Users/CaxtonTaylor/Developer/OrganicGrowth` was touched.

### Suite result

Ran every command exactly as documented in the Build Report, from scratch:

- `npx tsc -p tsconfig.json --noEmit` — clean, 0 errors.
- `npm test` — **2987 tests / 762 suites / 0 fail** (baseline on `main` `a6ba473`: 2956 / 753 / 0 fail).
  Matches the Build Report's claimed numbers exactly, actually executed, actually green.
- `npm run test:docs` — **284 tests / 76 suites / 0 fail** (a subset of the `npm test` total above, run
  standalone to confirm it independently).
- `npx openspec validate issue-223-ideastore --strict` — `Change 'issue-223-ideastore' is valid`.
- `npx openspec validate --all --strict` — **52 passed, 0 failed** (baseline: 49 — the 2 new spec
  capabilities `idea-store`/`trend-store` plus this 1 change).

### Per-criterion results (issue #223's acceptance criteria, verbatim)

1. **"`IdeaStore` exists and is the only route for Idea creation, Review, acceptance and Recipe
   selection."** PASS. `grep -rn "INTO idea\b\|INTO idea_recipe" src --include="*.ts"` shows the only
   production-code hits are `src/idea/store.ts`'s own `createIdea`/`upsertIdeaRecipeRow`; every other hit
   is a pre-existing (#222-era) `*.test.ts` fixture-seeding raw INSERT for a DIFFERENT store's own test
   (`src/asset/db-store.test.ts`, `src/production-spec/db-store.test.ts`, `src/copy/store.test.ts`,
   `src/db/schema.test.ts`, `src/db/media-ref.test.ts`) — not a second production route. `src/ledger/
   ledger.ts` is byte-for-byte untouched (`git diff a6ba473..6dd2af3 -- src/ledger/` — empty). `src/
   asset/store.ts` only ever reads `ideaId` as a foreign-key reference, never writes to `idea`. Proven by
   `src/idea/store.test.ts`'s four describe blocks (creation / reads / Review / Recipe selection).
2. **"hook_type/theme required + validated against closed vocabularies at the store boundary."** PASS —
   see the dedicated deep-dive below.
3. **"relevance/momentum/brand_fit alongside fit_score."** PASS. `"stores every optional field when
   given, including a real trendId"` (`src/idea/store.test.ts:106`) round-trips
   `fitScore: 0.82, relevance: 0.7, momentum: 0.9, brandFit: 0.6` verbatim through `createIdea` →
   `getIdea`.
4. **"An Idea records its own source_urls. A Trend records its source URLs, platform and an
   is_paywalled flag, so the openly-readable-source rule is enforced by data rather than by prose."**
   PASS as built — see the dedicated judgment-call section below, including a specific recommended
   follow-up.
5. **"idea_recipe records offered/chosen/decline reasons."** PASS. `"writes one row per offered item,
   chosen and declined together"` (`src/idea/store.test.ts:325`).
6. **"Writes run in transactions, so a partial write cannot land."** PASS. `withTransaction` is reused
   completely unchanged from #222 (`git diff a6ba473..6dd2af3 -- src/db/transaction.ts` — empty; the
   file appears nowhere in this branch's diff at all). `selectIdeaRecipes` wraps its batch in it. The
   mid-batch-rollback test (`"rolls back the WHOLE batch when an unwired recipe_slug appears partway
   through"`, `src/idea/store.test.ts:376`) asserts `listIdeaRecipes(db, ideaId)` returns `[]` AFTER the
   FOREIGN KEY throw — i.e. it proves nothing landed, not merely that the call threw. The declined-with-
   no-reason pre-check (`src/idea/store.ts:376-382`) runs its validation loop BEFORE `withTransaction`/
   `BEGIN` is even called — traced directly in source, not just inferred from the test — so zero SQL runs
   on that path at all.
7. **"No caller above the store boundary changes shape."** PASS. `git diff a6ba473..6dd2af3 --stat`
   shows only two brand-new production files (`src/idea/store.ts`, `src/trend/store.ts` + their tests)
   plus docs; every existing production module and every #222-era store file has a zero-line diff.

### hook_type / theme deep dive (the "other thing to check hard")

- **Required at creation, compile-time AND runtime.** `IdeaInput.hookType`/`theme`
  (`src/idea/store.ts:81-84`) are non-optional `HookType`/`Theme` fields — a caller cannot omit them at
  compile time. Independently, `assertValidHookType`/`assertValidTheme` (`src/idea/store.ts:49-63`) run
  as the literal FIRST two statements inside `createIdea` (`src/idea/store.ts:172-173`), before
  `randomUUID()` and before any `db.prepare()` call — confirmed by reading the source directly, not just
  inferring it from a passing test. A bad value throws a named `IdeaValidationError` listing every legal
  member; `listIdeasForRun` afterward returns `[]`, proving no row landed.
- **`unclassified` is a fully accepted, non-special-cased member.** Proven both by
  `"accepts 'unclassified' for both hookType and theme, like any other closed-vocabulary member"`
  (`src/idea/store.test.ts:210`) and by `src/vocabulary/hook-type.ts`/`theme.ts` (pre-existing from
  #219, untouched by this ticket — confirmed not in the branch's diff) exporting it as the genuine
  eleventh/tenth member of `HOOK_TYPES`/`THEMES`, not an out-of-band sentinel.
- **Distinguishable in a query.** `hook_type`/`theme` are plain `NOT NULL TEXT` columns (`src/db/
  schema.ts:268-269`, byte-identical to `main`) with no aliasing or coalescing — `unclassified` is stored
  as an ordinary string, so `WHERE hook_type != 'unclassified'` genuinely separates it from a real
  classified value. This is the exact property `src/vocabulary/context-md.docs-test.ts`'s pre-existing
  (#219) test already pins in CONTEXT.md's prose ("must state 'unclassified' is distinguishable, in a
  query, from a real classified value") — I confirmed that test is still green under this branch's full
  suite run, and this ticket's own store round-trips the value verbatim on top of it.
- **The 10-of-61 Briefs with neither a hook heading nor a `format` field** cannot be imported by
  `createIdea` as written, because `formatId` is a separate required, FK'd column this ticket does not
  touch — that gap is explicitly named in the Build Report's Known Limits and correctly left to #204 to
  resolve (deciding a `formatId` for those 10), not silently glossed over.
- **Validation-before-SQL is real, not just claimed.** Traced in source for both `createIdea` (validation
  before `randomUUID()`/any `db.prepare`) and `rejectIdea` (`typeof rejectionReason` check is the literal
  first statement, before even the `requireIdea` SELECT — `src/idea/store.ts:269-274`).

### AC4 / paywall-enforcement judgment call

**I would PASS this as built**, not split the difference. Reasoning:

- Issue #223's own explanatory prose (its "The paywall rule this encodes" section, not just the AC
  bullet) says: *"The data model should make an unbriefable Trend **visible** rather than relying on an
  agent remembering the rule."* That is verbatim what `listBriefableTrends` does. This is the issue
  author's own chosen word — not the developer's spin — and it deliberately avoids "blocked" /
  "refused" / "rejected". Epic #195's own User Story 20 uses the identical "enforced by data rather than
  by prose" sentence with no further constraint language attached either (checked via `gh issue view
  195`).
- A hard block on `createIdea` refusing any paywalled `trendId` would enforce the **wrong** invariant.
  The real, already-Operator-approved rule (`.claude/agents/idea-strategist.md:69-74`, live prose, cites
  the actual idea-03 rejection at Review, 2026-08-11) is about the **Idea's own `source_urls`** carrying
  at least one openly-readable link — an Idea is explicitly allowed to cite a paywalled Trend as a
  momentum signal while carrying its own open sources. Blocking on `trend_id`'s paywall flag would both
  reject some legitimate Ideas (over-strict) and fail to verify the thing that actually matters, i.e.
  whether the Idea's own sources are open (beside the point) — exactly the risk flagged in my brief.
  I confirmed this by reading `idea-strategist.md` directly, not taking the developer's citation on
  faith.
- The theoretically "correct" hard constraint — validating that an Idea's own `source_urls` contains at
  least one genuinely-open URL — isn't buildable with the current schema at all: there is no per-URL
  paywall flag on `idea.source_urls_json`, only a whole-Trend `is_paywalled` flag. Any block at
  `createIdea` would necessarily be checking a wrong or incomplete proxy, and the schema is frozen (no
  new migration authorized by any AC here).
- The developer surfaced this decision loudly and specifically — in `proposal.md`'s "What Changes" and
  "Known gaps, decided, not dropped" sections, and again in the handoff's Known Limits, with an explicit
  ask for an Operator ruling — rather than quietly building the weaker reading and calling it done. That
  is the right conduct even where the reading itself is debatable.

I do agree with the framing in my brief that "queryable but nothing calls it" leaves the practical
enforcement gap exactly where it was — an agent must remember to call `listBriefableTrends`, the same
way it must remember the prose rule today. **If a stronger guarantee is wanted, the follow-up should be
scoped exactly to this, and not to a blanket Trend-level block:**

> `createIdea` should reject a `trendId` that resolves to an `is_paywalled` Trend **unless** the Idea's
> own `sourceUrls` is non-empty — buildable today with zero new migration, enforces the real rule (an
> Idea must carry its own open source when its only recorded Trend is paywalled-only) rather than the
> wrong one (refusing any paywalled Trend link outright), and does not conflict with #204's importer
> (whose initial import, per this ticket's own Known Limits, attaches no `trendId` at all — no Trend data
> has been imported yet).

I would explicitly NOT recommend a blanket "refuse any `createIdea` whose `trendId` is paywalled" guard —
that enforces the wrong thing, per the reasoning above.

### Per-scenario results (spec deltas)

**`idea-store` spec — 18 Scenarios, all PASS**, each with a directly-named, passing test in
`src/idea/store.test.ts`:
- createIdea defaults / stores optional fields / rejects unknown FKs — 3/3 PASS.
- hook_type/theme required+validated / unclassified accepted — 3/3 PASS.
- getIdea/listIdeasForRun null-for-unknown/[]-for-none/creation-order — 3/3 PASS.
- acceptIdea/rejectIdea the two Review outcomes — 4/4 PASS, with one **coverage gap, not a functional
  failure**: the spec's "throws for an already-decided Idea (accepted OR rejected)" Scenario is only
  tested for the same-outcome case (accept-after-accept, reject-after-reject); there is no test for the
  cross case (accept-after-reject, reject-after-accept). I traced `requireSuggested`
  (`src/idea/store.ts:238-242`, shared by both functions) and confirmed it checks the generic
  `status !== "suggested"` — the cross case is provably covered by the implementation even though
  untested. Logged as defect #2 below, LOW severity.
- selectIdeaRecipes/listIdeaRecipes atomicity — 5/5 PASS, including the two atomicity proofs verified
  above.

**`trend-store` spec — 9 Scenarios, all PASS**, each with a directly-named test in
`src/trend/store.test.ts` — with one **coverage gap versus the developer's own `tasks.md`**: task item
2.1 explicitly claims a test for "an out-of-`KNOWN_PLATFORMS` `platform` is rejected (CHECK)" was
written, but no such test exists in the file (confirmed by grep). I manually verified the underlying
behavior is correct anyway, via a temporary, uncommitted probe script (deleted immediately after,
`git status --short` clean both before and after):
```
createTrend(db, { runId, label: "bad platform", platform: "not_a_real_platform" })
→ throws: CHECK constraint failed: platform IS NULL OR platform IN ('facebook', 'instagram', 'linkedin', 'x', 'tiktok', 'youtube')
```
So the schema-level CHECK genuinely rejects an invalid platform — this is a `tasks.md`-accuracy /
test-coverage gap, not a functional break. Logged as defect #1 below, LOW severity.

### Always-rules + Magnific-fake checks

- **Generate-never-publish** — PASS (out of scope for this slice; no publication code touched).
- **Public-metrics-only** — PASS (out of scope; no metrics code touched).
- **Relative-not-absolute** — PASS (out of scope; no scoring/comparison code touched).
- **Explicit-attribution** — PASS (out of scope; Post/attribution code untouched — confirmed
  `src/asset/store.ts` only reads `ideaId` as an FK, never infers one).
- **Ledger-as-source-of-truth** — PASS. `git diff a6ba473..6dd2af3 -- src/ledger/` is empty — zero
  changes to `src/ledger/ledger.ts` or its test suite. Rule 7's corrected doc text still explicitly
  states `ledger.json` stays canonical until #204 wires a real caller onto SQL.
- **Magnific fake / no live calls** — PASS. `grep -rn "spaces_\|creations_\|magnific" src/idea/ src/
  trend/` — zero hits (exit 1, no matches). Every test uses `withTempDb`: 22 call sites in `src/idea/
  store.test.ts`, 12 in `src/trend/store.test.ts` (grepped and counted), each opening a real,
  mkdtemp'd, throwaway SQLite file — zero `:memory:` anywhere in either test file (grepped, zero
  matches for the actual API usage; the only two hits are doc-comment mentions of "never `:memory:`").

### TrendStore scope check

**Not scope creep — justified.** Issue #223's own AC4 text (not just parent #202's) explicitly names
Trend's `source_urls`/`platform`/`is_paywalled` fields. I independently checked every other tracked epic
issue title (#197–#212 via `gh issue view <n> --json title`) — none names a "Trend store". #204 (the
importer) is *blocked by* #202 (this ticket's own parent), meaning #204 depends on `IdeaStore`/
`TrendStore` already existing, not the reverse — no collision, no ordering conflict. #203 (queue/post/
performance-as-time-series) doesn't touch Trend at all (read its full AC list — confirmed). The
TrendStore's own scope is also self-limiting in a good way: minimal, read-oriented, no general CRUD
beyond what `IdeaStore`'s FK and AC4 actually need (no `updateTrend`, no cross-Run `listTrends` — matches
the developer's own stated self-review reasoning).

### Doc changes

- Rule 7 + `src/db/adr.docs-test.ts` — additive, accurate, and the docs-test's assertions were
  *strengthened* (one new assertion added for the corrected forward-pointer), not loosened — confirmed
  green in the full suite run.
- `openspec/project.md` — corrected a genuinely stale claim ("not yet the backing of any store") to the
  true post-#222/#223 state; staleness independently verified via `git log -- openspec/project.md`
  showing no #222-era commit ever touched this file.
- `CONTEXT.md` — two one-sentence additive clarifications (Trend, Fit Score both cite `docs/adr/0029`
  and issue #223) — confirmed by reading the diff directly: neither touches the closed-vocabulary bullet
  lists `context-md.docs-test.ts` pins (Hook Type's/Theme's own glossary entries are untouched by this
  diff).
- No doc-conformance check was weakened anywhere in this slice; no new vocabulary term was coined.

### Archive-header check (not executed, per standing rules)

Both spec deltas (`openspec/changes/issue-223-ideastore/specs/idea-store/spec.md` and `.../trend-store/
spec.md`) are `## ADDED Requirements` only — there is no `## MODIFIED Requirements` section in either
file, and neither `openspec/specs/idea-store/` nor `openspec/specs/trend-store/` exists yet on `main`
(confirmed: `ls openspec/specs/` shows only `format-scoped-trend-research` and `idea-strategist-briefs`).
This is a pure-addition case, not the historically-fragile MODIFIED-header shape that has broken
`openspec archive` before. I expect `openspec archive issue-223-ideastore` to succeed cleanly, but did
NOT run it, per the standing hermetic/read-only rule.

### Defect list

1. **LOW** — `src/trend/store.test.ts` is missing the "out-of-`KNOWN_PLATFORMS` platform rejected
   (CHECK)" test that `openspec/changes/issue-223-ideastore/tasks.md` item 2.1 explicitly claims (checked
   off `[x]`) was written. **Repro:** `grep -n "KNOWN_PLATFORMS\|CHECK" src/trend/store.test.ts` — no
   hits; the only `platform` references in the file are the happy-path "stores every optional field"
   test. The underlying behavior is NOT broken — I manually confirmed `createTrend(db, { runId, label:
   "x", platform: "not_a_real_platform" })` throws `CHECK constraint failed: platform IS NULL OR
   platform IN (...)` via a temporary probe script (not committed). This is a tasks.md-accuracy / test-
   coverage gap only.
2. **LOW** — `src/idea/store.test.ts` does not test the cross-case for `acceptIdea`/`rejectIdea`'s shared
   "already decided" guard (i.e. calling `acceptIdea` on an already-`rejected` Idea, or `rejectIdea` on
   an already-`accepted` Idea) — only the same-outcome cases (accept-after-accept, reject-after-reject)
   are tested. **Repro:** read `src/idea/store.test.ts`'s `"acceptIdea / rejectIdea — the two Review
   outcomes..."` describe block — no cross-case test present. `requireSuggested`
   (`src/idea/store.ts:238-242`) is shared, generic (`status !== "suggested"`) logic, so the cross case
   is provably covered by the implementation even though untested.
3. **INFORMATIONAL, not a code defect** — AC4's "enforced by data rather than by prose" is implemented as
   a queryable view (`listBriefableTrends`), not a write-time block on `createIdea`. See the dedicated
   judgment-call section above for the full reasoning (I rule this a PASS as built) and the exact,
   narrowly-scoped follow-up I'd recommend if the Operator wants a stronger guarantee.

None of the three items above blocks this Round from being a PASS — items 1 and 2 are test-coverage gaps
with the underlying behavior independently verified correct, and item 3 is a disclosed, argued,
Operator-referable design decision, not a silently-dropped requirement.

### What #204's importer must know before it writes real Ideas

- `hookType`/`theme` are `NOT NULL` and store-boundary-validated; `unclassified` is a fully legal value
  for both — the importer's honest default for Briefs with no classifiable hook/theme. But the 10
  MundoTip-shape Briefs that also lack a `format` field cannot be imported via `createIdea` as written,
  because `formatId` is a separate required, FK'd column — the importer needs its own `formatId`
  resolution for those 10 before calling this store (correctly out of #223's scope).
- `createIdea` always creates at `status: 'suggested'` — there is no single-call way to insert an Idea
  already `accepted`/`rejected`. To reproduce a historical Idea's real status, call `createIdea` then
  immediately `acceptIdea`/`rejectIdea` as a second step. Every write function's `now: () => string`
  parameter is injectable — use it to backfill the real historical timestamp rather than accepting
  "now" for every imported record.
- `rejectIdea` requires a non-blank `rejectionReason` with no bypass in this store's API — if a
  historical rejected Idea has no captured reason string, the importer needs its own placeholder policy
  (there is no way to write a `rejected` row through `IdeaStore` without one).
- `fit_score`/`relevance`/`momentum`/`brand_fit` have zero range/shape validation (plain nullable `REAL`,
  no `CHECK`) — the importer can write any historical number verbatim, including out-of-[0,1] legacy
  values, without the store objecting; if that matters, the importer must self-validate before calling.
- `selectIdeaRecipes`'s `recipe_slug` is FK-checked against the live `recipe_vocabulary` (seeded from
  `src/recipe/registry.ts`) — a historical Recipe reference that no longer matches a currently-registered
  slug throws a FOREIGN KEY error and rolls back the WHOLE batch (not just that one item). The importer
  must map or reject stale/renamed Recipe slugs before calling `selectIdeaRecipes`.
- No hard block exists today on linking an Idea to a paywalled-only Trend — see the AC4 judgment-call
  section above if the importer or a future caller needs that enforced.
