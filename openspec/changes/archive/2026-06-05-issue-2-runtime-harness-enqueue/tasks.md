## 1. Runtime harness (Node + TypeScript)

- [x] 1.1 Add `package.json` with `build`, `test`, and `queue` scripts; add `typescript` and the test
  runner as dev dependencies; add `openspec` as a dev dependency.
- [x] 1.2 Add `tsconfig.json` (strict mode, ESM, `src/` → `dist/`).
- [x] 1.3 Update `.gitignore` for `node_modules/` and `dist/`.
- [x] 1.4 Add an initial passing unit test so `npm test` runs green, proving the runner is wired.

## 2. Production Queue state file + job shape

- [x] 2.1 Seed `data/queue.json` empty: `{ "jobs": [], "lock": { "active_job": null } }`.
- [x] 2.2 Define and document the job shape and lock in the queue deep module
  (`{ idea_id, phase: cast|render, status: queued|running|awaiting_cast|done|failed, enqueued_at }`,
  ISO-8601 `enqueued_at`).

## 3. Enqueue deep module (test-first, pure)

- [x] 3.1 Write failing tests against a fixture queue state: enqueue appends one `queued` `cast`-phase
  job for a given `idea_id`; re-enqueueing the same `idea_id` does not duplicate; the result is a new
  state object (no mutation of input); `enqueued_at` is ISO-8601.
- [x] 3.2 Implement the pure `enqueue(state, ideaId, now) → newState` deep module to pass the tests.
- [x] 3.3 Write a failing test that enqueue is rejected for an Idea whose ledger status is not
  `accepted` (rejected Ideas never produce a job), then implement the accepted-only guard.

## 4. Queue I/O (read/write `data/queue.json`)

- [x] 4.1 Write tests (against a temp file) that load/save round-trips the queue state and that a
  missing file loads as the empty queue.
- [x] 4.2 Implement pure-ish load/save helpers (defensive parse; missing file → empty queue).

## 5. Orchestration shell — enqueue on accept

- [x] 5.1 Write a test that the accept entry, given an accepted `idea_id`, reads the queue, enqueues,
  and persists exactly one job (and is idempotent on re-accept).
- [x] 5.2 Implement the thin `enqueueOnAccept(ideaId)` shell wiring load → enqueue → save, validating
  the Idea is `accepted` in the ledger first.
- [x] 5.3 Extend `.claude/commands/review-ideas.md` accept step to auto-enqueue (ADR-0004).

## 6. `/queue` command (list)

- [x] 6.1 Write a test that the list renderer prints each job's `idea_id`, `phase`, and `status`
  (and an empty-queue message when there are no jobs).
- [x] 6.2 Implement the `/queue` renderer (pure formatter + thin CLI entry).
- [x] 6.3 Add `.claude/commands/queue.md`.

## 7. Self-review

- [x] 7.1 `openspec validate --strict` green.
- [x] 7.2 `npm test` green; `npm run build` green.
- [x] 7.3 Simplify / dead-code pass; confirm each acceptance criterion maps to a specific test.
- [x] 7.4 Write the Build Report into `handoff.md`.
