## Why

Epic #195 exists because the pipeline's own state was uncontrolled — writes scattered across files with
no version stamp, no transaction, and no way to ask a real relational question. Issues #201–#252 spent
the whole epic fixing the WRITE side (a real schema, typed stores, a command surface, write-boundary
guards). Nothing was ever built for the READ side. `/report` takes one Brand and prints fixed text; there
is no query surface at all. This is the destination the epic was always aiming at — "the screen that
does not exist today, and the reason for the epic" — and it has never been started: no server, no HTML
rendering, no viewer module, zero comments on the issue.

The concrete gap this closes: joining a ledger Asset to its Production Spec used to require parsing
filenames, because a Spec file (`idea-NN.<recipe>.spec.json`) carries no `id`, `brand`, or `recipe` field
of its own. In SQL that join is now real — `asset.spec_json` sits on the very same row as `asset.id`,
`asset.idea_id`, and `asset.recipe_slug` — and this change is the first thing that actually exercises it
end to end, from a real HTTP request down to a real column.

**The one non-negotiable this change is built around: read-only, and it stays read-only.** A second
writer would recreate the exact uncontrolled-write problem the epic exists to remove. The four human
gates (Review, each Recipe's own pick-gate(s), Publish, and the Schedule Batch approval) stay
conversational, in chat — Review in particular is a negotiation (which Recipes to run, why an Idea was
rejected) that a form would capture as a decision while losing the reasoning. So this viewer has **no
write path at all** — not a disabled button, no endpoint — and that claim is *proven*, not merely
asserted: the exact database connection the server runs against is opened `{ readOnly: true }`
(`src/db/connection.ts`), so a stray write throws at the SQLite layer itself, and a dedicated test
(`src/library/read-only.test.ts`) attempts one through that same handle and asserts it throws. This
epic has already shipped six guards that looked green while being blind (#197's fixture-only credential
scanner, #205's never-enforced write boundary, #209/#204 registering a store nowhere a guard could see,
#252's guard missing a real citation shape); this change is built specifically not to be the seventh.

## What Changes

- **A new `src/library/` module** — the Library's own read model, pure render logic, and HTTP server:
  - `read-model.ts` composes ONLY existing (or newly added, right beside their siblings) typed store
    READ functions into the view-model shapes the screens need — never a raw SQL join written in this
    module, and never `ledger.json`.
  - `filter-sort.ts` / `queue-classify.ts` are pure deep modules (no database, no socket) — filtering,
    sorting (never fabricating a missing Performance Score as `0`; an unscored Asset always sorts last,
    never interleaved with real scores), and classifying a queue row into produced/parked/failed/
    running/queued/done.
  - `render/*.ts` are pure HTML-rendering functions (`html.ts`'s shared escaping + page shell, plus one
    module per screen) — given already-fetched, already-decided data, they return an HTML string; no
    database, no `node:fs`, fully unit-testable without a socket.
  - `media.ts` resolves one `asset_media` row's `storage_key` against its owning Brand's `media_root`
    (ADR-0029's own "resolved at READ time" rule) and reads the bytes off local disk — the ONE place
    this module touches `node:fs`, and a pure read.
  - `server.ts` is the thin orchestration shell: a `node:http` server wiring the above together. Every
    non-`GET` method is refused with `405` before any route is even consulted, for every path, with no
    exception — the structural half of "no write path at all."
- **A new CLI entry**, `src/commands/run-library-viewer.ts` (`npm run library -- [--db <path>]
  [--port <n>]`): opens the local SQLite database `{ readOnly: true }` and never creates or migrates it
  — a missing database file, or one that exists but carries no migrated schema yet, is refused with a
  clear, actionable message ("run `npm run import-data` first"), never silently worked around.
- **Four small, additive read-only functions**, each added beside its store's existing reads (never a
  raw SQL join scattered through `src/library/**`): `AssetStore.listAllAssets`/`getAssetMediaById`,
  `PostStore.listAllPosts`, `JobStore.listAllJobs` — every one of the "list every X in the database"
  queries the Library's screens need and no existing store yet exposed.
- **`src/db/connection.ts`'s `openDatabase` gains an additive `{ readOnly?: boolean }` option**, backed
  by `node:sqlite`'s own `DatabaseSync` `readOnly` constructor option (verified by hand against Node
  22.23.0: a write through a handle opened this way throws `"attempt to write a readonly database"` —
  enforced by SQLite itself, not by this codebase's own discipline). Every existing caller is unaffected
  (the option defaults to `false`, the unchanged read-write behavior).
- **`src/fs-boundary/allow-list.ts` gains one entry**, `src/library/media.ts` — audited, stated reason:
  the one place this module touches `node:fs`, a pure `readFile` resolving a produced Asset's media the
  same read-time way ADR-0029 already specifies.

## Design decisions worth stating explicitly

- **Reads bypass the typed command surface (`src/command-surface/`) by design, not by oversight.** The
  command surface's own spec (`command-surface`) fixes its shape around WRITE operations (issue #205's
  own AC2: "the command surface is the only thing that writes"), and the store-write boundary guard's
  own scope is explicit — "writes only, never reads" (`src/store-write-boundary/scan.ts`'s own doc
  comment). This viewer reads directly from the typed store layer (`AssetStore`, `IdeaStore`,
  `PostStore`, `PerformanceStore`, `JobStore`, `CopyStore`, `FormatStore`, `BrandStore`, `ChannelStore`,
  `RecipeRegistry`) — exactly the "existing store layer... where a read exists" the issue's own brief
  names, and the guard itself confirms this trips neither boundary guard (both are proven, not asserted,
  by `src/fs-boundary/node-fs-guard.test.ts` and `src/store-write-boundary/store-write-guard.test.ts`
  passing unchanged with `src/library/**` added).
- **The join to Production Spec is real, not filename parsing.** `asset.spec_json` sits on the exact
  same row as `asset.id`/`asset.idea_id`/`asset.recipe_slug` (`src/db/schema.ts`, issue #201) —
  `AssetStore.getAssetById`/`listAllAssets` already return it inline. `src/library/read-model.ts` never
  parses a path to find a Spec; it reads the column. Proven by a real-corpus test
  (`src/library/read-model.test.ts`) that every one of the 54 real Assets' rows carries its Spec (where
  saved) via this same join, not a file lookup.
- **The real corpus's 259 `asset_media` rows exist only on the Operator's own machine.** Produced media
  lives under a Brand's `ideas/**/*.output/` directories, which are deliberately git-ignored (too heavy
  for git — `.gitignore`'s own comment). This worktree's own import of the real, committed
  `data/brands/**` therefore yields `0` `asset_media` rows (verified: the reconciliation report this
  change's own test run generates lists ~260 "dead" media paths — every legacy `asset_paths` entry,
  because none of those files exist on THIS machine). `media.ts`/the Asset page's media section are
  built and tested against a real file on disk (a temp-directory fixture), and degrade gracefully (a
  clear `404`, never a crash) for a recorded-but-missing file — the exact shape a real, freshly cloned
  checkout will see today. See "Known Limits" in `handoff.md` for the full accounting.
- **No score has ever been computed for the real corpus's 7 Posts.** `performance_score` (SQL) and
  every posted Asset's `performance_score` field (`ledger.json`, verified directly) are both `undefined`
  today — `/track-performance` has never run against straw-motion's brand-new Page. This change does
  **not** compute or write any Performance Score itself (that would be new production behavior calling
  Apify, out of both this ticket's scope and the hermetic build's own rules) — it renders "not yet
  tracked" honestly wherever a score is absent. The specific behaviors the build brief calls out by
  name — several Posts tied at the exact same score, and a score missing entirely — are proven with a
  seeded fixture (`src/library/test-support.ts`), since the real corpus currently only exercises the
  "missing entirely" case.

## Non-Goals (explicitly out of scope for this slice)

- **Computing or writing any Performance Score, metric snapshot, or channel baseline.** That is
  `/track-performance`'s job (a live Apify call), off-limits to this hermetic, read-only build.
- **Wiring any existing production command onto the SQL-backed stores.** `ledger.json` stays the source
  of truth the live pipeline reads and writes (rule 7); this change only ADDS read-only query surface
  on top of the database issue #204's importer already populates.
- **A write path of any kind — even a "future" one.** No form posts anywhere; the one `<form>` this
  change ships (the Library screen's filter/sort controls) is `method="get"`, proven by its own test.
- **Copy variants / asset media for the real corpus**, beyond what the real, committed data already
  yields (`copy_variant` is `0` rows too — no production caller writes it yet, per `command-surface`'s
  own "not yet wired to any production caller" note in `project.md`). The Asset page renders these
  sections' genuine empty states honestly rather than faking data to make the screen look busier.

## Capabilities

### Added Capabilities

- `local-library-viewer`: the read model, pure render logic, media byte-serving, the read-only HTTP
  server, and its CLI entry.

### Modified Capabilities

- `sqlite-foundation`: `openDatabase` gains an additive `{ readOnly: true }` option.
- `asset-store`: gains `listAllAssets` and `getAssetMediaById`.
- `post-store`: gains `listAllPosts`.
- `job-claim-store`: gains `listAllJobs`.

## Impact

- **New code:** `openspec/changes/issue-210-local-library/` (this change); `src/library/{types,
  read-model, filter-sort, queue-classify, media, server}.ts` (+`.test.ts` each except `types.ts`,
  which carries no runtime logic of its own), `src/library/render/{html,library,asset,queue,chart,
  top}.ts` (+`.test.ts` each), `src/library/test-support.ts` (fixture seeding, exempt from both
  boundary guards by the same `path.includes("test")` convention `src/db/test-support.ts` already
  uses), `src/library/read-only.test.ts` (the read-only proof), `src/commands/run-library-viewer.ts`
  (+`.test.ts`).
- **Modified code:** `src/db/connection.ts` (+`.test.ts`), `src/db/node-sqlite.d.ts` (the ambient
  `DatabaseSyncOptions` type), `src/asset/store.ts` (+`db-store.test.ts`), `src/post/store.ts`
  (+`.test.ts`), `src/production-queue/job-store.ts` (+`.test.ts`), `src/fs-boundary/allow-list.ts`,
  `package.json` (new `library` script).
- **Hermetic, no live Space/Zoho MCP/Apify calls.** Every test either opens a real, throwaway SQLite
  file (`withTempDb`, never `:memory:`) or runs the real, already-built one-shot importer
  (`src/importer/`) plus the real Hook Type/Theme backfill (`src/commands/backfill-hook-theme.ts`)
  against this repo's own committed `data/brands/**` — no network call anywhere. The one live smoke
  test performed during this build (starting the real server against a locally-generated
  `data/organicgrowth.db` and curling every route) is recorded, with its output, in `handoff.md`; it is
  not part of `npm test`.
- **Always-rules upheld:** this change adds NO write path — generate-never-publish and
  ledger-as-source-of-truth are structurally unaffected (nothing here writes a ledger, an Asset, or a
  Post). Public-metrics-only is unaffected (no new metrics source; every metric this viewer displays
  already passed through `performance-tracker`'s existing Apify-only path). Relative-not-absolute is
  upheld by the chart/Library screen never presenting a raw metric, only the already-relative
  Performance Score. Explicit-attribution is upheld: every Post shown is the one the Operator logged via
  `/log-post`, read back verbatim, never inferred. Predicted-vs-measured (rule 3) is upheld explicitly —
  every screen labels a Fit Score "(predicted)" and a Performance Score "(measured)" wherever either
  appears, proven by dedicated tests.
