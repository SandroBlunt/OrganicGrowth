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
