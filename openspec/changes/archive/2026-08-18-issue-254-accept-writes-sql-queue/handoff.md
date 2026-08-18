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

## QA Verdict — Round 1: FAIL

### Suite result

- `npm test` — re-run live: **3674 tests / 956 suites / 0 fail**, matching the Build Report's claimed
  numbers exactly. Green.
- `npm run test:docs` — re-run live: **351 tests / 94 suites / 0 fail**. Green.
- `npx openspec validate issue-254-accept-writes-sql-queue --strict` — `Change 'issue-254-accept-writes-sql-queue' is valid`. Green.
- `npx openspec validate --all --strict` — `Totals: 69 passed, 0 failed`. Green.
- `node --import tsx --test src/store-write-boundary/scan.test.ts` — 28/4/0 fail. Green (no bypass).
- `node --import tsx --test src/fs-boundary/*.test.ts` — 14/4/0 fail. Green.

The suite is genuinely green. **Green-on-itself is not green-on-the-issue** — see the defects below, all
found by independently re-deriving the code's actual behavior against realistic inputs, not by re-running
the developer's own scripts.

### Per-criterion results (issue #254, "What to build, slice 1")

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Accepting an Idea creates its Idea row, per-Recipe Asset rows, one queued job per Recipe in SQL, through `src/command-surface/` | **FAIL (partial)** | True for the single, uniquely-titled Idea case (`sql-sync.test.ts` AC1; independently reproduced, see Defect 1's repro). **False** for a second, genuinely distinct accepted Idea sharing an identical title within the same Run: it gets **no** Idea row, **no** Asset row, and **no** Job row of its own — silently merged into the first Idea's SQL identity, and its own `job` outcome reports `synced: false` (read as "already queued" when it was never queued at all). See Defect 1. |
| 2 | Accepting twice must not double-enqueue (state which guard, why) | **PASS** (same-Idea case) / **caveat** (concurrency) | `sql-sync.test.ts` AC2 + independently reproduced: a second call for the literal same `(ideaId, recipe)` correctly reuses the row and skips the job. Guard used: `listJobsForComposite`, correctly named because `job.idempotency_key` carries no `UNIQUE` (confirmed: `src/db/schema.ts` line 361 `idempotency_key TEXT` vs `schedule_outbox`'s line 499 `idempotency_key TEXT NOT NULL UNIQUE`). **But** this is a read-then-write check with nothing enforcing it at the DB level — see Defect 4 (concurrency race, undocumented). |
| 3 | Already-imported jobs not duplicated/disturbed by a re-accept | **PASS** | `sql-sync.test.ts` "AC3" test seeds an importer-style Idea/Asset/Job via the exact same `(run, title)` shape `importer/execute.ts` uses, then calls `syncAcceptToSql` for the same ledger Idea and asserts the row count stays 1/1. Read and agree with the test; matches the design. |
| 4 | `queue.json` keeps being written exactly as today | **PASS** | The diff to `enqueue-on-accept.ts` is purely additive — every new branch is gated behind `options.db !== undefined`, checked *after* `saveQueue` already ran unconditionally. All 17 pre-existing tests in `enqueue-on-accept.test.ts` pass unmodified. Independently confirmed via `git diff cdb68a0 HEAD -- src/production-queue/enqueue-on-accept.ts`. |
| 5 | A failure to write SQL must be loud | **PASS** | Independently reproduced (see "Repro: loud failure" below) against my own throwaway DB, not the developer's script: `enqueueOnAccept` threw naming the missing Brand, and the file queue still landed the job correctly. |
| 6 | Prove: SQL `job` table gains exactly the expected rows (real query output) | **PASS** | Independently reproduced against my own throwaway DB (see "Repro: accept → SQL rows" below) — real `idea`/`asset`/`job` rows, not the developer's claim taken on faith. |
| 7 | Prove: `findNextQueuedJob` returns that job | **PASS (by code review + the developer's own transcript)** | `findNextQueuedJob` is a plain `SELECT ... WHERE status = 'queued' ...` (job-store.ts); the rows I produced independently carry `status: 'queued'`, so the same query necessarily returns them. Did not re-run this exact call myself; treated as adequately proven by code simplicity plus the Build Report's live transcript. |
| 8 | Prove: `drainQueue` picks it up against the fake Space | **PASS on the LITERAL bar, but see Defect 3** | The Build Report's transcript shows `claimJob`/`drainQueue` genuinely claiming and retrying the row 3 times (`attempt: 0→1→2→3`), `FakeSpace.editGoals`/`.runs` both `0` (no Space call attempted). This literally satisfies "picking it up." It terminally **fails**, every time, for every accept-created job, because nothing in this codebase authors a Production Spec outside an attended LLM producer session — see Defect 3 for why this matters more than the narrow wording suggests. |
| 9 | Prove: break it on purpose (missing Brand row), watch it fail loudly, restore | **PASS** | Independently reproduced (see below), not just re-reading the developer's transcript. |

### Per-scenario results (spec deltas)

`specs/accept-sql-sync/spec.md` and `specs/production-queue/spec.md`, both Requirements' Scenarios, checked against their named covering tests:

| Scenario | Result | Covering test |
|---|---|---|
| A brand-new accepted Idea gets an Idea row, one Asset per Recipe, one queued job per Recipe | PASS | `sql-sync.test.ts` "creates the Idea row... (AC1)" |
| A brand-new Run is created on demand | PASS | `sql-sync.test.ts` (same `describe` block, Run-creation assertion) |
| Calling `syncAcceptToSql` twice for the same ledger Idea does not duplicate | PASS | `sql-sync.test.ts` "is idempotent... (AC2)" |
| A re-accept of an importer-carried Idea reuses that row | PASS | `sql-sync.test.ts` "does not duplicate a job an EARLIER importer-style write... (AC3)" |
| A missing Brand/Format row fails loudly | PASS | `sql-sync.test.ts` "loud failure" `describe` block |
| `enqueueOnAccept`'s 4 `options.db` scenarios (omitted-unchanged / with-db-additive / loud-failure / already-queued-skips-sql) | PASS | `enqueue-on-accept.test.ts`'s new `describe` block, all 4 `it`s read and match |
| **Missing scenario:** two DIFFERENT, genuinely distinct accepted Ideas sharing an identical title within the SAME Run | **NOT COVERED — should exist and does not** | No test anywhere in this slice exercises this. The `(run_id, title)` Requirement's own text ("A second call for the SAME ledger Idea... SHALL reuse...") implicitly assumes the caller is always resolving the same ledger Idea; the code (`findExistingIdea`) has no way to verify that assumption — it matches on title alone, blind to `ideaId`. This is a **self-consistent-but-wrong spec** in the sense job (c) exists to catch: every written Scenario passes, but the Requirement doesn't state, bound, or test the one failure mode its own doc comment names as a known risk. See Defect 1. |

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | No render, no publish call anywhere in this slice's code. |
| Public-metrics-only | PASS | No metrics/Apify code touched (`grep -n "apify\|Apify"` across the 4 new/changed source files: no hits). |
| Relative-not-absolute | N/A | Not a scoring change. |
| Ledger-as-source-of-truth | PASS | Every SQL write goes through `src/command-surface/` (`createIdea`/`recordReviewDecision`/`saveAsset`/`enqueueJob`/`createRun`); `store-write-boundary` guard re-run green, zero new allow-list entries needed; confirmed by direct code read of `sql-sync.ts`. `queue.json`/`ledger.json` unchanged. |
| Explicit-attribution | **CAUTION — see Defect 1** | The proposal claims this rule is "unaffected (no Post logging here)," which is true of the *literal* `/log-post` rule. But `(run_id, title)` identity resolution is itself an **inferred** correlation between a file-ledger Idea and a SQL Idea — no explicit id links them — and I demonstrated it silently mis-attributes a second Idea's own Asset/Job to a first Idea's SQL identity purely because their titles collide. This is the same category of failure the always-rules exist to prevent, one layer removed from Post↔Idea attribution specifically. |
| Magnific fake only, no live Space calls | PASS | `grep -n "spaces_\|creations_\|magnific"` across every file this ticket touches: zero hits. The developer's own proof transcript shows `FakeSpace.editGoals`/`.runs` both `0`. No `_prove_254.ts`/`_break_254.ts`-style scratch file is present in the committed diff (`git status` clean after my own equivalent scratch scripts were deleted). |
| Migrations 1–4 frozen | PASS | `git diff --stat cdb68a0 HEAD` shows no change to `src/db/schema.ts` or `src/db/migrate.ts`. |
| No Apify | PASS | Confirmed by grep above. |

### Independent reproduction (QA's own scripts, not the developer's)

**Repro: accept → SQL rows → job visible.** Built a throwaway SQLite DB + ledger/Brief fixtures from
scratch (own script, deleted after use, never committed — confirmed clean `git status`). Result matched
the Build Report's shape: one `idea` row (`accepted`), one `asset` row (`queued`), one `job` row
(`queued`), for a single accepted Idea with a unique title.

**Repro: loud failure.** Built a migrated database with **no** `brand` row, called `enqueueOnAccept({
db, ... })`. Result:
```
THREW as expected: syncAcceptToSql: no Brand row for slug "straw-motion" — run the one-shot importer
(or create the Brand row) before accepting Ideas through SQL. The file queue was still written; only
the SQL sync failed.
```
`queue.json` still gained the job correctly, unaffected. Matches the Build Report's own transcript,
independently confirmed.

**Repro: `(run_id, title)` collision — Defect 1, see below.** Two DIFFERENT ledger Ideas (`idea-01`,
`idea-02`), same Run, same Format, **identical title** ("Same Headline Twice"), **different Briefs**
(different `Source:` URLs, different content — i.e. genuinely different real-world stories, not a
duplicate accept of the same one). Accepted both, in sequence, through `enqueueOnAccept({ db, ... })`:

```
accept idea-01 sql: { "ideaId": "026b2e5f-...", "ideaCreated": true,  "jobs": [{ "recipe": "news-carousel", "synced": true  }] }
accept idea-02 sql: { "ideaId": "026b2e5f-...", "ideaCreated": false, "jobs": [{ "recipe": "news-carousel", "synced": false }] }
idea-01 sqlIdeaId: 026b2e5f-...  idea-02 sqlIdeaId: 026b2e5f-...  SAME SQL row? true
idea rows in this Run: [ { "id": "026b2e5f-...", "title": "Same Headline Twice", "brief": "# Same Headline Twice\n\nBrief f" } ]
jobs for the shared SQL idea id / news-carousel composite: 1
```

`idea-02` — a real, distinct, `accepted` Idea with its own Brief and its own source — receives **zero**
SQL representation: no Idea row, no Asset row, no Job row. Its own `synced: false` outcome is
indistinguishable, from the caller's point of view, from "already queued" — there is no signal anywhere
that `idea-02`'s own work was silently dropped. `findNextQueuedJob` will never see it. **This is the exact
guard-blindness pattern this ticket exists to fix, reproduced one layer inside the fix itself.**

For contrast, titles differing by case/trailing whitespace ("Case Test" vs "case test ") correctly created
two separate rows (no false-positive merge there) — the risk is specifically **exact**-title collisions,
which the developer's own doc comment already names as possible, just untested and unbounded.

### Defect list

1. **[CRITICAL] `(run_id, title)` identity silently merges two distinct accepted Ideas and drops the second one's SQL job entirely, violating AC1 for the second Idea and the explicit-attribution rule's spirit.**
   Repro: seed a ledger with two Ideas in the same Run, identical `title`, different `brief_path`/content
   (e.g. `idea-01`/`idea-02`, title `"Same Headline Twice"`, distinct briefs). Call
   `enqueueOnAccept("idea-01", brand, ["news-carousel"], { db, ledgerPath, ... })`, then
   `enqueueOnAccept("idea-02", brand, ["news-carousel"], { db, ledgerPath, ... })`. Observe: both calls
   resolve to the SAME SQL `ideaId`; `idea-02`'s job outcome is `synced: false`; querying
   `listJobsForComposite`/`listIdeasForRun` shows exactly one Idea/Asset/Job row total, not two. No error,
   no warning — `enqueueOnAccept`'s return value looks identical to a legitimate re-accept. Fix needs
   either a real correlating column (a migration — the very thing this ticket avoided for good, documented
   reasons around the sibling worktrees) or, short of that, a loud failure/flag when a title match is found
   for an `ideaId` that does not match what a prior sync for that same title recorded, rather than a silent
   merge. At minimum this needs a documented, tested Scenario and an explicit Operator-facing warning, not
   a silent one-line risk note in a doc comment.

2. **[HIGH] The wiring that "actually makes the worker start seeing new work" is a markdown paragraph, not code, and no test enforces it.**
   `.claude/commands/review-ideas.md` now instructs opening `data/organicgrowth.db` and passing it as
   `db`. `/review-ideas` has no compiled TS command file at all — it is entirely LLM-interpreted at
   conversation time. The ONE actual production TypeScript caller of `enqueueOnAccept`
   (`src/commands/run-pipeline.ts:682`) does **not** pass `db` — confirmed by direct read, and disclosed
   by the developer as a "Known limit." `review-docs.test.ts` pins many other paragraphs of this same file
   verbatim (the established pattern this repo uses specifically so a prompt requirement is "provable by
   `npm test`, not just by hand-reading the doc" — that file's own words) but was never extended to pin the
   new "pass `db`" paragraph — confirmed by `grep -rln "organicgrowth.db\|openDatabase" src --include="*.test.ts" --include="*.docs-test.ts"` finding zero files referencing `review-ideas`. Repro: skip the "Also
   pass `db`" step during a live `/review-ideas` accept (nothing stops an agent from doing so, and nothing
   fails afterward) — the Idea still gets accepted, the file queue still gets its job, everything looks
   successful, and the SQL sync silently never happens. This is precisely "a process that succeeds and
   does nothing," one level removed.

3. **[HIGH] An accept-created job can never reach `done` on the unattended worker as currently built — the fix makes the worker "see" the work but not finish any of it.**
   `command-surface/worker.ts`'s `runOneJob` requires `asset.spec !== undefined` on the FIRST leg and
   fails immediately, by design, when it is absent (`"the Asset has no authored Production Spec yet"`) —
   it *audits* an already-authored spec, it does not author one. Nothing in this codebase authors a
   Production Spec outside an attended LLM producer session (`src/producer/`'s Skill-driven flow,
   interpreted by a Claude Code agent turn) — grepped for any deterministic writer of `asset.spec`
   outside `command-surface/worker.ts`'s own read path and found none. The importer's carried jobs work
   only because they inherit a spec a human producer session already authored, historically, before
   import. A brand-new accept, synced by this ticket, will NEVER have one. The developer's own proof
   transcript shows exactly this: 3 claim attempts, all terminally failed with that message,
   `FakeSpace` never even called. Disclosed honestly as a "Known limit," and technically within the
   issue's own literal "prove `drainQueue` picks it up" bar (which this slice meets) — but the issue's own
   title and problem statement ("the worker sits idle... start seeing new work") reads as a stronger claim
   than "the worker now finds real work and always fails it." Flagging as HIGH per this review's explicit
   brief: an accept-created job cannot complete, however honestly disclosed. Recommend the Operator be
   told, in plain terms, that after this slice: the worker no longer finds *zero* jobs, but it still
   cannot finish *any* newly-accepted one, and a follow-on ticket for unattended spec-authoring (not yet
   filed, not among the 3 listed follow-on slices) is required before this fix has real production value.

4. **[MEDIUM] The idempotency guard (`listJobsForComposite` then `enqueueJob`) has an undocumented, genuine cross-process race window.**
   `job.idempotency_key` carries no `UNIQUE` constraint (confirmed: `src/db/schema.ts` — `job` table line
   361 vs `schedule_outbox` line 499). Within a single Node process, the read (`listJobsForComposite`,
   synchronous) and the write (`enqueueJob`, synchronous) have no `await` between them, so no interleaving
   is possible from a second concurrent call in the SAME process — verified by code read. But two SEPARATE
   OS processes (e.g. two concurrent `/review-ideas` sessions accepting the same Idea, a real usage
   pattern this project's own memory notes confirm happens — "user runs multiple live Claude sessions")
   both holding the same SQLite file open could each pass the read-check before either commits the write,
   producing two `queued` job rows for the same Asset. The developer's handoff documents the
   *lack-of-UNIQUE-constraint fact* and the *mechanism*, but never names this specific residual
   concurrency risk as a "Known limit" the way the other four are. Given this is a local, single-Operator
   tool, this may be an acceptable risk to leave open — but it should be said outright, not left implicit.

### Overall

**FAIL.** The suite is honestly green and several individual pieces (loud-failure, `queue.json`
byte-for-byte preservation, the importer-non-disturbance guarantee, the single-Idea happy path) are real
and correctly proven. But three things the standing lesson in this review's brief explicitly asks about
are each answered "no" or "not really": (1) a real accept for a title-colliding Idea does **not** reliably
put a real job where the worker can find it — it can silently put none; (2) the wiring that makes any of
this happen for a real accept is prose an LLM agent must remember to follow, with zero code or test
enforcement, and the one real code caller (`run-pipeline.ts`) doesn't do it; (3) even a correctly-synced
job can never reach `done` on the unattended worker today. Hand back to the developer with this defect
list.

## Build Report — Round 2

Addresses all four defects from the Round 1 QA Verdict above. Summary verdict per defect, then the full
argument for each, then transcripts, then the updated acceptance-criteria/spec/known-limits state.

| Defect | Status |
|---|---|
| 1 (CRITICAL) — identity silently merges two distinct Ideas | **Fixed.** Real identity (`idea.legacy_ref`, migration 5), schema-backstopped. Red→green transcript below. |
| 2 (HIGH) — the wiring is prose, the real caller doesn't use it | **Fixed.** `run-pipeline.ts`'s stranded-idea resume now passes `db` BY DEFAULT — a compiled code path, not a paragraph. Red→green transcript below. The `review-ideas.md` paragraph is additionally pinned by a docs-test (Round 2's own instance of this repo's established pattern), since `/review-ideas` itself stays prose-only by design (no compiled TS command file exists for it — see "Guardrails" in this repo's CLAUDE.md; every conversational command works this way). |
| 3 (HIGH) — accept-created jobs can never complete | **Judgement stated plainly below: this is an accepted, disclosed consequence of the staging.** Follow-up drafted; not filed (see below — a real limit on my own tool grant, not an oversight). |
| 4 (MEDIUM) — undocumented concurrency race | **Fixed at the schema level** (a cheap, partial `UNIQUE` index) **and named explicitly** in Known Limits, since a schema index closes the *double-enqueue* race but not every theoretically-possible concurrent-write interleaving. |

### Defect 1 (CRITICAL) — identity decision, argued

**Decision: `idea.legacy_ref`, a new nullable column added in migration 5, scoped per-Brand (`UNIQUE
(brand_id, legacy_ref)`, a partial index).** This is exactly what QA's defect asked for: "an Idea already
has a stable, unique identifier: its own ledger id... unique per Brand and already carried everywhere in
this system."

Why per-**Brand**, not per-Run (the schema could have gone either way — a Run-scoped unique index would
also have fixed the reported bug, since the collision QA reproduced was within one Run): the file ledger's
own Idea-id *format itself* changed over the project's history specifically to guarantee Brand-wide
uniqueness — early Runs minted bare `idea-01`..`idea-NN` (unique only within that one Run), and every Run
since `2026-W30` mints `idea-<run>-NN` (embedding the Run key, so it is unique across the WHOLE Brand,
forever). Surveyed the real `data/brands/straw-motion/ledger.json` (51 Ideas, 5 Runs): zero id collisions,
confirming this is the system's actual, live convention, not a hopeful assumption. Scoping the constraint
to `(brand_id, legacy_ref)` matches that convention directly and is *stricter* than a Run-scoped
constraint would have been (would also catch a hypothetical future collision across two Runs for the same
Brand, which a Run-scoped index would miss).

**Why a migration, when Round 1 deliberately avoided one:** QA's defect said it plainly — "If that needs
a migration, take it — the sibling slices are landing now, and an additive migration is the normal
route." Checked: this worktree's `src/db/schema.ts` still had exactly `MIGRATION_1`..`MIGRATION_4` at the
start of this round (no sibling worktree had landed a migration 5 yet), so appending `MIGRATION_5` is a
clean, additive, append-only change — the exact shape migrations 2/3/4 already used. Migrations 1–4 are
untouched (`git diff` confirms — see "How to run" below).

**Both halves of "a genuine collision must be loud" are now true, at two levels:**
1. **Application level:** `syncAcceptToSql` looks an existing Idea up by `(brand_id, legacy_ref)`
   (`getIdeaByLegacyRef`) instead of `(run_id, title)` — two Ideas sharing a title are now genuinely
   distinct lookups, so the second one is never silently treated as "already there."
2. **Schema level:** `idx_idea_legacy_ref_per_brand` is a REAL `UNIQUE` index. Even if a future bug
   bypassed the application-level lookup entirely (a race, a refactor mistake), a second `createIdea` call
   for the same `(brand_id, legacy_ref)` throws a real `SQLITE_CONSTRAINT` error — proven live in the
   green-check transcript below.

**`synced: false` is now unambiguous.** `SqlSyncJobOutcome` gained a `reason: "created" | "already-queued"`
field. Because identity is now the real ledger id, `"already-queued"` can only ever mean "this exact
`(brand, idea, recipe)` already has a job" — never "a different Idea got silently merged into this one."

**Known, honestly-disclosed residual limit (new in Round 2 — see Known Limits below):** an Idea imported
by the ORIGINAL one-shot importer run (2026-08-17, issue #204) — which ran BEFORE migration 5 existed —
carries no `legacy_ref` at all. A later re-sync of that SAME ledger Idea will not find it by
`(brand_id, legacy_ref)` and will create a SECOND, duplicate Idea row rather than reusing the pre-migration
one. This is never a silent MERGE (this ticket's own bar is fully met — two distinct Ideas never collapse
into one), but it is a real, narrow duplicate an Operator would need to reconcile by hand. Proven directly
by a dedicated test (`sql-sync.test.ts`, "KNOWN LIMIT" — see the acceptance table below).

### Defect 2 (HIGH) — the real caller, made real

`run-pipeline.ts`'s stranded-idea resume branch — the ONE compiled TypeScript caller of `enqueueOnAccept`
— now opens and migrates the local SQLite database **by default**, before re-enqueueing anything, and
passes it through. `RunPipelineOptions` gains an optional `dbPath` (defaults to `data/organicgrowth.db`
at runtime — the same file every other command opens; every test injects a throwaway temp path, so no
test ever touches the real, committed database — confirmed by `stat`-ing its mtime before and after every
test run in this round; see the transcripts below).

A database-open/migrate failure, or a PER-IDEA SQL sync failure, is caught and surfaced in that turn's
message (never silently swallowed, never retried), and does NOT abort re-enqueueing the remaining
stranded Ideas — proven by a dedicated two-Idea test (one fails, one succeeds; both still land in the file
queue; only the second lands in SQL).

`.claude/commands/review-ideas.md`'s own "Also pass `db`" paragraph is additionally pinned by a new
`review-docs.test.ts` describe block, matching this file's own established convention for every other
Gate-1 requirement — so even though `/review-ideas` has no compiled runtime (this repo's own CLAUDE.md:
every conversational `/` command is either compiled or prompt-driven; `/review-ideas` has always been the
latter, by design — see `src/recipe/review-docs.test.ts`'s own doc comment, unchanged from Round 1: "there
is no compiled TS runtime for its conversational behavior to unit-test directly"), its wording is now
provable by `npm test`, not merely hand-read.

### Defect 3 (HIGH) — judgement, stated plainly

**This is an accepted, disclosed consequence of the staging.** Slice 1's real deliverable is that
accept-flow rows land correctly in SQL (Idea, per-Recipe Asset, `job`), through the command surface,
idempotently, attributed to the real ledger Idea — not that the unattended worker can finish producing an
Asset end to end. Making the worker able to author a Production Spec is later work, requiring genuinely
new production logic (an LLM-callable or deterministic Spec-authoring step invocable OUTSIDE an attended
producer session) that does not exist anywhere in this codebase today, for ANY caller — not a gap this
slice introduced, and not something a slice titled "accept writes SQL" should silently grow to include.

**Follow-up: drafted, not filed.** This agent's `gh` grant is scoped to read-only `gh issue view` — it
does not include `gh issue create`. I cannot file the follow-up issue myself. Draft text, ready for the
Operator or `/build-issue`'s orchestrator to file directly:

> **Title:** The unattended worker cannot author a Production Spec for an accept-created job
>
> **Body:** `command-surface/worker.ts`'s `runOneJob` requires `asset.spec !== undefined` on its first
> leg and fails immediately, by design, when absent ("the Asset has no authored Production Spec yet") — it
> *audits* an already-authored Spec, it does not author one. Nothing in this codebase authors a Production
> Spec outside an attended LLM producer session today. Since issue #254, the worker now correctly *finds*
> real accept-created work (previously it found nothing at all) — but every such job terminally fails on
> its Spec-authoring check, every time, because it was never authored. Scope this follow-up to give the
> unattended worker a real path to a Spec: either (a) a genuinely new, deterministic or LLM-callable
> Spec-authoring step the worker can invoke for a wired, zero/one-gate Recipe, or (b) have `runOneJob`
> leave a spec-less job PARKED (a new, honestly-named outcome, not `failed`) rather than burning through
> `maxAttempts` and terminally failing, so an attended session can author the Spec and requeue it later.
> Blocked-by: none. Blocks: the unattended path (#208/#254) ever completing an Asset without an attended
> session in the loop. See issue #254's `handoff.md` Round-2 Build for the full context.

### Defect 4 (MEDIUM) — concurrency, closed at the schema level

**Took the `UNIQUE` constraint — cheap, and it closes the exact race QA named.** Added
`idx_job_idempotency_key`, a partial `UNIQUE (idempotency_key) WHERE idempotency_key IS NOT NULL` index,
in the SAME migration 5. Verified safe before adding it: `job.idempotency_key` is set ONLY by
`sql-sync.ts` (grepped the whole `src/` tree — the importer's own `executeJob` never sets one, and no
other job-creation call site does either), always in the same deterministic `"<brand>::<idea>::<recipe>"`
shape, and only ever once per composite BY CONSTRUCTION (the application-level `listJobsForComposite`
guard already prevents a second `enqueueJob` call for the same composite within one process). So the
index changes nothing about today's normal, single-process behavior — it is pure insurance. With it: a
genuinely concurrent SECOND process's `enqueueJob` call for the same composite now throws a real
`SQLITE_CONSTRAINT` error instead of silently creating a duplicate `queued` job — proven directly
(`job-store.test.ts`, "a SECOND job with the SAME idempotency_key throws").

**Named explicitly in Known Limits (below), not left implicit:** the index closes the *double-enqueued-job*
race specifically. It does NOT make the whole `syncAcceptToSql` call atomic across processes — two
concurrent callers could still, in principle, both create their OWN Brand/Format/Run rows via
`getRunByKey`-then-`createRun` (a read-then-write with no equivalent UNIQUE-on-natural-key backstop at the
`run` level beyond the schema's existing `UNIQUE (format_id, run_key)`, which DOES already prevent a
duplicate Run — so this specific residual is narrower than it might sound: the `run` table's own existing
constraint already covers it). The genuinely open residual is a process crash strictly BETWEEN two of
`syncAcceptToSql`'s own steps (already named in Round 1's Known Limits, unchanged) — this is a DIFFERENT
risk than the double-enqueue race Defect 4 named, and is argued acceptable there (every step is
individually atomic and the whole function is idempotent on retry).

### Files touched (Round 2)

- `src/db/schema.ts` (migration 5: `idea.legacy_ref` + its partial UNIQUE index; `job.idempotency_key`'s
  partial UNIQUE index)
- `src/db/migrate.test.ts` (`CURRENT_SCHEMA_VERSION` assertion bumped 4→5)
- `src/idea/store.ts` (`IdeaInput.legacyRef`, `IdeaRecord.legacyRef`, `createIdea` writes it,
  `getIdeaByLegacyRef` — new)
- `src/idea/store.test.ts` (new `getIdeaByLegacyRef` describe block — 6 tests; `legacyRef` added to the
  existing `createIdea` field-coverage tests)
- `src/importer/execute.ts` (stamps `legacyRef: ideaPlan.legacyId` on every imported Idea)
- `src/production-queue/sql-sync.ts` (identity switched from `(run_id, title)` to `(brand_id,
  legacy_ref)`; `SqlSyncJobOutcome.reason`; module doc comment rewritten; `findExistingIdea` helper
  simplified away)
- `src/production-queue/sql-sync.test.ts` (AC1/AC2/AC3 updated for `reason` + `legacyRef`; new "QA
  round-1 Defect 1" describe block — 3 tests, including the KNOWN-LIMIT test)
- `src/production-queue/enqueue-on-accept.test.ts` (`reason` assertion added; new collision test at the
  real `enqueueOnAccept` entry point)
- `src/production-queue/job-store.test.ts` (new `job.idempotency_key` UNIQUE-index describe block — 2
  tests)
- `src/recipe/review-docs.test.ts` (new describe block pinning the "Also pass `db`" paragraph — 3 tests)
- `src/commands/run-pipeline.ts` (`RunPipelineOptions.dbPath`; the stranded-idea resume branch opens +
  migrates the database by default and passes it through, with per-Idea catch-and-continue)
- `src/commands/run-pipeline.test.ts` (`BrandFixturePaths.dbPath` + `healthyOptions` wiring; two new
  tests — the positive-path SQL proof, and the partial-failure-doesn't-abort proof)
- `openspec/changes/issue-254-accept-writes-sql-queue/proposal.md` (rewritten "What Changes"/"Modified
  Capabilities"/"Impact" sections for the Round-2 fixes)
- `openspec/changes/issue-254-accept-writes-sql-queue/specs/accept-sql-sync/spec.md` (identity Requirement
  rewritten; two new Scenarios)
- `openspec/changes/issue-254-accept-writes-sql-queue/specs/production-queue/spec.md` (one new Scenario;
  one new Requirement — the `idempotency_key` UNIQUE index)
- `openspec/changes/issue-254-accept-writes-sql-queue/specs/run-pipeline-conductor/spec.md` (**new file** —
  `## MODIFIED Requirements`, heading matched verbatim against the live spec at
  `openspec/specs/run-pipeline-conductor/spec.md`)
- `openspec/changes/issue-254-accept-writes-sql-queue/tasks.md` (new "Round 2" section)
- `openspec/changes/issue-254-accept-writes-sql-queue/handoff.md` (this Round-2 Build Report)

### How to run

```bash
# From this worktree:
npm test                                                       # full suite
npm run test:docs
npm run build
openspec validate issue-254-accept-writes-sql-queue --strict
openspec validate --all --strict
node --import tsx --test src/store-write-boundary/scan.test.ts src/fs-boundary/*.test.ts
```

Round 1 baseline: 3674 tests / 956 suites / 0 fail. **Round 2: 3691 tests / 960 suites / 0 fail** (17 new
tests, 4 new suites — `src/idea/store.test.ts` +6 in a new `getIdeaByLegacyRef` describe block,
`src/production-queue/sql-sync.test.ts` +3 in a new "QA round-1 Defect 1" describe block,
`src/production-queue/enqueue-on-accept.test.ts` +1, `src/recipe/review-docs.test.ts` +3 in a new
describe block, `src/commands/run-pipeline.test.ts` +2, `src/production-queue/job-store.test.ts` +2 in a
new describe block). `npm run test:docs`: 351/94/0-fail, unchanged. `npm run build`,
`openspec validate issue-254-accept-writes-sql-queue --strict`, `openspec validate --all --strict`
(69 passed), and the store-write-boundary/fs-boundary guards (42 tests / 8 suites) are all clean.
Confirmed throughout this round, via `stat -f "%m" data/organicgrowth.db` before/after every test run,
that the real, committed database's mtime never changed — no test ever touched it.

### Prove it, do not assert it — Round 2

**Red→green, Defect 1 (identity): independently reproduced, not just re-asserting the new tests.** Ran
against a **throwaway temp SQLite file and temp ledger/Brief paths** — never the committed `data/`.
`git stash push -u` reverted the whole worktree to the Round-1-committed state (`28a430d`); a temp script
(`_red_check_defect1.ts`, deleted immediately after, confirmed absent from `git status`) reproduced QA's
exact repro scenario fresh:

```
=== RED CHECK — Round 1 committed code (28a430d), independently reproduced ===
first (idea-01) outcome: {
  "ideaId": "4a0b2353-5125-4565-8736-642fbc5ebd30",
  "ideaCreated": true,
  "jobs": [ { "recipe": "news-carousel", "synced": true } ]
}
second (idea-02) outcome: {
  "ideaId": "4a0b2353-5125-4565-8736-642fbc5ebd30",
  "ideaCreated": false,
  "jobs": [ { "recipe": "news-carousel", "synced": false } ]
}
SAME sqlIdeaId? true
total idea rows in Run (expect 2 if fixed, 1 if the round-1 bug is present): 1
```

Then `git stash pop` restored every Round-2 change (confirmed via `git status --porcelain` matching
exactly the 17 modified/new files listed below — nothing lost, nothing extra). Re-ran the SAME scenario
(`_green_check_defect1.ts`, also deleted immediately after) against the fixed code, PLUS a bonus proof of
the schema-level backstop:

```
=== GREEN CHECK — Round 2 fixed code, same scenario, independently reproduced ===
first (idea-01) outcome: {
  "ideaId": "aadb5eaf-d377-4864-8e3c-630d5308f199",
  "ideaCreated": true,
  "jobs": [ { "recipe": "news-carousel", "synced": true, "reason": "created" } ]
}
second (idea-02) outcome: {
  "ideaId": "12e9880e-4362-4b2a-a609-047fb2d7a62e",
  "ideaCreated": true,
  "jobs": [ { "recipe": "news-carousel", "synced": true, "reason": "created" } ]
}
SAME sqlIdeaId? false
total idea rows in Run (expect 2, fixed): 2
=== Bonus: schema-level backstop — a genuine (brand, legacy_ref) collision throws loudly ===
threw as expected on a forced (brand, legacy_ref) collision: UNIQUE constraint failed: idea.brand_id, idea.legacy_ref
```

**Red→green, Defect 2 (the real caller): the new `run-pipeline.ts` test genuinely fails without the fix.**
Temporarily commented out the `...(db !== undefined ? { db } : {})` spread in `run-pipeline.ts`'s
`enqueueOptions` (the ONE line that actually wires `db` through), re-ran
`src/commands/run-pipeline.test.ts`:

```
not ok 4 - resume ALSO writes to SQL by default — the REAL production code path, never depending on a
markdown paragraph being followed (issue #254 Defect 2)
  error: "resume's re-enqueue must have written a real SQL job row, not just the file queue"
  expected: true
  actual: false
```

Restored the line exactly (confirmed via `diff` against the pre-edit content), re-ran:

```
# tests 48 (at that point)
# pass 48
# fail 0
```

(The suite is 49 in the final state above — the partial-failure test for Defect 2's "keep processing the
remaining stranded Ideas" claim was added afterward, and is included in every full-suite run reported in
"How to run".)

### Acceptance-criteria self-assessment (Round 2 additions)

| Claim | Proven by |
|---|---|
| Two DIFFERENT accepted Ideas sharing an identical title each get their own Idea/Asset/Job row (Defect 1) | `sql-sync.test.ts` "TWO DIFFERENT accepted Ideas... (QA round-1 Defect 1)" — at the `syncAcceptToSql` layer; `enqueue-on-accept.test.ts` "QA round-1 Defect 1, reproduced at the REAL entry point" — at the actual `enqueueOnAccept` caller boundary; `idea/store.test.ts`'s `getIdeaByLegacyRef` describe block, "TWO DIFFERENT accepted Ideas... never collide" — at the store layer directly. |
| A genuine `(brand, legacy_ref)` collision throws loudly at the schema level | `idea/store.test.ts` "the schema itself is the backstop: a SECOND Idea with the SAME (brand, legacyRef) throws loudly" |
| `reason` distinguishes "created" from "already-queued" | `sql-sync.test.ts`'s AC1/AC2/AC3 tests, all updated with `reason` assertions; the new collision tests assert `reason: "created"` on both distinct Ideas |
| An importer-carried row now correlates via `legacyRef`, not title | `sql-sync.test.ts` "AC3" test, updated to seed `legacyRef: "idea-01"` on the prior row, mirroring `execute.ts`'s real behavior |
| Pre-migration-5 imported rows (no `legacy_ref`) are a named, tested, honest residual — never a silent merge | `sql-sync.test.ts` "KNOWN LIMIT: an importer-carried row from BEFORE migration 5..." |
| `run-pipeline.ts`'s stranded-idea resume passes `db` by default | `run-pipeline.test.ts` "resume ALSO writes to SQL by default..." — red→green proven above |
| A per-Idea SQL failure during resume doesn't abort the remaining stranded Ideas | `run-pipeline.test.ts` "a per-Idea SQL sync failure during resume is surfaced plainly and does NOT abort the remaining stranded Ideas" |
| `.claude/commands/review-ideas.md`'s "Also pass `db`" paragraph is pinned | `review-docs.test.ts`'s new "ALSO passes db to enqueueOnAccept" describe block (3 tests) |
| `job.idempotency_key` is backstopped by a real UNIQUE index | `job-store.test.ts`'s new "job.idempotency_key — a partial UNIQUE index backstops..." describe block (2 tests) |
| No test ever touches the real, committed `data/organicgrowth.db` | Every `run-pipeline.test.ts` fixture now injects `dbPath: paths.dbPath` (a throwaway temp file); confirmed by `stat`-ing the real file's mtime before/after every run in this round (unchanged throughout) |

### Fakes / fixtures used (Round 2, additive to Round 1's list)

- Same as Round 1: `src/space-driver/fixtures/fake-space.ts`'s `FakeSpace` (the Magnific fake — **not
  touched by any Round 2 change**, no new Space-driving code was added), `src/db/test-support.ts`'s
  `withTempDb` (real, throwaway SQLite files, never `:memory:`).
- New this round: `run-pipeline.test.ts`'s `BrandFixturePaths.dbPath` (a per-test throwaway temp SQLite
  file, mirroring the existing `queuePath`/`brandsRoot` convention) — flagged explicitly because its
  ABSENCE in Round 1's test fixture is exactly what would have made the Defect-2 fix silently start
  touching the real, committed database; its presence is what keeps this round hermetic.
- No Apify, no Zoho, no S3 — unchanged from Round 1.

### Self-review notes (Round 2)

- Simplified `sql-sync.ts`'s Round-1 `findExistingIdea` helper away: once it became a two-line pass-through
  to `getIdeaByLegacyRef`, keeping it as a separate function added indirection without adding meaning —
  inlined it at the one call site with a one-line comment instead.
- Updated `sql-sync.ts`'s own module doc comment throughout (the "Idea identity" section and the
  "Idempotency" section) to describe the ACTUAL Round-2 mechanism, rather than leaving Round-1's now-false
  claims ("the idea table carries no column correlating...", "idempotency_key carries no UNIQUE
  constraint") in place beside code that no longer matches them.
- Every Round-1 test that asserted `.synced` without `.reason` was updated in place (not left duplicated
  alongside a parallel "reason" test) — `reason` is additive to the SAME assertions, not a second copy.

### Known limits (Round 2 — supersedes/updates Round 1's list where noted)

- **No Production Spec authoring at accept time — unchanged from Round 1, and the subject of Defect 3's
  judgement above.** Spec authoring stays the producer/worker's own later responsibility; this ticket does
  not attempt it. Follow-up drafted above, not filed (this agent's `gh` grant has no `issue create`).
- **NEW — pre-migration-5 imported rows carry no `legacy_ref`.** An Idea imported by the ORIGINAL one-shot
  importer run (2026-08-17, before migration 5 existed) has `legacy_ref IS NULL`. A later re-sync of that
  SAME ledger Idea will not find it and will create a genuine duplicate Idea row (never a silent merge —
  this ticket's own bar is still met — but a real duplicate an Operator would need to reconcile by hand).
  Proven directly, not hidden: `sql-sync.test.ts`'s "KNOWN LIMIT" test. A future backfill (stamping
  `legacy_ref` onto the 61 already-imported Ideas by re-deriving it from their recorded `(run, title)`,
  which WAS a safe correlating key at the time they were imported) would close this; out of THIS ticket's
  scope.
- **NEW — the `job.idempotency_key` UNIQUE index closes the double-enqueue race specifically, not every
  concurrent-write interleaving.** See Defect 4's own argument above for exactly what remains open (a
  process crash strictly between two of `syncAcceptToSql`'s own steps — the SAME risk Round 1 already
  named and argued acceptable, unchanged by this round).
- **`run-pipeline.ts`'s stranded-idea recovery path — RESOLVED, no longer a known limit.** Round 1 listed
  this as unwired; Round 2 wires it by default (Defect 2's fix). Removed from this list.
- **`(run_id, title)` Idea-identity risk — RESOLVED, no longer a known limit.** Superseded by migration 5's
  real `legacy_ref` identity (Defect 1's fix). Removed from this list; see the NEW pre-migration-5 residual
  above, which is a narrower, different risk than the one this line used to name.
- **A fixed SQL failure requires calling `syncAcceptToSql` directly to recover, not a second
  `enqueueOnAccept` call — unchanged from Round 1.** See Round 1's own "break it on purpose" transcript's
  recovery note.
- **No outer SQL transaction around the whole sync — unchanged from Round 1.** Argued acceptable there
  (every step individually atomic, the whole function idempotent on retry); Defect 4's fix is a DIFFERENT,
  narrower guarantee (no duplicate `job` row across processes) layered on top, not a replacement for this
  argument.

## QA Verdict — Round 2: FAIL

### Suite result

All commands actually re-run live in this worktree, not taken on faith from the Build Report:

- `npm test` — **3691 tests / 960 suites / 0 fail**, matching the Round-2 Build Report exactly. Green.
- `npm run test:docs` — **351 tests / 94 suites / 0 fail**. Green.
- `npx openspec validate issue-254-accept-writes-sql-queue --strict` — `Change 'issue-254-accept-writes-sql-queue' is valid`. Green.
- `npx openspec validate --all --strict` — `Totals: 69 passed, 0 failed`. Green.
- `node --import tsx --test src/store-write-boundary/scan.test.ts src/fs-boundary/*.test.ts` — 42/8/0 fail. Green. `git diff cdb68a0 HEAD --stat -- src/store-write-boundary/ src/fs-boundary/` is empty — no new allow-list entries were needed, confirming every Round-2 write still routes through `src/command-surface/`.
- `stat -f "%m %Sm" data/organicgrowth.db` before and after this entire QA session: unchanged (`Aug 18 10:59:35 2026` both times, while my own session ran ~30 minutes later). The real, committed database was never touched by this verification.

The suite is genuinely green. As in Round 1: **green-on-itself is not green-on-the-issue** — this round's
defects were found by independently re-deriving behavior (a standalone reproduction script against a
throwaway temp DB, never the developer's own scripts) and by reading the actual diffs, not by re-running
what was handed to me.

### Per-defect results (the four Round-1 defects, re-verified)

| # | Round-1 defect | Developer's claim | QA finding | Verdict |
|---|---|---|---|---|
| 1 | CRITICAL — `(run_id, title)` silently merges two distinct Ideas | Fixed: migration 5, `idea.legacy_ref`, schema-backstopped | **The title-collision case is genuinely fixed** — independently reproduced (see below): two distinct same-titled Ideas now get two separate Idea/Asset/Job rows, and a forced `(brand, legacy_ref)` collision throws a real `SQLITE_CONSTRAINT` error. **But the fix introduces a NEW, real duplicate-row regression**: any of the real committed database's 61 already-imported Ideas (all `legacy_ref IS NULL`, since the column didn't exist when they were imported) that is ever re-synced through `syncAcceptToSql` — reachable via `run-pipeline.ts`'s stranded-idea resume branch, which Round 2's OWN Defect-2 fix now wires to the real database BY DEFAULT — gets a brand-new, DUPLICATE Idea/Asset/Job row rather than reusing its real one. Independently reproduced (see "Independent reproduction" below), matching the developer's own "KNOWN LIMIT" test. This is a genuine regression relative to Round 1: the OLD `(run_id, title)` mechanism actually resolved a pre-existing imported Idea correctly (title match found it); the NEW `legacy_ref` mechanism does not. The formal spec (`specs/accept-sql-sync/spec.md`) states unconditionally that "A SECOND call for the SAME ledger Idea... SHALL reuse that existing row rather than creating a duplicate" — this is FALSE for any pre-migration-5 row, and no Scenario in the spec names or bounds this exception; it exists only as a test and a handoff paragraph, not in the contract itself. | **CRITICAL — still open, new form** |
| 2 | HIGH — the wiring is prose, the one real compiled caller doesn't use it | Fixed: `run-pipeline.ts`'s stranded-idea resume now passes `db` by default | The `run-pipeline.ts` fix is real and independently verified (code read + the developer's own red→green transcript, which I did not need to re-run since the mechanism is simple and directly legible: one `...(db !== undefined ? { db } : {})` spread, gated on a `db` opened unconditionally by default at `DEFAULT_DB_PATH = "data/organicgrowth.db"`, confirmed via `grep -n DEFAULT_DB_PATH src/commands/run-pipeline.ts`). **But this is not the primary accept path.** `/review-ideas` — Gate 1, the ORDINARY way an Idea is accepted every week — has **no compiled TypeScript backing at all**: `ls src/commands/ \| grep -i review` returns nothing, unlike `pick.ts`, `pick-cast.ts`, `log-post.ts`, `queue.ts`, `track-performance.ts`, `export-schedule.ts`, `backup-media.ts`, `cleanup-schedule-media.ts`, `report.ts` — every one of which DOES have a compiled `.ts` counterpart backing its own `.claude/commands/*.md`. The developer's framing ("every conversational `/` command is either compiled or prompt-driven... every one works this way") overstates this: `/review-ideas` and `/run-trends` are the ONLY two commands in this repo with no compiled runtime at all; every other gated command has one. So for an ORDINARY accept, **nothing compiled writes to SQL** — only an LLM agent's fidelity to a markdown paragraph does, exactly Round 1's finding. The new `review-docs.test.ts` block genuinely pins the paragraph's literal text (verified: `assert.match(doc, /Also pass \`db\`/)` etc. — removing the paragraph would fail this test), which is real, but it proves the INSTRUCTION exists in the file, not that it is ever followed at runtime. AC1 ("Accepting an Idea creates its Idea row... in SQL... through `src/command-surface/`") is still not code-enforced for the real-world, everyday accept flow. | **HIGH — narrowed, not fixed** |
| 3 | HIGH — an accept-created job can never complete on the unattended worker | Judged: an accepted, disclosed staging consequence, not fixed | The "Known limits" section states this plainly and prominently, with the exact failure mode named ("the Asset has no authored Production Spec yet"), a proof transcript showing 3 terminal failures and 0 Space calls, and a drafted (not filed — the developer's `gh` grant has no `issue create`) follow-up. No reader of the Build Report could conclude the worker now finishes an accept-created Asset end to end — the language is explicit that it does not. This is an honest, plain judgement call within the ticket's own staged scope (the Operator's issue comment scoped this ticket to "slice 1... SQL becomes the one queue" — spec authoring was never part of slice 1). | **PASS — judgement accepted** |
| 4 | MEDIUM — undocumented cross-process concurrency race on `job.idempotency_key` | Fixed: partial `UNIQUE (job.idempotency_key)` index, migration 5 | Confirmed safe against the real committed database: `idempotency_key` is set ONLY by `sql-sync.ts` (grepped the whole `src/` tree for `idempotencyKey`/`idempotency_key` — the importer's `executeJob` and every other job-creation call site never set one), so every one of the real database's existing `job` rows has `idempotency_key IS NULL`, and a partial index `WHERE idempotency_key IS NOT NULL` is trivially satisfiable against an all-NULL column — the migration will not fail on the real, populated machine. Independently confirmed via `job-store.test.ts`'s new UNIQUE-index test (read, not merely trusted) and by the grep above. Named explicitly in Known Limits as closing the double-enqueue race specifically, not every concurrent-write interleaving — an honest scope statement. | **PASS — genuinely fixed** |

### Independent reproduction (QA's own script, not the developer's)

Built a standalone script against a fresh, throwaway temp SQLite file + temp ledger/Brief fixtures
(`/private/tmp/.../scratchpad/qa_round2_repro.mts`, run via `npx tsx`, never touching this worktree or
`data/organicgrowth.db` — confirmed via `git status --porcelain` staying empty throughout):

```
=== TEST A: two DIFFERENT accepted Ideas, same Run, same title ===
idea-01 outcome: {"ideaId":"f62a...","ideaCreated":true,"jobs":[{"recipe":"news-carousel","synced":true,"reason":"created"}]}
idea-02 outcome: {"ideaId":"5403...","ideaCreated":true,"jobs":[{"recipe":"news-carousel","synced":true,"reason":"created"}]}
SAME sqlIdeaId? false

=== TEST B: pre-migration-5 style row (legacy_ref NULL) -- does a re-sync duplicate? ===
pre-migration idea SQL id: 79253035-...
resync outcome: {"ideaId":"ac9be8ce-...","ideaCreated":true,"jobs":[{"recipe":"news-carousel","synced":true,"reason":"created"}]}
idea rows before: 1 after: 2 (2 = duplicate created)
resync ideaId === preMigrationId? false

=== TEST C: force a genuine (brand, legacy_ref) collision directly at the store layer ===
THREW as expected: UNIQUE constraint failed: idea.brand_id, idea.legacy_ref
```

Test A confirms Round 1's original CRITICAL is genuinely fixed for the title-collision case. Test C
confirms the schema-level backstop genuinely throws loudly on a forced collision. **Test B independently
reproduces the new residual**: a ledger Idea whose SQL row predates migration 5 (no `legacy_ref`) is NOT
found on re-sync — a second, real, duplicate `idea` row is created (`ideaCreated: true`, a DIFFERENT id
than the pre-migration row; row count goes from 1 to 2 for what is one real Idea). This matches the
developer's own "KNOWN LIMIT" test in `sql-sync.test.ts` exactly — independently confirmed, not merely
re-read.

### Per-criterion results (issue #254, "What to build, slice 1")

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Accepting an Idea creates its Idea row, per-Recipe Asset rows, one queued job per Recipe in SQL, through `src/command-surface/` | **FAIL** | True for `syncAcceptToSql` itself, and for the ONE compiled caller now wired (`run-pipeline.ts`'s stranded-idea resume). **False for the primary, everyday Gate-1 accept** — no compiled code puts rows in SQL there; only a markdown paragraph does (Defect 2, still open). **Also false for a re-sync of any pre-migration-5 Idea** — it creates a duplicate row rather than the correct existing one (Defect 1, new form, still open). |
| 2 | Accepting twice must not double-enqueue (state which guard, why) | **PASS** | `listJobsForComposite`, correctly named and now backstopped at the schema level too (`idx_job_idempotency_key`) — independently confirmed via `job-store.test.ts` read and the grep showing `idempotency_key` is always NULL on legacy rows, so the new index cannot fail against the real database. |
| 3 | Already-imported jobs not duplicated/disturbed by a re-accept | **PASS (for imports that ran AFTER migration 5) / FAIL (for the real, already-imported 61 Ideas that ran BEFORE it)** | The `sql-sync.test.ts` "AC3" test now seeds `legacyRef: "idea-01"` on the prior row — this proves the FUTURE case (an importer run after migration 5 exists) correctly correlates. It does NOT prove the REAL, PRESENT case (the actual `data/organicgrowth.db`'s 61 Ideas, imported 2026-08-17, before migration 5) — that case duplicates, per Defect 1's new form. |
| 4 | `queue.json` keeps being written exactly as today | **PASS** | `enqueue-on-accept.ts`'s diff since `cdb68a0` for the omitted-`db` path is unaffected by Round 2 (Round 2 only touches `sql-sync.ts` internals reached when `db` IS given); all pre-existing tests still pass. |
| 5 | A failure to write SQL must be loud | **PASS** | Unchanged code path (the Brand/Format-missing checks in `syncAcceptToSql` are untouched by Round 2); still throws by name. |
| 6-9 | The four "prove it" items | **PASS on the literal bar, same caveats as Round 1** | Re-derived directly from code read (`findNextQueuedJob` is a plain `SELECT`; `drainQueue`/`FakeSpace` mechanics unchanged by this round) rather than re-running the developer's transcript verbatim — no reason to doubt it, the mechanism is unchanged from Round 1 where I already independently reproduced it. |

### Per-scenario results (spec deltas, Round 2 additions)

| Scenario | Result | Covering test | Note |
|---|---|---|---|
| A brand-new accepted Idea gets Idea/Asset/Job rows | PASS | `sql-sync.test.ts` "AC1" | — |
| Idea identity resolved by `legacy_ref`, not title; two same-titled Ideas never collide | PASS | `sql-sync.test.ts` "QA round-1 Defect 1" block; independently reproduced (TEST A above) | — |
| A second `createIdea` with the same `(brand, legacy_ref)` throws `SQLITE_CONSTRAINT` | PASS | `idea/store.test.ts`; independently reproduced (TEST C above) | — |
| A re-accept of an importer-carried Idea reuses that row | PASS **only for a post-migration-5 import** | `sql-sync.test.ts` "AC3" (updated to stamp `legacyRef`) | The spec's own Requirement text makes an UNCONDITIONAL claim ("A SECOND call for the SAME ledger Idea... SHALL reuse that existing row rather than creating a duplicate") that is false for a pre-migration-5 row. The KNOWN-LIMIT test that proves this exists in the test file but has **no corresponding Scenario in the spec** — a self-consistent-but-wrong spec: the written Scenarios all pass, but the Requirement's own prose overstates the guarantee the code actually provides. |
| `job.idempotency_key` UNIQUE index closes the cross-process race | PASS | `job-store.test.ts` | — |
| Resume ALSO writes SQL by default | PASS (for the resume path specifically) | `run-pipeline.test.ts` | Scoped correctly in its own Requirement text ("If the Operator types resume... AND stranded Ideas exist") — this spec delta does NOT claim to fix the ordinary accept path, so it is not itself misleading; the gap is that no spec delta in this change covers the ordinary `/review-ideas` accept path with equivalent code-level force, because none exists. |

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | No render/publish code touched this round. |
| Public-metrics-only | PASS | No Apify code touched; `git diff cdb68a0 HEAD --name-only -- src/ \| grep -v test \| xargs grep -ln "apify\|Apify"` hits only pre-existing, unrelated lines in `run-pipeline.ts` (an import-type comment) and `schema.ts` (unrelated table), confirmed via `git diff ... -- <file> \| grep -i apify` returning nothing for either — no new Apify code. |
| Relative-not-absolute | N/A | Not a scoring change. |
| Ledger-as-source-of-truth | **FAIL** | Two SQL `idea` rows can now exist for one real, canonical ledger Idea (Defect 1's new form) — the SQL mirror is no longer guaranteed unambiguous for any pre-migration-5 Idea that is re-synced. This is a direct violation of the rule's own text ("the ledger stays canonical") one layer into its SQL mirror. |
| Explicit-attribution | PASS (narrowly) | The literal Post↔Idea/Recipe attribution chain (`/log-post`) is untouched by this ticket; the concern here is about SQL-Idea identity, which is closer to ledger-as-source-of-truth than explicit-attribution proper — recorded under that rule instead, above. |
| Magnific fake only, no live Space calls | PASS | `git diff cdb68a0 HEAD --name-only \| grep -v handoff.md \| grep -v openspec/ \| xargs grep -ln "spaces_\|creations_"` finds one hit, `run-pipeline.test.ts:926`, which is the pre-existing test NAME `"uses a fake Magnific port — no live spaces_* calls are made"` — not a live call. No Space-driving code was touched this round (`Files touched` list confirms). |
| Migrations 1-4 frozen | PASS | `git diff cdb68a0 HEAD -- src/db/schema.ts \| grep -c '^@@'` → 1 hunk, starting immediately after `MIGRATION_4`'s closing backtick — independently confirmed, not merely re-read from the Build Report. |
| No Apify | PASS | See above. |

### Defect list

1. **[CRITICAL] A pre-migration-5 imported Idea creates a genuine duplicate SQL Idea/Asset/Job row on
   re-sync, rather than reusing its real one — a new regression introduced by the very fix for Round 1's
   CRITICAL, reachable through Round 2's OWN Defect-2 fix.**
   The real, committed `data/organicgrowth.db` holds 61 Ideas imported 2026-08-17, all with `legacy_ref
   IS NULL` (the column did not exist yet). `syncAcceptToSql` now resolves identity via
   `getIdeaByLegacyRef(db, brand.id, ideaId)` — for any of these 61 rows, this returns `null`, so a
   re-sync takes the "create a new Idea" branch and produces a SECOND row for the SAME real-world Idea.
   This is reachable in production: `run-pipeline.ts`'s stranded-idea resume branch — Defect 2's own fix
   — now opens `data/organicgrowth.db` and calls `enqueueOnAccept({ db, ... })` **by default**, for any
   Idea whose file-ledger status is `accepted` with zero recorded Assets that goes "stranded" again. Not
   a cross-Idea content merge (the schema's `UNIQUE (brand_id, legacy_ref)` index still prevents that —
   confirmed via TEST C above), so it is a different failure shape than Round 1's, but it is still a
   genuine ledger-as-source-of-truth violation: two SQL rows for one real Idea, with the NEW duplicate
   (which now legitimately carries the real `legacy_ref`) winning every future lookup by that key, and
   the ORIGINAL row's real production history (if any) orphaned. Disclosed as a "Known Limit" and a
   dedicated test (`sql-sync.test.ts`, "KNOWN LIMIT"), which is genuinely better than Round 1's silent
   version of this class of bug — but disclosure does not close a CRITICAL regression, and the formal
   spec's own Requirement text overstates the guarantee ("SHALL reuse that existing row rather than
   creating a duplicate" — unconditional, no named exception Scenario for this case).
   **Repro:** (1) migrate a temp SQLite DB, seed a Brand + Format + Run; (2) `createIdea` a row with NO
   `legacyRef` (simulating any of the real database's 61 pre-migration-5 rows), title `"X"`; (3) write a
   temp `ledger.json` + Brief for a ledger Idea with id `"idea-01"`, the SAME `run`/`format`, and the SAME
   title `"X"`; (4) call `syncAcceptToSql("idea-01", ["news-carousel"], { db, brand, ledgerPath })`;
   (5) observe `ideaCreated: true` with a brand-new `ideaId` different from the row created in step 2, and
   `listIdeasForRun` growing from 1 to 2 for what is one real Idea. Independently reproduced this round
   (see "Independent reproduction" above) and matches the developer's own "KNOWN LIMIT" test exactly.

2. **[HIGH] Defect 2 is narrowed, not fixed: the ordinary, everyday Gate-1 accept path (`/review-ideas`)
   still has zero compiled code enforcing the SQL write — only the rare stranded-idea resume path does.**
   `/review-ideas` has no compiled TypeScript command file (`ls src/commands/ | grep -i review` returns
   nothing), unlike `pick.ts`, `pick-cast.ts`, `log-post.ts`, `queue.ts`, `track-performance.ts`,
   `export-schedule.ts`, `backup-media.ts`, `cleanup-schedule-media.ts`, and `report.ts`, which all DO
   have a compiled counterpart backing their own gated `.claude/commands/*.md`. This makes `/review-ideas`
   (along with `/run-trends`) the exception, not the rule, in this codebase — contrary to the Build
   Report's framing that "every conversational `/` command... works this way." For an ORDINARY accept
   (not a stranded-idea resume), the ONLY thing making the SQL write happen is an LLM agent correctly
   reading and following `.claude/commands/review-ideas.md`'s "Also pass `db`" paragraph at conversation
   time — exactly Round 1's finding, unchanged for the primary path. The new `review-docs.test.ts` block
   is real and does pin the paragraph's literal text (confirmed: `assert.match(doc, /Also pass \`db\`/)`
   etc. would fail if the paragraph were removed or reworded) — a genuine, if partial, improvement — but
   it proves the INSTRUCTION is present in the file, not that any given `/review-ideas` conversation
   actually executes it. AC1's own words ("Accepting an Idea creates its Idea row... in SQL... through
   `src/command-surface/`") are still not met by code for the path that actually matters week to week.
   **Repro:** read `.claude/commands/review-ideas.md` around "Also pass `db` in that same options object";
   note it is prose inside a `.md` file with no compiled backing; run `ls src/commands/ | grep -i review`
   (empty) vs. `ls src/commands/ | grep -i pick` (finds `pick.ts`/`pick-cast.ts`) to see the asymmetry;
   confirm the only `db`-passing call site is `run-pipeline.ts`'s stranded-idea resume branch via
   `grep -n "db !== undefined ? { db }" src/commands/run-pipeline.ts`.

### Overall

**FAIL.** Real, substantial progress this round: the title-collision CRITICAL from Round 1 is genuinely
fixed (independently reproduced), the schema now backstops both the identity guarantee and the
idempotency guarantee at the database level (both verified safe against the real, populated database),
and one real compiled caller (`run-pipeline.ts`'s resume branch) is now genuinely, testably wired to SQL
by default. Defects 3 and 4 are honestly resolved.

But two things remain genuinely open, one of them a new CRITICAL: (1) the very fix for Round 1's CRITICAL
creates a different, still-live CRITICAL — a real, reachable duplicate-row regression for the 61 Ideas
that already exist in the real, committed database, disclosed but not fixed, and not reflected as a
bounded exception in the formal spec's own Requirement text; (2) the wiring for the PRIMARY, everyday
accept path is still a markdown paragraph an LLM agent must remember to follow — Round 2 fixed a REAL but
secondary compiled caller, not the main one, so AC1 remains unmet by code for an ordinary accept. Hand
back to the developer with this defect list.

## Build Report — Round 3

This is the final retry round. Both remaining defects are addressed below: Defect A (CRITICAL) with a
fix, and Defect B (HIGH) with a real, working compiled command — not a deferral. Summary, then the full
argument for each, then transcripts, then updated suite numbers.

| Defect | Status |
|---|---|
| A (CRITICAL) — the identity fix duplicates every already-imported Idea | **Fixed.** Bounded fallback (`listUnclaimedIdeasForRunByTitle` + `claimLegacyRef`): adopt on exactly one unclaimed match, refuse loudly on ambiguity, create on no match. No migration, no backfill, no re-import. Red→green + break-it-on-purpose transcripts below. |
| B (HIGH) — the everyday accept path has no compiled backing | **Built, not deferred.** `src/commands/accept-idea.ts`'s `acceptIdeaCommand` performs the WHOLE Gate-1 accept mutation (Recipe selection, `status: accepted`, file-queue-and-SQL enqueue) through compiled code, opening/migrating `data/organicgrowth.db` BY DEFAULT. `.claude/commands/review-ideas.md` now calls it via `npm run accept-idea`. Break-it-on-purpose transcript below. |

### Defect A (CRITICAL) — identity reconciliation, argued

**Decision: when `getIdeaByLegacyRef` finds nothing, fall back to a NARROW, ambiguity-refusing
`(run_id, title)` lookup scoped to UNCLAIMED rows (`legacy_ref IS NULL`) — adopt on exactly one match,
refuse loudly on more than one, create on none.** This is the direction the QA Verdict suggested, and I
did not find a better one after considering the alternative (a migration-5 backfill) seriously.

**Why not a backfill migration instead.** A backfill would need to run once, correctly, against the REAL
`data/organicgrowth.db` — and I cannot prove it correct against real data without touching that file,
which I am expressly barred from doing in this build environment (and shouldn't do from a build agent
regardless — a data migration against production data is an Operator-run, reviewed operation, not
something that should happen silently inside a `syncAcceptToSql` code change). A backfill's own
correctness claim ("stamp `legacy_ref` by re-deriving `(run, title)`") is EXACTLY the mechanism the
runtime fallback below already performs, just done once eagerly instead of lazily on first re-sync — so a
migration buys nothing a lazy, self-healing fallback doesn't already provide, while adding a real risk
(a migration that touches all 61 rows in one irreversible step, with no independent per-row verification)
the lazy path avoids entirely (each row is reconciled individually, verifiable via its own SQL row
inspection, the moment it is actually re-synced — never all-at-once, never unreviewed).

**Why this exact bound (unclaimed rows only, exactly-one adopts, more-than-one refuses).** Scoping the
fallback to `legacy_ref IS NULL` rows is what makes it safe to run for EVERY sync attempt, not just once:
an already-reconciled row (one some other ledger Idea already adopted) can never be matched a second time,
so there is no risk of two different ledger Ideas racing to claim the same legacy row after the first one
has already been reconciled. Requiring EXACTLY one match before adopting — never "the first" or "the most
recently created" — is the direct lesson of Round 1's own CRITICAL: that bug existed because the code
picked a match without verifying uniqueness. This ticket does not repeat that mistake at one remove: an
ambiguous fallback throws, by name, rather than guessing.

**What closes, concretely.** The real, committed database's 61 pre-migration-5 Ideas each have `legacy_ref
IS NULL` and a real `(run, title)` — the natural key Round 1 itself already proved is safe against the
real data (surveyed then: zero collisions across 51 Ideas / 5 Runs). The first time any of those 61 rows
is re-synced (via `run-pipeline.ts`'s stranded-idea resume, or a future accept-command re-run), it is
ADOPTED, not duplicated, and permanently reconciled from then on — no Operator action needed, no migration
step, no re-import.

**What stays open, honestly.** If the SAME title were ever reused across TWO different pre-migration-5
Ideas in one Run (a case Round 1's own survey found zero instances of, and this round did not re-survey
since it changes nothing about the real data), the fallback now REFUSES rather than merges — a stricter,
safer failure than either Round 1 (silent merge) or Round 2 (silent duplicate) produced. An Operator
hitting this would need to reconcile manually (call `claimLegacyRef` directly, as the store's own doc
comment documents) — a real but narrow residual, changed in KIND from a data-corruption risk to an
operational one.

### Defect B (HIGH) — judgement, stated plainly: built, not deferred

**This was buildable within scope, so I built it rather than deferring it.** The QA Verdict's own
framing gave me the option to say "this needs its own slice" — I considered that seriously, since the
gap turned out to be larger than "one missing `db` argument": `/review-ideas` had NO compiled backing
for ANY part of its accept mutation, including a genuinely new discovery — no compiled function anywhere
in this codebase set an Idea's `status: accepted` on the file ledger at all (an LLM edited the JSON
directly, freehand, for both accept AND reject, since the ledger's own inception). But the SHAPE of the
fix is exactly the shape this repo already uses for every other gated command (`/pick`, `/pick-cast`,
`/log-post`): a thin `src/commands/<name>.ts` with a testable async function plus a CLI `main()`, composed
from EXISTING pieces (`writeIdeaRecipeSelection`, unchanged; `enqueueOnAccept`, unchanged) plus ONE small,
genuinely new piece (`markIdeaAccepted`, an 18-line function mirroring `writeIdeaRecipeSelection`'s own
shape). This is squarely "add the missing compiled entry point," not "redesign the accept flow" — so I
built it.

**Scope I deliberately held the line on, and why.** `acceptIdeaCommand` performs ONLY the accept
MUTATION — the deterministic write that happens once the Operator's decision (which Idea; which Recipes
chosen/declined) is already known. The CONVERSATIONAL parts of `/review-ideas` — presenting suggested
Ideas with their sources, taking the Operator's free-text verdict, letting them trim/extend the offered
Recipe set — remain prose, because they need an LLM's judgment (reading Operator intent from natural
language) that no amount of compiled code can replace; `/review-ideas` itself is, and stays, a
prompt-driven command with no compiled turn-by-turn runtime, exactly like `/run-trends`. I also did NOT
build an equivalent compiled command for REJECT — the issue and QA's own Defect B repro were both scoped
to the ACCEPT path (AC1's own wording: "Accepting an Idea creates its Idea row... in SQL"), reject writes
no SQL row at all today, and building it would have been unrequested scope creep in the very round where
scope discipline matters most. This is recorded as a Known Limit below, not silently done.

**The one genuinely new judgement call: `markIdeaAccepted` is unconditional, matching what it replaces.**
The SQL-side `acceptIdea` (`src/idea/store.ts`) requires an Idea currently be `suggested` and throws
otherwise. I did NOT give `markIdeaAccepted` that same precondition, because the freeform behavior it
replaces never had one either — an LLM setting `status: accepted` in the JSON never checked the prior
value first. Adding a NEW precondition here would be a silent behavior change riding along with an
unrelated ticket (SQL wiring), not something #254 asked for. Setting an already-`accepted` Idea to
`accepted` again is a safe, idempotent no-op write either way.

### Prove it, do not assert it — Round 3

**Defect A, at both layers, independently reproduced (not just re-asserting the new tests) — full test
output:**

```
$ node --import tsx --test src/production-queue/sql-sync.test.ts
...
# Subtest: syncAcceptToSql — QA round-1 Defect 1: identity is the ledger's own id, never title
    ok 1 - TWO DIFFERENT accepted Ideas sharing an IDENTICAL title each get their OWN Idea/Asset/Job row — never silently merged
    ok 2 - re-syncing idea-02 again (after the collision above) reuses ONLY idea-02's own row, never idea-01's
    ok 3 - Round 3, Defect A: a pre-migration-5 row (no legacy_ref recorded) is ADOPTED on re-sync, never duplicated
    ok 4 - Round 3, Defect A: two OR MORE unclaimed pre-migration-5 rows sharing the same title is genuine ambiguity — refuses loudly rather than guessing
...
# tests 12
# suites 3
# pass 12
# fail 0
```

`ok 3` proves the exact repro QA gave in the Round-2 Verdict ("seed a database to look like the real one
— a pre-migration-5 row with `legacy_ref IS NULL` — and re-sync it"): the row is REUSED (`ideaId` equal
to the pre-migration row's own id, `ideaCreated: false`), `listIdeasForRun` stays at 1 (not 2), and a
SECOND re-sync afterward resolves via the fast `getIdeaByLegacyRef` path with no fallback needed. `ok 4`
proves the forced-ambiguous case: two unclaimed rows sharing a title, `syncAcceptToSql` throws naming
"ambiguous identity", "2 pre-migration-5", and "Refusing to guess" — neither row is claimed, no third row
is created.

Reproduced AGAIN at the real `enqueueOnAccept` entry point (not just the deep module):

```
$ node --import tsx --test src/production-queue/enqueue-on-accept.test.ts
...
ok 6 - Round 3, Defect A, reproduced at the REAL entry point: a pre-migration-5 imported row (no legacy_ref) is ADOPTED on re-sync, never duplicated — exactly the shape of all 61 Ideas in the real database
...
# tests 23
# suites 3
# pass 23
# fail 0
```

**Defect A, break it on purpose, watch it go red, restore byte-identically:** temporarily replaced
`sql-sync.ts`'s real fallback lookup (`const unclaimed = listUnclaimedIdeasForRunByTitle(db, runId,
title);`) with a hard-coded empty array (`const unclaimed = [] as ReturnType<typeof
listUnclaimedIdeasForRunByTitle>;`) — simulating Round 2's exact regression — then re-ran the suite:

```
$ node --import tsx --test src/production-queue/sql-sync.test.ts src/production-queue/enqueue-on-accept.test.ts
...
not ok 5 - syncAcceptToSql — QA round-1 Defect 1: identity is the ledger's own id, never title
  error: '2 subtests failed'   # the adopt test AND the ambiguity test both fail
not ok 3 - enqueueOnAccept — OPTIONAL SQL sync (issue #254)
  error: '1 subtest failed'    # the entry-point adopt test fails
...
# tests 35
# suites 6
# pass 32
# fail 3
```

Restored via `cp` from a pre-edit backup, confirmed byte-identical with `diff` (no output — identical),
re-ran:

```
$ diff /tmp/.../sql-sync.ts.bak src/production-queue/sql-sync.ts
(no output — IDENTICAL)
$ node --import tsx --test src/production-queue/sql-sync.test.ts src/production-queue/enqueue-on-accept.test.ts
...
# tests 35
# suites 6
# pass 35
# fail 0
```

`git status --porcelain src/production-queue/sql-sync.ts` after restoration: `M
src/production-queue/sql-sync.ts` — the SAME, legitimate diff against the committed baseline this whole
round produced, nothing extra, nothing missing (confirmed via the `diff` against the backup above, taken
BEFORE the break-it edit).

**Defect B, break it on purpose, watch it go red, restore byte-identically:** temporarily replaced
`accept-idea.ts`'s default-db-opening condition (`if (db === undefined) { ... }`) with a condition gated
on a `BREAK_ON_PURPOSE_NEVER_OPEN_BY_DEFAULT = true` constant that always skips the block — simulating the
wiring being deleted entirely — then re-ran:

```
$ node --import tsx --test src/commands/accept-idea.test.ts
...
ok 1 - acceptIdeaCommand — writes the Recipe selection and sets the Idea accepted (issue #54/#254)
ok 2 - acceptIdeaCommand — SQL sync via an INJECTED already-open db (issue #254)
not ok 3 - acceptIdeaCommand — opens + migrates data/organicgrowth.db BY DEFAULT, never depending on a caller passing db (issue #254 Round 3, Defect B)
ok 4 - accept-idea CLI main() — argv parsing and usage-error path
# pass 7
# fail 2
```

Both tests in the "opens + migrates BY DEFAULT" describe block fail — exactly the two tests that never
pass `options.db`, only `options.dbPath` (mirroring the real `/review-ideas` CLI invocation, which never
constructs a `DatabaseSync` at all). Restored via `cp` from a pre-edit backup, confirmed byte-identical
with `diff` (no output), re-ran:

```
$ diff /tmp/.../accept-idea.ts.bak src/commands/accept-idea.ts
(no output — IDENTICAL)
$ node --import tsx --test src/commands/accept-idea.test.ts
...
# pass 9
# fail 0
```

`git status --porcelain` after both restorations, and after deleting the two `.bak` scratch files: clean
except for this round's own legitimate, intended diff (18 modified files + 3 new files — the `accept-idea`
command + its test + the new `accept-idea-command` OpenSpec capability directory). No `_break_*`/`.bak`
file ever appears in `git status` at any point (both were written to and deleted from the scratchpad
directory, never this worktree).

### Files touched (Round 3)

- `src/idea/store.ts` (`listUnclaimedIdeasForRunByTitle` — new read; `claimLegacyRef` — new write)
- `src/idea/store.test.ts` (new `listUnclaimedIdeasForRunByTitle` / `claimLegacyRef` describe block — 7 tests)
- `src/store-write-boundary/scan.ts` (`claimLegacyRef` added to `src/idea/store.ts`'s allow-listed write functions)
- `src/store-write-boundary/scan.test.ts` (updated expectations for the new allow-listed function, both the direct list and the namespace-import test)
- `src/command-surface/ideas.ts` (`claimLegacyRef` thin wrapper)
- `src/command-surface/ideas.test.ts` (new `claimLegacyRef` describe block — 2 tests)
- `src/command-surface/index.ts` (exports `claimLegacyRef`)
- `src/production-queue/sql-sync.ts` (identity resolution grows the bounded `(run_id, title)` fallback; module doc comment rewritten; `SqlSyncOutcome.ideaCreated`'s own doc comment updated)
- `src/production-queue/sql-sync.test.ts` ("KNOWN LIMIT" test replaced with an "ADOPTED, never duplicated" test; new ambiguous-refuse test)
- `src/production-queue/enqueue-on-accept.test.ts` (new entry-point-level adoption test)
- `src/ledger/ledger.ts` (`markIdeaAccepted` — new)
- `src/commands/accept-idea.ts` (new — `acceptIdeaCommand` + CLI `main()`)
- `src/commands/accept-idea.test.ts` (new — 9 tests)
- `package.json` (`accept-idea` npm script)
- `.claude/commands/review-ideas.md` (Gate-1 accept step 5.5 rewritten to call the compiled command; step 6's cross-reference updated)
- `src/recipe/review-docs.test.ts` (three describe blocks updated to match the rewritten prose)
- `openspec/changes/issue-254-accept-writes-sql-queue/proposal.md` (Round 3 "What Changes"/Capabilities/Impact updates)
- `openspec/changes/issue-254-accept-writes-sql-queue/specs/accept-sql-sync/spec.md` (identity Requirement rewritten to state the bounded, real behavior; two new Scenarios)
- `openspec/changes/issue-254-accept-writes-sql-queue/specs/accept-idea-command/spec.md` (new capability — ADDED Requirements)
- `openspec/changes/issue-254-accept-writes-sql-queue/tasks.md` (new "Round 3" section)
- `openspec/changes/issue-254-accept-writes-sql-queue/handoff.md` (this Round-3 Build Report)

No change to `src/db/schema.ts` — migrations 1–5 stay exactly as Round 2 left them (confirmed via `git
diff cdb68a0 HEAD -- src/db/schema.ts` showing only Round 2's own migration-5 hunk, nothing added this
round).

### How to run

```bash
# From this worktree:
npm test                                                       # full suite
npm run test:docs
npm run build
openspec validate issue-254-accept-writes-sql-queue --strict
openspec validate --all --strict
node --import tsx --test src/store-write-boundary/scan.test.ts src/fs-boundary/*.test.ts
node --import tsx --test src/production-queue/sql-sync.test.ts src/production-queue/enqueue-on-accept.test.ts src/idea/store.test.ts src/command-surface/ideas.test.ts src/commands/accept-idea.test.ts src/recipe/review-docs.test.ts
```

Round 2 baseline: 3691 tests / 960 suites / 0 fail. **Round 3: 3712 tests / 965 suites / 0 fail** (21 new
tests, 5 new suites — `src/idea/store.test.ts` +7 in a new describe block, `src/production-queue/sql-sync.test.ts`
net +2 (one KNOWN-LIMIT test replaced by an ADOPTED test, one new ambiguous-refuse test),
`src/production-queue/enqueue-on-accept.test.ts` +1, `src/command-surface/ideas.test.ts` +2 in a new
describe block, `src/commands/accept-idea.test.ts` +9 in 4 new describe blocks, `src/recipe/review-docs.test.ts`
net +4 across its rewritten describe block). `npm run test:docs`: 351/94/0-fail, unchanged. `npm run
build`, `openspec validate issue-254-accept-writes-sql-queue --strict`, and `openspec validate --all
--strict` (69 passed) are all clean. `node --import tsx --test src/store-write-boundary/scan.test.ts
src/fs-boundary/*.test.ts`: 42/8/0 fail — the one new allow-list entry (`claimLegacyRef`) is genuinely
exercised, not merely declared.

Confirmed throughout this round, via `stat -f "%Sm %z" data/organicgrowth.db` before and after EVERY test
run (including the full suite, the break-it-on-purpose runs, and the OpenSpec validations): this
worktree's own local `data/organicgrowth.db` — itself git-ignored (`data/*.db`, confirmed via `git
check-ignore -v`) and NOT the shared, real database (that file lives only in the main working directory,
`/Users/CaxtonTaylor/Developer/OrganicGrowth/data/organicgrowth.db`, a separate worktree this agent never
opened) — never changed: `Aug 18 10:59:35 2026`, `258048` bytes, identical before and after this entire
round. Every test that opens a database uses either `withTempDb` (a real, throwaway SQLite file) or an
explicit `options.dbPath`/`options.db` pointed at a throwaway temp file — confirmed by reading every new
test in this round; no test ever omits both.

### Acceptance-criteria self-assessment (Round 3 additions)

| Claim | Proven by |
|---|---|
| A pre-migration-5 row (`legacy_ref IS NULL`) sharing the ledger Idea's `(run, title)` is ADOPTED, not duplicated | `sql-sync.test.ts` "Round 3, Defect A: a pre-migration-5 row... is ADOPTED..." (deep-module layer) + `enqueue-on-accept.test.ts` "Round 3, Defect A, reproduced at the REAL entry point..." (entry-point layer) |
| A SECOND re-sync of an adopted row takes the fast `legacy_ref` path, no fallback needed | Same `sql-sync.test.ts` test, second half — asserts a follow-up `syncAcceptToSql` call resolves to the same id with `ideaCreated: false` |
| Two or more unclaimed rows sharing a title is refused loudly, never guessed | `sql-sync.test.ts` "Round 3, Defect A: two OR MORE unclaimed pre-migration-5 rows..." — asserts the thrown message names the count and says "Refusing to guess"; asserts both rows are left unclaimed, no third row created |
| `claimLegacyRef` is atomic and refuses a lost race / an already-claimed row | `idea/store.test.ts`: "claimLegacyRef throws for an unknown Idea id" + "claimLegacyRef throws when the row ALREADY carries a legacy_ref" |
| `listUnclaimedIdeasForRunByTitle` never matches an already-claimed row | `idea/store.test.ts`: "never matches a row that ALREADY carries a legacy_ref" |
| The formal spec states the REAL, bounded behavior (not an unconditional claim) | `specs/accept-sql-sync/spec.md`'s identity Requirement rewritten with "falling back to an ambiguity-refusing (run_id, title) lookup..." in its own title and body; two new Scenarios (`adopted` / `ambiguous-refuses`) |
| An ordinary accept puts rows in SQL through compiled code (AC1, for the everyday path) | `accept-idea.test.ts`: "with ONLY options.dbPath given (never options.db)..." — re-opens the database independently after the call and queries it directly |
| A regression-guard test fails if the default-db-opening wiring is removed | `accept-idea.test.ts`: "REGRESSION GUARD: if the default db-opening wiring were ever removed, this test fails..." — proven red→green live above, not merely by inspection |
| `markIdeaAccepted` is the first compiled writer of the Idea's `status: accepted` on the file ledger | `accept-idea.test.ts`: "writes chosen/declined Recipes and sets status: accepted on the ledger" — reads the raw JSON back and asserts `status === "accepted"` |
| `.claude/commands/review-ideas.md` instructs the compiled command, not freeform calls | `review-docs.test.ts`'s rewritten describe block (7 tests) — pins the literal `npm run accept-idea --` invocation, the "never write the ledger... yourself" instruction, and the "opens + migrates... BY DEFAULT" claim |
| Issue #247's own pinned `recordReviewDecision` citation still holds after the rewrite | `command-surface-citations.docs-test.ts` (unmodified) — re-ran green; the rewritten prose keeps the literal `status: accepted` ... `recordReviewDecision` substring within its 150-char window |

### Fakes / fixtures used (Round 3, additive to Rounds 1–2's lists)

- Same as Rounds 1–2: `src/space-driver/fixtures/fake-space.ts`'s `FakeSpace` (the Magnific fake — **not
  touched by any Round 3 change**, no new Space-driving code was added this round either), `src/db/
  test-support.ts`'s `withTempDb` (real, throwaway SQLite files, never `:memory:`).
- New this round: `accept-idea.test.ts`'s `withBrandFixture` — a throwaway temp `brandsRoot`/`ledger.json`/
  `queue.json`/`dbPath` quadruple, mirroring `enqueue-on-accept.test.ts`'s existing `withSqlFixture`
  convention, extended with a computed-but-never-created `dbPath` (so a test can prove the command creates
  it itself). Every test in this file passes an explicit `dbPath` (or `db`) — confirmed by reading the
  whole file — so no test can ever fall through to `acceptIdeaCommand`'s own real default,
  `data/organicgrowth.db`.
- No Apify, no Zoho, no S3 — unchanged from Rounds 1–2. No live `spaces_*`/`creations_*` call anywhere in
  this round's code or tests — grepped the full Round-3 diff for `spaces_\|creations_\|magnific`: zero hits
  outside this handoff.md's own prose.

### Self-review notes (Round 3)

- Considered giving `markIdeaAccepted` the same "must currently be suggested" precondition
  `src/idea/store.ts`'s SQL-side `acceptIdea` has. Deliberately did NOT — the freeform behavior it
  replaces never had this check, and adding a new one would be an unrelated, unrequested behavior change
  riding along with this ticket's actual scope (SQL wiring). Recorded as a deliberate choice above, not an
  oversight.
- Simplified the SQL-open/close lifecycle in `acceptIdeaCommand` to a single `ownsDb` boolean (mirroring
  `run-pipeline.ts`'s own `db?.close()`-in-`finally` shape exactly) rather than inventing a new pattern —
  keeps the two compiled default-db-opening call sites in this codebase (`run-pipeline.ts`'s resume branch,
  `accept-idea.ts`) visibly consistent with each other.
- Did NOT build a compiled `reject-idea` counterpart. Tempting for symmetry, but out of this ticket's own
  scope (AC1 names accept only) and out of THIS round's scope specifically (the QA Verdict's Defect B was
  about the accept path). Named explicitly as a Known Limit below rather than silently left out.
- Removed no code from earlier rounds — every Round 1/2 test, doc-comment claim, and Known Limit that is
  still accurate is left untouched; only the ones Round 3 actually falsified (the "pre-migration-5 rows
  duplicate" Known Limit, the identity Requirement's unconditional claim) were rewritten.

### Known limits (Round 3 — supersedes/updates Round 2's list where noted)

- **No Production Spec authoring at accept time — unchanged since Round 1.** Still the subject of Round
  2's Defect-3 judgement (accepted, disclosed staging consequence); follow-up drafted, not filed (this
  agent's `gh` grant has no `issue create`), and referenced in this round's own task context as issue
  **#264** (filed by the Operator/orchestrator between Round 2 and Round 3).
- **RESOLVED, no longer a known limit — pre-migration-5 imported rows duplicating on re-sync.** Round 2's
  own Known Limit ("a later re-sync... will create a genuine duplicate Idea row") is fixed by this round's
  adopt/refuse/create fallback. Superseded by the NEW, narrower residual immediately below.
- **NEW, narrow residual — two or more UNCLAIMED pre-migration-5 rows sharing an identical title in the
  SAME Run is refused, not resolved automatically.** An Operator hitting this (never observed in the real
  data, per Round 1's own survey) would need to call `claimLegacyRef` directly, by hand, naming which row
  is which ledger Idea — a manual, narrow reconciliation step, documented in `src/idea/store.ts`'s own doc
  comment, not a silent failure (the thrown error names the ambiguity plainly).
- **NEW — no compiled `reject-idea` command.** `/review-ideas`'s reject path (step 6) is unchanged from
  Round 2: an LLM still edits `status: rejected`/`rejection_reason` freehand, with no compiled backing.
  Deliberately out of this ticket's own scope (AC1 names accept only); a real, symmetric gap for a future
  ticket to close if it becomes load-bearing.
- **The `job.idempotency_key` UNIQUE index closes the double-enqueue race specifically — unchanged from
  Round 2.** See Round 2's own argument; Defect 4 was already resolved and untouched by this round.
- **A fixed SQL failure requires calling `syncAcceptToSql` directly to recover, not a second
  `enqueueOnAccept`/`acceptIdeaCommand` call — unchanged since Round 1.** See Round 1's own "break it on
  purpose" transcript's recovery note; the same mechanism now also applies to `acceptIdeaCommand`'s own
  file-queue-already-landed short-circuit.
- **No outer SQL transaction around the whole sync — unchanged since Round 1.** Argued acceptable there
  (every step individually atomic, the whole function idempotent on retry); unaffected by this round's
  changes.

## QA Verdict — Round 3: PASS

This is QA's third and final attempt on this slice. Both remaining defects from the Round-2 Verdict were
independently re-derived against realistic data (never the developer's own scripts, never the real
`data/organicgrowth.db`) and are genuinely closed. No new defect was found in this round's diff.

### Suite result

All commands actually re-run live in this worktree (never taken on faith from the Build Report):

- `npm test` — **3712 tests / 965 suites / 0 fail**, matching the Round-3 Build Report exactly (+21
  tests / +5 suites over Round 2's 3691/960/0). Green.
- `npm run test:docs` — **351 tests / 94 suites / 0 fail**, unchanged. Green.
- `npm run build` — clean (`tsc -p tsconfig.build.json`, no output, no error).
- `npx openspec validate issue-254-accept-writes-sql-queue --strict` — `Change 'issue-254-accept-writes-sql-queue' is valid`. Green.
- `npx openspec validate --all --strict` — `Totals: 69 passed, 0 failed`. Green.
- `node --import tsx --test src/store-write-boundary/scan.test.ts src/fs-boundary/*.test.ts` — **42/8/0
  fail**. Green. Diff confirms exactly one allow-list change (`claimLegacyRef` added to
  `src/idea/store.ts`'s tracked write-function list).
- `node --import tsx --test src/production-queue/sql-sync.test.ts src/production-queue/enqueue-on-accept.test.ts src/idea/store.test.ts src/command-surface/ideas.test.ts src/commands/accept-idea.test.ts src/recipe/review-docs.test.ts`
  — **128/30/0 fail**, re-run standalone. Green.
- `node --import tsx --test src/commands/run-pipeline.test.ts src/production-queue/job-store.test.ts` —
  **75/20/0 fail** — spot-check that Round 2's already-passed Defects 2 and 4 were not disturbed. Green;
  `git diff 4d79459 HEAD -- src/commands/run-pipeline.ts src/commands/run-pipeline.test.ts` and
  `-- src/db/schema.ts` are both **empty** — neither file changed this round.
- `data/organicgrowth.db` / `data/queue.json` (this worktree's own, git-ignored, non-shared copy) — `stat
  -f "%Sm %z"` before and after this entire QA session: **unchanged** (`Aug 18 10:59:35 2026 258048` /
  `Aug 18 09:56:28 2026 14205` both times). Every probe below ran against throwaway temp files or a
  throwaway working directory instead. `git status --porcelain` stayed clean throughout (confirmed after
  every probe); no scratch file was ever left in the worktree.

### Per-defect results (the two Round-2 defects, independently re-verified)

| # | Round-2 defect | Developer's claim | QA finding | Verdict |
|---|---|---|---|---|
| A | CRITICAL — the Round-2 identity fix (`legacy_ref`) duplicates every already-imported (pre-migration-5) Idea on re-sync | Fixed: a bounded fallback — `getIdeaByLegacyRef` finds nothing → `listUnclaimedIdeasForRunByTitle` (scoped to `legacy_ref IS NULL`) → exactly one match ADOPTS (`claimLegacyRef`), more than one REFUSES loudly, none CREATES | **Independently reproduced, at three layers, with my own scripts (never the developer's test file):** (1) seeded a SQL `idea` row directly via `createIdea` with no `legacyRef` — exactly the shape of the real database's 61 imported Ideas — then called the REAL `enqueueOnAccept` entry point for a ledger Idea sharing that row's `(run, title)`: the row was **reused** (`ideaId` identical, `ideaCreated: false`), not duplicated — `listIdeasForRun` stayed at 1. (2) Called `syncAcceptToSql` directly TWICE for the same ledger Idea: the second call took the fast `getIdeaByLegacyRef` path (`reason: "already-queued"`), same `ideaId`, row count still 1 — the adoption is genuinely idempotent, not just a one-time coincidence. (3) Forced TWO unclaimed rows sharing an identical `(run, title)` and called `enqueueOnAccept` for a third ledger Idea matching both: it **threw**, naming "2 pre-migration-5 Idea rows... Refusing to guess" — neither row was claimed, no third row was created. (4) Confirmed the `legacy_ref IS NULL` scoping holds: after one row was claimed by `idea-01`, a SECOND ledger Idea (`idea-05`) sharing that SAME now-claimed title correctly got its OWN brand-new row rather than re-adopting the claimed one, and `idea-01`'s claim was left untouched. (5) Called `claimLegacyRef` twice on the same row directly: the second call threw ("not found, or already carries a legacy_ref"), confirming the atomic `WHERE legacy_ref IS NULL` guard genuinely refuses a lost race rather than silently overwriting. Every one of these five independent checks matches the developer's own claim exactly. **A genuine, narrow residual remains and is honestly disclosed, not hidden**: two OR MORE unclaimed pre-migration-5 rows sharing an identical title is refused rather than auto-resolved (an Operator would reconcile by hand via `claimLegacyRef`) — Round 1's own survey found zero real instances of this shape, and refusing rather than guessing is exactly the discipline this whole ticket exists to enforce. | **PASS — genuinely fixed** |
| B | HIGH — the everyday `/review-ideas` accept path has zero compiled backing; only the rare `run-pipeline.ts` resume path is wired | Built (not deferred): `src/commands/accept-idea.ts`'s `acceptIdeaCommand` performs the WHOLE Gate-1 accept mutation (Recipe selection, `status: accepted` via new `markIdeaAccepted`, file-queue-and-SQL enqueue opening `data/organicgrowth.db` by default) through one compiled, testable function; `review-ideas.md` now instructs `npm run accept-idea --` instead of freeform writes | **Confirmed real, and run end-to-end myself via the actual CLI, not just the test file.** `package.json` genuinely registers `"accept-idea": "tsx src/commands/accept-idea.ts"`. From a throwaway working directory (never this worktree's `data/`), I ran the compiled entry point directly twice: first against a fresh, un-seeded `data/organicgrowth.db` — it created + migrated the file itself, wrote `queue.json` and the ledger accept correctly, and surfaced the missing-Brand SQL failure **loudly** in its own printed output ("Enqueued (file queue only — SQL sync failed): ... no Brand row for slug..."); second, after seeding that SAME db's Brand/Format via a separate connection, a second real accept produced a genuine `idea`/`asset`/`job` row set, independently re-queried and confirmed visible to `findNextQueuedJob`, alongside a `queue.json` in the unchanged shape. `review-ideas.md` step 5.5 now reads "**never write the ledger or call `writeIdeaRecipeSelection`/`enqueueOnAccept` yourself**" and instructs `npm run accept-idea -- <brand> <ideaId> "<chosen-csv>" '<declined-json>'` — pinned by 7 new tests in `review-docs.test.ts` (read directly: real `assert.match` calls against the doc's own literal text, not vague). The regression-guard test (`accept-idea.test.ts`, "if the default db-opening wiring were ever removed, this test fails") is a real, meaningful assertion — it calls `acceptIdeaCommand` with `dbPath` only (never `db`), mirroring the real CLI's own invocation shape, then re-opens that same file independently to verify a real row exists; the developer's own red→green transcript (breaking, then restoring, the default-opening condition) is consistent with the test's construction. **Judgment on the residual, as asked**: an LLM conducting a live `/review-ideas` conversation could still, in principle, ignore the instruction and hand-edit the ledger directly — nothing mechanically prevents that. But this is now the SAME shape as every other gated command in this codebase (`/pick`, `/pick-cast`, `/log-post`): none of them are enforced beyond a doc-pinning test either; full runtime enforcement would require redesigning how every prompt-driven command in this repo works, not something in scope for this ticket. What Round 3 actually closes is the specific, narrower gap Round 2 left open: before, there was NO compiled path at all for the everyday accept (0% code enforcement, freeform prose only); now the ENTIRE mutation — ledger write, status flip, dual-queue enqueue — is one real, tested, directly-callable function, and the doc explicitly forbids the freeform alternative. Matches the "same shape as `/pick`/`/log-post`" bar this round's own brief set. | **PASS — genuinely fixed within scope** |

### Spot-check: Defects 3 and 4 (already passed in Round 2) — undisturbed

- **Defect 3 (accept-created jobs cannot complete on the unattended worker)** — Known Limits still states
  this plainly, unchanged, now cross-referenced to the filed follow-up **issue #264**. No claim anywhere
  in this round's Build Report, proposal, or spec deltas suggests the worker now finishes an accept-created
  Asset end to end — confirmed by reading the Known Limits section fresh, not assuming Round 2's judgment
  still applies. Correctly **not** re-opened.
- **Defect 4 (`job.idempotency_key` cross-process race)** — `git diff 4d79459 HEAD -- src/db/schema.ts` is
  **empty**: migration 5 (added in Round 2) is untouched this round; migrations 1–4 remain frozen (no
  further schema diff exists beyond the one migration-5 hunk already verified in Round 2). `job-store.test.ts`
  re-run green (included in the 75/20/0-fail spot-check run above).

### Per-criterion results (issue #254, "What to build, slice 1")

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Accepting an Idea creates its Idea row, per-Recipe Asset rows, one queued job per Recipe in SQL, through `src/command-surface/` | **PASS** | True for `syncAcceptToSql` (independently reproduced), for `run-pipeline.ts`'s stranded-idea resume (Round 2, undisturbed), AND now for the primary Gate-1 accept via `acceptIdeaCommand` (independently run end-to-end against a real CLI invocation this round). No production write bypasses `src/command-surface/` — `claimLegacyRef` is the one new write, routed through `command-surface/ideas.ts`, confirmed by grep (`sql-sync.ts` imports it only from `../command-surface/index.ts`) and by a synthetic guard-bypass check (a hand-built `SourceFile` importing `claimLegacyRef` directly from `../idea/store.ts` was fed to `findStoreWriteImports` and correctly flagged as a violation). |
| 2 | Accepting twice must not double-enqueue (state which guard, why) | **PASS** | Unchanged from Round 2 (`listJobsForComposite`, backstopped by the `job.idempotency_key` partial UNIQUE index); independently re-confirmed this round via the direct two-call `syncAcceptToSql` script (second call: `synced: false, reason: "already-queued"`, row count unchanged). |
| 3 | Already-imported jobs not duplicated/disturbed by a re-accept | **PASS — the Round-2 gap for PRE-migration-5 rows is now closed** | Independently reproduced: a `createIdea`-seeded row with no `legacyRef` (the real database's own shape) is ADOPTED, not duplicated, on first re-sync, and stays reconciled on every subsequent sync. |
| 4 | `queue.json` keeps being written exactly as today | **PASS** | Confirmed via the real CLI run: `queue.json`'s shape (`idea_id`/`brand`/`recipe`/`gate`/`status`/`enqueued_at`) is byte-for-byte the pre-existing shape; `enqueue-on-accept.ts`'s omitted-`db` path is untouched this round (diff confirms `sql-sync.ts`/`idea/store.ts` are the only production files this round's fix touches, both reached only when `db` is given). |
| 5 | A failure to write SQL must be loud | **PASS** | Independently reproduced via the real CLI run against an un-seeded database: the printed output named the exact problem ("no Brand row for slug \"straw-motion\"") while the ledger accept and file queue both still landed. |
| 6-9 | The four "prove it" items (SQL rows gained; `findNextQueuedJob` sees it; `drainQueue` picks it up against the fake Space; break-it-on-purpose) | **PASS** | Re-derived directly: real `idea`/`asset`/`job` rows produced by my own CLI run, independently re-queried via `getIdeaByLegacyRef`/`listJobsForComposite`/`findNextQueuedJob` (all three returned the real row); `drainQueue`/`FakeSpace` mechanics are unchanged since Round 1, where this was already independently reproduced; break-it-on-purpose (missing Brand row) independently reproduced this round via the real CLI, not merely re-read. |

### Per-scenario results (spec deltas, Round 3)

`specs/accept-sql-sync/spec.md`'s rewritten identity Requirement and `specs/accept-idea-command/spec.md`
(new capability), checked against their own text and against my independent reproductions:

| Scenario | Result | Covering test / independent check |
|---|---|---|
| A brand-new accepted Idea gets Idea/Asset/Job rows | PASS | `sql-sync.test.ts` "AC1"; unchanged since Round 1/2, re-run green |
| Two DIFFERENT accepted Ideas sharing a title never collide | PASS | `sql-sync.test.ts` "QA round-1 Defect 1"; unaffected by this round, re-run green |
| A pre-migration-5 row (`legacy_ref IS NULL`) sharing `(run, title)` is ADOPTED, never duplicated | PASS | `sql-sync.test.ts` "Round 3, Defect A: ... ADOPTED..."; **independently reproduced**, own script |
| A SECOND sync of an adopted row takes the fast `legacy_ref` path | PASS | Same test's second half; **independently reproduced**, own script (direct two-call test) |
| Two or more unclaimed rows sharing a title refuses loudly | PASS | `sql-sync.test.ts` "Round 3, Defect A: two OR MORE..."; **independently reproduced**, own script |
| A second `createIdea` with the same `(brand, legacy_ref)` throws `SQLITE_CONSTRAINT` | PASS | `idea/store.test.ts`; unaffected by this round (schema unchanged), re-run green |
| `acceptIdeaCommand` writes the Recipe selection and sets the Idea accepted | PASS | `accept-idea.test.ts`; **independently reproduced** via the real CLI end-to-end |
| An empty chosen-Recipe list accepts but enqueues nothing | PASS | `accept-idea.test.ts`; read and matches |
| `acceptIdeaCommand` opens+migrates the database BY DEFAULT | PASS | `accept-idea.test.ts` "REGRESSION GUARD"; **independently reproduced** via the real CLI (no `data/organicgrowth.db` existed beforehand; the command created it) |
| A SQL sync failure is surfaced plainly while the ledger accept and file queue still land | PASS | `accept-idea.test.ts`; **independently reproduced** via the real CLI against an un-seeded database |

The spec text itself is now honest: the identity Requirement states the bounded adopt/refuse/create
behavior explicitly (no unconditional "SHALL reuse" claim left standing, closing the exact self-consistent-
but-wrong-spec issue Round 2 flagged), and the new `accept-idea-command` capability's Requirements match
what was actually built and what I independently ran.

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | No render/publish/Space-driving code touched this round (`git diff 4d79459 HEAD --name-only` contains no file under `src/producer/`, `src/space-driver/`, or any command that publishes). |
| Public-metrics-only | PASS | `git diff 4d79459 HEAD --name-only \| grep -v handoff.md \| grep -v openspec/ \| xargs grep -iln apify` → two hits, both benign: `package.json`'s pre-existing, unrelated `apify-smoke` script line (context noise in the diff, not a change) and `accept-idea.ts`'s own doc comment disclaiming Apify use ("No Magnific, no Apify, no network"). No real Apify code. |
| Relative-not-absolute | N/A | Not a scoring change. |
| Ledger-as-source-of-truth | **PASS — the crux of this round, genuinely closed** | Round 2's CRITICAL was exactly a ledger-as-source-of-truth violation (two SQL rows for one real ledger Idea). Independently reproduced this round that the SAME repro scenario now produces exactly ONE SQL row, reused across every re-sync — confirmed at three independent layers (direct store seeding + real entry point, two-call idempotency, real CLI). |
| Explicit-attribution | PASS | Untouched this round; `/log-post` and the Post↔Idea/Recipe attribution chain are outside this round's diff. |
| Magnific fake only, no live Space calls | PASS | `git diff 4d79459 HEAD --name-only \| grep -v handoff.md \| xargs grep -iln "spaces_\|creations_\|magnific"` → hits only in `proposal.md`/`tasks.md` prose and two doc-comment disclaimers (`accept-idea.ts`: "No Magnific Space..."; `review-docs.test.ts`: "No Magnific Space involved — this is a plain markdown-file read."). No Space-driving code touched; `FakeSpace` untouched since Round 1. |
| Migrations 1-4 frozen | PASS | `git diff cdb68a0 HEAD -- src/db/schema.ts` still shows exactly one hunk, starting immediately after `MIGRATION_4`'s close (confirmed in Round 2, re-confirmed this round via `git diff 4d79459 HEAD -- src/db/schema.ts` being empty — no further change at all this round). |
| No Apify | PASS | See Public-metrics-only above. |

### Issue #264 disclosure check (Production Spec authoring — not to be re-opened)

Confirmed the Known Limits section states plainly: "No Production Spec authoring at accept time —
unchanged since Round 1... referenced in this round's own task context as issue **#264**." No sentence
anywhere in the Round-3 Build Report, proposal, or spec deltas could be read as claiming the unattended
worker now completes an accept-created Asset end to end. Per this task's own scope, **not treated as a
defect** — accepted, disclosed, filed.

### Non-blocking observations (nits — not affecting the verdict)

- `review-ideas.md`'s new invocation (`npm run accept-idea -- <brand> <ideaId> ...`) uses the `--`
  separator, while `pick.md`/`log-post.md` invoke their own commands without one
  (`npm run pick <brand> ...`). Both work for these particular argument shapes (none start with `-`); `--`
  is if anything the more portable npm convention. A cosmetic inconsistency across command docs, not a
  functional gap.
- `markIdeaAccepted` silently no-ops when `ideaId` is not found in the ledger — this exactly mirrors the
  pre-existing `writeIdeaRecipeSelection`/`writeBaseline` shape already used throughout `src/ledger/ledger.ts`,
  not a new gap this round introduces.

### Defect list

None open. Both Round-2 defects are closed; no new defect was found in this round's diff.

### Overall

**PASS.** Both defects carried into this final round are genuinely fixed, each independently re-derived
against realistic data shaped like the real, already-populated database — never the developer's own test
file taken on faith, and never the real `data/organicgrowth.db` itself. Defect A's fix closes the
duplicate-row regression with a self-healing, ambiguity-refusing fallback that matches the exact
discipline (never guess) this whole ticket exists to enforce; Defect B's fix gives the everyday accept
path real, tested, compiled backing for the first time, matching the same shape every other gated command
in this codebase already uses. The suite is genuinely green (3712/965/0, +21/+5 over Round 2, matching the
Build Report exactly), both `openspec validate` invocations pass, the store-write-boundary guard's one new
allow-list entry is genuinely exercised (confirmed via an independent synthetic bypass check), and no live
Magnific Space or Apify call exists anywhere in this round's code. Issue #264's disclosure of the
unattended-worker Spec-authoring gap remains honest and is correctly left open, not re-litigated here. This
slice is ready for a PR.
