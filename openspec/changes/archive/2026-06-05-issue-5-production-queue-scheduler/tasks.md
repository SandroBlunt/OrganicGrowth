## 1. Scheduler readiness (test-first, pure)

- [x] 1.1 Write failing tests (`scheduler.test.ts`): `nextReady` returns the earliest-`enqueued_at`
  `queued` job (FIFO proven against fixtures with distinct timestamps AND scrambled array order, not
  insertion order); returns nothing for an empty/no-queued queue.
- [x] 1.2 Write failing tests: `nextReady` returns nothing while any job is `running` (single-Space
  lock — ≤1 running ever); skips `awaiting_cast` and returns the next `queued` job; skips `failed` and
  returns a later `queued` job (failure does not block successors).
- [x] 1.3 Implement `nextReady(state) → QueueJob | null` in `src/production-queue/scheduler.ts`: pure,
  reads `enqueued_at` for FIFO, returns null while a job is `running` or the lock is held, considers only
  `queued` jobs (skips `awaiting_cast` / `done` / `failed`).

## 2. mark* lifecycle transitions + lock (test-first, pure)

- [x] 2.1 Write failing tests: `markRunning` (`queued → running`, sets lock; refuses a second start while
  the lock is held); `markAwaitingCast` (`running → awaiting_cast`, releases lock); `markDone`
  (`running → done`, releases lock); `markFailed` (`running → failed`, releases lock). Plus purity
  (input unmutated via `JSON.stringify` snapshot), unknown-Idea refusal, and invalid-prior-status
  refusal leaving the queue unchanged.
- [x] 2.2 Implement `markRunning` / `markAwaitingCast` / `markDone` / `markFailed` in `scheduler.ts`:
  pure (new state, no mutation, no clock), maintain the single-active-run lock (set on running, release
  on awaiting_cast/done/failed), return an identifiable refusal on unknown Idea / invalid prior status.

## 3. Queue → ledger reflection (test-first, pure mapper + thin shell)

- [x] 3.1 Write failing tests (`ledger.test.ts`): `ledgerStatusForTransition` maps a `cast`→`awaiting_cast`
  job to `casting`, a `render`→`done` job to `produced`, and everything else (`running`, any `failed`,
  `cast`→`done`) to `null` (no ledger change). `applyIdeaStatus` purely sets one Idea's status and
  changes no other. The write shell round-trips: an `accepted` Idea reads `casting` after applying the
  cast-gate reflection; the ledger file stays well-formed.
- [x] 3.2 Implement `ledgerStatusForTransition` (pure), `applyIdeaStatus` (pure, new array), and the thin
  `writeIdeaStatus` shell (load → apply → save) in `src/ledger/ledger.ts` — adding a minimal full-record
  ledger loader/saver. The ledger stays canonical; status is reflected from the queue transition, never
  inferred.

## 4. Self-review

- [x] 4.1 `npx openspec validate issue-5-production-queue-scheduler --strict` green.
- [x] 4.2 `npm test` green; `npm run build` (`tsc -p tsconfig.build.json`) exit 0.
- [x] 4.3 Simplify / dead-code pass; confirm each acceptance criterion maps to a specific named test.
- [x] 4.4 Write the Build Report into `handoff.md`.
