# Slice Handoff — issue #203: Real job claiming on the queue, and Performance as a time series

## Build Report (developer)

### What changed

Two independent halves, matching the issue's two problem statements.

**1. Real, atomic job claiming (a NEW SQL store; the file-based queue's `lock` field deleted, not
ported).**

- `src/production-queue/job-store.ts` — a genuinely new, `{ db }`-only `JobStore`. Job identity is the
  surrogate `id` (never `(brand, idea, recipe)`); `listJobsForComposite` makes that triple a NON-UNIQUE
  lookup (joined through `asset`). `claimJob(db, jobId, ownerId, leaseMs, now)` is ONE atomic SQL
  `UPDATE ... WHERE id = ? AND (eligible) RETURNING *` — SQLite's equivalent of
  `SELECT ... FOR UPDATE SKIP LOCKED` — using `job`'s already-reserved `locked_by`/`locked_until`/
  `attempt` columns (no new migration). "Eligible" = `queued`, or `running` with an EXPIRED lease.
  `releaseJob`/`requeueJob` are the atomic counterparts that end/revive a claim.
- `src/production-queue/gate-request-store.ts` — `gate_request` CRUD: a gate's name, candidates, and
  (once decided) who decided, when, and the choice.
- `src/db/connection.ts` gained `PRAGMA busy_timeout = 5000` (was `node:sqlite`'s own default of `0`) —
  a concurrent writer now WAITS for the lock instead of an immediate `SQLITE_BUSY`. This is what makes
  the atomic claim safe under REAL concurrent callers, not merely correct in isolation.
- The file-based Production Queue's `lock` field is **deleted, not ported**: `QueueLock`/`JobRef`/
  `QueueState.lock` are gone from `queue.ts`/`store.ts`/`scheduler.ts`. `spaceBusy` (the single-Space
  invariant) is now derived PURELY from reading `jobs[].status` — there is no second,
  independently-writable structure left to drift out of sync. A stray `lock` key on a hand-edited or
  pre-#203 `data/queue.json` is silently ignored on load and never re-written on save.

**2. Performance as a time series (two NEW SQL stores).**

- `src/post/store.ts` — `PostStore`. `recordPost` is a keyed upsert on `(asset_id, channel_id)`
  (ADR-0028): one Asset published to more than one Channel gets its own, independent Post row.
- `src/performance/store.ts` — the Performance time-series stores, alongside this directory's existing
  pure computation modules (`score.ts`/`metrics.ts`/`maturity.ts`/`selection.ts`, all untouched).
  `recordMetricSnapshot` ALWAYS inserts (no update/delete path exists anywhere in the store) — history
  is never overwritten. `recordChannelBaseline` ALWAYS inserts a fresh row per recompute. 
  `recordPerformanceScore` ALWAYS inserts, stamped with the caller-supplied `computedAt` — a re-score
  never destroys a Post's prior scores.

**No new migration.** `src/db/schema.ts`'s `job`/`gate_request`/`post`/`metric_snapshot`/
`channel_baseline`/`performance_score` were already fully specified by migration 1 (issue #201) —
`MIGRATION_1`/`MIGRATION_2` are byte-for-byte untouched. **Saying this loudly per the brief: this ticket
needed no new migration, so there is no numbering conflict with sibling slice #226.**

### Files touched

**New:**
- `src/production-queue/job-store.ts` (+`.test.ts`)
- `src/production-queue/gate-request-store.ts` (+`.test.ts`)
- `src/production-queue/claim-concurrency.test.ts`
- `src/production-queue/fixtures/claim-worker.ts` (spawnable fixture, not a `.test.ts`)
- `src/db/fixtures/seed-chain.ts` (shared brand/format/run/idea/asset/channel seed fixture)
- `src/post/store.ts` (+`.test.ts`)
- `src/performance/store.ts` (+`.test.ts`)
- `openspec/changes/issue-203-job-claiming-performance-time-series/` (this change)

**Modified:**
- `src/db/connection.ts` (+`.test.ts`) — `busy_timeout`
- `src/production-queue/queue.ts`, `store.ts`, `scheduler.ts` (+ their `.test.ts` files) — lock deletion
- `src/production-queue/enqueue-on-accept.test.ts`, `format.test.ts` — stray `lock:` literals removed
  from fixtures (no logic change)
- `src/commands/pick.test.ts`, `pick-cast.test.ts`, `queue.test.ts` — same, `lock:` literals removed

**Deliberately untouched:** `src/db/schema.ts`, `src/db/migrate.ts` (no new migration), `src/ledger/
ledger.ts`, `src/asset/asset.ts`, every real production module that reads/writes `ledger.json`/
`data/queue.json` today, `src/commands/queue.ts`/`pick.ts`/`pick-cast.ts` (their own logic — only their
tests' fixtures changed), `.claude/rules/always/organicgrowth-rules.md` (Rule 7's existing wording
about which stores are `{ db }`-backed remains literally true; extending its list is optional polish I
chose not to risk against its pinned docs-test regex for a fact this ticket's own ACs don't ask for).

### How to run

```bash
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-203-job-claiming-performance-time-series
npx tsc -p tsconfig.json --noEmit          # type-check
npm test                                    # full suite: 3040 / 780 / 0 fail (baseline 2987/762/0)
npx openspec validate issue-203-job-claiming-performance-time-series --strict   # valid
npx openspec validate --all --strict        # 54 passed, 0 failed

# The concurrency proofs specifically:
node --import tsx --test src/production-queue/claim-concurrency.test.ts
# The new stores specifically:
node --import tsx --test src/production-queue/job-store.test.ts \
  src/production-queue/gate-request-store.test.ts \
  src/post/store.test.ts \
  src/performance/store.test.ts
```

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proven by |
|---|---|---|
| 1 | Job identity is the surrogate `id`; `(brand, idea, recipe)` becomes a non-unique lookup. | `job-store.ts`'s `createJob`/`getJob` (id-keyed) + `listJobsForComposite`. Test: `job-store.test.ts` → *"listJobsForComposite — a NON-UNIQUE (brand, idea, recipe) lookup (issue #203 AC1)" → "returns every job sharing one composite, oldest first"* (two jobs on one composite, neither masked). |
| 2 | A job is claimed by an atomic claim-with-owner-and-expiry — not a field inside a contended file. | `job-store.ts`'s `claimJob` (one `UPDATE...WHERE...RETURNING`). Test: `job-store.test.ts` → *"claimJob — atomic claim-with-owner-and-expiry" → "claims a queued job: status becomes running, owner + lease are set, attempt increments"*. |
| 3 | Two concurrent claims against one queued job yield exactly one winner. **Test proves it.** | `claim-concurrency.test.ts` → *"Two concurrent claims against ONE queued job yield exactly one winner (issue #203 AC)"* — two REAL, separate `node:child_process` processes, each with its own `DatabaseSync` connection, synchronized to race at the same instant. Asserts exactly one winner AND the database's own final state (`attempt: 1`) agrees. |
| 4 | A lock that expires makes its job claimable again, so a crashed worker's job does not stay stuck. **Test proves it.** | Two tests: (a) deterministic, injected-clock proof in `job-store.test.ts` → *"an expired lease makes a running job claimable again"*; (b) a REAL crash scenario in `claim-concurrency.test.ts` → *"An expired lock makes its job claimable again..."* — one real process claims with a 50ms lease and exits without releasing (a simulated crash); a SEPARATE real process, after the lease has genuinely elapsed, claims the same job. |
| 5 | A lost update is impossible: two concurrent writers cannot silently discard each other's work. **Test proves it.** | `claim-concurrency.test.ts` → *"A lost update is impossible..."* — two real processes claim TWO DIFFERENT jobs concurrently; asserts BOTH succeed and BOTH survive in the database, independently. |
| 6 | The `lock` field inside `queue.json` is deleted, not ported. | `queue.ts`/`store.ts`/`scheduler.ts` — `QueueLock`/`JobRef`/`.lock` removed entirely. Tests: `store.test.ts` → *"writes valid JSON with the documented shape including brand + recipe + gate, and no lock field (issue #203)"*, *"a hand-edited file carrying a stray legacy lock key is ignored, never re-written on save (issue #203)"*, *"a raw lock field is ignored — parseQueueState never reads or reconstitutes it (issue #203)"*. |
| 7 | `gate_request` records a gate's name, its candidates, who decided, when, and the choice. | `gate-request-store.ts`. Test: `gate-request-store.test.ts` → *"recordGateDecision — who decided, when, and the choice" → "records decidedBy, a fresh decidedAt, and the choice onto an undecided gate request"*. |
| 8 | `post` is its own record keyed to an Asset and a Channel, so one Asset can be published to more than one Channel and each measured separately. | `post/store.ts`'s `recordPost`. Test: `store.test.ts` → *"one Asset, more than one Channel — CONTEXT.md \"Post\": each measured separately (issue #203)" → "publishing the SAME Asset to a SECOND Channel yields a SECOND, independent Post row"*. |
| 9 | `metric_snapshot` stores dated captures per Post with their source and raw payload; history is never overwritten. | `performance/store.ts`'s `recordMetricSnapshot` (no update/delete path exists in the module). Test: `store.test.ts` → *"a SECOND capture for the SAME Post is a SECOND row — history is never overwritten"*. |
| 10 | `performance_score` is computed per Post against a `channel_baseline` and stored with the time it was computed, so a Post can be re-scored later without losing what came before. | `performance/store.ts`'s `recordPerformanceScore` (always inserts, carries `baselineId` + caller-supplied `computedAt`). Test: `store.test.ts` → *"a RE-SCORE is a NEW row — the earlier score is never lost (issue #203 AC)"*. |
| 11 | The scores and baselines produced by the measurement-loop ticket round-trip through the new tables unchanged. | Test: `store.test.ts` → *"AC11 — scores and baselines produced by the measurement-loop (issue #200) round-trip UNCHANGED" → "computePerformanceScore's real output, and recomputeBaseline's real medians, survive a write + read through these tables"* — runs the REAL `computePerformanceScore`/`recomputeBaseline` functions from `src/performance/score.ts`/`metrics.ts` and asserts byte-identical round-trip. Per the brief, this proves the SHAPES round-trip, not a live-data migration (none exists yet — #204's job). |

### Fakes / fixtures used

- **`src/db/test-support.ts`'s `withTempDb`** — every SQL test opens a REAL, throwaway SQLite file per
  test (never `:memory:`), mirroring #201/#222/#223's own Testing Decisions.
- **`src/db/fixtures/seed-chain.ts`** — a shared, hand-seeded brand → format → run → idea → asset
  (→ channel) fixture chain (no RunStore exists), used by every new store's tests in this ticket.
- **`src/production-queue/fixtures/claim-worker.ts`** — the spawnable concurrency-test fixture. It is
  the ONLY thing this ticket spawns as a child OS process, and it imports and calls the REAL, shipped
  `claimJob` from `job-store.ts` (never a re-implemented copy) — so the concurrency tests prove the
  actual shipped code, not a stand-in for it.
- **The Magnific fake — explicitly N/A.** This slice touches no `magnific`/Zoho MCP tool, no
  `src/space-driver/**`, no `src/producer/**`. Nothing in this slice's tests calls a Magnific Space,
  fake or otherwise — the `developer` agent was never given the `magnific` MCP tools in the first place,
  and this slice never reached for them. Confirmed by `npm test` passing hermetically (no network, no
  `magnific`/Zoho MCP import) and by inspection: every import in the touched files resolves to `src/db/
  **`, `src/production-queue/**`, `src/post/**`, `src/performance/**`, `src/asset/store.ts` (its `{ db }`
  branch only), `src/brand/store.ts`, `src/channel/store.ts`, `src/format/store.ts`,
  `src/vocabulary/**` — none of which touch Magnific.

### Self-review notes

- Moved the shared seed fixture from `src/production-queue/fixtures/seed-job.ts` to
  `src/db/fixtures/seed-chain.ts` mid-build once it became clear `src/post`/`src/performance` needed it
  too, not just `src/production-queue` — a `git mv`-equivalent rename, not a duplicate.
- Considered a `renewLease`/heartbeat function on `JobStore` (a common real-world addition to a claim
  primitive) and deliberately left it out — no acceptance criterion asks for it, and adding untested
  surface area for its own sake would violate the "prove every acceptance criterion with a test" brief
  rather than serve it.
- Considered naming the new job-claiming module `src/job/store.ts` (a fresh top-level directory,
  mirroring `src/idea/store.ts`'s "genuinely new gets its own directory" convention from #222/#223).
  Kept it at `src/production-queue/job-store.ts` instead, alongside the file-based queue it is the SQL
  future of, and alongside `gate-request-store.ts` (tightly coupled via `gate_request.job_id`) — a
  judgment call, flagging it explicitly for qa/Operator review rather than treating it as obviously
  correct.
- Grouped `metric_snapshot`/`channel_baseline`/`performance_score` into ONE file
  (`src/performance/store.ts`) rather than three directories, since none of the three is its own
  CONTEXT.md-named term (unlike Post) and they are, per `schema.ts`'s own section heading, "the feedback
  loop" — one coherent unit. `Post` got its own `src/post/` directory since ADR-0029 explicitly names
  `PostStore` as a peer of `IdeaStore`/`ChannelStore`/`QueueStore` in its own store-boundary list.
- Trimmed the `production-queue` OpenSpec MODIFIED delta down from an accidental first draft that
  copy-pasted all 13 of the live spec's requirements to just the 8 that ACTUALLY changed — verified
  programmatically (a Python diff against the live spec, requirement-by-requirement) rather than by eye.
- Fixed 5 requirements `openspec validate --strict` flagged with "must contain SHALL or MUST": the
  validator's parser reads only the FIRST markdown line of a requirement's body as its indexed "text",
  and my manual ~100-column line-wrapping had pushed the word SHALL onto each one's wrapped SECOND line.
  Reworded the opening sentence of each (never the requirement title) so SHALL lands in the parsed
  first line — a real gotcha worth flagging for future slices that also hand-wrap long opening
  sentences.
- Every MODIFIED `### Requirement:` title in the `production-queue`/`sqlite-foundation` deltas is
  BYTE-IDENTICAL to the current live `openspec/specs/**/spec.md` (verified programmatically), per the
  brief's warning about `openspec archive`'s known MODIFIED-header trap — only requirement BODIES and
  `#### Scenario:` sub-headings were reworded.

### The concurrency verification (the thing the issue specifically asked me to prove, not assert)

1. **Genuinely concurrent, not sequential.** `claim-concurrency.test.ts` spawns two REAL, separate
   `node:child_process` processes (`fixtures/claim-worker.ts`), each opening its OWN `DatabaseSync`
   connection to the same on-disk file, synchronized via a parent-computed `startAt` wall-clock instant
   (each child spin-waits to it). `node:sqlite`'s calls are synchronous, so two same-process calls —
   even via `Promise.all` over two `async` functions — can never actually overlap; only two real OS
   processes can.
2. **Ran it repeatedly for flakiness, and reported the finding honestly rather than tuning it green.**
   Ran the three-test suite 16 times back to back (1 initial + 5 + 10, all logged in this session):
   **zero failures across all 48 individual test executions.** This is not "got lucky" — the safety
   property comes from SQLite's own writer serialization (a deterministic transactional guarantee: at
   most one write transaction holds the file's write lock at a time; `PRAGMA busy_timeout = 5000` makes
   the loser WAIT for it rather than error), not from favorable timing between the two spawned
   processes. Had it been flaky, that would have been reported here as a finding, not silently
   worked around.
3. **Broke it locally, watched it go red, restored it.** Temporarily replaced `claimJob`'s single
   atomic `UPDATE...WHERE...RETURNING` with a naive read-then-delay(150ms)-then-write (the literal
   shape of the OLD `data/queue.json` read-whole-file-then-write-whole-file bug this ticket exists to
   fix). Ran `claim-concurrency.test.ts` 3 times against the broken version: **"exactly one winner"
   failed all 3 times** (`AssertionError: expected 1, actual 2` — both spawned processes won the race).
   The other two concurrency tests ("lost update impossible" and "expired lock reclaimable") kept
   passing under the broken version, as expected — they don't exercise the SAME-row race the broken
   code fails on ("lost update" races on two DIFFERENT rows; "expired lock" is about elapsed time, not
   simultaneity). Restored via `git checkout -- src/production-queue/job-store.ts` and confirmed
   `npx tsc --noEmit` + the full concurrency suite were green again, byte-identical to before the
   experiment (`git diff` empty).

### Known limits

- **No SQL table holds real production data.** Every test seeds its own fixtures via `withTempDb`. The
  live `data/queue.json`'s 12 duplicate `(brand, idea, recipe)` triples are NOT deduplicated by this
  ticket — that is #204's (the one-shot importer's) job, explicitly named in the issue's own framing
  ("AC11 ... is about proving the shapes round-trip, not about migrating live data").
- **No existing production command is rewired onto any new store.** `data/queue.json` and every Brand's
  `ledger.json` stay exactly what the live pipeline reads/writes — the same posture #222/#223 left every
  other `{ db }` store in.
- **`JobStore` has no `renewLease`/heartbeat function.** A long-running worker that wants to extend its
  own lease before it expires has no primitive for that yet — not asked for by any AC; `releaseJob`/
  `requeueJob` cover the lifecycle this ticket's tests actually exercise.
- **`.claude/rules/always/organicgrowth-rules.md` Rule 7's store list is not extended** to name Job/
  GateRequest/Post/Performance — its existing text remains literally true (it never claimed to be
  exhaustive), and extending it risked its own pinned docs-test regex for no AC-driven reason.
