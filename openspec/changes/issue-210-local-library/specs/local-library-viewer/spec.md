## ADDED Requirements

### Requirement: The Library's database connection is opened read-only, and a write through it throws — proven directly, not merely asserted

`src/commands/run-library-viewer.ts`'s `prepareLibraryViewer` SHALL open its target database via
`openDatabase(dbPath, { readOnly: true })` (`src/db/connection.ts`) — never a plain read-write
`openDatabase(dbPath)` call anywhere in `src/library/**` or `src/commands/run-library-viewer.ts`. The
resulting connection SHALL be the EXACT same handle `createLibraryServer` runs every route against, so
that a write attempted through it — whether a raw SQL statement or any typed store's write function —
throws at the SQLite connection level itself, never merely by this codebase's own discipline. A
dedicated test (`src/library/read-only.test.ts`) SHALL demonstrate this directly: hand the read-only
connection to `createLibraryServer`, prove it still serves a real GET request, THEN attempt a write
through that SAME handle and assert it throws, THEN reopen the file fresh and prove the row count is
unchanged.

#### Scenario: A raw SQL write through the server's own connection throws

- **GIVEN** a real, already-migrated database file, opened `{ readOnly: true }` and handed to
  `createLibraryServer`
- **WHEN** a raw `INSERT` is executed through that same connection
- **THEN** it throws, and the row is never written (verified by reopening the file fresh afterward)

#### Scenario: A typed store's write function called against the server's own connection throws

- **GIVEN** the same read-only connection as above
- **WHEN** `AssetStore`'s `writeAsset` (or any other store's write function) is called against it
- **THEN** it throws — the SAME guarantee holds for every write path this codebase has, not only raw SQL

#### Scenario: The server still serves real GET requests against the same read-only connection

- **GIVEN** the same read-only connection as above, handed to `createLibraryServer`
- **WHEN** a real HTTP GET request is made to `/`
- **THEN** it returns `200` with the Library screen's HTML — read-only-ness never blocks a legitimate
  read

### Requirement: The viewer's CLI entry refuses cleanly when the database is missing or unmigrated, and never creates or migrates one itself

`prepareLibraryViewer` SHALL throw a clear, actionable error — naming the fix (`npm run import-data`) —
for a `--db` path that does not exist, and for one that exists but carries no migrated schema yet
(e.g. an empty file). It SHALL NOT create a database file, run a migration, or otherwise write anything
in either case. Defaults SHALL be `data/organicgrowth.db` (matching the importer's/backfill's own
default) and port `4173` when `--db`/`--port` are omitted.

#### Scenario: A missing database file is refused with a clear message, and never created

- **GIVEN** `--db` pointing at a path that does not exist
- **WHEN** `prepareLibraryViewer` is called
- **THEN** it throws an error naming the fix, and the path still does not exist afterward

#### Scenario: An existing but unmigrated database file is refused

- **GIVEN** `--db` pointing at a real SQLite file with no `schema_migrations` table (never migrated)
- **WHEN** `prepareLibraryViewer` is called
- **THEN** it throws, naming the fix

#### Scenario: A real, migrated database opens successfully and builds a working server

- **GIVEN** `--db` pointing at a real, already-migrated SQLite file
- **WHEN** `prepareLibraryViewer` is called
- **THEN** it resolves with an open, read-only `db` handle and a `server` that serves real GET requests

### Requirement: The server has no write path at all — every non-GET method is refused with 405, for every route, with no exception

`src/library/server.ts`'s `createLibraryServer(db)` SHALL refuse any HTTP request whose method is not
`GET` with `405 Method Not Allowed` (an `Allow: GET` header) BEFORE any route is consulted — not for
some routes, for ALL of them, including unknown paths. There SHALL be no `POST`/`PUT`/`PATCH`/`DELETE`
handler anywhere in `src/library/**` for any path — this is a structural absence, not a disabled control
that merely declines to act.

#### Scenario: Every write method on every route is refused with 405

- **GIVEN** the Library's server, running against a real database
- **WHEN** `POST`, `PUT`, `PATCH`, or `DELETE` is sent to `/`, `/queue`, `/chart`, `/top`,
  `/assets/<any>`, `/media/<any>`, or an entirely unknown path
- **THEN** every one of those 28 combinations returns `405` with `Allow: GET` — none is accepted, none
  silently no-ops as if accepted

#### Scenario: The Library screen's own filter/sort form only ever issues a GET request

- **GIVEN** the Library screen's rendered HTML
- **WHEN** its filter/sort `<form>` is inspected
- **THEN** it is `method="get"` — there is no `<form method="post">` anywhere on any rendered page

### Requirement: The Library screen lists every Asset and sorts them by Performance Score, Fit Score, produced date, or title — never fabricating a missing value

`src/library/read-model.ts`'s `buildLibraryIndex(db)` SHALL return one row per `asset` row in the
database, joined to its owning Idea's title/hook type/theme/Fit Score, its Recipe's name, its Format,
its Brand, and the BEST (highest) latest Performance Score across every Post it has, if any.
`src/library/filter-sort.ts`'s `sortLibraryRows` SHALL support ordering by Performance Score, Fit Score,
produced date, and Idea title; for every one of these, an Asset carrying NO value on the sorted
dimension SHALL sort LAST, never interleaved among real values as if it scored the lowest — a missing
score and a low score are different facts (rule 8, never fabricate). Ties SHALL resolve to the SAME
stable order on every call.

#### Scenario: Every Asset in the database appears in the index

- **GIVEN** a database with several Assets across more than one Idea/Brand/Format
- **WHEN** `buildLibraryIndex(db)` is called
- **THEN** it returns exactly one row per Asset, none dropped

#### Scenario: Sorting by Performance Score puts unscored Assets last, never as if they scored 0

- **GIVEN** three Assets: two with real, different Performance Scores, one with none logged/tracked yet
- **WHEN** the rows are sorted by Performance Score
- **THEN** the two scored Assets come first, highest first, and the unscored one comes last

#### Scenario: Several Assets tied at the exact same Performance Score all render correctly and in a stable order

- **GIVEN** three Assets whose best Performance Score is the identical `0.5` (the real shape once every
  currently-zero-engagement straw-motion Post is eventually tracked)
- **WHEN** the rows are sorted by Performance Score, twice
- **THEN** all three report `0.5`, and the two sorted results are IDENTICAL — no flicker

### Requirement: The Library screen filters by Hook Type, Theme, Recipe, and Format — answering "every Idea that used a given Hook Type" by clicking

`src/library/filter-sort.ts`'s `applyLibraryFilter` SHALL narrow `buildLibraryIndex`'s rows to those
matching every SET field of a `LibraryFilter` (`hookType`, `theme`, `recipe`, `format`) — an unset field
imposes no constraint. `deriveFilterOptions` SHALL derive the filter controls' offered values from the
rows actually present, never a fixed static list, so a filter option can never return zero rows by
construction. The server SHALL expose this as query-string parameters on `GET /`
(`?hookType=...&theme=...&recipe=...&format=...&sort=...`).

#### Scenario: Filtering by hookType answers "every Idea that used a given Hook Type" by clicking

- **GIVEN** several Assets across more than one Hook Type
- **WHEN** `GET /?hookType=irony` is requested
- **THEN** the response includes only the Asset(s) whose Idea's `hook_type` is `irony`, and excludes
  every other row

#### Scenario: Filters combine (AND, not OR)

- **GIVEN** Assets spanning several Hook Types and Themes
- **WHEN** both `hookType` and `theme` are set
- **THEN** only rows matching BOTH are returned

#### Scenario: A filter matching nothing renders an honest empty state, not an error

- **GIVEN** a `hookType` value present on no current row
- **WHEN** that filter is applied
- **THEN** the page renders "No Assets match this filter," never a crash or a silently-ignored filter

### Requirement: The Asset page shows its Production Spec, its media, its Copy variants, its Post URLs, and its metric history together on one page, via a real SQL join — never filename parsing

`src/library/read-model.ts`'s `getAssetDetail(db, assetId)` SHALL return, for one Asset, its Idea's
title/brief/hook type/theme/Fit Score/source URLs, its Recipe/Format/Brand, its Production Spec (read
directly off `asset.spec_json` — the SAME row as `asset.id`/`asset.idea_id`/`asset.recipe_slug`, a real
relational join, never a reconstructed file path or any filename parsing anywhere in
`src/library/read-model.ts`), its `asset_media` rows, its `copy_variant` rows, and every `post` row
(each with its own `metric_snapshot` and `performance_score` history) — ALL on the SAME returned object,
never scattered across separate fetches a page would need tabs for. `render/asset.ts` SHALL render every
one of these sections on one page. `spec` SHALL be `null` (never `{}`) when unsaved.

#### Scenario: An Asset's Spec, media, Copy, Posts, and metric history are all present on one response

- **GIVEN** an Asset with a saved Production Spec, recorded media, a Copy variant, a logged Post, and a
  recorded metric snapshot + Performance Score
- **WHEN** `GET /assets/:id` is requested for it
- **THEN** the single response's HTML includes the Spec (pretty-printed), the media, the Copy variant's
  caption, the Post's URL, and its metric/score history — together

#### Scenario: The Production Spec is read from the Asset's own row, never a filename

- **GIVEN** an Asset saved with a Production Spec
- **WHEN** `getAssetDetail` is called
- **THEN** the returned `spec` matches what was saved, resolved via `asset.id` alone — no path is ever
  constructed from a Brand slug, Run id, or Idea id to locate it

#### Scenario: An unknown Asset id returns null, rendered as 404

- **GIVEN** an id naming no `asset` row
- **WHEN** `GET /assets/:id` is requested
- **THEN** the response is `404`

### Requirement: Media is served from local disk, resolved via storage_key + the owning Brand's media_root, and degrades to a clean 404 when the file is not present on this machine

`src/library/media.ts`'s `resolveMediaFile(db, mediaId)` SHALL resolve `mediaId` to its `asset_media`
row, walk to its owning Asset's Idea's Brand, join the Brand's `media_root` with the media row's
root-relative `storage_key` (ADR-0029's own "resolved at READ time" rule), and read the file. It SHALL
return `null` — never throw — for an unknown `mediaId`, or for a file recorded in the database but not
actually present on disk (the real, expected state for this repo's own committed data, since produced
media lives in git-ignored `*.output/` directories). `GET /media/:id` SHALL stream the resolved bytes
with the recorded MIME type, or respond `404` when `resolveMediaFile` returns `null`.

#### Scenario: A real file on disk is streamed back with its recorded MIME type

- **GIVEN** an `asset_media` row whose `storage_key`, joined against its Brand's `media_root`, points at
  a file that genuinely exists
- **WHEN** `GET /media/:id` is requested
- **THEN** it returns `200` with the exact bytes and the recorded `mime` as `Content-Type`

#### Scenario: A recorded-but-missing file 404s cleanly, never throws

- **GIVEN** an `asset_media` row whose resolved path does not exist on this machine
- **WHEN** `GET /media/:id` is requested
- **THEN** it returns `404`, and the server itself keeps serving other requests normally

### Requirement: A chart plots Fit Score against Performance Score, both axes explicitly labeled predicted vs measured, and an unscored Idea is never plotted as if it scored zero

`src/library/read-model.ts`'s `buildFitPerformanceData(db)` SHALL include every Idea carrying a Fit
Score, each paired with its best Asset's best Performance Score IF one exists — `performanceScore`
SHALL stay `undefined` (never `0`) for an Idea not yet scored. `render/chart.ts` SHALL plot ONLY the
Ideas carrying BOTH values, as an SVG scatter with both axes explicitly labeled "Fit Score (predicted)"
and "Performance Score (measured)" (rule 3: never present one as the other) and a reference diagonal
marking "predicted exactly." Every Idea with a Fit Score but no Performance Score SHALL be listed
separately, with an honest count — never silently dropped from the page, never plotted at
Performance Score = 0.

#### Scenario: A scored Idea is plotted; both axes are labeled predicted vs measured

- **GIVEN** an Idea with both a Fit Score and a Performance Score
- **WHEN** `GET /chart` is requested
- **THEN** the response includes one plotted point for it, and the literal strings "Fit Score
  (predicted)" and "Performance Score (measured)"

#### Scenario: An Idea with a Fit Score but no Performance Score is listed separately, counted, never plotted at 0

- **GIVEN** an Idea with a Fit Score and no Performance Score yet
- **WHEN** `GET /chart` is requested
- **THEN** it is NOT among the plotted SVG points, and appears instead in a separate "awaiting a
  Performance Score" list whose count matches

#### Scenario: Several Ideas tied at the exact same coordinates are all drawn, never collapsed into one point

- **GIVEN** three Ideas each scoring the identical Fit Score AND Performance Score
- **WHEN** `GET /chart` is requested
- **THEN** the response includes three separate plotted points, not one

### Requirement: A Run & queue state screen shows what is produced, parked, or failed, without reading data/queue.json

`src/library/queue-classify.ts`'s `classifyQueueRow` SHALL classify each `job` row (joined to its
Asset's own status and `pending_gate`) into exactly one of `failed` / `parked` / `running` / `queued` /
`produced` / `done` — `failed` when the Job itself failed regardless of Asset status; `parked` when the
Job is `awaiting_pick` OR the Asset carries a `pending_gate` (CONTEXT.md: a human pick is a pause inside
`in_production`, never a status of its own); `produced` only when the Job is `done` AND the Asset has
actually reached `produced` or later. `render/queue.ts` SHALL group rows by bucket with a per-bucket
count. Nothing in this Requirement's implementation reads any file under `data/`.

#### Scenario: A produced, a parked, and a failed Job are all classified and shown correctly

- **GIVEN** one Job whose Asset reached `produced`, one `awaiting_pick` Job whose Asset carries a
  `pending_gate`, and one `failed` Job
- **WHEN** `GET /queue` is requested
- **THEN** the response groups them under "Produced," "Parked," and "Failed" respectively, each with a
  count of 1

### Requirement: A Top-5-by-Performance-Score screen shows Production Specs side by side, answering "the top 5 Assets with their Specs side by side" by clicking

`src/library/filter-sort.ts`'s `topAssetsByPerformance(rows, 5)` SHALL return the top 5 Assets by
`bestPerformanceScore` DESC, EXCLUDING any unscored Asset entirely (never padding the list to look like
five). `GET /top` SHALL fetch each returned Asset's full Production Spec and render every one in its own
column, side by side, on one page. When fewer than 5 Assets are scored, the page SHALL state that count
plainly rather than implying five existed.

#### Scenario: The top 5 scored Assets are shown with their Specs side by side

- **GIVEN** at least 5 Assets with distinct Performance Scores, each with a saved Production Spec
- **WHEN** `GET /top` is requested
- **THEN** the response shows exactly the 5 highest-scoring Assets, each in its own column with its own
  full Spec printed

#### Scenario: Fewer than 5 scored Assets states the real count, never pads

- **GIVEN** only 2 Assets currently carry a Performance Score
- **WHEN** `GET /top` is requested
- **THEN** the response shows exactly those 2, and states "Only 2 of a possible 5 shown"
