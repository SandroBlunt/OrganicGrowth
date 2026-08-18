## Why

The worker built in #208 (`drainQueue`) reads the SQL `job` table via `findNextQueuedJob`. Accepting an
Idea (`/review-ideas`'s Gate 1) has only ever written a completely different queue: `enqueueOnAccept`
(`src/production-queue/enqueue-on-accept.ts`) appends to `data/queue.json`, the file the attended
`producer`/`/queue`/`/pick`/`/pick-cast`/`/run-pipeline` read. `enqueueJob` — the command-surface function
that writes a `job` row — has exactly two production callers: the one-shot importer, and `resolveGate`
(resuming an already-imported job). Neither is the accept flow. So the SQL `job` table only ever contains
what the 2026-08-17 import put there; every Idea accepted since then is invisible to the worker, and
nothing reports this — `findNextQueuedJob` returning `null` cannot distinguish "no work exists" from "the
work went somewhere I cannot see." This is the guard-blindness pattern from #197/#205/#209/#204/#252 in a
different costume: not a check that is green and blind, but a process that succeeds and does nothing.

The Operator decided the fork on the issue (2026-08-17 comment): **Option B, staged.** SQL becomes the
one queue, eventually; this ticket is **slice 1** — accept writes SQL through the command surface,
`data/queue.json` keeps being written exactly as today, no attended behaviour changes. `/queue`/`/pick`/
`/pick-cast` moving onto SQL, and `data/queue.json` retiring, are later slices.

## What Changes

- **A new deep module, `src/production-queue/sql-sync.ts`, syncs an accepted Idea's chosen Recipes into
  SQL.** `syncAcceptToSql(ideaId, recipes, { db, brand, ledgerPath, now })` ensures the Idea's SQL row
  exists and is `accepted` (creating the Brand's Format/Run rows on demand when they are not already
  there — a brand-new week's Run was never part of the one-shot import), reads the Idea's Brief off disk
  (`src/importer/load-brief.ts`'s existing `loadBrief`, extracting `sourceUrls` via the existing
  `extractSourceUrls`), then for each Recipe upserts its `queued` Asset and enqueues a `job` row **unless**
  one already exists for that `(brand, idea, recipe)` composite (`listJobsForComposite` — the SQL-side
  sibling of the file queue's own `hasJobFor`). Every write goes through `src/command-surface/` —
  `createIdea`, `recordReviewDecision`, `saveAsset`, `enqueueJob`, `createRun` — never a store directly.
- **Idea identity is resolved by `(run_id, title)`, not a new schema column.** The `idea` table carries no
  column correlating a SQL row back to the file ledger's own id (`"idea-05"`); this ticket deliberately
  does not add one — `schema.ts`'s migration list is a shared, append-order file three other build slices
  are concurrently landing changes near, and a title is a safe, sufficient natural key within one Run
  (idea-strategist never repeats a headline). This is also what makes a re-accept of an Idea the one-shot
  importer already carried safe without any backfill: the importer wrote a real `title` on every Idea it
  created, so a later accept-flow call for the SAME ledger Idea finds the importer's own row by
  `(run_id, title)` and reuses it, never duplicating it.
- **Job-level idempotency uses `listJobsForComposite`, not `idempotency_key`'s own uniqueness.**
  `job.idempotency_key` carries no `UNIQUE` constraint (unlike `schedule_outbox.idempotency_key`). This
  ticket sets it anyway (`"<brand>::<legacy-idea-id>::<recipe>"`, the same `::`-joined shape the importer's
  own `assetKey` uses) as recorded provenance, but the actual duplicate guard is checking
  `listJobsForComposite` (already built by #203) before every `enqueueJob` call.
- **`enqueueOnAccept` grows one optional `db` (+ `brandsRoot`) parameter.** Omitted (every existing
  caller), its behavior is byte-for-byte unchanged — `data/queue.json` is written exactly as before. When
  given, AFTER the file write already happened, it calls `syncAcceptToSql` for exactly the Recipes the file
  queue decided were genuinely NEW this call (never one already `"already-queued"` there) — so an Idea the
  importer already carried, or a Recipe synced on an earlier call, is never re-touched.
- **A SQL failure is loud, never silent — decided: report, not roll back.** `syncAcceptToSql` throws,
  naming what could not be resolved (a missing Brand/Format row, an unreadable Brief), rather than
  swallowing the problem or reporting success. `enqueueOnAccept` does not catch this: the exception
  propagates to its own caller, AFTER the file queue was already saved — so a SQL problem never blocks the
  attended, file-based pipeline this slice promises not to change, but nobody calling `enqueueOnAccept`
  can mistake a failed SQL sync for a quiet success. This ticket does NOT wrap the whole sync in one SQL
  transaction (`recordReviewDecision`'s own `selectIdeaRecipes` half already opens its own —
  `withTransaction` does not nest, per `command-surface/ideas.ts`'s own doc comment); instead every step
  (`createIdea`/`saveAsset`/`enqueueJob`) is individually atomic AND idempotent on retry (find-or-create
  Idea, upsert Asset, guard-then-enqueue Job), so re-running `syncAcceptToSql` after a partial failure
  reaches the same end state rather than duplicating anything.
- **`.claude/commands/review-ideas.md` is updated** to open (`openDatabase`/`runMigrations`) and pass
  `data/organicgrowth.db` as `enqueueOnAccept`'s new `db` argument at Gate 1 — the change that actually
  makes the worker start seeing new work, and to surface a thrown SQL-sync error to the Operator verbatim
  rather than reporting a bare "Enqueued" success.
- **No attended behaviour changes.** `data/queue.json`'s shape, `/queue`/`/pick`/`/pick-cast`/
  `/run-pipeline`, and every existing `enqueueOnAccept` caller (`run-pipeline.ts`'s stranded-idea recovery,
  which does not pass `db` in this slice — a known, documented limit) are unaffected.

## Capabilities

### Added Capabilities

- `accept-sql-sync`: `src/production-queue/sql-sync.ts` — syncs an accepted Idea's chosen Recipes (Idea,
  per-Recipe Asset, `job` rows) into SQL through the command surface, idempotently, failing loudly.

### Modified Capabilities

- `production-queue`: `enqueueOnAccept` gains an optional `db` parameter that additively syncs newly-file-
  enqueued Recipes into SQL, never changing the existing file-write behavior.

## Impact

- **New code:** `src/production-queue/sql-sync.ts` (+`.test.ts`),
  `openspec/changes/issue-254-accept-writes-sql-queue/` (this change).
- **Modified code:** `src/production-queue/enqueue-on-accept.ts` (+`.test.ts` additions),
  `.claude/commands/review-ideas.md` (Gate 1's accept step passes `db`).
- **No schema change.** Migrations 1-4 stay untouched; no migration 5 (deliberate — see "What Changes").
- **No new store-write-boundary allow-list entry.** Every SQL write this ticket performs
  (`createIdea`/`recordReviewDecision`/`saveAsset`/`enqueueJob`/`createRun`) is already registered in
  `src/store-write-boundary/scan.ts`'s `STORE_WRITE_FUNCTIONS`, and every one happens inside
  `src/command-surface/` (`syncAcceptToSql` itself reads directly from stores — `getBrandBySlug`,
  `getFormatBySlug`, `getRunByKey`, `getIdea`, `listIdeasForRun`, `listJobsForComposite` — which the guard
  is scoped to ignore by design, "writes only, never reads").
- **Hermetic, no live Magnific/Zoho/Apify call.** Every new test runs against a real, throwaway SQLite file
  (`db/test-support.ts`'s `withTempDb`, never `:memory:`); the "worker picks it up" proof drives
  `drainQueue`/`runOneJob` against the SAME Magnific fakes issue #208 already established
  (`space-driver/fixtures/fake-space.ts`, `producer/fixtures/fake-carousel-space.ts`) — documented fully
  in this change's `handoff.md`, never a live `spaces_*`/`creations_*` call.
- **Always-rules upheld.** Generate-never-publish/public-metrics-only/relative-not-absolute: unaffected
  (no render, no metrics touched). Explicit-attribution: unaffected (no Post logging here).
  Ledger-as-source-of-truth: `data/queue.json`/`ledger.json` stay exactly as written today; the SQL sync is
  additive plumbing behind the SAME command surface every other SQL write in this codebase already uses,
  never a second, independently-writable ledger.
