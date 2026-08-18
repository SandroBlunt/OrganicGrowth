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
- **Idea identity is resolved by `idea.legacy_ref` (migration 5), NOT `(run_id, title)`.** QA round-1
  found that a title-based natural key silently MERGED two genuinely distinct accepted Ideas sharing an
  identical title: the second Idea got no Idea row, no Asset row, no Job row of its own, and its own `job`
  outcome read exactly like a legitimate "already queued" re-accept — the exact guard-blindness bug this
  ticket exists to close, reproduced one layer inside the fix. Round 2 adds migration 5:
  `idea.legacy_ref TEXT` (the file ledger's own Idea id, e.g. `"idea-05"` — already unique per Brand and
  already carried everywhere in this system: `/log-post`, `/pick`, the whole attribution chain) plus a
  partial `UNIQUE (brand_id, legacy_ref)` index enforced by SQLite itself. `syncAcceptToSql` now looks an
  Idea up by `(brand_id, legacy_ref)` via `getIdeaByLegacyRef` (`src/idea/store.ts`) and stamps
  `legacyRef: ideaId` on every row it creates; `src/importer/execute.ts` does the same with its own
  `ideaPlan.legacyId`, so a re-accept of an importer-carried Idea still correlates correctly. Two Ideas
  sharing a title now correctly get two SEPARATE Idea/Asset/Job rows; a genuine collision (the same
  `legacy_ref` used twice for the same Brand) is impossible in normal operation and would hit a real, loud
  `SQLITE_CONSTRAINT` error if it somehow occurred. **Known, documented residual limit:** an Idea imported
  by the ORIGINAL one-shot importer run (2026-08-17, before migration 5 existed) carries no `legacy_ref` —
  a later re-sync of that same ledger Idea will not find it and will create a second, duplicate row rather
  than reusing the pre-migration one (never a silent MERGE, this ticket's own bar, but a real duplicate an
  Operator would need to reconcile by hand). See `handoff.md`'s Known Limits.
- **`SqlSyncJobOutcome` now carries `reason: "created" | "already-queued"`, not just `synced: boolean`.**
  QA round-1 Defect 1 also named that `synced: false` meant both "already there" and "silently dropped" —
  indistinguishable. `reason` makes that explicit; because identity is now `legacy_ref`, `"already-queued"`
  can only ever mean a genuine re-sync of the SAME ledger Idea, never a second, distinct Idea silently
  merged into the first.
- **Job-level idempotency uses `listJobsForComposite` as the primary guard, now BACKSTOPPED by a real
  UNIQUE index (migration 5, QA round-1 Defect 4).** `job.idempotency_key` carried no `UNIQUE` constraint
  in round 1 (unlike `schedule_outbox.idempotency_key`), so the read-then-write sequence
  (`listJobsForComposite` then `enqueueJob`) was safe within one process but not across two concurrent OS
  processes racing the same accept. Migration 5 adds a partial `UNIQUE (job.idempotency_key) WHERE
  idempotency_key IS NOT NULL` index — cheap (only `sql-sync.ts` ever sets this column, and only once per
  composite by construction) and closes the race: a second, concurrent `enqueueJob` call for the same
  composite now throws a real `SQLITE_CONSTRAINT` error instead of silently creating a duplicate `queued`
  job. `idempotency_key` is still set (`"<brand>::<legacy-idea-id>::<recipe>"`, the same `::`-joined shape
  the importer's own `assetKey` uses) as recorded provenance and, now, real enforcement too.
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
  rather than reporting a bare "Enqueued" success. `src/recipe/review-docs.test.ts` now PINS this paragraph
  (QA round-1 Defect 2) — the established pattern this file already uses for every other Gate-1 accept-flow
  requirement — so its wording is provable by `npm test`, not merely hand-read.
- **`run-pipeline.ts`'s stranded-idea recovery — the ONE real, compiled TypeScript caller of
  `enqueueOnAccept` — now passes `db` BY DEFAULT (QA round-1 Defect 2).** Round 1 left this caller unwired,
  meaning a real accept through real code never reached SQL at all — only a markdown paragraph an LLM agent
  had to remember to follow did. `RunPipelineOptions` gains an optional `dbPath` (defaulting to
  `data/organicgrowth.db` at runtime, the same file every other command opens; every test injects a
  throwaway temp path). The resume branch now opens + migrates this database itself, before re-enqueueing
  any stranded Idea, and passes it through; a SQL-only failure (the file queue write always happens first,
  inside `enqueueOnAccept`, before the SQL attempt) is caught, surfaced to the Operator verbatim in that
  turn's message, and does not abort re-enqueueing the REMAINING stranded Ideas.
  `src/commands/run-pipeline.test.ts` adds a positive-path test that seeds a real Brand/Format row in a temp
  SQLite file, resumes a stranded Idea, and asserts the SQL `job` table gains a real row — proven red
  (fails without the `db` wiring) then green, not merely asserted.

## Capabilities

### Added Capabilities

- `accept-sql-sync`: `src/production-queue/sql-sync.ts` — syncs an accepted Idea's chosen Recipes (Idea,
  per-Recipe Asset, `job` rows) into SQL through the command surface, idempotently, failing loudly.

### Modified Capabilities

- `production-queue`: `enqueueOnAccept` gains an optional `db` parameter that additively syncs newly-file-
  enqueued Recipes into SQL, never changing the existing file-write behavior.
- `run-pipeline-conductor`: the resume/fresh Requirement's stranded-idea re-enqueue step (point 3) now
  opens/migrates the local SQLite database BY DEFAULT and passes it to `enqueueOnAccept`, catching and
  surfacing a per-Idea SQL failure without aborting the remaining stranded Ideas (QA round-1 Defect 2).

## Impact

- **New code:** `src/production-queue/sql-sync.ts` (+`.test.ts`),
  `openspec/changes/issue-254-accept-writes-sql-queue/` (this change).
- **Modified code:** `src/production-queue/enqueue-on-accept.ts` (+`.test.ts` additions),
  `.claude/commands/review-ideas.md` (Gate 1's accept step passes `db`),
  `src/recipe/review-docs.test.ts` (pins that paragraph, Round 2),
  `src/commands/run-pipeline.ts` (+`.test.ts` additions — the stranded-idea resume path passes `db` by
  default, Round 2), `src/db/schema.ts` (+`.test.ts`, migration 5, Round 2), `src/db/migrate.test.ts`
  (`CURRENT_SCHEMA_VERSION` bumped 4→5, Round 2), `src/idea/store.ts` (+`.test.ts` — `legacyRef` /
  `getIdeaByLegacyRef`, Round 2), `src/importer/execute.ts` (stamps `legacyRef`, Round 2),
  `src/production-queue/job-store.test.ts` (the `idempotency_key` UNIQUE-index proof, Round 2).
- **Schema change (Round 2): migration 5.** Adds `idea.legacy_ref TEXT` plus a partial `UNIQUE (brand_id,
  legacy_ref)` index, AND a partial `UNIQUE (job.idempotency_key)` index — purely additive
  (`ALTER TABLE ... ADD COLUMN` / `CREATE INDEX`), touching no existing column, row, or constraint.
  Migrations 1–4 stay byte-for-byte frozen. (Round 1 deliberately shipped with no schema change; QA round-1
  Defects 1 and 4 are why Round 2 adds one — see "What Changes" and `handoff.md`'s Round-2 Build.)
- **No new store-write-boundary allow-list entry.** Every SQL write this ticket performs
  (`createIdea`/`recordReviewDecision`/`saveAsset`/`enqueueJob`/`createRun`) is already registered in
  `src/store-write-boundary/scan.ts`'s `STORE_WRITE_FUNCTIONS`, and every one happens inside
  `src/command-surface/` (`syncAcceptToSql` itself reads directly from stores — `getBrandBySlug`,
  `getFormatBySlug`, `getRunByKey`, `getIdea`, `getIdeaByLegacyRef`, `listJobsForComposite` — which the
  guard is scoped to ignore by design, "writes only, never reads").
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
