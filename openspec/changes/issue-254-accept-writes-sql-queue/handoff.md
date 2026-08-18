# Slice Handoff — issue #254: Accepting an Idea never reaches the SQL queue

Bidirectional channel between `developer` and `qa`. Developer writes the Build Report below; `qa`
appends a QA Verdict; retries append `Round-N Build` blocks. Nothing here is ever overwritten.

## Build Report (Round 1)

### What changed

Accepting an Idea (`/review-ideas`'s Gate 1) wrote only `data/queue.json` — the file the *attended*
`producer`/`/queue`/`/pick`/`/pick-cast`/`/run-pipeline` read. The SQL `job` table the *unattended*
worker (`drainQueue` → `findNextQueuedJob`, issue #208) reads had exactly two production writers
(the one-shot importer, and `resolveGate`), neither of which is the accept flow — so every Idea accepted
since the 2026-08-17 import was invisible to the worker, silently.

This slice (Option B, slice 1, per the Operator's 2026-08-17 comment on the issue) adds a second write,
alongside the unchanged file write, never replacing it:

- **`src/production-queue/sql-sync.ts` (new deep module).** `syncAcceptToSql(ideaId, recipes, { db,
  brand, ledgerPath, now })` ensures a SQL `idea` row exists and is `accepted` (creating its Brand's
  Format/Run rows on demand when they don't already exist — a brand-new week's Run is never part of the
  one-shot import), reads the Idea's Brief off disk to populate `brief`/`sourceUrls` (reusing the
  importer's own `loadBrief`/`extractSourceUrls`), then for each Recipe upserts a `queued` Asset and
  enqueues a `job` row **unless one already exists** for that `(brand, idea, recipe)` composite. Every
  write goes through `src/command-surface/` (`createIdea`, `recordReviewDecision`, `saveAsset`,
  `enqueueJob`, `createRun`) — never a store directly.
- **`enqueueOnAccept` grows one optional `db` (+ `brandsRoot`) parameter.** Omitted — every existing
  caller until this ticket — behavior is byte-for-byte unchanged: only `data/queue.json` is written.
  When given, AFTER the file write already happened, it calls `syncAcceptToSql` for exactly the Recipes
  the file queue decided were newly enqueued this call (never a Recipe already `"already-queued"` there).
- **`.claude/commands/review-ideas.md`** now instructs opening `data/organicgrowth.db` and passing it as
  `db` at Gate 1's accept step — the change that actually makes the worker start seeing new work — and to
  surface a thrown SQL-sync error verbatim rather than reporting a bare "Enqueued" success.

### Files touched

- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-254-accept-writes-sql-queue/src/production-queue/sql-sync.ts` (new)
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-254-accept-writes-sql-queue/src/production-queue/sql-sync.test.ts` (new)
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-254-accept-writes-sql-queue/src/production-queue/enqueue-on-accept.ts` (modified — optional `db`/`brandsRoot` options, optional `sql` result field)
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-254-accept-writes-sql-queue/src/production-queue/enqueue-on-accept.test.ts` (modified — new `describe` block covering the SQL-aware path)
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-254-accept-writes-sql-queue/.claude/commands/review-ideas.md` (modified — Gate 1's accept step now passes `db`)
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-254-accept-writes-sql-queue/openspec/changes/issue-254-accept-writes-sql-queue/` (this change: `proposal.md`, `tasks.md`, `specs/accept-sql-sync/spec.md`, `specs/production-queue/spec.md`, `handoff.md`)

No schema change. No new `src/store-write-boundary/scan.ts` allow-list entry (every write this ticket
performs was already registered from earlier tickets, and every one happens inside
`src/command-surface/`).

### How to run

```bash
# From this worktree:
npm test                                                       # full suite
node --import tsx --test src/production-queue/sql-sync.test.ts src/production-queue/enqueue-on-accept.test.ts
npm run test:docs
npm run build
openspec validate issue-254-accept-writes-sql-queue --strict
openspec validate --all --strict
```

Baseline at branch cut (`cdb68a0`): 3662 tests / 953 suites / 0 fail. After this slice: **3674 tests /
956 suites / 0 fail** (12 new tests: 8 in `sql-sync.test.ts`, 4 new in `enqueue-on-accept.test.ts`; 3 new
suites, matching the two new `describe` blocks in `sql-sync.test.ts` plus one new `describe` block in
`enqueue-on-accept.test.ts`). `npm run test:docs`: 351/94/0-fail (unchanged from baseline — the
`review-ideas.md` edit is additive prose only, verified against `src/recipe/review-docs.test.ts`).
`npm run build` and both `openspec validate` invocations are clean.

### Acceptance-criteria self-assessment

| Acceptance criterion (issue #254) | Proven by |
|---|---|
| Accepting an Idea creates its Idea row, per-Recipe Asset rows, and one `queued` job per Recipe in SQL, all through `src/command-surface/` | `sql-sync.test.ts`: *"creates the Idea row, one Asset per Recipe, and one queued job per Recipe (AC1)"* — asserts real `idea`/`asset`/`job` rows via `getIdea`/`getAssetByRecipe`/`listJobsForComposite`. Every write in `sql-sync.ts` is a `command-surface` export (`createIdea`/`recordReviewDecision`/`saveAsset`/`enqueueJob`/`createRun`) — confirmed by `store-write-boundary` guard staying green with zero new allow-list entries. |
| Accepting twice must not double-enqueue; say which of `idempotencyKey`/`listJobsForComposite` was used and why | `sql-sync.test.ts`: *"is idempotent: a second call for the SAME ledger Idea reuses the Idea row and does not double-enqueue (AC2)"*. **Used `listJobsForComposite` as the actual guard** (checked before every `enqueueJob`), because `job.idempotency_key` carries no `UNIQUE` constraint in the schema (unlike `schedule_outbox.idempotency_key`, which does) — setting it alone would not have prevented a duplicate. `idempotencyKey` is still set (`"<brand>::<idea>::<recipe>"`, matching the importer's own `assetKey` shape) as recorded provenance. See `sql-sync.ts`'s own doc comment, "Idempotency: report, not roll back". |
| The importer's already-carried jobs must not be duplicated or disturbed by a re-accept | `sql-sync.test.ts`: *"does not duplicate a job an EARLIER importer-style write already carried for this ledger Idea (AC3)"* — seeds an Idea/Asset/Job exactly as `src/importer/execute.ts` would (same `(run, title)`), then calls `syncAcceptToSql` for the same ledger Idea and asserts the pre-existing row is reused, not duplicated. |
| `queue.json` keeps being written exactly as today | `enqueue-on-accept.test.ts`: *"omitting options.db leaves behavior byte-for-byte unchanged"* (no `db` — existing 17 tests from before this ticket, unmodified, still pass) and *"with options.db, the file queue is written EXACTLY as before AND the SQL job table gains the same job"* (with `db` — asserts the on-disk `queue.json` shape). |
| A failure to write SQL must be loud; decide and argue rollback vs report | `sql-sync.test.ts`'s "loud failure" `describe` block (5 tests: missing Brand, missing Format, unknown Idea, no `run`, unreadable Brief — each asserts a thrown `Error` naming the problem) and `enqueue-on-accept.test.ts`'s *"a SQL failure is LOUD: it throws, but only AFTER the file queue was already saved"*. **Decision: report, not roll back** — argued in `sql-sync.ts`'s own doc comment and `proposal.md`'s "What Changes": `recordReviewDecision`'s own `selectIdeaRecipes` half already opens a transaction (`withTransaction` does not nest), so one outer transaction around the whole sync was not available without bypassing the command surface; instead every step (`createIdea`/`saveAsset`/`enqueueJob`) is individually atomic AND idempotent on retry, so a re-run after a partial failure reaches the same end state rather than duplicating anything, and the failure is never swallowed. |
| Prove: accept an Idea, show the SQL `job` table gaining exactly the expected rows (real query output) | See "Prove it, do not assert it" section below — real `SELECT * FROM job`/`idea`/`asset` output. |
| Prove: `findNextQueuedJob` returning that job | See below — real return value. |
| Prove: `drainQueue` picking it up against the fake Space | See below — real `drainQueue` outcome, `FakeSpace` call counts. |
| Prove: break it on purpose (missing Brand row), watch it fail loudly, restore | See below — full transcript. |

### Prove it, do not assert it

Run against a **throwaway temp SQLite file and temp ledger/queue paths** — never the committed
`data/organicgrowth.db` or `data/queue.json`. Scripts were written to the worktree root as
`_prove_254.ts`/`_break_254.ts`, run with `npx tsx`, and deleted immediately after (confirmed absent from
`git status` — see the transcripts below for the deletion step being unnecessary to show, since the
files never appear in any commit).

**Accept → SQL job table gains exactly the expected rows → `findNextQueuedJob` finds it → `drainQueue`
picks it up against `FakeSpace`:**

```
=== Setup: throwaway temp dir (never the committed data/) ===
dir: /var/folders/cy/jk41bm_d27s23tx27kq5_xbw0000gn/T/og-issue-254-proof-ZzVUbm

=== Step 1: accept the Idea via enqueueOnAccept({ db, ... }) ===
enqueueOnAccept result.enqueued: true
enqueueOnAccept result.sql: {
  "ideaId": "9e71343d-3a29-426f-89ab-e8d2fae2efa9",
  "ideaCreated": true,
  "jobs": [
    { "recipe": "news-carousel", "synced": true }
  ]
}

=== Step 2: data/queue.json (the FILE queue) still gained its job, unchanged shape ===
{
  "jobs": [
    {
      "idea_id": "idea-01",
      "brand": "straw-motion",
      "recipe": "news-carousel",
      "gate": null,
      "status": "queued",
      "enqueued_at": "2026-08-18T09:00:00.000Z"
    }
  ]
}

=== Step 3: real SQL query output — SELECT * FROM job ===
[
  {
    "id": "74693f9f-27ae-4197-97ec-391da13c47e4",
    "asset_id": "470c5160-c101-485d-b889-7a72cfadc092",
    "brand_id": "62ab0ef5-3738-4975-82f5-0ea684627e81",
    "gate": null,
    "status": "queued",
    "attempt": 0,
    "enqueued_at": "2026-08-18T09:00:00.000Z",
    "started_at": null,
    "idempotency_key": "straw-motion::idea-01::news-carousel",
    "locked_by": null,
    "locked_until": null,
    "created_at": "2026-08-18T09:00:00.000Z",
    "updated_at": "2026-08-18T09:00:00.000Z",
    "schema_version": 1
  }
]

=== Step 4: real SQL query output — SELECT id, run_id, brand_id, format_id, title, status, hook_type, theme FROM idea ===
[
  {
    "id": "9e71343d-3a29-426f-89ab-e8d2fae2efa9",
    "run_id": "6bd9a669-ad7b-4f7a-9cfb-a6112381c9bb",
    "brand_id": "62ab0ef5-3738-4975-82f5-0ea684627e81",
    "format_id": "81989d37-6e67-443d-ae05-8042e44a90b8",
    "title": "A real accepted headline",
    "status": "accepted",
    "hook_type": "unclassified",
    "theme": "unclassified"
  }
]

=== Step 5: real SQL query output — SELECT id, idea_id, recipe_slug, status FROM asset ===
[
  {
    "id": "470c5160-c101-485d-b889-7a72cfadc092",
    "idea_id": "9e71343d-3a29-426f-89ab-e8d2fae2efa9",
    "recipe_slug": "news-carousel",
    "status": "queued"
  }
]

=== Step 6: findNextQueuedJob(db) — proves the worker's own read sees it ===
{
  "id": "74693f9f-27ae-4197-97ec-391da13c47e4",
  "assetId": "470c5160-c101-485d-b889-7a72cfadc092",
  "brandId": "62ab0ef5-3738-4975-82f5-0ea684627e81",
  "status": "queued",
  "attempt": 0,
  "enqueuedAt": "2026-08-18T09:00:00.000Z",
  "idempotencyKey": "straw-motion::idea-01::news-carousel",
  "createdAt": "2026-08-18T09:00:00.000Z",
  "updatedAt": "2026-08-18T09:00:00.000Z"
}

=== Step 7: drainQueue(db, FakeSpace) — the unattended worker, against the FAKE Space only ===
drainQueue outcome: {
  "processed": [
    { "jobId": "74693f9f-27ae-4197-97ec-391da13c47e4", "outcome": { "status": "failed", "terminal": false, "reason": "the Asset has no authored Production Spec yet" } },
    { "jobId": "74693f9f-27ae-4197-97ec-391da13c47e4", "outcome": { "status": "failed", "terminal": false, "reason": "the Asset has no authored Production Spec yet" } },
    { "jobId": "74693f9f-27ae-4197-97ec-391da13c47e4", "outcome": { "status": "failed", "terminal": true,  "reason": "the Asset has no authored Production Spec yet" } }
  ]
}
FakeSpace edit/run calls made (should be 0 — this job has no authored Production Spec yet, a known limit): 0 0

=== Step 8: job row after drainQueue (proves the row was genuinely claimed/processed) ===
[
  { "id": "74693f9f-27ae-4197-97ec-391da13c47e4", "status": "failed", "attempt": 3, "locked_by": null, "locked_until": null }
]

=== Cleaned up temp dir ===
```

`attempt` climbing `0 → 1 → 2 → 3` across the three processed entries is `claimJob` genuinely claiming
the SAME row three times (retried within `drainQueue`'s own loop, `maxAttempts` default 3) — proof the
row is live and reachable, not a silent no-op. It ends `failed` honestly: this slice creates the `job`
row but does not author a Production Spec (that stays the producer/worker's own later responsibility —
see "Known limits" below), so `runOneJob`'s own pre-existing "the Asset has no authored Production Spec
yet" check stops it before any Space call — `FakeSpace.editGoals`/`.runs` both stay at `0`, and no live
`spaces_*`/`creations_*` call was ever possible (`FakeSpace` holds no network transport at all).

**Break it on purpose — missing Brand row, loud failure, restore:**

```
=== BREAK: a migrated database with NO Brand row at all ===
brand rows in this fresh db: [Object: null prototype] { n: 0 }

=== Calling enqueueOnAccept({ db, ... }) against it ===
THREW, loudly, as expected:
   syncAcceptToSql: no Brand row for slug "straw-motion" — run the one-shot importer (or create the Brand row) before accepting Ideas through SQL. The file queue was still written; only the SQL sync failed.

=== But the FILE queue still got the job — the SQL failure never blocked the attended pipeline ===
{
  "jobs": [
    {
      "idea_id": "idea-01",
      "brand": "straw-motion",
      "recipe": "news-carousel",
      "gate": null,
      "status": "queued",
      "enqueued_at": "2026-08-18T09:00:00.000Z"
    }
  ]
}

=== And SQL genuinely has nothing (no idea/asset/job row was written) ===
idea rows: [Object: null prototype] { n: 0 }
asset rows: [Object: null prototype] { n: 0 }
job rows: [Object: null prototype] { n: 0 }

=== RESTORE: create the missing Brand + Format row ===

=== Recovery note: the FILE queue already carries this job (from the first, SQL-failed call), so
    calling enqueueOnAccept again would see it as already-queued and never re-attempt the SQL sync
    at all (by design). The real recovery path is calling syncAcceptToSql DIRECTLY once the
    underlying SQL problem is fixed — exactly what an Operator/agent would do next. ===
syncAcceptToSql recovered result: {
  "ideaId": "25bc5dc2-0d5b-4775-a67c-207b392aa43b",
  "ideaCreated": true,
  "jobs": [ { "recipe": "news-carousel", "synced": true } ]
}
job rows after restore: [Object: null prototype] { n: 1 }
the actual job row: [
  { "id": "6a6a7f14-e7e5-4423-999e-307e4b06e468", "status": "queued", "idempotency_key": "straw-motion::idea-01::news-carousel" }
]

=== Cleaned up temp dir ===
```

This surfaced a real, worth-naming design consequence: once a Recipe is `"already-queued"` in the FILE
queue (as it always is after even a SQL-failed `enqueueOnAccept` call, since the file write happens
first and unconditionally), a later `enqueueOnAccept` call for the SAME Idea/Recipe will never re-attempt
the SQL sync — `planEnqueue`'s own "already-queued" gate short-circuits before `syncAcceptToSql` is ever
called again. The actual recovery path, once the underlying SQL problem (e.g. a missing Brand row) is
fixed, is calling `syncAcceptToSql` **directly** (exported, not gated by file-queue state) — shown above.
Documented as a known limit, not hidden.

### Fakes / fixtures used

- **`src/space-driver/fixtures/fake-space.ts`'s `FakeSpace`** — the Magnific fake driven by the
  `drainQueue`/`runOneJob` proof above. **No live `spaces_*`/`creations_*` call was made anywhere in this
  slice's tests or proof scripts** — `FakeSpace` holds no network transport, and `FakeSpace.editGoals`/
  `.runs` both report `0` in the proof transcript, confirming no Space call was even attempted (the job
  failed one phase earlier, at the missing-Production-Spec check).
- **`src/db/test-support.ts`'s `withTempDb`** — every `sql-sync.test.ts`/new `enqueue-on-accept.test.ts`
  test runs against a real, throwaway SQLite file, never `:memory:`, matching this repo's own SQL-testing
  convention.
- Plain temp-directory ledger/Brief fixtures (`mkdtemp` + `writeFile`), mirroring the existing
  `enqueue-on-accept.test.ts` convention (`withTempFiles`) extended with `run`/`format`/`title`/
  `brief_path` — the fields `syncAcceptToSql` needs that the original, narrower fixture never carried.
- No Apify, no Zoho, no S3 — none of this ticket's code path touches any of them.

### Self-review notes

- Factored the duplicated `recipes.map((recipe) => ({ recipe, chosen: true }))` expression (present in
  both the "reuse an existing Idea" and "create a new Idea" branches of `syncAcceptToSql`) into one
  `recipeSelections` local, computed once.
- Added a defensive, loud failure for an unwired Recipe slug inside `syncAcceptToSql` itself (`throw`,
  naming the Recipe) rather than silently treating an unknown Recipe as zero-gate — `enqueueOnAccept`'s
  own caller already filters to wired Recipes via `planEnqueue`, but `syncAcceptToSql` is independently
  exported and callable directly (as this slice's own proof scripts do), so it should not trust an
  un-vetted caller's Recipe list silently.
- Considered, then rejected, adding a `migration 5` (`idea.legacy_ref`) to correlate a SQL Idea row back
  to the file ledger's own id directly. Rejected because `schema.ts`'s migration list is a shared,
  append-order file three sibling worktrees (#243/#253/#255) are concurrently landing changes near, and
  because `(run_id, title)` is sufficient without any schema change — see `sql-sync.ts`'s own doc comment
  for the full argument and the documented residual risk (two same-titled Ideas in one Run).
- Kept `enqueueOnAccept`'s existing 17 tests and file-queue policy (`planEnqueue`) completely untouched —
  the diff to that file is purely additive (new optional fields/branches), verified by re-running every
  pre-existing test unmodified and green.

### Known limits

- **No Production Spec authoring at accept time.** A job this slice creates carries no `spec` — Spec
  authoring stays the producer/worker's own later responsibility (unchanged from before this ticket for
  the attended path; for the unattended worker, `runOneJob` already refuses a spec-less job with a named,
  honest failure, "the Asset has no authored Production Spec yet" — shown live in the proof above). This
  ticket does not attempt to author one; that would be new production logic well outside slice 1's scope.
- **`run-pipeline.ts`'s stranded-idea recovery path does not pass `db`.** `enqueueOnAccept`'s OTHER
  production caller (`src/commands/run-pipeline.ts`'s Gate-1-resume "re-enqueue stranded ideas" branch)
  is left unwired to SQL in this slice — it has no established way to resolve a database path today. Only
  `/review-ideas`'s own Gate 1 accept step (the primary, real-world accept trigger) is wired.
- **`(run_id, title)` Idea-identity risk.** Two Ideas in the SAME Run sharing an identical title would
  collide under this natural key (documented in `sql-sync.ts`'s own doc comment and in "Self-review notes"
  above) — no real Brief has ever done this, verified at the time this ticket landed, but it is a real,
  narrow risk rather than an impossibility.
- **A fixed SQL failure requires calling `syncAcceptToSql` directly to recover**, not a second
  `enqueueOnAccept` call — see the "break it on purpose" transcript's own recovery note above.
- **No outer SQL transaction around the whole sync** — a process crash strictly between two of
  `syncAcceptToSql`'s steps (e.g. after `createIdea`, before `enqueueJob`) leaves a partial write. Argued
  acceptable because every step is individually atomic and the WHOLE function is idempotent on retry
  (find-or-create Idea, upsert Asset, guard-then-enqueue Job) — a retry reaches the same end state, never
  duplicates. See `sql-sync.ts`'s own doc comment, "Idempotency: report, not roll back".
