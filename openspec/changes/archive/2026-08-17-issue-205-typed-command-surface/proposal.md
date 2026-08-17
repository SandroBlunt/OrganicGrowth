## Why

Epic #195's own words: "The 'API' this rebuild needs is not a server. It is a typed in-process command
surface — plain exported TypeScript functions over the stores — and it is the only thing permitted to
write." Everything above it — the worker (#208), the viewer (#210), every agent (#211) — is meant to hang
off this surface instead of touching a store or a file directly. Until it exists there is nothing for
those later slices to call, and the store boundary the epic has been building since #201/#222/#223/#203
stays nominal: real, typed, tested — and unreachable from anywhere a real caller would sit.

The issue also names a second, entangled problem: "Roughly 41 non-test modules import `node:fs`
directly today, bypassing the stores. Until that is fixed the store boundary is nominal rather than
real." Re-deriving the count (`git grep -l "node:fs" -- 'src/**/*.ts' | grep -v test`) finds **33**, not
~41 — the number likely dropped because #222/#223's SQL stores absorbed some of the original violators
into their own file-backed halves. The audit and sweep are part of this ticket, not cleanup afterwards,
per the issue's own framing.

## What Changes

- **A new `src/command-surface/` module** — plain exported TypeScript functions, one file per domain
  area, each a thin orchestration shell over the `{ db }` stores #201/#222/#223/#203 already shipped:
  - `trends.ts` — `listTrends` (wraps `TrendStore.listTrendsForRun`/`listBriefableTrends`).
  - `ideas.ts` — `createIdea` (wraps `IdeaStore.createIdea`) and `recordReviewDecision` (composes
    `IdeaStore.acceptIdea`/`rejectIdea` with, for an acceptance, `selectIdeaRecipes` — CONTEXT.md's own
    "Review": one Operator decision, not two store calls a caller has to remember to sequence).
  - `jobs.ts` — `enqueueJob` (wraps `JobStore.createJob`), `claimJob` (wraps `JobStore.claimJob`
    unchanged — the atomic claim-with-owner-and-expiry primitive), and `releaseJob` (wraps
    `JobStore.releaseJob`) — the last one a deliberate, minimal, necessary companion beyond the issue's
    own "enqueuing and claiming" phrasing: a surface that can enqueue and claim a job but never let a
    caller finish it would make AC2 impossible to honor the moment the worker (#208) needed to.
  - `assets.ts` — `saveAsset` (wraps `AssetStore.writeAsset`'s SQL-backed `{ db }` overload) and
    `attachAssetMedia` (wraps `AssetStore.addAssetMediaBatch`) — the second a deliberate, minimal
    companion: CONTEXT.md's own "Asset" is "the media ... plus its tailored Copy", so a surface that
    could save an Asset's status/spec but never record the media rows it produced would leave half of
    "saving an Asset" with no legal write path.
  - `posts.ts` — `logPost` (wraps `PostStore.recordPost`).
  - `performance.ts` — `readPerformance` (wraps `listMetricSnapshotsForPost` +
    `latestPerformanceScoreForPost`) plus, as deliberate, minimal, necessary companions,
    `recordPerformanceSnapshot`/`recordPerformanceScore` (wrap `recordMetricSnapshot`/
    `recordPerformanceScore`) — the issue's own AC1 names only the READ ("reading Performance"), but
    with no write path Performance data could never legally enter the system through this surface at
    all.
  - `index.ts` — a barrel re-exporting every command, proven wired end-to-end by one integration test
    that drives Trend → Idea → Review → Job → Asset → Post → Performance entirely through `index.ts`'s
    own exported names.
- **Every command is tested in-process against a real, throwaway SQLite file** (`src/db/test-support.ts`'s
  `withTempDb`, never `:memory:` — AC3, "the highest seam available"), reusing `src/db/fixtures/
  seed-chain.ts`'s existing `seedAsset`/`seedAssetAndChannel` fixtures wherever they fit.
- **A published audit of every non-test module importing `node:fs`** (33, re-derived — see "Why"), each
  given one of the issue's own three verdicts, posted to issue #205 via `gh issue comment`. Full
  reasoning below, under "The audit".
- **The one genuine store-boundary bypass the audit found is swept**: `src/commands/run-pipeline.ts`
  computed its `baselineExists` readiness flag via a raw `readFile` + `JSON.parse` of the ledger, instead
  of `src/ledger/ledger.ts`'s own `loadBaseline` accessor — and, unlike `loadBaseline`, silently
  swallowed a genuinely corrupt ledger as "no baseline" rather than propagating the error
  (data-handling rule 4: never silently degrade real corruption into a normal empty state). Swapped to
  `loadBaseline`; the file's `node:fs/promises` import is removed entirely.
- **A new `src/fs-boundary/` module** — the automated check AC7 asks for:
  - `scan.ts` — a PURE deep module (`findNodeFsImports`, `importsNodeFs`, `isTestPath`) matching an
    actual ES-import or `require` SITE naming the target module, never a bare substring search (a
    substring search would false-positive on this very module's own doc comments describing what it
    does — hit for real while writing this module, fixed by rewording rather than weakening the match).
  - `allow-list.ts` — `NODE_FS_ALLOW_LIST`, the 32 legitimately-direct modules the audit concluded need
    no further change, each grouped by its verdict category with a one-line pointer to the full
    reasoning (this proposal + the issue #205 audit comment).
  - `node-fs-guard.test.ts` — the one place this whole check touches disk: walks every `.ts` file under
    `src/`, and asserts `findNodeFsImports` returns EXACTLY `NODE_FS_ALLOW_LIST` — both directions (a
    new, un-audited import fails the build; a stale entry that no longer imports `node:fs` fails too, so
    the list can never silently drift into over-claiming).
- **Landed as a ratchet, per the issue's own suggested sequencing**: the guard's first commit lands with
  the allow-list still holding all 33 of today's real violators (including `run-pipeline.ts`), proven
  green against reality; the very next commit performs the sweep and shrinks the list to 32, proving the
  ratchet actually catches and fixes a real violation rather than starting pre-solved.
- **Rule 7** (`.claude/rules/always/organicgrowth-rules.md`) and `openspec/project.md`'s Tech stack
  paragraph gain the command surface and the guard, plus a small factual fix noticed while in the
  neighborhood: issue #203's Job/Gate Request/Post/Performance stores were never added to rule 7's list
  of SQL-backed stores. New `docs/adr.docs-test.ts` assertions pin the additions.

## The audit

Every one of the 33 non-test modules importing `node:fs` was read and given one of the issue's own three
verdicts. The full per-module table with reasoning is posted on issue #205 (`gh issue comment 205`) —
summarized here by category:

- **1 moved behind a store**: `src/commands/run-pipeline.ts` (swept onto `ledger.ts`'s `loadBaseline`,
  above).
- **0 moved behind an existing port**: none of the 33 needed to move behind `SpaceMcpPort`/
  `PerformanceScrapePort`/`MediaHostPort`/the Zoho MCP schedule port — none of their concerns (produced
  media on local disk, document reads, ops tooling) are things any of those four ports models.
- **32 legitimately direct**, falling into six reasoned groups:
  1. **Produced-media/output-bundle writers** (`asset/carousel-real-media.ts`, `asset/download.ts`,
     `asset/news-short-script-output.ts`, `asset/output-bundle.ts`, `asset/shot-list-media.ts`) — write
     the actual rendered media bytes to local disk, which is exactly what ADR-0029 says stays there ("the
     database holds a root-relative storage key" — never the bytes themselves).
  2. **Already-the-store** (`brand-asset/store.ts`, `format/store.ts`, `production-spec/store.ts`) — each
     one's file-backed half IS the store (mirrors `AssetStore`'s own file/SQL split); their `node:fs` use
     is the store boundary, not a bypass of it.
  3. **Foundational I/O primitives** (`brand/resolver.ts`, `db/connection.ts`, `fs/safe-io.ts`) — the
     low-level path-resolution/file-write/DB-connection primitives every file-backed (or SQL-backed)
     store is itself built on.
  4. **Documents ADR-0029 explicitly names as staying files** (`commands/run-pipeline-readiness.ts`,
     `commands/track-performance.ts`, `format/baseline-prompt.ts`, `mention-handle/store.ts`,
     `production-spec/brand-profile.ts`) — Brand Profile YAML, Format YAML, the Baseline Prompt document,
     `seeds.yaml`, and the Mention Handle Registry (`data/mention-handles.yaml`, ADR-0029 + issue #226 —
     explicitly a "stays a file" decision, named here per this ticket's own instruction to say so
     explicitly rather than skip it).
  5. **Third-party/generated/ops artifacts, not domain store data**
     (`brand/scaffold-brand.ts`, `camera-hub/upload.ts`, `commands/export-schedule.ts`,
     `commands/schedule-via-zoho-mcp.ts`, `commands/upload-camera-hub-scripts.ts`,
     `media-backup/backup-runner.ts`, `media-backup/checksum.ts`, `media-backup/copy.ts`,
     `media-backup/produced-media-tree.ts`, `media-backup/verify-runner.ts`,
     `schedule-batch/cleanup-runner.ts`, `secrets-scan/tracked-files.ts`) — a third-party desktop app's
     own storage (epic #195's own "what cannot come along"), generated export/scratch bundles whose
     actual ledger write already goes through `AssetStore`, the phase-00 media backup tool's raw
     byte-copy/checksum/walk, Schedule Batch's own manifest housekeeping (explicitly separate from the
     ledger), and the CI credential scanner reading arbitrary git-tracked files.
  6. **Test/fixture support and deferred, never-`npm test`-exercised live-adapter code**
     (`media-host/fixtures/tiny-png.ts`, `media-host/live/env.ts`, `media-host/live/smoke.ts`,
     `space-driver/live/replay/transport.ts`) — not named `*.test.ts`, so the audit still covers them, but
     each is either fixture support for the one real `sips` test / the manual live smoke script, or the
     hermetic record/replay harness's own fixture loader.

A unifying fact behind most of the "legitimately direct" verdicts: **no SQL table holds real production
data yet** (issue #204's importer has not run — #222's and #223's own QA verdicts already established
this for the six/two stores they shipped, and nothing since has changed it). Any file-based read of real
Brand/Idea/ledger data that moved onto the still-empty SQL tables today would not be a cleanup — it would
silently start returning nothing. `run-pipeline.ts`'s fix does not touch this: it moves onto the
EXISTING file-based `loadBaseline` accessor already used by real production code, not onto SQL.

## Known gaps, decided, not dropped

- **No automated check enforces AC2 ("nothing above it writes to a store or the filesystem directly")
  the way AC7 asks for `node:fs`.** AC7 explicitly names an automated check; AC2 does not. Building a
  second static-analysis guard — walking every SQL store's write-function exports and asserting only
  `src/command-surface/**` and test/fixture code import them — would need to carve out the SAME class of
  legitimate exceptions the `node:fs` guard does (store-to-store composition, e.g. `idea/store.ts`
  importing `trend/store.ts`'s `getTrend`; fixture support like `db/fixtures/seed-chain.ts` and
  `production-queue/fixtures/claim-worker.ts`, which are not `*.test.ts`-named but legitimately call
  store writes directly) — real complexity with real risk of a second fragile tool, for a claim this
  ticket already VERIFIES is true today by grep (no production module outside stores/tests imports these
  store writes — checked at both the start and the end of this ticket) and states as an architectural
  rule in rule 7 and each command module's own doc comment. Deferred, not silently dropped: if a future
  slice needs it enforced automatically (most likely the worker, #208, the first real caller), it can
  reuse `fs-boundary/scan.ts`'s exact pattern.
- **No `requeueJob` command.** `JobStore.requeueJob` (reviving a `failed` job back to `queued`) is not
  wrapped — not needed to prove any of this ticket's own acceptance criteria; left for #208 to add if/when
  it needs that specific retry shape.
- **No command wraps `Brand`/`Channel`/`Format`/`BrandAsset`/`CopyVariant` stores.** AC1 names eight
  specific operations; these four stores are not among them, and no other tracked issue in this epic asks
  for them here. They remain directly importable (as they already were before this ticket), consistent
  with "nothing above the store layer currently imports them either" — adding commands for
  operations nobody has asked for yet is scope this ticket was not given.

## Capabilities

### Added Capabilities

- `command-surface`: `src/command-surface/`'s typed, in-process write API over the SQL-backed stores —
  the eight named pipeline operations plus their justified minimal companions.
- `node-fs-boundary-guard`: `src/fs-boundary/`'s automated, ratcheted check that only audited,
  allow-listed production modules import `node:fs` directly.

## Impact

- **New code:** `src/command-surface/` (7 modules + 7 test files), `src/fs-boundary/` (3 modules + 2 test
  files), `openspec/changes/issue-205-typed-command-surface/` (this change).
- **Modified code:** `src/commands/run-pipeline.ts` (the one swept module),
  `.claude/rules/always/organicgrowth-rules.md`, `openspec/project.md`, `src/db/adr.docs-test.ts`.
- **Untouched (deliberately):** `src/db/schema.ts`, `src/db/migrate.ts` (MIGRATION_1/MIGRATION_2 stay
  byte-for-byte frozen — no new migration), the four integration ports (`SpaceMcpPort`,
  `PerformanceScrapePort`, `MediaHostPort`, the Zoho MCP schedule port) and their fakes, every existing
  store's own operations/return shapes, `src/ledger/ledger.ts` and every real production module that
  reads/writes `ledger.json`.
- **Hermetic, no live Space/Apify/Zoho MCP calls.** Every new test opens a real, empty, throwaway SQLite
  file per test (`withTempDb`); `src/fs-boundary/scan.test.ts` is pure, in-memory only.
- **Always-rules upheld:** this slice touches no content-generation, publication, or metrics-scraping
  code — generate-never-publish/public-metrics-only/relative-not-absolute are untouched by construction.
  Explicit-attribution is upheld by `logPost`'s own contract (writes only what it is given, never
  infers). Ledger-as-source-of-truth is explicitly preserved: `ledger.json` stays the one thing every real
  production command actually reads/writes; the command surface is additive and unused by any of them
  until #204/#208.
