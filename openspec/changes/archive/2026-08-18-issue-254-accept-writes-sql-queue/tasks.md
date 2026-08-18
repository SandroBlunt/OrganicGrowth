## 1. Scope audit — before writing any code

- [x] 1.1 Read issue #254 + its Operator comment (`gh issue view 254 --repo SandroBlunt/OrganicGrowth`);
  confirm `ready-for-agent`; confirm the scope decision ("Option B, staged — this ticket is slice 1").
- [x] 1.2 Read `src/production-queue/enqueue-on-accept.ts` + its test end to end — the file-queue policy
  this ticket must leave byte-for-byte unaffected when `db` is omitted.
- [x] 1.3 Read `src/command-surface/jobs.ts`/`ideas.ts`/`assets.ts`/`tenancy.ts` + `src/production-queue/
  job-store.ts` (`JobInput`, `listJobsForComposite`) + `src/idea/store.ts` (`createIdea`, `IdeaInput`,
  `acceptIdea`'s "must be suggested" precondition, `selectIdeaRecipes`'s upsert-on-`(idea,recipe)` shape) —
  confirm the FK chain a fresh Idea row needs (`run_id`/`brand_id`/`format_id`) and that `createIdea`
  requires REQUIRED `hookType`/`theme` (no nullable escape hatch).
- [x] 1.4 Read `src/importer/execute.ts` end to end — the precedent for "Idea+Asset+Job through the
  command surface, in FK-dependency order", and its own decision to classify every imported Idea
  `unclassified` for `hookType`/`theme` (the real backfill, #206, targets the file ledger's Briefs, not
  SQL) — mirrored by this ticket for the SAME reason.
- [x] 1.5 Read `src/ledger/ledger.ts`'s `loadFullIdeas`/`FullLedgerIdea` (built for #204, a strict
  superset of `LedgerIdea` carrying `run`/`title`/`format`/`briefPath`/`fitScore`) and
  `src/importer/load-brief.ts`/`source-urls.ts` (`loadBrief`, `extractSourceUrls`) — confirm these are
  directly reusable rather than re-implementing a second Brief reader.
- [x] 1.6 Read `src/db/schema.ts`'s `idea`/`asset`/`job` tables — confirm `idea` carries NO column
  correlating a SQL row back to the file ledger's own id, and that migrations 1-4 are frozen. Decide: do
  NOT add migration 5 (a shared, append-order file three sibling worktrees are concurrently touching);
  instead resolve Idea identity via `(run_id, title)` — a documented, argued tradeoff (see `handoff.md`).
- [x] 1.7 Read `src/store-write-boundary/scan.ts`'s `STORE_WRITE_FUNCTIONS` + `isCommandSurfacePath` —
  confirm every write this ticket needs is already registered and every call site will be inside
  `src/command-surface/` (via its re-exports) or a plain read directly against a store (out of the
  guard's scope by design) — no new allow-list entry needed.
- [x] 1.8 Read `src/command-surface/worker.ts`'s `runOneJob` — confirm a freshly `queued` job with no
  authored Production Spec fails at `"the Asset has no authored Production Spec yet"` BEFORE any Space
  call; this ticket does not author Production Specs (that stays the producer/worker's own later job) —
  recorded as a known limit, not silently narrowed.

## 2. `src/production-queue/sql-sync.ts` — test-first, against a real throwaway SQLite file

- [x] 2.1 Write failing tests, then implement `syncAcceptToSql` creating the Idea row (Brand/Format/Run
  resolved-or-created), one `queued` Asset per Recipe, and one `queued` job per Recipe — all through
  `src/command-surface/`. Assert the exact SQL rows: `idea.status === 'accepted'`, `idea.hook_type ===
  'unclassified'`, `idea.theme === 'unclassified'`, `idea.source_urls_json` populated from the Brief's
  `## Source(s)` section, one `job` row per Recipe with the Recipe's own first gate (or none for a
  zero-gate Recipe) and the `"<brand>::<idea>::<recipe>"` idempotency key.
- [x] 2.2 Write a failing test, then confirm idempotency: calling `syncAcceptToSql` twice for the SAME
  ledger Idea reuses the SAME SQL Idea row (`ideaCreated: false` the second time) and does not
  double-enqueue (`listJobsForComposite` still returns exactly one job).
- [x] 2.3 Write a failing test, then confirm a re-accept of an Idea an EARLIER importer-style write
  already carried (same `(run, title)`, created directly through the command surface exactly like
  `src/importer/execute.ts` does) reuses that row and does not duplicate its job — the "must not disturb
  already-imported jobs" acceptance criterion.
- [x] 2.4 Write failing tests, then confirm loud failure: a missing Brand row throws naming the slug; a
  missing Format row throws naming Brand+Format; an Idea with no `run`/`format` recorded throws; an
  unreadable Brief throws naming every candidate path tried.

## 3. `enqueueOnAccept` — optional `db` wiring (test-first)

- [x] 3.1 Add `EnqueueOnAcceptOptions.db`/`.brandsRoot` (both optional) and `EnqueueResult.sql` (optional).
  Write a failing test, then confirm omitting `db` leaves behavior byte-for-byte unchanged (`result.sql`
  is `undefined`, no SQL touched).
- [x] 3.2 Write a failing test, then wire: when `db` is given, AFTER the file queue is saved, call
  `syncAcceptToSql` for exactly the Recipes `planEnqueue` decided were newly enqueued this call — assert
  `data/queue.json`'s on-disk shape is identical to the no-`db` case, AND the SQL `job` table gained the
  matching row(s).
- [x] 3.3 Write a failing test, then confirm a re-accept that is `"already-queued"` in the file touches
  SQL for nothing at all (`result.sql` is `undefined`) — the file-queue's own decision gates the SQL call.
- [x] 3.4 Write a failing test, then confirm a SQL failure (missing Brand row) throws from
  `enqueueOnAccept` itself, but ONLY after `data/queue.json` already carries the job — proving the file
  write is never blocked by a SQL problem, and the failure is never silent.

## 4. Wire the real accept path + prove it end to end

- [x] 4.1 Update `.claude/commands/review-ideas.md`'s Gate 1 accept step: open+migrate
  `data/organicgrowth.db`, pass `db` to `enqueueOnAccept`, and surface a thrown SQL-sync error verbatim
  to the Operator rather than reporting a bare "Enqueued" success. Confirm `npm run test:docs` stays
  green (no doc-conformance test pins the OLD four-argument call shape as exhaustive).
- [x] 4.2 In `handoff.md`, PROVE (not assert) the full chain against a real, throwaway `data/*.db` copy —
  never the committed one: accept an Idea via `enqueueOnAccept(..., { db, ... })`, paste real `SELECT`
  output showing the `job` table's new row(s); call `findNextQueuedJob(db)` and paste its return value;
  call `drainQueue(db, fakeSpacePort)` and paste its outcome (claimed, then a named, honest failure —
  "the Asset has no authored Production Spec yet" — since nothing authors a Spec at accept time; flagged
  as a known limit, not hidden) — proving the row is genuinely live and reachable, never a silent
  no-op, entirely against the fake Space.
- [x] 4.3 In `handoff.md`, paste the "break it on purpose" transcript: point `syncAcceptToSql` at a
  database with no Brand row, show the loud thrown error, then restore/re-run clean.

## 5. OpenSpec + full-suite green + self-review + Build Report

- [x] 5.1 Author spec deltas: `accept-sql-sync` (ADDED, new capability) and `production-queue` (ADDED
  Requirement — the file-queue Requirements already archived stay untouched). Run
  `openspec validate issue-254-accept-writes-sql-queue --strict` and `openspec validate --all --strict`
  until green.
- [x] 5.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run test:docs`, `npm run build` — all
  green, at/above the 3662/953/0-fail baseline recorded at branch cut.
- [x] 5.3 Self-review pass: remove dead code, tighten module boundaries, confirm every issue #254
  acceptance criterion maps to a specific test (table in the Build Report).
- [x] 5.4 Write the Build Report into `handoff.md`: what changed, files touched, how to run, the
  acceptance-criteria table, fakes/fixtures used (flagging the Magnific fake explicitly), self-review
  notes, and known limits (no Production Spec authoring at accept time; `run-pipeline.ts`'s stranded-idea
  recovery path not wired to `db` in this slice; `(run_id, title)` Idea-identity risk).

## 6. Round 2 — QA round-1 defect fixes

- [x] 6.1 **Defect 1 (CRITICAL — identity).** Add migration 5: `idea.legacy_ref TEXT` + a partial
  `UNIQUE (brand_id, legacy_ref)` index; add `idea/store.ts`'s `getIdeaByLegacyRef` + `IdeaInput.legacyRef`;
  switch `syncAcceptToSql`'s `findExistingIdea` from `(run_id, title)` to `(brand_id, legacy_ref)`; stamp
  `legacyRef: ideaId` on every Idea it creates; stamp `legacyRef: ideaPlan.legacyId` in
  `src/importer/execute.ts`. Add `SqlSyncJobOutcome.reason: "created" | "already-queued"`. Red→green test:
  two ledger Ideas, same Run, identical title, different Briefs — prove each gets its own Idea/Asset/Job
  row, at both the `syncAcceptToSql` layer and the real `enqueueOnAccept` entry point.
- [x] 6.2 **Defect 2 (HIGH — the real caller).** Add `RunPipelineOptions.dbPath` (defaults to
  `data/organicgrowth.db` at runtime; every test injects a temp path). `run-pipeline.ts`'s stranded-idea
  resume branch now opens+migrates this database BY DEFAULT and passes it to `enqueueOnAccept`, catching a
  per-Idea SQL failure without aborting the remaining stranded Ideas. Pin `.claude/commands/review-ideas.md`'s
  "Also pass `db`" paragraph with a new `src/recipe/review-docs.test.ts` describe block. Prove red→green: a
  new positive-path test fails without the `db` wiring (confirmed by temporarily reverting it) and passes
  with it.
- [x] 6.3 **Defect 3 (HIGH — judgement call).** Decide and state plainly in the Build Report: this is an
  accepted, disclosed consequence of the staging (Option B, slice 1) — the deliverable is that accept-flow
  rows land correctly in SQL; making the worker able to author a Production Spec is later work. Draft the
  follow-up issue text (cannot `gh issue create` — read-only `gh issue view` only in this agent's grant);
  flag for the Operator/orchestrator to file it.
- [x] 6.4 **Defect 4 (MEDIUM — concurrency).** Add a partial `UNIQUE (job.idempotency_key)` index to
  migration 5 — cheap (only `sql-sync.ts` ever sets this column), closes the cross-process double-enqueue
  race at the schema level. Name the residual risk explicitly in Known Limits either way.
- [x] 6.5 Update the OpenSpec spec deltas (`accept-sql-sync`, `production-queue` ADDED; `run-pipeline-
  conductor` MODIFIED, heading matched verbatim to the live spec) to reflect the identity fix, the `reason`
  field, the `job.idempotency_key` index, and the `run-pipeline.ts` default-`db` wiring. Re-run
  `openspec validate issue-254-accept-writes-sql-queue --strict` and `openspec validate --all --strict`.
- [x] 6.6 Re-run the full suite (`npm test`, `npm run test:docs`, `npm run build`,
  `node --import tsx --test src/store-write-boundary/scan.test.ts src/fs-boundary/*.test.ts`) green. Append
  a `Round-2 Build` block to `handoff.md` covering all four defects, the identity decision, the real-caller
  proof, the Defect-3 judgement, and red→green transcripts.

## 7. Round 3 — QA round-2 defect fixes

- [x] 7.1 **Defect A (CRITICAL — the identity fix duplicates every already-imported Idea).** Add
  `src/idea/store.ts`'s `listUnclaimedIdeasForRunByTitle` (read) and `claimLegacyRef` (write, allow-listed
  in `src/store-write-boundary/scan.ts`, wrapped by `src/command-surface/ideas.ts`). `syncAcceptToSql`
  falls back to this lookup, scoped to `legacy_ref IS NULL` rows, ONLY when `getIdeaByLegacyRef` finds
  nothing: exactly one match adopts (claims) it; more than one match throws (ambiguity, never guessed); no
  match creates, as before. Rewrite the identity Requirement in `specs/accept-sql-sync/spec.md` to state
  this real, bounded behavior (no unconditional claim), with Scenarios for the adopt case and the
  ambiguous-refuse case. Prove at BOTH the `syncAcceptToSql` layer and the real `enqueueOnAccept` entry
  point: a pre-migration-5 row (no `legacy_ref`) is reused, never duplicated, on re-sync.
- [x] 7.2 **Defect B (HIGH — the everyday accept path has no compiled backing).** Judged buildable within
  scope (not deferred): add `src/ledger/ledger.ts`'s `markIdeaAccepted` (the first compiled writer of an
  Idea's `status: accepted` on the file ledger) and `src/commands/accept-idea.ts`'s `acceptIdeaCommand` —
  performs the WHOLE accept mutation (Recipe selection + status + file-queue-and-SQL enqueue) in one
  compiled call, opening/migrating `data/organicgrowth.db` BY DEFAULT (mirroring Round 2's `run-pipeline.ts`
  fix). Add the `accept-idea` npm script. Rewrite `.claude/commands/review-ideas.md`'s Gate-1 accept step
  (5.5) to call `npm run accept-idea -- ...` instead of freeform function calls; update
  `src/recipe/review-docs.test.ts` to match; keep issue #247's own pinned `recordReviewDecision` citation
  (`src/claude-commands/command-surface-citations.docs-test.ts`) satisfied by the rewritten prose, unmodified.
  New capability spec `specs/accept-idea-command/spec.md` (ADDED Requirements). Prove: an ordinary accept
  puts rows in SQL through compiled code (`options.dbPath` alone, never `options.db`), and a regression-
  guard test that fails if that default-opening wiring is removed.
- [x] 7.3 Re-run the full suite (`npm test`, `npm run test:docs`, `npm run build`,
  `openspec validate issue-254-accept-writes-sql-queue --strict`, `openspec validate --all --strict`) green.
  Append a `Round-3 Build` block to `handoff.md` covering both defects, the identity-reconciliation
  argument, the Defect-B judgement, and red→green/break-it-on-purpose transcripts.
