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
