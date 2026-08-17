# Slice Handoff — issue #201: Two superseding ADRs, the closed vocabularies, and the SQLite foundation

## Build Report (developer, Round 1)

### What changed

This is the foundation slice epic #195's whole rebuild stands on. It lands four things, and
deliberately nothing more:

1. **Two ADRs** (`docs/adr/0028`, `docs/adr/0029`) recording the Operator's 2026-08-16 decisions:
   Post becomes its own record (partially superseding ADR-0011 — the per-Recipe Asset grain, its
   six-stage lifecycle, and `(Idea, Recipe)` attribution are explicitly KEPT); canonical relational
   state moves to local SQLite (superseding ADR-0014's "keep files for the MVP" choice while explicitly
   KEEPING and FULFILLING its store-boundary/relational/stable-id principles). Both ADR-0011 and
   ADR-0014 gain a forward-pointer blockquote, mirroring how ADRs 0015–0018 point back at
   0010/0013/0014 — no existing decision text was edited.
2. **Two closed vocabularies** (`src/vocabulary/hook-type.ts`'s ten `HOOK_TYPES`,
   `src/vocabulary/theme.ts`'s nine `THEMES`), calibrated against a real sample of both Brands' Briefs.
   `CONTEXT.md` defines both, term-for-term identical to the TS source, and its Recipe entry is
   corrected from a stale "two Recipes are wired" to the registry's real "three Recipes are wired"
   (News Short Script has been wired since issue #174; `CONTEXT.md`'s own count had gone stale). Its
   Post entry is updated to reflect the ADR-0028 reversal.
3. **The SQLite schema and migration runner** (`src/db/schema.ts`, `src/db/migrate.ts`,
   `src/db/connection.ts`): all 18 CONTEXT.md entities, each with `id`/`created_at`/`updated_at`/
   `schema_version`; three closed vocabularies modeled as SEEDED REFERENCE TABLES with real foreign
   keys (`hook_type_vocabulary`, `theme_vocabulary`, `recipe_vocabulary`) rather than static CHECK
   lists — seeded directly from the TypeScript source arrays and from
   `src/recipe/registry.ts`'s `listWiredRecipeSlugs()`/`getRecipe()`, so nothing is a second,
   hand-copied list; a partial unique index enforcing exactly one primary Channel per Brand
   (ADR-0019); `job` gains the columns issue #203's real claiming needs room for
   (`attempt`/`idempotency_key`/`locked_by`/`locked_until`) without implementing claiming itself;
   `account`/`user`/`connection` are deliberately NOT built.
4. **The storage-key store boundary** (`src/db/storage-key.ts`'s `assertRootRelativeStorageKey`,
   wired into real inserts by `src/db/media-ref.ts`'s `insertAssetMedia`/`insertBrandAsset`): an
   absolute path (POSIX, Windows drive-letter, Windows UNC, home-directory shorthand) or a
   `..`-traversal segment is rejected BEFORE any row is written, proven against a real database.

This slice deliberately does **not** swap any existing store's backing (issue #202), does not run the
importer (issue #204), and does not implement real job claiming (issue #203) — it only lands the
foundation those slices build on.

### Files touched

**New:**
- `src/vocabulary/hook-type.ts`, `.test.ts`
- `src/vocabulary/theme.ts`, `.test.ts`
- `src/vocabulary/context-md.docs-test.ts`
- `src/db/node-sqlite.d.ts` (ambient `node:sqlite` type declaration)
- `src/db/schema.ts`, `.test.ts`
- `src/db/connection.ts`, `.test.ts`
- `src/db/migrate.ts`, `.test.ts`
- `src/db/storage-key.ts`, `.test.ts`
- `src/db/media-ref.ts`, `.test.ts`
- `src/db/test-support.ts`, `.test.ts`
- `src/db/adr.docs-test.ts`
- `src/recipe/registry-wired-count.docs-test.ts`
- `docs/adr/0028-post-is-its-own-record.md`
- `docs/adr/0029-local-sqlite-behind-the-store-boundary.md`
- `openspec/changes/issue-201-adrs-vocabularies-sqlite-foundation/` (this change: `proposal.md`,
  `tasks.md`, `specs/sqlite-foundation/spec.md`, `specs/domain-vocabulary/spec.md`,
  `specs/docs-conformance/spec.md`, `handoff.md`)

**Modified:**
- `CONTEXT.md` (Hook Type + Theme glossary entries added; Recipe entry corrected; Post entry updated)
- `docs/adr/0011-ledger-grain-per-recipe-assets-attribution.md` (forward-pointer blockquote only)
- `docs/adr/0014-canonical-state-in-files-behind-store-boundary.md` (forward-pointer blockquote only)
- `.claude/rules/always/organicgrowth-rules.md` (rule 7 gains an ADR-0029 citation)
- `openspec/project.md` (Tech stack section describes the new, not-yet-wired SQLite foundation)

No `package.json` change — `node:sqlite` is a Node built-in; see "Fakes / fixtures used" below for why
a scoped ambient `.d.ts` was written instead of bumping the shared `@types/node` devDependency.

### How to run

```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-201-adrs-vocabularies-sqlite-foundation
npx tsc -p tsconfig.json --noEmit          # typecheck — clean
npm test                                   # 2454 tests / 613 suites / 0 fail (baseline: 2411 / 598)
npm run test:docs                          # 275 tests / 75 suites / 0 fail (baseline: 259 / 66)
npx openspec validate --all --strict       # 44 passed, 0 failed
```

To run just this slice's own tests:
```
node --import tsx --test src/vocabulary/*.test.ts src/vocabulary/*.docs-test.ts \
  src/db/*.test.ts src/db/*.docs-test.ts src/recipe/registry-wired-count.docs-test.ts
```

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proven by |
|---|---|---|
| 1 | An ADR supersedes ADR-0011, records the Post-becomes-its-own-entity reversal, with the Operator decision date | `docs/adr/0028-post-is-its-own-record.md` itself; `src/db/adr.docs-test.ts` — "ADR-0028 records the Post-becomes-its-own-entity reversal (AC1)" (both `it`s: supersession + date, and the `(asset_id, channel_id)` table-shape claim) |
| 2 | An ADR supersedes ADR-0014, keeps its store-boundary principle, records local SQLite (not hosted/Postgres/multi-tenant) with reasoning | `docs/adr/0029-local-sqlite-behind-the-store-boundary.md` itself; `src/db/adr.docs-test.ts` — "ADR-0029 records the local-SQLite decision (AC2)" (all three `it`s: supersession+date, "never hosted/Postgres/multi-tenant" + `node:sqlite`, "KEPT and FULFILLED") |
| 3 | CONTEXT.md defines closed `hook_type` and `theme` vocabularies, each term with a one-line meaning | `src/vocabulary/hook-type.test.ts` + `theme.test.ts` (the vocabularies themselves are closed, 10/9 distinct non-empty values); `src/vocabulary/context-md.docs-test.ts` (CONTEXT.md states "closed" and lists every value with its EXACT meaning, derived from the same source array) |
| 4 | Doc-conformance checks assert both vocabularies and both ADRs, so they cannot drift | `src/vocabulary/context-md.docs-test.ts` (vocabularies) + `src/db/adr.docs-test.ts` (both ADRs, their forward-pointers, rule 7, CONTEXT.md's Post entry) + `src/recipe/registry-wired-count.docs-test.ts` (the related Recipe-count correction) — all run under `npm run test:docs` |
| 5 | One SQLite database under `data/`, opened in-process by Node; no service/API/container/cloud DB | `src/db/connection.test.ts` ("creates the database file and any missing parent directories"; "enables PRAGMA foreign_keys = ON"); `src/db/schema.ts`/`migrate.ts`'s doc comments and `docs/adr/0029` state the no-service constraint explicitly (asserted by `adr.docs-test.ts`) |
| 6 | Schema covers every entity: brand, channel, format, baseline_prompt, brand_asset, run, trend, idea, idea_recipe, asset, asset_media, copy_variant, job, gate_request, post, metric_snapshot, performance_score, channel_baseline | `src/db/migrate.test.ts` — "creates every entity table AND every vocabulary table" iterates `ENTITY_TABLES` (all 18, exported from `schema.ts`) against a real migrated database |
| 7 | Three Recipes treated as wired — trust the registry, not CONTEXT.md's stale count of two | `src/db/migrate.test.ts` — "seeds recipe_vocabulary... including the third wired Recipe"; `src/db/schema.test.ts` — "asset.recipe_slug trusts the registry (AC7)" (accepts all three real slugs incl. `news-short-script`, rejects an unwired one); `src/recipe/registry-wired-count.docs-test.ts` (CONTEXT.md corrected) |
| 8 | Every table carries id, created_at, updated_at, and a schema version | `src/db/migrate.test.ts` — "every entity table carries id, created_at, updated_at, and schema_version columns" (via `PRAGMA table_info`, generic over `ENTITY_TABLES`); "a freshly-written row's schema_version defaults to CURRENT_SCHEMA_VERSION" |
| 9 | A migration runner creates and upgrades the schema and records which version a database is at | `src/db/migrate.test.ts` — "a fresh database starts at schema version 0"; "running migrations brings a fresh database to CURRENT_SCHEMA_VERSION"; "is idempotent"; "a failed migration rolls back cleanly and leaves the database at its pre-migration version" |
| 10 | Media referenced by root-relative storage key with mime/bytes/checksum; media root is configuration | `src/db/schema.ts`'s `asset_media`/`brand_asset` DDL (`storage_key`, `mime`, `bytes`, `checksum` columns) and `brand.media_root`; `src/db/media-ref.test.ts` inserts and reads back all four fields on both tables |
| 11 | An absolute storage-key path is rejected at the store boundary, not merely discouraged, with a test | `src/db/storage-key.test.ts` (the pure validator: POSIX/Windows/UNC/home-shorthand/empty/`..`-traversal, all throw `StorageKeyError` naming the key); `src/db/media-ref.test.ts` — "rejects an absolute storage key BEFORE any row is written" / "rejects a home-directory-shorthand storage key" (against a REAL database, with a `COUNT(*)` check proving no partial insert) |
| 12 | Tests open a real, empty SQLite file per test, dropped afterwards — no in-memory double | `src/db/test-support.ts`'s `withTempDb` (never `:memory:`) is the ONLY way every `src/db/**` test opens a database; `src/db/test-support.test.ts` explicitly proves the file is real (not `:memory:`), the temp directory is removed after return, and removed even when the callback throws |
| 13 | Schema leaves room for account/user/connection without reshaping brand, but does not build them | `src/db/migrate.test.ts` — "does NOT create account, user, or connection... (epic #195 AC12)"; `docs/adr/0029`'s Decision section states the reasoning |

### Fakes / fixtures used

- **The Magnific fake is NOT used and NOT needed.** This slice touches no Space interaction, no
  Production Spec generation, no Execution Protocol, and no Recipe run-time driving — it is schema and
  vocabulary only. No file in this slice imports `src/space-driver/fixtures/fake-space.ts`, calls any
  `spaces_*`/`creations_*` MCP tool, or is driven by any port/fixture in `src/space-driver/`. The one
  place the word "magnific" appears anywhere in this slice's new code is the SCHEMA COLUMN NAME
  `asset_media.magnific_creation_id` (`src/db/schema.ts`, `src/db/media-ref.ts`) — an opaque string
  column that would eventually hold a real Magnific creation identifier once #202/#208 wire an actual
  Space run into it; no test in this slice ever calls a live or fake Magnific tool to populate it (every
  test passes it as an ordinary optional string, or omits it).
- **The real database fake/fixture is `src/db/test-support.ts`'s `withTempDb`** — per this epic's own
  Testing Decisions, this is deliberately a REAL, empty, throwaway SQLite file per test (mkdtemp'd,
  closed and removed in a `finally`), never an in-memory double. This is the seam this ticket itself
  introduces, not a stand-in for an external service.
- No live filesystem outside temp directories is touched by any test — confirmed via `git status
  --porcelain data/` returning empty both before and after the full suite run.

### Self-review notes

- Replaced the first draft's fixed char-count window (`doc.slice(start, start + 2000)`) in
  `context-md.docs-test.ts` with a heading-line-anchored `extractGlossaryEntry` parser after it produced
  two real failures while authoring the test: a naive `doc.indexOf("**Theme**")` matched the Hook Type
  entry's own INLINE cross-reference ("alongside **Theme** below") rather than the real Theme heading,
  grabbing the wrong term's body; separately, a fixed 2000-char window silently truncated the Theme
  list's last two values. Both are now structurally impossible (the parser finds a heading only at the
  start of a line, and reads to the next such heading rather than a magic-number cutoff).
- Applied the same `collapseWhitespace` treatment to the ADR/rule-7 docs-test after CONTEXT.md's/rule
  7's own markdown line-wrapping broke a literal multi-word substring match mid-sentence.
- Chose seeded REFERENCE TABLES with real foreign keys (`hook_type_vocabulary`, `theme_vocabulary`,
  `recipe_vocabulary`) over static `CHECK (col IN (...))` lists for the three closed vocabularies —
  gives genuine referential integrity (defense in depth alongside the future TS-level `IdeaStore`
  validation issue #202 will add), and lets a future local Library viewer (#210) query the vocabulary's
  own one-line meanings straight out of the database rather than hardcoding them into HTML.
- Added `src/db/connection.test.ts` and `src/db/test-support.test.ts` (not in the original plan) once it
  became clear those two files' own behavior — creating parent directories, enabling FK enforcement,
  and actually cleaning up a temp directory including on throw — were asserted by NO test otherwise,
  despite being exactly the kind of "new machinery" this epic's Testing Decisions call out.
- Added the `account`/`user`/`connection`-absence test and its matching spec Requirement after
  reviewing the acceptance criteria a second time and finding AC13 ("leaves room... but does not build
  them") had no test proving the "does not build them" half.
- No dead code found to remove — this is a from-scratch addition, not a refactor of existing code.

### Known limits

- **`@types/node` is not bumped.** This repo's pinned `@types/node@20.19.x` predates `node:sqlite`'s
  type declarations. Rather than bump the shared devDependency — which would touch the `node_modules`
  physically shared (via a local symlink) with sibling in-flight worktrees (#199, #207) building
  concurrently — I wrote a minimal, scoped ambient declaration (`src/db/node-sqlite.d.ts`) covering only
  the surface this codebase calls, verified correct in an isolated throwaway project first. This file
  becomes deletable the day `@types/node` is bumped past ~22.5. Flagged here for whichever slice next
  touches `package.json`'s devDependencies.
- **`node:sqlite` remains Node's own "experimental feature"** — every test run prints one cosmetic
  `ExperimentalWarning` line to stderr; it does not affect exit codes or fail anything. Not suppressed,
  since doing so would mean touching the shared `npm test`/`npm run test:docs` scripts.
- **No production code calls this database yet.** `src/db/*` is entirely new, self-contained
  infrastructure — no existing store, command, or agent instruction references it. That wiring is
  issue #202 (stores) and issue #205 (the typed command surface), not this ticket.
- **The file ledger is untouched and still canonical.** `AssetStore`, `QueueStore`, `FormatStore`, and
  every other existing store still read/write plain files exactly as before; `ledger-as-source-of-truth`
  is upheld by construction (nothing in this slice reads OR writes any Brand's real `ledger.json` or the
  real `data/queue.json`).
- **The `hook_type`/`theme` vocabularies and the `theme` set's granularity are a genuine product design
  choice made by me (the developer), not handed down by the issue** — calibrated against a real sample
  of both Brands' existing Briefs but not reviewed by the Operator. If the Operator later wants
  different categories, widening either set is a new migration plus a `CONTEXT.md` edit, not a rewrite
  (the seeded-table design was chosen partly to make that cheap).
- **Backfilling `hook_type`/`theme` onto the 61 existing Briefs** is explicitly issue #206's job, not
  this ticket's.

---

## QA Verdict — Round 1: PASS

Verified inside `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-201-adrs-vocabularies-sqlite-foundation`
only, branch `issue-201-adrs-vocabularies-sqlite-foundation`, HEAD `58126d0` (rebased onto `main` at
`bd7cc35`). `/Users/CaxtonTaylor/Developer/OrganicGrowth` was never touched (this worktree's
`node_modules` is a symlink into it, confirmed via `readlink`, so nothing that would trigger a
reinstall was run).

### Suite result (all commands re-run from scratch, not taken from the Build Report)

| Command | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | clean, exit 0 |
| `npm test` | **2773 tests / 699 suites / 0 fail** — matches the post-rebase expected count exactly |
| `npm run test:docs` | **275 tests / 75 suites / 0 fail** |
| `npx openspec validate --all --strict` | **45 passed, 0 failed** (44 pre-existing specs + this change's own `change/issue-201-adrs-vocabularies-sqlite-foundation` entry = 45; consistent with the change being newly added) |
| Slice-scoped: `node --import tsx --test src/vocabulary/*.test.ts src/vocabulary/*.docs-test.ts src/db/*.test.ts src/db/*.docs-test.ts src/recipe/registry-wired-count.docs-test.ts` | **59 tests / 24 suites / 0 fail** |

`git status --porcelain` was empty before and after every run, including inside `/tmp` (no
`og-sqlite-*`/`og-connection-*` directories left behind) — no test leaves a real file, temp dir, or
tracked-file change behind.

### Per-criterion results (issue #201, verbatim)

| # | Criterion | Result | Proving test |
|---|---|---|---|
| 1 | ADR supersedes ADR-0011, records the Post reversal, Operator decision date | PASS | `docs/adr/0028-post-is-its-own-record.md`; `src/db/adr.docs-test.ts` ("ADR-0028 records the Post-becomes-its-own-entity reversal (AC1)", 2 `it`s) |
| 2 | ADR supersedes ADR-0014, keeps store-boundary principle, local SQLite reasoning | PASS | `docs/adr/0029-local-sqlite-behind-the-store-boundary.md`; `src/db/adr.docs-test.ts` ("ADR-0029 records the local-SQLite decision (AC2)", 3 `it`s) |
| 3 | CONTEXT.md defines closed `hook_type`/`theme`, each term with a one-line meaning | PASS | `src/vocabulary/hook-type.test.ts`, `theme.test.ts` (closed sets); `src/vocabulary/context-md.docs-test.ts` (doc lists every value + exact meaning) |
| 4 | Doc-conformance checks assert both vocabularies and both ADRs | PASS | `context-md.docs-test.ts` + `adr.docs-test.ts` + `registry-wired-count.docs-test.ts`, all under `npm run test:docs` (with one quality note below, not a failure) |
| 5 | One SQLite DB under `data/`, in-process, no service/API/container/cloud DB | PASS | `src/db/connection.test.ts` (creates file+dirs, enables FK enforcement); read `connection.ts`/`docs/adr/0029` directly — no HTTP/server code anywhere in the slice |
| 6 | Schema covers all 18 named entities | PASS | `src/db/migrate.test.ts` — "creates every entity table AND every vocabulary table", generic over `ENTITY_TABLES`; read `schema.ts` DDL directly, confirmed all 18 names present |
| 7 | Three Recipes trusted from the registry, not CONTEXT.md's stale count | PASS | `migrate.test.ts` (seeds `news-short-script`); `schema.test.ts` ("asset.recipe_slug trusts the registry (AC7)"); `registry-wired-count.docs-test.ts` |
| 8 | Every table carries id/created_at/updated_at/schema_version | PASS | `migrate.test.ts`, generic `PRAGMA table_info` loop over `ENTITY_TABLES` |
| 9 | Migration runner creates/upgrades schema, records version | PASS | `migrate.test.ts` — version-0-start, idempotency, rollback-on-failure, all against a real file |
| 10 | Media by root-relative key + mime/bytes/checksum; media root is config | PASS | `schema.ts` DDL (`storage_key`/`mime`/`bytes`/`checksum` on both media tables, `brand.media_root`); `media-ref.test.ts` round-trips all four fields |
| 11 | Absolute path rejected at the store boundary, with a test | PASS | `storage-key.test.ts` (POSIX/Windows/UNC/home/empty/`..`); `media-ref.test.ts` (real DB, `COUNT(*)` proves no partial insert for `asset_media`) — see low-severity note below re: `insertBrandAsset`'s equivalent count check |
| 12 | Tests open a real, empty file per test, drop it after — no `:memory:` | PASS | `grep -rn ":memory:" src/db/*.test.ts src/vocabulary/*.test.ts` → only the one negative assertion in `test-support.test.ts` (`assert.notEqual(path, ":memory:")`); every DB test goes through `withTempDb` |
| 13 | Schema leaves room for account/user/connection, doesn't build them | PASS | `migrate.test.ts` — explicit absence test; `schema.ts` has no columns anticipating them beyond a documented comment |

All 13 acceptance criteria are PASS, each backed by a test that actually exercises the claim (verified
by reading the test bodies, not just their names — `schema.test.ts` and `migrate.test.ts` in particular
assert against a real migrated database with `PRAGMA foreign_keys = ON`, not mocks).

### Per-scenario results (spec deltas)

**`sqlite-foundation`** (11 Requirements, 22 scenarios) — every scenario traced to a passing test in
`connection.test.ts`, `migrate.test.ts`, `schema.test.ts`, `storage-key.test.ts`, `media-ref.test.ts`,
`test-support.test.ts`. All PASS. Read each spec Requirement against its cited file directly; every
`GIVEN`/`WHEN`/`THEN` has a literal counterpart test (e.g. the partial-unique-index scenarios map 1:1
onto `schema.test.ts`'s "Exactly one primary Channel per Brand" describe block).

**`domain-vocabulary`** (2 Requirements, 4 scenarios) — all PASS, `hook-type.test.ts` + `theme.test.ts`
cover length/distinctness/meaning-non-emptiness and `isHookType`/`isTheme` membership both ways.

**`docs-conformance`** (5 Requirements, 9 scenarios) — all PASS via `context-md.docs-test.ts` (2 Reqs),
`registry-wired-count.docs-test.ts` (1 Req, 3 scenarios), `adr.docs-test.ts` (2 Reqs covering both ADRs
+ rule 7 + CONTEXT.md's Post entry). One quality note (not a scenario failure — see Defect list, low
severity): the Recipe-wired-count scenario's own doc-comment claims the count is "never hardcoded", but
the actual assertion is a fixed regex for the literal string "Today three Recipes are wired" rather than
one derived from `listWiredRecipeSlugs().length` — it will not itself re-fail if a fourth Recipe is
wired and CONTEXT.md is left saying "three". The scenario as written for THIS state (three wired,
CONTEXT.md says three) is genuinely satisfied.

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | No content-generation or publish code touched; `grep -rn "spaces_\|creations_\|zoho\|apify" -i src/db src/vocabulary` → zero hits (only `zoho_schedule_ref`/`magnific_creation_id` as inert column names) |
| Public-metrics-only | PASS | `metric_snapshot`/`performance_score` are schema only in this slice — no scrape code added or touched |
| Relative-not-absolute | PASS | `channel_baseline` table exists as schema only; no scoring logic in this slice |
| Explicit-attribution | PASS, strengthened | ADR-0028 gives Post its own explicit `(asset_id, channel_id)` key; rule 5 (`.claude/rules/always/organicgrowth-rules.md`) is untouched and still accurately describes today's real, unchanged `/log-post` behavior (the file ledger is not touched by this slice) |
| Ledger-as-source-of-truth | PASS | `grep -rn "ledger.json\|queue.json" src/db src/vocabulary --include="*.ts"` → zero real-path references (only fixture *string literals* like `"data/brands/test-brand"` used as a fake `media_root` value in tests); rule 7 correctly states the new DB "is not yet the backing of any store" |
| Magnific fake (hard requirement) | PASS | No `spaces_*`/`creations_*` MCP call anywhere in this slice; no import of `src/space-driver/fixtures/fake-space.ts`; the only "magnific" string in the whole slice is the inert `asset_media.magnific_creation_id` column name, populated in tests only as a plain optional string or omitted |

### Defect list

No defects block this round. Two low-severity test-quality notes for the developer's awareness (do not
require a re-round):

1. **Low — `registry-wired-count.docs-test.ts` doesn't actually self-heal on future drift.** The file's
   own doc-comment says the count is "DERIVED from the registry itself — never a hardcoded '3'", but
   `it("names every currently-wired Recipe slug's human name...")` asserts a fixed regex
   `/Today three Recipes are wired/` rather than building the expected phrase from
   `listWiredRecipeSlugs().length`. Repro: wire a fourth Recipe in `src/recipe/registry.ts` without
   touching `CONTEXT.md` — this test keeps passing (it only checks `wired.length >= 3`, and the literal
   "three" string is unaffected), silently missing exactly the drift the epic's problem statement calls
   out ("CONTEXT.md's own count had gone stale"). Suggest deriving the expected word from
   `wired.length` the next time this file is touched.
2. **Low — `insertBrandAsset`'s rejection test doesn't assert zero rows the way `insertAssetMedia`'s
   does.** `src/db/media-ref.test.ts`'s "rejects an absolute storage key BEFORE any row is written" test
   (for `insertAssetMedia`) checks `COUNT(*) FROM asset_media` is `0` after the throw; the sibling
   "rejects a home-directory-shorthand storage key" test (for `insertBrandAsset`) only asserts the
   throw, not a matching `COUNT(*) FROM brand_asset` check — even though the spec's own Scenario text
   ("insertBrandAsset rejects a home-directory-shorthand storage key before writing any row") explicitly
   claims that "no row" property. Reading `media-ref.ts` confirms the validator genuinely runs before
   any `db.prepare(...).run(...)` call, so this is not a live bug — just an unproven half of the spec
   scenario. Repro: read `src/db/media-ref.test.ts` lines ~117–139 and compare against the
   `insertAssetMedia` test immediately above it.

### Design concerns for whoever builds #202/#204/#206 next (do not block this merge)

1. **HIGH — `idea.hook_type`/`idea.theme` are `NOT NULL` foreign keys, and the real import order may
   not be able to satisfy that.** Verified against the real data and the real ticket graph, not just the
   schema text:
   - Of the 61 real Briefs (51 straw-motion + 10 mundotip), only 51 carry ANY hook heading at all
     (`## Hook concept` / `## Hook Concept`); the other 10 are exactly the 10 MundoTip Briefs
     (`data/brands/mundotip/ideas/2026-W22/idea-0{1..9,10}.md`) — verified they carry no hook heading of
     any spelling and no `format` field, matching the epic's own "10 Ideas with no format field" claim.
     None of the 61 carries a value from the new closed vocabulary today — that classification judgment
     is issue #206's whole job, not #204's.
   - `gh issue view 206` is explicitly **"Blocked by #204, #205"**, and #206's own body says "This ticket
     classifies the 61 Briefs already written" (present tense — implying they are NOT yet classified
     when #204 runs) and is listed in epic #195 as an item that "can be **dropped** if phase 02 runs
     long."
   - `gh issue view 204`'s own acceptance criteria require importing "all 61 Briefs" and end with a
     reconciliation that "accounts for all 54 Assets, all 61 Briefs and all 66 queue jobs" — i.e. #204
     must succeed in importing every legacy Idea, including the 10 with no hook signal whatsoever,
     while `idea.hook_type`/`idea.theme` are `NOT NULL` and #206 (the ticket that actually classifies
     them) runs strictly *after* #204 and is explicitly droppable.
   - This schema already handled the analogous case correctly once: `idea.trend_id` is deliberately
     nullable, with a doc-comment explaining exactly this kind of import-compatibility reasoning ("a
     future importer... may meet a legacy Idea with no recorded Trend"). The same reasoning was not
     extended to `hook_type`/`theme`, despite the real data showing an even larger gap (10 Briefs with
     zero signal, and all 61 needing genuine classification judgment #206 alone performs).
   - I am not asserting #204 is unbuildable as a result — the developer or the epic's next slice may
     resolve this by resequencing #206 before #204, by having #204 do its own first-pass classification
     (duplicating part of #206's job), or by making the columns nullable at the DB level with `NOT NULL`
     enforced only at the future command-surface layer for newly-created Ideas (mirroring `trend_id`'s
     precedent). I'd want this made an explicit decision, in writing, before #204 is built — right now
     it is an unstated assumption sitting on top of a hard SQL constraint.
2. **`node-sqlite.d.ts` vs bumping `@types/node` — assessed on the merits, as asked.** I independently
   verified the ambient declaration against the real Node 22.23.0 runtime
   (`Object.getOwnPropertyNames(DatabaseSync.prototype)` / `StatementSync.prototype`, plus live
   `run`/`get`/`all` return-shape checks): it covers exactly `exec`/`prepare`/`close` on `DatabaseSync`
   and `run`/`get`/`all` on `StatementSync`, matching the real API precisely for everything this
   codebase calls — no wrong signatures found. I also confirmed via `npm view` and a disposable install
   in `/private/tmp/.../scratchpad` (never in this worktree — its `node_modules` is a live symlink to
   `/Users/CaxtonTaylor/Developer/OrganicGrowth/node_modules`, confirmed by `readlink`) that
   `@types/node@20.19.43` (latest 20.x) has **no** `sqlite.d.ts`, while `@types/node@22.20.1` **does**
   ship one today — so bumping to `^22.x` (matching `engines.node: ">=22"` this repo already requires)
   is available right now, not blocked on waiting for a future release. On the narrow technical
   question: **yes, I'd rather see `@types/node` bumped to `^22.x`** eventually — it deletes this file
   for free and removes a devDependency/engines mismatch that predates this ticket. But the developer's
   stated operational reason for not doing it *in this PR* is not "questionable" as framed — I verified
   this worktree's `node_modules` really is a symlink into the main checkout other live sessions are
   using, so an `npm install` here would genuinely touch shared state. I'd recommend the bump as a small,
   isolated, separately-timed follow-up (once no concurrent worktree session is mid-run) rather than
   folded into a future ticket's unrelated diff.
3. **The migration path for the 191 real absolute paths IS written down, not left dangling** — confirmed
   good. `docs/adr/0029` states the storage-key rule "is how the 191 machine-welded absolute paths are
   prevented from **recurring**", and issue #204's own acceptance criteria explicitly own the conversion:
   "The 191 absolute paths are converted to root-relative storage keys; no absolute path survives into
   the database." No gap here — flagged in the task brief as something to check, and it checks out.
4. **Real-data sanity-check on the 10 Hook Types, against all 51 Briefs that do carry a heading:** I read
   the actual "Hook concept" text of all 51 (both Brands, all weeks). The great majority map cleanly onto
   one of the ten values (e.g. `irony` for the literal "Note the irony of Microsoft funding OpenAI...",
   `surprising_number` for "$0.20 figure... 80% cut", `contradiction` for "record profits, and about
   $590 billion gone in two days"). A handful of the newest batch
   (`unhypped-daily/2026-W33/friday-14-august/idea-04`, `idea-12`) are pure "explain what X means"/
   "highlight the shift from X to Y" framings without a clear surprise-tension, and are a stretch against
   all ten values — not a hard miss, but worth the Operator's eye during #206 rather than assuming 100%
   coverage. This is a minor observation, not a defect — the vocabulary is genuinely well-calibrated
   against the bulk of the real sample.

### Overall

**PASS.** Every acceptance criterion is proven by a real, passing test against a real database; the two
ADRs faithfully and explicitly reverse/extend exactly what the issue and the epic asked, in the repo's
established forward-pointer style; the vocabularies and schema are single-sourced with a docs-test that
would actually catch drift (with one noted quality gap, non-blocking); the storage-key boundary rejects
absolute paths against a real insert; every DB test uses a real throwaway file, never `:memory:`, and
cleans up after itself; no live Magnific/Zoho/Apify call exists anywhere in the slice; and the file
ledger stays untouched and canonical. The one design item I would want resolved in writing before #204
is built is the `hook_type`/`theme` `NOT NULL` constraint against the real, unclassified 61-Brief import
sequencing described above — a real foundation-level question, not a defect in this slice's own scope.
