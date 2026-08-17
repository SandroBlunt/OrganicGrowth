## 1. Read-only connection (test-first) — the non-negotiable, built first

- [x] 1.1 Write failing tests (`src/db/connection.test.ts`): `openDatabase(path, { readOnly: true })`
  refuses a database file that does not exist (never creates one); opens and can read an EXISTING
  database; a write through the returned handle throws, at the connection level.
- [x] 1.2 Extend `src/db/node-sqlite.d.ts`'s ambient `DatabaseSync` declaration with a `readOnly`
  constructor option (verified by hand against the real Node 22.23.0 `node:sqlite` runtime behavior).
- [x] 1.3 Implement `{ readOnly?: boolean }` on `src/db/connection.ts`'s `openDatabase` — additive, every
  existing caller unaffected.

## 2. The four small store reads the screens need (test-first, added beside each store's existing reads)

- [x] 2.1 Write failing tests + implement `AssetStore.listAllAssets` (`src/asset/store.ts` /
  `db-store.test.ts`) and `AssetStore.getAssetMediaById` (for the `/media/:id` route).
- [x] 2.2 Write failing tests + implement `PostStore.listAllPosts` (`src/post/store.ts` / `.test.ts`).
- [x] 2.3 Write failing tests + implement `JobStore.listAllJobs` (`src/production-queue/job-store.ts` /
  `.test.ts`).

## 3. View-model types + pure filter/sort/classify logic (test-first)

- [x] 3.1 Define `src/library/types.ts` — `LibraryAssetRow`, `AssetDetailView`, `QueueRow`,
  `FitPerformancePoint`, `TopAssetEntry`, and their supporting shapes. No runtime logic; no test file.
- [x] 3.2 Write failing tests (`filter-sort.test.ts`) + implement `src/library/filter-sort.ts`:
  `applyLibraryFilter`, `deriveFilterOptions`, `sortLibraryRows` (an unscored/unfit/never-produced row
  always sorts LAST, never as if it were a real `0`; every tie resolves to the SAME stable order on
  every call), `topAssetsByPerformance` (excludes unscored Assets entirely, never pads to look like 5).
- [x] 3.3 Write failing tests (`queue-classify.test.ts`) + implement `src/library/queue-classify.ts`:
  `classifyQueueRow` — pure Job-status/Asset-status/pendingGate -> produced/parked/failed/running/
  queued/done classification.

## 4. Fixture support for the Library's own tests (test-first infrastructure)

- [x] 4.1 Implement `src/library/test-support.ts` — `seedWorld`/`seedLibraryIdea`/`seedLibraryAsset`/
  `seedLibraryPost`/`seedLibraryCopyVariant`/`seedLibraryJob`. Path deliberately contains `"test"` (the
  same convention `src/db/test-support.ts` already uses) so it is exempt from both the `node:fs` and
  store-write boundary guards while still calling real store writes to seed data.

## 5. The read model — thin, impure, composed ONLY from existing typed store reads (test-first)

- [x] 5.1 Write failing tests (`read-model.test.ts`, fixture-seeded): `buildLibraryIndex` joins an Asset
  to its Idea's hook_type/theme/fit_score/title, its Recipe's name, its Format, and its Brand; one Idea
  run through two Recipes yields two rows; `bestPerformanceScore` is `undefined` for an Asset with no
  scored Post (never fabricated `0`); the BEST score wins across more than one scored Post; several
  Assets tied at the exact same score all report that score correctly. `getAssetDetail` returns spec +
  media + Copy variants + Posts + metric/score history together, `null` for an unknown id, `spec: null`
  (never `{}`) when unsaved. `buildQueueRows` classifies produced/parked/failed correctly, joined out to
  readable names. `buildFitPerformanceData` includes every fit-scored Idea, with or without a Performance
  Score — none silently dropped; an Idea with no Fit Score at all is excluded.
- [x] 5.2 Implement `src/library/read-model.ts`: `buildLibraryIndex`, `getAssetDetail`, `buildQueueRows`,
  `buildFitPerformanceData`, `countAllPosts` — composing ONLY typed store read functions (never raw SQL
  of its own, never `ledger.json`).
- [x] 5.3 Write the REAL-CORPUS proof test (same file): run the real one-shot importer (`planImport` +
  `executeImport`) plus the real Hook Type/Theme backfill (`backfillHookTheme`) against this repo's own
  committed `data/brands/**`, into a temp database, and assert `listAllIdeas`/`listAllAssets`/
  `listAllJobs`/`listAllPosts` — AND `buildLibraryIndex`/`buildQueueRows`/`countAllPosts` — all report
  EXACTLY 61/54/66/7, matching `docs/import-reconciliation-2026-08-17.md`. Deliberately break the join
  (filter out a Recipe) to watch it fail red, then restore — transcript in `handoff.md`.

## 6. Pure render modules — no database, no socket (test-first)

- [x] 6.1 Write failing tests + implement `render/html.ts` (`escapeHtml`, `formatScore` — "not yet
  tracked" for `undefined`, never `"0%"` — `formatDate`, `page`, the shared nav, no `<form method="post">`
  anywhere).
- [x] 6.2 Write failing tests + implement `render/library.ts` (AC2/AC3: every Asset, sortable/filterable,
  a `method="get"` filter form, an honest empty state, filtered-vs-total count line).
- [x] 6.3 Write failing tests + implement `render/asset.ts` (AC4: Spec/media/Copy/Posts/metric history
  together on one page, media as `<img>`/`<video>`/`<audio>` `src="/media/:id"` — never inline bytes).
- [x] 6.4 Write failing tests + implement `render/queue.ts` (AC6: grouped by produced/parked/failed/
  running/queued/done, with per-bucket counts, without reading JSON).
- [x] 6.5 Write failing tests + implement `render/chart.ts` (AC5/Question 3: a hand-rolled SVG scatter,
  both axes explicitly labeled "(predicted)"/"(measured)", a reference diagonal, EVERY tied point drawn
  as its own circle — never collapsed — and an unscored Idea listed separately with an honest count,
  never plotted at y=0).
- [x] 6.6 Write failing tests + implement `render/top.ts` (Question 1: top-N by Performance Score with
  full Production Specs side by side; states plainly when fewer than N are scored, never pads).

## 7. Media byte-serving (test-first)

- [x] 7.1 Write failing tests (`media.test.ts`, a real temp-directory file, never a mock filesystem):
  `resolveMediaAbsolutePath` joins a relative `media_root` against `cwd`, an absolute one directly;
  `resolveMediaFile` returns real bytes + mime for a file that exists, `null` (never throws) for one that
  does not, `null` for an unknown media id.
- [x] 7.2 Implement `src/library/media.ts`. Add `src/library/media.ts` to
  `src/fs-boundary/allow-list.ts` with a stated reason; confirm `node-fs-guard.test.ts` stays green.

## 8. The server — GET-only, structurally (test-first)

- [x] 8.1 Write failing tests (`server.test.ts`, a real `node:http` server on an ephemeral port, real
  `fetch` requests): every GET route (`/`, filtered/sorted, `/assets/:id`, `/media/:id`, `/queue`,
  `/chart`, `/top`, 404 for unknown paths and unknown ids); AND, exhaustively, every
  `{POST,PUT,PATCH,DELETE} x {every route}` combination returns `405` with `Allow: GET` — 28
  combinations, none an exception.
- [x] 8.2 Implement `src/library/server.ts`: `createLibraryServer(db)`.

## 9. The read-only proof — THE non-negotiable, proven directly (test-first)

- [x] 9.1 Write `src/library/read-only.test.ts`: seed a real database file with a writable connection,
  close it, reopen `{ readOnly: true }`, hand THAT SAME handle to `createLibraryServer` and prove it
  still serves a real GET request — then attempt a write through the SAME handle (a raw `db.exec`
  INSERT, and the SAME typed `createBrand` every production caller uses) and assert BOTH throw; reopen
  fresh and prove the count is unchanged (neither write landed).
- [x] 9.2 Deliberately drop `{ readOnly: true }` to watch the write-throws assertion fail red (`Missing
  expected exception`), confirming the test would actually catch a real regression — transcript in
  `handoff.md` — then restore.

## 10. The CLI entry (test-first)

- [x] 10.1 Write failing tests (`run-library-viewer.test.ts`): `prepareLibraryViewer` throws a clear,
  actionable error for a missing database file (never creates one) and for one that exists but has no
  migrated schema yet; opens a real migrated database read-only and builds a working, genuinely
  read-only server against it; defaults to `data/organicgrowth.db` / port `4173` when no flags are given.
- [x] 10.2 Implement `src/commands/run-library-viewer.ts`: `prepareLibraryViewer` + `main()` (listen,
  print the URL, clean shutdown on SIGINT/SIGTERM). Add the `library` npm script.

## 11. Manual smoke test against the real, locally-built database (not part of `npm test`)

- [x] 11.1 Run `npm run import-data` + `npm run backfill-hook-theme` in this worktree (git-ignored
  `data/organicgrowth.db`, reproducing the real corpus's 61/54/66/7/2 counts locally).
- [x] 11.2 Start `npm run library` against it; curl every route; confirm the counts rendered match
  (54 Asset rows, 61 Ideas' worth of Fit Scores on the chart, 0 currently scored) and that a real
  Production Spec renders as pretty JSON on a real Asset page. Recorded, with output, in `handoff.md`.

## 12. OpenSpec + full-suite green + self-review + Build Report

- [x] 12.1 Author spec deltas: `specs/local-library-viewer` (ADDED — the whole new capability),
  `specs/sqlite-foundation` (MODIFIED — `openDatabase`'s `readOnly` option, full verbatim requirement
  reproduced plus the addition), `specs/asset-store`/`specs/post-store`/`specs/job-claim-store` (ADDED
  Requirements — the four new list-all/lookup reads). Run `openspec validate --strict` until green.
- [x] 12.2 Run `npm test` (type-check + full suite) — green, above the `3488 / 915 / 0 fail` baseline.
  Run `npm run test:docs` — green, unchanged (no domain-doc/CONTEXT.md edits in this change).
- [x] 12.3 Self-review pass: remove dead code, tighten module boundaries, confirm every one of issue
  #210's ten acceptance criteria maps to a specific test.
- [x] 12.4 Write the Build Report into `handoff.md` — including the real-corpus counts, both red
  transcripts (the join-drop and the read-only-drop), the manual smoke-test output, and Known Limits
  (media/copy-variant/performance-score all genuinely empty against THIS worktree's real import, and why).
