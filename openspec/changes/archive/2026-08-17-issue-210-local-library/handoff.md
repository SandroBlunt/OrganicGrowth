# Slice Handoff — issue #210, "The local read-only Library"

## Build Report (developer)

### What changed

Built the destination of epic #195: a small local `node:http` server that renders HTML from the SQLite
database `docs/adr/0029`/`src/db/` already ships, and **never writes to it**. Four screens:

1. **Library** (`GET /`) — every Asset, sortable by Performance Score/Fit Score/produced date/title,
   filterable by hook type, theme, Recipe, and Format.
2. **Asset page** (`GET /assets/:id`) — its Production Spec, media, Copy variants, Post URLs, and
   metric/score history, all on one page (never tabs).
3. **Run & queue state** (`GET /queue`) — every Job, grouped into produced/parked/failed/running/
   queued/done, without reading `data/queue.json`.
4. **Fit vs Performance chart** (`GET /chart`) — a hand-rolled SVG scatter, both axes labeled
   "(predicted)"/"(measured)" explicitly, an unscored Idea listed separately (never plotted at 0).

Plus `GET /top` (Question 1's own screen — top 5 by Performance Score, Specs side by side) and
`GET /media/:id` (byte-serving a produced Asset's media off local disk).

**Read-only is structural, not a policy.** The CLI (`npm run library`) opens the database via
`openDatabase(dbPath, { readOnly: true })` — a new, additive option on `src/db/connection.ts` backed by
`node:sqlite`'s own `DatabaseSync({ readOnly: true })`, verified by hand to make a write throw at the
SQLite layer itself. Every server route only ever calls a store's READ function; the server refuses
every non-`GET` method, for every path, before any route is consulted — no `POST`/`PUT`/`PATCH`/`DELETE`
handler exists anywhere in `src/library/**`.

The Asset-to-Production-Spec join the issue named explicitly is real: `asset.spec_json` sits on the same
row as `asset.id`/`asset.idea_id`/`asset.recipe_slug` (`src/db/schema.ts`, issue #201) —
`AssetStore.getAssetById`/`listAllAssets` already return it inline. `src/library/read-model.ts` never
parses a filename to find a Spec.

### Files touched

New:
- `src/library/types.ts` — shared view-model shapes.
- `src/library/read-model.ts` (+`.test.ts`) — the thin, impure layer composing typed store reads into
  view models.
- `src/library/filter-sort.ts` (+`.test.ts`) — pure filter/sort/top-N logic.
- `src/library/queue-classify.ts` (+`.test.ts`) — pure Job/Asset -> bucket classification.
- `src/library/media.ts` (+`.test.ts`) — resolves `storage_key` + Brand `media_root` and reads bytes.
- `src/library/server.ts` (+`.test.ts`) — the `node:http` orchestration shell.
- `src/library/read-only.test.ts` — the direct read-only proof.
- `src/library/test-support.ts` — fixture-seeding helpers (path contains "test", exempt from both
  boundary guards, same convention as `src/db/test-support.ts`).
- `src/library/render/{html,library,asset,queue,chart,top}.ts` (+`.test.ts` each) — pure HTML rendering.
- `src/commands/run-library-viewer.ts` (+`.test.ts`) — the CLI entry (`npm run library`).
- `openspec/changes/issue-210-local-library/` — this change (proposal, tasks, spec deltas).

Modified:
- `src/db/connection.ts` (+`.test.ts`) — additive `{ readOnly?: boolean }` option on `openDatabase`.
- `src/db/node-sqlite.d.ts` — the ambient `DatabaseSyncOptions`/constructor-overload addition.
- `src/asset/store.ts` (+`db-store.test.ts`) — `listAllAssets`, `getAssetMediaById`.
- `src/post/store.ts` (+`.test.ts`) — `listAllPosts`.
- `src/production-queue/job-store.ts` (+`.test.ts`) — `listAllJobs`.
- `src/fs-boundary/allow-list.ts` — one new audited entry, `src/library/media.ts`.
- `package.json` — new `library` script.

### How to run

```bash
# Build a local, git-ignored database from the real, committed data/brands/** corpus:
npm run import-data
npm run backfill-hook-theme

# Start the viewer (defaults: data/organicgrowth.db, port 4173):
npm run library
# or: npm run library -- --db data/organicgrowth.db --port 4321

# Type-check + full suite:
npm test
# Docs-tests:
npm run test:docs
# OpenSpec:
npx openspec validate issue-210-local-library --strict
npx openspec validate --all --strict
```

Single test file: `node --import tsx --test src/library/read-model.test.ts` (etc.)

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proven by |
|---|---|---|
| 1 | A local process renders HTML from the database and never writes to it | `src/library/read-only.test.ts` (direct proof: a write through the SAME connection the server runs against throws); `src/library/server.test.ts`'s 28-combination `{POST,PUT,PATCH,DELETE} x {every route}` → 405 sweep |
| 2 | Library screen lists every Asset, sortable by Performance Score | `src/library/read-model.test.ts` ("buildLibraryIndex" suite — every Asset appears); `src/library/filter-sort.test.ts` ("sortLibraryRows" suite — performance sort, ties, missing-last) |
| 3 | Library filters by hook type, theme, Recipe, Format | `src/library/filter-sort.test.ts` ("matchesLibraryFilter / applyLibraryFilter" suite); `src/library/server.test.ts` ("GET /?hookType=… narrows…") |
| 4 | Asset page shows Spec, media, Copy variants, Post URLs, metric history together | `src/library/read-model.test.ts` ("getAssetDetail" suite); `src/library/render/asset.test.ts` ("Post URLs together with metric and score history on the SAME page"); `src/library/server.test.ts` ("GET /assets/:id renders…") |
| 5 | A chart plots Fit Score against Performance Score, wrong prediction visible on sight | `src/library/render/chart.test.ts` (labels both axes "(predicted)"/"(measured)", never confuses one for the other, ties all drawn, unscored listed separately) |
| 6 | Run & queue state screen — produced/parked/failed, without reading JSON | `src/library/queue-classify.test.ts`; `src/library/render/queue.test.ts`; `src/library/read-model.test.ts` ("buildQueueRows" suite) |
| 7 | Q1 — top 5 Assets by Performance Score, Specs side by side, by clicking | `src/library/filter-sort.test.ts` ("topAssetsByPerformance" suite); `src/library/render/top.test.ts`; `GET /top` in `server.test.ts` |
| 8 | Q2 — every Idea that used a given hook type, by clicking | `src/library/server.test.ts` ("GET /?hookType=irony narrows to matching rows"); `src/library/filter-sort.test.ts` |
| 9 | Q3 — how well Fit Score predicted Performance, by clicking | `src/library/render/chart.test.ts`; `GET /chart` in `server.test.ts` |
| 10 | No write path at all — not a disabled button, no endpoint | `src/library/read-only.test.ts`; `src/library/server.test.ts`'s 28-combination sweep; `src/library/render/library.test.ts`/`html.test.ts` assert no `<form method="post">` anywhere; the server's own source has no `POST`/`PUT`/`PATCH`/`DELETE` branch to disable in the first place |

### Fakes / fixtures used

- **No Magnific fake needed and none touched.** This slice never imports the `magnific` MCP surface, a
  Space driver, or any live-adapter module — it only reads the local SQLite database. Confirmed: `grep
  -rn "magnific\|SpaceMcpPort\|spaces_\|creations_" src/library src/commands/run-library-viewer.ts`
  returns nothing.
- **`src/db/test-support.ts`'s `withTempDb`** — every unit/integration test opens a real, empty,
  throwaway SQLite file (never `:memory:`), the epic's own established Testing Decision.
- **`src/library/test-support.ts`** (new) — richer fixture seeding for the Library's own tests: multiple
  Ideas/Assets/Posts with deliberately varied hook type/theme/Recipe/Format/Performance-Score data,
  including several Posts tied at the SAME score and Posts logged but never scored — reproducing exactly
  the two behaviors ("every score is identical," "a score is missing entirely") this ticket's brief
  called out by name.
- **The real one-shot importer + real Hook Type/Theme backfill, run in-process against this repo's own
  committed `data/brands/**`** — the "prove it, don't assert it" integration test
  (`src/library/read-model.test.ts`'s last `describe` block): builds a temp database from the REAL data,
  no network call, and asserts the read model reports exactly the counts
  `docs/import-reconciliation-2026-08-17.md` documents.
- A real temp-directory file (`mkdtemp`) for `media.test.ts`/`server.test.ts` — proving byte-serving
  against a genuine file on disk, never a mocked filesystem.

### Self-review notes

- Chose **plain N+1 lookups** (resolve an Idea/Format/Brand per Asset via already-existing `getX(db,
  id)` reads, memoized per `buildLibraryIndex`/`buildQueueRows` call via a small `Lookups` class) over
  hand-written SQL joins in `read-model.ts`. At the real corpus's size (54 Assets, 61 Ideas, 66 Jobs) this
  is milliseconds and keeps every query attributable to an existing, already-tested typed store function
  — no new raw SQL anywhere in `src/library/**`, matching the brief's own instruction ("not raw SQL
  scattered through render code").
- Removed an early draft of a `takes the BEST score` test that recorded two Posts on the SAME Channel
  for one Asset — `recordPost` upserts keyed on `(asset_id, channel_id)`, so that would have silently
  tested one Post overwriting itself, not two. Fixed to use a genuinely second Channel (LinkedIn),
  matching CONTEXT.md's own "Post": "at most one Post per Channel."
- Kept `types.ts` free of any runtime logic (pure type declarations) so `render/**` can import shapes
  without any risk of pulling in database code — verified by the `node:fs`/store-write guards passing
  unchanged with the whole new module tree added.
- `formatScore`/`formatDate` centralize the ONE wording decision ("not yet tracked" for a missing score,
  never `"0%"`) so every screen says the same honest thing rather than five slightly different guesses.

### Known limits

- **The real corpus's `asset_media` (259 rows on the Operator's machine) and `copy_variant` (0 rows
  anywhere yet) are genuinely empty in THIS worktree's own import.** Produced media lives under a
  Brand's `ideas/**/*.output/` directories, deliberately git-ignored ("too heavy for git," `.gitignore`'s
  own comment) — a fresh checkout/worktree never has them. Running `npm run import-data` in this
  worktree therefore reports every legacy media path as "dead" (confirmed: ~260 dead paths, matching the
  real reconciliation report's own ~259-media-row count). The Asset page's Media/Copy sections are built
  and tested against a real file on disk (a fixture) and render their genuine "none yet" empty state
  honestly against the real corpus — this is not a bug, it is what this worktree's real data actually
  contains.
- **No Performance Score has ever been computed for the real corpus.** `performance_score` (SQL) is `0`
  rows; every one of straw-motion's 7 posted Assets' `performance_score` is `undefined` in `ledger.json`
  too (verified directly) — `/track-performance` has never run against the brand-new Page. This change
  does NOT compute or write one (that is a live Apify call, out of scope for a hermetic, read-only
  build) — the Library, Top-5, and Chart screens all currently show "not yet tracked" / "0 scored"
  against the real database. The "several ties at 0.5" and "missing entirely" behaviors the brief called
  out are proven with a seeded fixture instead (see above), since the real data only currently exercises
  the "missing entirely" half.
- **Reads bypass the typed command surface (`src/command-surface/`) by design.** That surface's own
  spec scopes it to writes (issue #205 AC2); the store-write boundary guard's own scope is explicit,
  "writes only, never reads." This viewer reads directly from the typed store layer instead — confirmed
  to trip neither `src/fs-boundary/node-fs-guard.test.ts` nor
  `src/store-write-boundary/store-write-guard.test.ts` (both pass, unchanged, with the whole new module
  tree present).
- **Not built:** any write path of any kind (by design — the whole point of the ticket); wiring any
  existing production command onto the SQL stores (out of scope, unrelated to this ticket);
  authentication/multi-user access (single-Operator local tool, matching ADR-0029's own "no
  multi-tenancy" scope).

### Manual smoke test (not part of `npm test`)

Ran once, against a real, locally-built (git-ignored) `data/organicgrowth.db`:

```
$ npm run import-data                    # 2 Brands, 61 Ideas, 54 Assets, 66 Jobs, 7 Posts, 45 Trends
$ npm run backfill-hook-theme             # Updated: 51. Reported: 0. No matching classification: 10.
$ npm run library -- --port 4321 &
$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/           # 200
$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/queue      # 200
$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/chart      # 200
$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/top        # 200
$ curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4321/   # 405
$ curl -s http://localhost:4321/ | grep -c "<tr>"                          # 55 (1 header + 54 Asset rows)
$ curl -s http://localhost:4321/ | grep -oE "[0-9]+ Asset\(s\)\."          # 54 Asset(s).
$ curl -s http://localhost:4321/?hookType=irony | grep -oE "[0-9]+ of [0-9]+ Asset"   # 0 of 54 Asset
$ curl -s http://localhost:4321/chart | grep -oE "[0-9]+ Idea\(s\) plotted.*"
  0 Idea(s) plotted (both a Fit Score and a Performance Score). 61 Idea(s) have a Fit Score but no
  Performance Score yet.
$ curl -s http://localhost:4321/assets/5eb7f27e-... | grep -o "Production Spec"   # present, real JSON
  pretty-printed underneath (a real News Carousel spec with 7 slides' image/video prompts)
```

`0 of 54` for `hookType=irony` is real, not a bug: only 1 real Idea across the whole corpus classified
as `irony`, and it never had a Recipe accepted/an Asset produced — so it never appears in the Library's
per-Asset index at all (which is Asset-scoped, matching AC2's own "lists every Asset").

### Red transcripts (both restored to green afterward)

**1. `read-model.test.ts`'s real-corpus join proof, deliberately broken** (filtered out every
`news-carousel` Asset before asserting the count):

```
not ok 1 - 2 Brands, 61 Ideas, 54 Assets, 66 Jobs, 7 Posts — read back through the SAME read model...
  error: |-
    buildLibraryIndex must carry every one of the 54 real Assets through the join
    21 !== 54
  expected: 54
  actual: 21
```

**2. `read-only.test.ts`'s write-throws proof, deliberately broken** (dropped `{ readOnly: true }` from
the server's own connection):

```
not ok 1 - a raw SQL write through the SAME handle the server is running against THROWS
  error: 'Missing expected exception.'
  expected:
  operator: 'throws'
```

Both restored; `npm test` green afterward (3616 / 945 / 0 fail).

---

## QA Verdict — Round 1: FAIL

Verified in worktree `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-210-local-library`, branch
`issue-210-local-library` at `d3be168`. Every command below was actually run by QA, not read off the
Build Report.

### Suite result

| Check | Command | Result |
|---|---|---|
| Full suite | `npm test` | **3616 / 945 suites, 0 fail** — matches claim exactly; delta from baseline (3488/915) is +128 tests / +30 suites, genuinely new (verified file-by-file against `git diff origin/main...HEAD --stat`, 46 files, all under `src/library/**`, `src/commands/run-library-viewer.*`, plus additive test files on `src/db/connection.ts`, `src/asset/store.ts`, `src/post/store.ts`, `src/production-queue/job-store.ts`) |
| Docs suite | `npm run test:docs` | **349 / 92 suites, 0 fail** |
| Build | `npm run build` | Clean, no errors (`tsc -p tsconfig.build.json`) |
| OpenSpec (change) | `npx openspec validate issue-210-local-library --strict` | `Change 'issue-210-local-library' is valid` |
| OpenSpec (all) | `npx openspec validate --all --strict` | `Totals: 67 passed, 0 failed (67 items)` — includes `change/issue-210-local-library` |

All green, genuinely, on a fresh run. No leftover processes or repo pollution afterward (`git status
--short` clean; `data/organicgrowth.db` confirmed git-ignored).

### Per-criterion results (issue #210 acceptance criteria, taken verbatim)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | A local process renders HTML from the database and never writes to it | **PASS** | Independently reproduced (see "Read-only guarantee" below) — not merely read off the test file |
| 2 | Library screen lists every Asset, sortable by Performance Score | **PASS** | `buildLibraryIndex` returns 54/54 real Assets (verified by direct query); `sortLibraryRows` tie/missing-last tested and matches real all-`0.5`-or-missing corpus shape |
| 3 | Filters by hook type, theme, Recipe, Format | **PASS** | `applyLibraryFilter`/`deriveFilterOptions` tests; live `GET /?hookType=irony` on the real corpus narrows correctly |
| 4 | Asset page shows Spec, media, Copy variants, Post URLs, metric history **together** | **PASS** | `render/asset.ts` puts all five sections on one returned HTML string, no tabs, no secondary fetch; verified live against a real Asset (`5eb7f27e-...`) — Spec + the real logged Post URL rendered on the same page |
| 5 | Chart plots Fit Score vs Performance Score, wrong prediction visible on sight | **PASS** | `render/chart.ts` labels both axes "(predicted)"/"(measured)" explicitly everywhere; an unscored Idea is listed separately, never plotted at 0; ties-at-identical-coordinates and real-corpus-shape (0 scored, 61 awaiting) both tested |
| 6 | Run & queue state screen, without reading JSON | **PASS** | `grep` confirms no `node:fs` import anywhere in `src/library/**` except `media.ts` (a pure `readFile`, unrelated to `queue.json`); `queue-classify.ts` is a pure function of Job/Asset status only |
| 7 | Q1 — top 5 Assets by Performance Score, Specs side by side, by clicking | **PASS** | `GET /top` renders scored Assets in side-by-side `.spec-col` columns with full pretty-printed Specs; states real count when fewer than 5 |
| 8 | Q2 — every Idea that used a given hook type, by clicking | **PASS, with a caveat worth surfacing** | See "AC8 scope note" below — the Library is Asset-scoped, so an Idea that never produced an Asset never appears under any filter. Directly consistent with epic #195's own User Story 47 ("filter Assets by hook type... so question 1 and question 2 are answered by clicking"), and honestly disclosed in the Build Report's own manual smoke test (the real `irony`-classified Idea that never got an Asset). Not treated as a blocking defect, but flagged for Operator awareness since issue #210's own AC8 text says "every **Idea**," not "every Idea with an Asset." |
| 9 | Q3 — how well Fit Score predicted Performance, by clicking | **PASS** | `GET /chart` |
| 10 | No write path at all — not a disabled button, no endpoint | **PASS** | See "Read-only guarantee" below |

### Per-scenario results (spec deltas, `openspec/changes/issue-210-local-library/specs/**`)

All scenarios in `local-library-viewer/spec.md`, `sqlite-foundation/spec.md`, `asset-store/spec.md`,
`post-store/spec.md`, `job-claim-store/spec.md` were traced to a passing test and, where feasible,
independently reproduced by QA outside the test file:

- "A raw SQL write through the server's own connection throws" — **PASS**, reproduced live (see below).
- "A typed store's write function called against the server's own connection throws" — **PASS**,
  reproduced live: `createBrand(reader, ...)` against the read-only handle threw `attempt to write a
  readonly database`.
- "The server still serves real GET requests against the same read-only connection" — **PASS**,
  reproduced live (`200` from `GET /`).
- "A missing/unmigrated database file is refused, never created/migrated" — **PASS**,
  `run-library-viewer.test.ts`.
- "Every write method on every route is refused with 405" — **PASS**, reproduced live against a running
  server with `POST`/`PUT`/`PATCH`/`DELETE`/lowercase methods/`OPTIONS`/an `X-HTTP-Method-Override`
  header — every one 405'd; `TRACE`/`CONNECT` are rejected by Node's own HTTP client before reaching the
  server at all.
- "The Library screen's own filter/sort form only ever issues a GET request" — **PASS**,
  `render/library.test.ts` + visual confirmation (`<form method="get" action="/">`).
- "Every Asset in the database appears in the index" / sort scenarios — **PASS**, reproduced against the
  real corpus (54/54).
- "Filtering by hookType answers 'every Idea that used a given Hook Type' by clicking" — **PASS as
  specified**, but see AC8 caveat above — the spec's own scenario is itself Asset-scoped, which is
  faithful to how the developer built it, but is a narrower claim than issue #210's own AC8 prose.
- "The Asset page shows Spec/media/Copy/Posts/metric history together" — **PASS**, reproduced live.
- "Media served from local disk... degrades to clean 404" — **PASS**, reproduced live (see path-traversal
  section below).
- "Chart labels predicted vs measured, never plots unscored at 0, ties all drawn" — **PASS**.
- "Run & queue classifies produced/parked/failed/running/queued/done" — **PASS**.
- "Top-5 shows Specs side by side, states real count when fewer than 5" — **PASS**.
- `sqlite-foundation`'s `readOnly` scenarios — **PASS**, reproduced live (see below).
- `asset-store`/`post-store`/`job-claim-store`'s new `listAll*` scenarios — **PASS**, reproduced live
  against the real corpus (61 Ideas / 54 Assets / 66 Jobs / 7 Posts, matching
  `docs/import-reconciliation-2026-08-17.md`).

### Read-only guarantee — attacked directly, not read off the test

QA wrote and ran its own script (not the developer's test file) against a fresh temp database, opening
the connection exactly as `run-library-viewer.ts` does and handing it to the real `createLibraryServer`:

- Raw SQL `INSERT` through the server's own connection → **threw** `Error: attempt to write a readonly
  database`.
- The typed store's own `createBrand(reader, ...)` write function against the same connection → **threw**
  the identical error.
- Every HTTP method attempted against the running server (`POST`, `PUT`, `PATCH`, `DELETE`, lowercase
  `post`/`Post`, `OPTIONS`, plus a `GET` with an `X-HTTP-Method-Override: POST` header, plus a `POST` with
  an `X-HTTP-Method-Override: GET` header) → **all 405**, none slipped through.
- `TRACE`/`CONNECT` are refused client-side by Node's `fetch` before ever reaching the server.

**The `openDatabase` default is `readOnly: false`** (`src/db/connection.ts`) — a real foot-gun *in
principle*, but not in practice here: `grep -rn "openDatabase" src/library src/commands/run-library-viewer.ts`
shows exactly ONE production call site (`run-library-viewer.ts`'s `prepareLibraryViewer`), and it always
passes `{ readOnly: true }`. Crucially, `run-library-viewer.test.ts`'s third test does not just assert the
option was passed — it inserts through `prepared.db`, the actual handle `prepareLibraryViewer` built and
the actual server runs against, and asserts the insert throws `/readonly/i`. That closes the gap a
weaker "assert the argument was `true`" guard would have left (the exact shape of #212's boolean-not-true
guard failure this epic has already been burned by). The default itself is honestly documented in the
`sqlite-foundation` spec delta as intentional, additive backward-compatibility for existing read-write
callers, not concealed.

### Path traversal (`/media/:id`) — attacked directly

QA wrote a script serving a real `SECRET.txt` one directory above a configured `media_root`, and hit
`/media/:id` with `../SECRET.txt`, `..%2f..%2fSECRET.txt`, `%2e%2e%2f...`, double-encoded, and
`%2Fetc%2Fpasswd` variants. **Every attempt returned 404.** Root cause confirmed by reading the code, not
assumed: `mediaId` is used purely as a `WHERE id = ?` parameterized lookup key against `asset_media`
(`getAssetMediaById`) — it never touches path construction. The actual filesystem path is built from
`asset_media.storage_key` (a database column) joined against the owning Brand's `media_root`
(`resolveMediaAbsolutePath`), and `storage_key` is validated at WRITE time by the pre-existing
`assertRootRelativeStorageKey` (issue #201) to reject any `..` segment, absolute path, or home-directory
shorthand. No path traversal is reachable through this route.

### Network binding — **DEFECT, see below**

`src/commands/run-library-viewer.ts`'s `main()` calls `server.listen(port, res)` with **no host
argument**. QA started the real CLI (`npm run library -- --port 4322`) and confirmed with `lsof` that it
binds `TCP *:4322 (LISTEN)` — all interfaces, not loopback — and confirmed live that the server answered
`200` when curled from the machine's own LAN IP (`192.168.18.18`), i.e. from anywhere else on the same
network. See defect list.

### Real-corpus counts — verified independently, and asked what the test does not count

QA queried the real, git-ignored `data/organicgrowth.db` directly (bypassing both the developer's test
and the read model) and got: `brand=2, idea=61, asset=54, job=66, post=7, asset_media=0, copy_variant=0` —
exactly matching the Build Report's claim and `docs/import-reconciliation-2026-08-17.md`. QA then called
`buildLibraryIndex`/`buildQueueRows`/`getAssetDetail` directly — the SAME functions `server.ts`'s
`handleGet` calls, not a parallel query — confirming `buildLibraryIndex` returns all 54 real rows and
`buildQueueRows` returns all 66 real rows.

**What `read-model.test.ts`'s real-corpus test does NOT count:** it asserts `listAllPosts(db).length ===
7` and `countAllPosts(db) === 7`, but never asserts the *content* of any of those 7 real Post rows (URL,
channel) survives the join — only a synthetic-fixture test checks `postUrl` field-level correctness. This
is exactly the shape of blind spot #204's reconciliation was burned by (a balanced count while dropping
every URL). QA closed this gap by hand: called `getAssetDetail` for all 7 real posted Assets and confirmed
every one of the 7 real `https://www.facebook.com/...` URLs is present, correctly attributed one-per-Asset,
through the join. **The underlying behavior is correct** — this is a test-coverage gap, not a live bug —
but it should be closed with an assertion in the same test, not left to a manual QA check to catch next
time.

### Always-rules + Magnific-fake + hermeticity checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | **PASS** | No write path exists at all; nothing publishes |
| Public-metrics-only | **PASS** | No new metrics source; `grep -rln "apify\|Apify" src/library` hits only a fixture's `source: "apify"` string literal and a doc comment — no network call |
| Relative-not-absolute | **PASS** | `sortLibraryRows`/`topAssetsByPerformance` rank on `bestPerformanceScore` (already baseline-relative) only; the Asset page's raw reaction/comment/share/view numbers are shown as supporting detail alongside the score, never used for ranking/comparison |
| Explicit-attribution | **PASS** | Post URLs rendered are read back verbatim from what `/log-post` recorded; never inferred |
| Ledger-as-source-of-truth | **PASS (not applicable — no writes)** | This viewer performs zero writes of any kind; `ledger.json` remains untouched and unread by this module |
| Magnific fake / hermeticity | **PASS** | `grep -rln "magnific\|SpaceMcpPort\|spaces_\|creations_" src/library src/commands/run-library-viewer.ts` → no hits; no ledger/queue.json writes (`queue.json`/`ledger.json` mentions are comments stating the module does NOT touch them) |
| Guards: `src/fs-boundary/` | **PASS** | One new, narrowly-scoped, well-justified allow-list entry: `src/library/media.ts` (a single pure `readFile`) |
| Guards: `src/store-write-boundary/` | **PASS** | `git diff origin/main...HEAD -- src/store-write-boundary/` is empty — **zero** new allow-list entries, correctly consistent with a read-only viewer (a new entry here would have been a contradiction) |
| No new runtime dependency | **PASS** | `git diff origin/main...HEAD -- package.json` shows only a new `library` script; no new `dependencies` entry |

### Defect list

1. **[HIGH] The Library server binds to all network interfaces, not loopback-only — a real local-network
   data exposure, untested by any test in the suite.**
   - **What's wrong:** `src/commands/run-library-viewer.ts`'s `main()` (`await new Promise<void>((res) =>
     server.listen(port, res));`) omits the host argument. Node's documented default when no host is
     given is to accept connections on all available interfaces. Every one of the three test files that
     exercise `.listen()` (`server.test.ts`, `read-only.test.ts`, `run-library-viewer.test.ts`) explicitly
     passes `"127.0.0.1"` as the host — so the actual behavior of the shipped `main()` entry point is
     never exercised by any test. This is the "green and blind" pattern this epic has already been burned
     by six times, in a new place. It also directly contradicts epic #195's own architecture decision #3,
     "The UI is a local HTML viewer, **not a web app**" — the current binding makes it reachable from any
     device on the same network, i.e. functionally a web app on the LAN, exposing the Operator's brand
     Copy, Production Specs, Post URLs and media to anyone on that network (e.g. shared office wifi, a
     coffee shop).
   - **Repro steps:**
     ```
     cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-210-local-library
     npm run import-data && npm run backfill-hook-theme   # if data/organicgrowth.db doesn't exist yet
     npm run library -- --port 4322 &
     lsof -nP -iTCP:4322 -sTCP:LISTEN
     # → COMMAND PID ... TCP *:4322 (LISTEN)     <- wildcard bind, not 127.0.0.1:4322
     curl -s -o /dev/null -w "%{http_code}\n" http://$(ipconfig getifaddr en0):4322/
     # → 200, from the machine's own LAN-facing IP — i.e. reachable from any other device on the network
     ```
   - **Suggested fix:** `server.listen(port, "127.0.0.1", res)` (or `"localhost"`), plus a regression
     test that calls the real `main()`/`prepareLibraryViewer` + `.listen()` path (not a hand-built
     `createLibraryServer` + manual `"127.0.0.1"` listen) and asserts the bound address is loopback.

2. **[LOW, non-blocking] The real-corpus integration test proves Post *count* survives the join, never
   Post *content*.**
   - **What's wrong:** `src/library/read-model.test.ts`'s "against the REAL imported corpus" test asserts
     `listAllPosts(db).length === 7` / `countAllPosts(db) === 7`, but never asserts that the real 7 Posts'
     `postUrl`/`channelPlatform` fields survive `getAssetDetail`'s join. This is exactly the shape of blind
     spot issue #204's own reconciliation was burned by (a balanced count while every URL was silently
     dropped) — a future regression that dropped every real Post's URL while keeping the count at 7 would
     pass this test.
   - **Repro / verification:** QA independently confirmed the underlying behavior IS correct today (see
     "Real-corpus counts" above) — this is a coverage gap, not a live bug, filed so it doesn't regress
     silently.
   - **Suggested fix:** In the same real-corpus test, after asserting the counts, also assert
     `getAssetDetail(db, <a real posted Asset's id>).posts[0].postUrl` matches a known real URL (or at
     minimum that every real Post's `postUrl` is a non-empty `https://` string) — closing the gap with an
     assertion rather than relying on manual QA to catch it.

3. **[LOW, note only, non-blocking] AC8's literal "every Idea" is narrower in practice: Asset-scoped, not
   Idea-scoped.**
   - **What's wrong:** issue #210's own AC8 text reads "every **Idea** that used a given hook type."
     The shipped Library only ever lists Assets — an Idea that was rejected, or accepted but never
     produced an Asset, never appears anywhere in the Library under any filter. Live-verified: the real
     corpus's one Idea classified `hookType: irony` is invisible under `GET /?hookType=irony` (`0 of 54`)
     because it never had a Recipe accepted/an Asset produced.
   - **Why this is not treated as blocking:** epic #195's own User Story 47 explicitly frames the
     mechanism the same way the developer built it — "filter Assets by hook type... so question 1 and
     question 2 are answered by clicking" — and the Build Report's own manual smoke test discloses the
     `0 of 54` result plainly, unprompted, rather than hiding it.
   - **Suggested action:** no code change required for this round; worth a one-line disclosure in the
     Library screen itself ("Assets only — a rejected or not-yet-produced Idea won't appear here") so a
     future Operator doesn't misread a `0 of 54` result as "no Idea ever used this hook type."

### Overall

**FAIL — Defect 1 (HIGH) is real, live-reproduced, and untested by the suite**, and blocks this round.
Defects 2 and 3 do not block on their own (both are coverage/disclosure gaps behind correct underlying
behavior) but should be addressed in the same pass. Everything else — the read-only guarantee, the
route/method sweep, path-traversal resistance, the real-corpus join, the guard boundaries, hermeticity,
and nine of the ten acceptance criteria — is genuinely proven, not merely asserted, and passes.

---

## Build Report — Round 2

Fixes all three Round 1 defects. No other part of the slice was touched — QA's Round 1 pass on the
read-only guarantee, the media path-traversal safety, the 405 sweep, and the real-corpus counts stands
unchanged and was not re-litigated.

### Defect 1 (HIGH) — network binding — FIXED

**Root cause:** `src/commands/run-library-viewer.ts`'s `main()` called `server.listen(port, res)` with no
host argument. Node's documented default when no host is given is to bind every available interface.

**Fix:**
- Added an explicit `const LOOPBACK_HOST = "127.0.0.1"` and changed the real listen call to
  `server.listen(port, LOOPBACK_HOST, res)`.
- The deeper ask — a test that exercises the real CLI path, not a re-implementation of it — required a
  small, honest refactor: `main()` now accepts an optional `argv` (defaulting to the real
  `process.argv.slice(2)`) and *returns* the `PreparedLibraryViewer` (now listening) instead of `void`.
  This lets a test call the literal exported `main()` — the exact function the `npm run library` CLI
  invokes at its entry point below — with a throwaway migrated database and an OS-assigned port, then
  inspect `server.address()` directly, then close it itself. Nothing about `main()`'s behavior as the CLI
  entry point changed: the entry-point block at the bottom of the file still calls `main()` with no
  arguments and ignores its return value.
- Fixed a latent, adjacent bug this surfaced: `prepareLibraryViewer`'s own port parsing rejected `0`
  (`parsedPort > 0`), silently falling back to the real default port `4173` — meaning a test passing
  `--port 0` (the OS "assign a free port" convention) was actually binding the real default port, a
  collision risk with any concurrently-running viewer. Changed the guard to `parsedPort >= 0` (a real
  user still can't pass a negative or garbage port; `0` now means what it means everywhere else).

**Files touched:** `src/commands/run-library-viewer.ts` (fix + refactor),
`src/commands/run-library-viewer.test.ts` (new regression test),
`openspec/changes/issue-210-local-library/specs/local-library-viewer/spec.md` (new Requirement).

**Red → green transcript** (temporarily reverted the fix — `server.listen(port, res)` with no host — ran
the new test, restored, ran again):

Red (host argument removed):
```
$ node --import tsx --test src/commands/run-library-viewer.test.ts
not ok 5 - main() — the REAL CLI entry point, not a re-implementation of it — binds loopback-only, never every interface (issue #210 QA round 1, defect 1)
  error: |-
    expected main() to bind loopback-only ("127.0.0.1"), got "::" — reachable from every network
    interface, not just this machine

    '::' !== '127.0.0.1'
  expected: '127.0.0.1'
  actual: '::'
  operator: 'strictEqual'
# tests 5
# pass 4
# fail 1
```
This is the exact defect QA reproduced live via `lsof`/`curl` from the LAN IP, now caught by the suite
itself instead of requiring a human with `lsof`.

Green (fix restored, `server.listen(port, LOOPBACK_HOST, res)`):
```
$ node --import tsx --test src/commands/run-library-viewer.test.ts
ok 5 - main() — the REAL CLI entry point, not a re-implementation of it — binds loopback-only, never every interface (issue #210 QA round 1, defect 1)
# tests 5
# pass 5
# fail 0
```

The new test calls `main()` itself (not a hand-built server with the test's own hardcoded host), so a
future edit that drops the host argument from `main()`'s own `server.listen()` call breaks CLI behavior
and this test in the SAME commit — the "green and blind" pattern QA named cannot recur here undetected.

### Defect 2 (LOW) — real-corpus test counted Posts, never checked their URL content — FIXED

Added, inside the SAME real-corpus test (`src/library/read-model.test.ts`, "against the REAL imported
corpus"), right after the existing count assertions:

1. **Ground truth pulled from the source of truth, not re-derived.** Read straw-motion's real
   `ledger.json` via the SAME typed `loadFullIdeas` loader the one-shot importer itself reads through
   (`src/ledger/ledger.ts` — never hand-parsed JSON), collected the real, non-null `post_url` on every
   Idea's every Asset, and asserted there are exactly 7 (a sanity check on the ground truth itself).
2. **Through `buildLibraryIndex`** (what the Library screen, AC2, actually renders) — flattened every
   row's `posts[].postUrl`, asserted the resulting set has exactly 7 members, and that every one of the 7
   real ledger URLs is present, verbatim.
3. **Through `getAssetDetail`** (what the Asset page, AC4, actually renders) — for EVERY one of the 7 real
   posted Assets (never a single sampled row, since issue #204's own blind spot hid across all 7), called
   `getAssetDetail` and asserted the resulting Post-URL set is EXACTLY (not a subset/superset of) the real
   7 from `ledger.json`.

**Proved the new assertions have teeth**, not just that they pass today: temporarily changed
`read-model.ts`'s `getAssetDetail` to return a hardcoded fake `postUrl` for every Post, re-ran the file —
**2 tests went red** (the pre-existing fixture-level `getAssetDetail` test AND the new real-corpus
assertion, both catching it independently), then reverted and confirmed green again (`git diff -- src/
library/read-model.ts` is empty — the revert is byte-for-byte the original).

**"What else does the real-corpus test count without checking?"** — audited every count in that test:

- **Posts (7) → FIXED above** (URL content).
- **Specs (`hasSpec`)** — same shape of gap, and directly on-theme with this same epic's own #212 finding
  ("verified a field was a boolean rather than *true*"): the test never checked that a real Asset's saved
  `spec_json` carries actual content, only that `hasSpec` is a truthy boolean. **Fixed in the same pass:**
  for every real Asset where `hasSpec === true` (not just one sample), asserted `getAssetDetail`'s `spec`
  is non-null AND carries genuinely non-trivial content — checked generically (at least one own key whose
  value is a non-empty array/string/object), because the three wired Recipes' Specs have three different
  shapes (News Carousel's own top-level key is `slides`; Character Explainer with Cast's are
  `character_concepts`/`clips`/`thumbnails`; News Short Script's is `beats`) and a single hardcoded key
  would only have covered one Recipe.
- **Ideas (61) / Assets (54) / Jobs (66)** — left as row counts. Reasoned about and decided to leave:
  Job rows are internal Production Queue bookkeeping, already covered field-by-field at the fixture level
  by `job-store.test.ts`/`queue-classify.test.ts`, and carry no Operator-facing content whose silent loss
  would be as consequential as a dropped Post URL or an emptied Spec (the two things an Operator actually
  reads off these two screens per AC2/AC4/AC7). Idea/Asset row *identity* (id, status) is already
  exercised structurally by the join succeeding at all (54/54, 61/61) plus the `hookType`/`theme`
  non-empty-string checks already in the test.
- **Fit Score** — `hookType`/`theme` non-empty-string presence was already checked against the real
  corpus; the real `fitScore` *numeric* content is checked at the fixture level
  (`buildFitPerformanceData` round-trips a real number), but not against the real corpus specifically.
  Left for a future round: lower risk than the two fixed above (a dropped Fit Score would be visually
  obvious on the Library screen and the Fit-vs-Performance chart as a missing point, not silently absent
  the way a URL string can be), and this round is scoped to the three defects QA actually filed.
- **`mediaCount`/media rows** — already correctly and honestly `0` in this worktree (git-ignored
  `*.output/` directories don't exist in a fresh checkout) and already disclosed, verified, and accepted
  by QA in Round 1's "Known limits" — not re-touched.

**Files touched:** `src/library/read-model.test.ts` only (test-only change; no production code changed
for this defect).

### Defect 3 (LOW) — AC8's "every Idea" vs. the shipped Asset-scoped filter — DECISION: kept Asset-scoped, disclosed plainly, not widened

**Decision:** kept the Library Asset-scoped (matching epic #195's own User Story 47 — "filter *Assets* by
hook type" — and the shipped `buildLibraryIndex`/`applyLibraryFilter` shape QA already reviewed and
passed on every other axis). Widening to genuinely "every Idea" would mean a second, Idea-scoped index/
screen showing rejected and never-produced Ideas — a real scope change to a screen QA already verified
correct for what it does, not a defect fix, and outside this round's "fix the three filed defects, don't
redo the slice" instruction.

**What changed instead:** added QA's own suggested action — a plain, always-visible one-line disclosure
on the Library screen itself, in both the populated and empty-result states, so a `0 of 54` result for a
Hook Type nobody produced an Asset for is never misread as "no Idea ever used this hook type":

> Asset-scoped: an Idea that was rejected, or accepted but never produced an Asset, will not appear here
> or under any filter below.

**Files touched:** `src/library/render/library.ts` (the disclosure line, in both branches),
`src/library/render/library.test.ts` (new test asserting it renders in both the populated and empty-
result states), `openspec/changes/issue-210-local-library/specs/local-library-viewer/spec.md` (the
Hook-Type-filter Requirement now states the Asset-scoping and the disclosure explicitly, matching what's
actually shipped).

This is a disclosure, not a scope widening — issue #210's own AC8 is still met the same way it was in
Round 1 (by clicking a hook-type filter on the Asset list), now with the limit stated on the page instead
of only in the Build Report.

### Suite / build / spec results (Round 2, fresh run)

| Check | Command | Result |
|---|---|---|
| Full suite | `npm test` | **3618 / 945 suites, 0 fail** (+2 tests vs. Round 1's 3616/945: the new `main()` loopback regression test, and the new AC8-disclosure render test; 0 new suites — both landed inside existing `describe` blocks) |
| Docs suite | `npm run test:docs` | **349 / 92 suites, 0 fail** — unchanged from Round 1 |
| Build | `npm run build` | Clean, no errors |
| OpenSpec (change) | `npx openspec validate issue-210-local-library --strict` | `Change 'issue-210-local-library' is valid` |
| OpenSpec (all) | `npx openspec validate --all --strict` | `Totals: 67 passed, 0 failed (67 items)` |

`git status --short` shows exactly the 7 files touched this round (6 code/test files + this handoff);
`src/library/read-model.ts` itself has an EMPTY diff — the temporary break used to prove Defect 2's new
assertions have teeth was fully reverted, byte-for-byte.

### Files touched this round

- `src/commands/run-library-viewer.ts` — loopback bind fix, `main()` made testable (optional `argv`,
  returns the prepared+listening viewer), `--port 0` fixed to mean "OS-assigned," not "fall back to
  4173."
- `src/commands/run-library-viewer.test.ts` — new regression test calling the real `main()`.
- `src/library/read-model.test.ts` — real-corpus test now asserts Post URL content (all 7, through both
  `buildLibraryIndex` and `getAssetDetail`) and real Spec content (every `hasSpec` row, generically across
  all three wired Recipes' Spec shapes).
- `src/library/render/library.ts` — AC8 Asset-scoping disclosure line.
- `src/library/render/library.test.ts` — test for the new disclosure line.
- `openspec/changes/issue-210-local-library/specs/local-library-viewer/spec.md` — new loopback-binding
  Requirement; the Hook-Type-filter Requirement amended to state the Asset-scoping and disclosure.

### How to run (unchanged from Round 1)

```bash
npm test
npm run test:docs
npm run build
npx openspec validate issue-210-local-library --strict
npx openspec validate --all --strict
```

Single new test: `node --import tsx --test src/commands/run-library-viewer.test.ts`

---

## QA Verdict — Round 2: PASS

Verified in worktree `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-210-local-library`, branch
`issue-210-local-library` at `a0c8d2c`. Per the scope note in this round's task, the hard parts already
proven live in Round 1 (read-only guarantee, media path-traversal safety, the 405 method sweep, the
real-corpus counts) were **not re-litigated** — only spot-checked that `d3be168..a0c8d2c` did not disturb
them (confirmed: `git diff d3be168..a0c8d2c --stat` touches exactly 7 files — the handoff, one spec-delta
file, and the six code/test files the Build Report names; `src/library/server.ts`, `read-only.test.ts`,
`media.ts`, `queue-classify.ts`, `filter-sort.ts` and their tests are byte-identical across the round).
This round's verification effort was spent entirely on the three defects, per the task's own instruction.

### Suite result

| Check | Command | Result |
|---|---|---|
| Full suite | `npm test` | **3618 / 945 suites, 0 fail** — matches claim exactly; re-ran `src/commands/run-library-viewer.test.ts` and `src/library/read-model.test.ts` individually too |
| Docs suite | `npm run test:docs` | **349 / 92 suites, 0 fail** — unchanged from Round 1, as claimed |
| Build | `npm run build` | Clean, no errors |
| OpenSpec (change) | `npx openspec validate issue-210-local-library --strict` | `Change 'issue-210-local-library' is valid` |
| OpenSpec (all) | `npx openspec validate --all --strict` | `Totals: 67 passed, 0 failed (67 items)` |

**The +2 delta is genuinely new**, not a relabeling: `git diff d3be168..a0c8d2c -- src/commands/run-library-viewer.test.ts` adds exactly one new `it()` (`main()` — the REAL CLI entry point...), and `git diff d3be168..a0c8d2c -- src/library/render/library.test.ts` adds exactly one new `it()` (the AC8 disclosure test) — both landed inside pre-existing `describe` blocks, matching the claimed "0 new suites."

`git status --short` clean after every run; no leftover listening processes from this session's own testing
(confirmed via `lsof -iTCP -sTCP:LISTEN`; the one process found belongs to an unrelated Playwright server
from another project, not this repo).

### Defect 1 (HIGH) — network binding — VERIFIED FIXED, live

Re-ran the exact live attack from Round 1, on a fresh port:

```
$ npm run library -- --port 4399 &
$ lsof -nP -iTCP:4399 -sTCP:LISTEN
node ... TCP 127.0.0.1:4399 (LISTEN)          # loopback only — was `TCP *:4399` in Round 1
$ curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4399/     → 200
$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4399/     → 200
$ curl -s -o /dev/null -w "%{http_code}\n" http://192.168.18.18:4399/ → 000, curl exit 7 (connection refused)
```

The machine's own LAN IP now genuinely refuses the connection — not just a different status code, an
actual connection failure. **Defect 1 is fixed, live-reproduced by QA independently of the test.**

**The `main()` refactor was scrutinized for the exact new risk the task named** — that the test might
drive `main()` down a path the real CLI entry point never exercises. Read `src/commands/run-library-viewer.ts`
end to end:

- The file's bottom entry-point block (`if (entryPoint !== undefined && ...) { main().catch(...) }`) still
  calls `main()` with **zero arguments** — identical to before the refactor. `main`'s new `argv` parameter
  defaults to `process.argv.slice(2)`, the exact same expression `main()`'s body used to read directly. No
  behavioral change for the real CLI path.
- Critically, **the host binding itself is not parameterized at all** — `LOOPBACK_HOST` is a module-level
  `const "127.0.0.1"`, applied unconditionally inside `main()`'s own `server.listen(port, LOOPBACK_HOST, res)`
  call. The test's `main(["--db", dbPath, "--port", "0"])` call passes different `argv` than the real
  entry point (different db path, OS-assigned port instead of 4173) — but neither of those differences can
  touch the host argument, because the host is never read from `argv` at all. The one thing this defect is
  about (does the host get passed to `.listen()`) is exercised identically regardless of what argv the
  caller supplies. There is no reintroduced blind spot here: the divergence between test-argv and
  real-argv is real but provably irrelevant to the property under test.
- Confirmed no other test anywhere in the suite also calls `main()` (`grep -rn "\bmain(" src/` inside test
  files → only this one call site) — no risk of a `SIGINT`/`SIGTERM` listener leak across repeated calls
  either.

### `--port 0` fix — VERIFIED, live

```
$ npm run library -- --port 0
OrganicGrowth Library (read-only) — serving "data/organicgrowth.db" at http://localhost:53862 — Ctrl-C to stop.
```

OS-assigned (`53862`), not the old silent fallback to `4173`. Confirmed via code read
(`prepareLibraryViewer`'s guard changed from `parsedPort > 0` to `parsedPort >= 0`) that `--port` is the
**only** numeric CLI argument this file parses (`--db` is a string) — there is no sibling falsy-fallback
bug left to find in this file.

### Defect 2 (LOW) — Post-URL / Spec content coverage — VERIFIED FIXED, on QA's own mutation

Read `src/library/read-model.test.ts`'s new assertions: ground truth pulled from straw-motion's real
`ledger.json` via `loadFullIdeas` (the same loader the importer itself uses), asserted `deepEqual`
against the Post-URL sets returned by both `buildLibraryIndex` and `getAssetDetail`, for all 7 real Assets
(never one sampled row).

**Proved this has teeth on QA's own mutation, deliberately on a DIFFERENT code path than the developer's
own transcript exercised** (the developer's transcript mutated `getAssetDetail`'s own postUrl assembly at
line ~187; QA instead mutated `postSummaries`, the function `buildLibraryIndex` calls, at line ~88 —
confirming both independent join sites are covered, not just the one the developer happened to demonstrate):

```
# Mutated src/library/read-model.ts line 88: postUrl: post.postUrl → postUrl: "QA-MUTATION-TEST-CORRUPTED-URL"
$ node --import tsx --test src/library/read-model.test.ts
not ok 6 - against the REAL imported corpus...
  error: "buildLibraryIndex must carry all 7 real Post URLs, not just 7 Post rows\n\n1 !== 7"
# Restored. md5 before: 8a381899961b82d7ec2046bf83258200 — md5 after: 8a381899961b82d7ec2046bf83258200 (match)
# git diff -- src/library/read-model.ts: empty. git status --short: clean.
$ node --import tsx --test src/library/read-model.test.ts   → 13/13 pass, 0 fail
```

**Defect 2 is fixed, and the fix has real teeth — confirmed independently, not merely re-reading the
developer's own transcript.**

### `hasSpec` content assertion — VERIFIED FIXED for the case it targets; one real, non-blocking gap found

Two of QA's own mutations against `getAssetDetail`'s `spec: asset.spec ?? null` line:

1. **Totally emptied spec** (`asset.spec !== undefined ? {} : null`) — **caught**, named precisely:
   `"hasSpec=true for 97fca1ec-...(news-carousel) but getAssetDetail's spec carries no real content: {}"`.
   Restored; md5 matched before/after; `git status --short` clean.
2. **A real field emptied behind a non-empty decoy key** (`{ slides: [], junk: "x" }`) — **NOT caught**;
   the real-corpus test passed anyway, because the generic "any own key has non-empty content" check is
   satisfied by `junk` alone. Restored; md5 matched; `git status --short` clean.

**Is this gap hypothetical or real?** Checked the three wired Recipes' actual on-disk Specs directly:
`news-carousel` → `{ slides }` (one key), `news-short-script` → `{ beats }` (one key), but
`character-explainer-with-cast` → `{ character_concepts, clips, thumbnails }` — **three** keys. For that
Recipe specifically, a regression that silently emptied `clips` (arguably the most consequential field —
the actual rendered video clips) while `character_concepts` or `thumbnails` stayed populated would pass
this assertion undetected. **This is a real, live gap for one of the three Recipes, not a purely
theoretical one** — though it is a strictly narrower miss than the totally-empty-spec case the assertion
was actually written to catch (per issue #212's own "boolean vs. `true`" lesson the Build Report cites),
and the developer's own text discloses the generic, cross-shape design tradeoff plainly rather than hiding
it. **Judgment: not blocking.** The assertion has genuine teeth against the specific regression shape
Defect 2 was filed for (a spec present-but-empty), it is a real improvement over Round 1's state (no
content check existed at all), and per-key precision across three differently-shaped Recipes is a
reasonable scope boundary for a two-defect-fix round — but it is not airtight, and is filed below as a
non-blocking note for a future round.

### "What does the real-corpus test still count without checking?" — asked again, one new instance found

The developer's own audit (Ideas/Assets/Jobs left as row counts with reasons; Fit Score deferred with a
reason; media/copy already correctly 0 and previously disclosed) is reasonable and each reason holds up
under inspection — none of it is hand-waved.

Independently hunting for the same SHAPE of blind spot (a silent fallback masking a broken join, exactly
like the pre-fix Post-URL case), QA found one more, not previously named: `channelPlatform: channel?.platform
?? "facebook"` appears **three times** in `read-model.ts` (lines 87, 165, 186) — if a Post's `channel_id`
ever failed to resolve to a real `Channel` row, this would silently report `"facebook"` rather than
surfacing the failure, exactly the same failure shape the fixed Post-URL bug had. Queried the real database
directly (bypassing the read model) and confirmed all 7 real posts resolve to a genuine Channel row with
platform `facebook` today — **not a live bug**, straw-motion's Posts genuinely are all Facebook today —
but no test (fixture-level or real-corpus) currently asserts `channelPlatform` round-trips a real,
resolved Channel rather than the fallback default. **Non-blocking**, filed for the same reason Defect 2
originally was: not a live bug, a coverage gap in the identical shape, worth closing before it can recur
silently once a non-Facebook Channel exists in the real corpus (straw-motion's own LinkedIn/X Channels are
already onboarded per CONTEXT.md's multi-channel model, just not yet posted-to).

### Defect 3 (LOW) — AC8 disclosure — VERIFIED

- **Renders in both paths, live-confirmed via test + diff, not just claimed:** `render/library.test.ts`'s
  new test asserts the "Asset-scoped" string appears in both a populated-rows render and an empty-rows
  (`hookType=irony`, 0 matches) render; read `render/library.ts`'s diff directly — the `scopeNote` constant
  is emitted unconditionally before the `rows.length === 0` branch, so it is genuinely present on every
  path, not just the two the test happens to sample.
- **Wording is accurate, not merely present:** "Asset-scoped: an Idea that was rejected, or accepted but
  never produced an Asset, will not appear here or under any filter below" is a correct, complete
  description of the actual `buildLibraryIndex`/`applyLibraryFilter` behavior QA already verified in Round 1
  (the real `irony`-classified, never-produced Idea genuinely is invisible under every filter).
- **Does the disclosure satisfy AC8, or document a shortfall?** Honestly: **it documents a shortfall**, and
  says so plainly — it does not make the Library actually show "every Idea that used a given hook type" as
  AC8's literal text asks; it tells the Operator the screen does something narrower. Round 1 accepted the
  narrower behavior itself as epic-consistent (User Story 47's own framing) and did not block on it; this
  round's job was only to confirm the disclosure is honest and present, which it is. Not re-opening the
  underlying scope decision, per this round's own "kept Asset-scoped, disclosed" framing and the task's
  instruction not to re-litigate.
- **The amended OpenSpec Requirement states the limit plainly, not merely restates the original ask:** read
  the diff directly — the Requirement's body now says "This screen, and every filter on it, is deliberately
  ASSET-scoped: an Idea that was rejected, or accepted but never produced an Asset... never appears here or
  under any filter — `render/library.ts` SHALL state this limit plainly, on every render..." — this is a
  real, substantive addition, not a restatement. **One very minor, non-blocking nit:** the Requirement's own
  *heading* still reads "...answering 'every Idea that used a given Hook Type' by clicking," unchanged —
  slightly at odds with the honest limit stated one paragraph below it. Cosmetic only; the body is what
  governs, and it is accurate.

### Append-only rule — VERIFIED

`git diff d3be168..a0c8d2c --stat -- openspec/changes/issue-210-local-library/handoff.md` → **`408
insertions(+), 0 deletions`** — the Round 1 Build Report and QA's own Round 1 Verdict are untouched, byte
for byte; everything this round added is a pure append after the Round 1 Verdict's closing `---`.

### Per-criterion results (issue #210 acceptance criteria)

Unchanged from Round 1 for criteria 1–7, 9, 10 (all **PASS**, not re-litigated per this round's scope).
Criterion 8 (Q2 — every Idea that used a given hook type) stays **PASS, with the same caveat as Round 1**,
now additionally **disclosed on-screen and in the spec** rather than only in the Build Report — see "Defect
3" above.

### Always-rules + Magnific-fake + hermeticity checks

Not re-litigated (unchanged code); Round 1's PASS stands, confirmed still applicable since none of the
touched files (`run-library-viewer.ts`, its test, `read-model.test.ts`, `render/library.ts`, its test, the
spec delta) introduce any write path, metrics source, absolute-count ranking, inferred attribution, or
Magnific/live-Space reference. `grep -rln "magnific\|SpaceMcpPort\|spaces_\|creations_" src/library
src/commands/run-library-viewer.ts` re-run this round: no hits.

### Defect list

No blocking defects. Two **non-blocking, low-severity notes** carried forward for a future round (not this
one — per the task's own "do not fail it for a nit" instruction):

1. **[LOW, non-blocking] `hasSpec` content check is generic-but-loose: a real field emptied behind a
   sibling non-empty key would slip through, specifically for `character-explainer-with-cast`'s 3-key Spec
   shape.**
   - Repro: in `getAssetDetail` (`src/library/read-model.ts`), temporarily change `spec: asset.spec ?? null`
     to `spec: asset.spec !== undefined ? { slides: [], junk: "x" } : null`; re-run
     `src/library/read-model.test.ts` — all 6 suites still pass.
   - Suggested fix (future round): assert non-empty content on the Recipe-specific "hero" key (e.g.
     `clips` for `character-explainer-with-cast`, `slides` for `news-carousel`, `beats` for
     `news-short-script`) rather than "any own key," using the same `getRecipe`/`recipe.slug` lookup
     `read-model.ts` already has in scope.

2. **[LOW, non-blocking] `channelPlatform`'s silent `?? "facebook"` fallback (3 call sites in
   `read-model.ts`) is untested against the real corpus — same shape as the just-fixed Post-URL gap, not a
   live bug today.**
   - Repro: none needed to demonstrate a live bug (there isn't one — verified directly against the real
     DB, all 7 real Channel lookups resolve correctly); the gap is the absence of an assertion, not a wrong
     value today.
   - Suggested fix (future round): in the same real-corpus test, assert each of the 7 real Posts'
     `channelPlatform` matches its `channel` table row's `platform` directly, not just that it's present.

3. **[Cosmetic, non-blocking]** The amended Hook-Type-filter Requirement's own heading text is unchanged
   ("...answering 'every Idea that used a given Hook Type' by clicking") while its body now states the
   Asset-scoped limit — the body governs and is accurate; the heading is a residual wording mismatch only.

### Overall

**PASS.** All three Round 1 defects are genuinely fixed and independently re-verified live by QA — the
loopback bind (confirmed with `lsof` + a real LAN-IP connection-refused test), the `--port 0` fix
(confirmed with a real OS-assigned port), and the Post-URL/Spec content assertions (confirmed with QA's
own mutations on a different code path than the developer's own transcript, restored byte-identically via
md5, `git status` clean throughout). The full suite, docs suite, build, and both OpenSpec validations are
green, genuinely, on a fresh run (`3618/945/0`, `349/92/0`, clean build, `67/67` specs). The append-only
rule held across the round boundary (`408 insertions(+), 0 deletions` on `handoff.md`). Two low-severity,
non-blocking coverage notes are filed for a future round — neither is a live bug, neither blocks this
slice from proceeding to PR.
