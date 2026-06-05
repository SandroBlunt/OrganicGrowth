## 1. Magnific fake — async start-then-poll SpaceSession (test-first scaffolding)

- [x] 1.1 Extend `src/space-driver/fixtures/fake-space.ts` with a `FakeSpaceSession` that models a single
  in-flight Space op as **start-then-poll**: `start(job)` kicks off a cast-gen or a render (over the
  existing `FakeSpace` port, hermetically) and returns a handle without blocking to completion; `poll()`
  returns `running` until the op is advanced, then the terminal outcome (a Cast for a cast-gen, an Asset
  for a render, or a modelled failure). NO live `spaces_*`/`creations_*`, NO credits, NO board mutation,
  NO network — this IS the Magnific fake.

## 2. enqueueRender — picking a Cast enqueues the render (test-first)

- [x] 2.1 Write failing tests (`queue.test.ts`): `enqueueRender(state, ideaId, now)` appends exactly one
  `phase: render`, `status: queued` job for the Idea; it is idempotent per `idea_id` for a render job (a
  second call adds no duplicate render job); it is pure (new state, input unchanged); `enqueued_at` is the
  injected timestamp, never the clock. The prior cast job for the same Idea is preserved.
- [x] 2.2 Implement `enqueueRender(state, ideaId, now)` in `src/production-queue/queue.ts`, mirroring
  `enqueue` but with `phase: render` and render-phase idempotency. `enqueue` (cast) is unchanged.

## 3. Worker drain — serialized, single Space op at a time (test-first)

- [x] 3.1 Write failing tests (`worker.test.ts`): `drain(deps)` with a free Space and a ready `queued`
  cast job marks exactly that job `running` (taking the single-Space lock), starts ONE Space op through
  the `SpaceSession`, and exits — it starts **at most one** op (never two Space ops at once), even with
  several ready jobs. A `drain` with the Space busy, or with no ready job, is a clean no-op. FIFO: the
  earliest-`enqueued_at` ready job is the one started.
- [x] 3.2 Implement `drain(deps)` in `src/production-queue/worker.ts`: loop `nextReady` → `markRunning`
  (persist queue) → `SpaceSession.start` for that job → persist; since the Space is then busy, `nextReady`
  returns null and `drain` exits. No daemon, no busy-wait. Returns a summary of the job it started (or
  none).

## 4. Worker tick — reap an async op, advance the queue unattended (test-first)

- [x] 4.1 Write failing tests: with a render started and still in-flight, `tick(deps)` does nothing
  (polls `running`). With the in-flight render advanced to terminal, `tick(deps)` reaps it: `markDone`,
  `writeIdeaAsset`, `writeIdeaStatus("produced")` (status derived from `ledgerStatusForTransition` for
  `render → done`), the lock releases, and the next queued job is started — with NO Operator action. A
  cast-gen reaching the Cast gate is reaped as `markAwaitingCast` + `writeIdeaCast` +
  `writeIdeaStatus("casting")`, releasing the lock.
- [x] 4.2 Implement `tick(deps)`: poll the in-flight op; if `running`, return. If terminal, reap by phase
  (cast → awaiting_cast + cast/casting ledger writes; render → done + asset/produced ledger writes;
  failure → failed + notify), persist queue + ledger, then call `drain(deps)` to start the next ready job.

## 5. Gate releases the Space — a later cast-gen proceeds while a gated Idea waits (test-first)

- [x] 5.1 Write failing tests: two accepted Ideas. `drain` starts the first cast-gen; the Space is busy so
  the second does not start (serialized). A `tick` reaps the first to the Cast gate (`awaiting_cast`),
  releasing the lock, and starts the second Idea's cast-gen while the first waits at the gate. The gated
  Idea is never re-run; exactly one Space op is ever in flight.

## 6. Pick-cast enqueues the render and the worker renders it (test-first)

- [x] 6.1 Write failing tests (`pick-cast.test.ts` + `worker.test.ts`): after `/pick-cast` records the
  chosen Character, a `render`-phase job is enqueued for the Idea; a worker `drain` (Space free) starts the
  render and a `tick` reaps it to a finished Asset with `casting → produced` written to the ledger. The
  Producer takes no publish action.
- [x] 6.2 Wire `src/commands/pick-cast.ts` to enqueue the render (via `enqueueRender`) after the pure
  `selectCharacter`, keeping the pure selection + messaging testable without I/O. The `/pick-cast` message
  already states "render queued"; make it real.

## 7. Failure isolation + notification (test-first)

- [x] 7.1 Write failing tests: a Space op that fails (e.g. an unconfirmed inject / a failed render) is
  reaped by `tick` as `markFailed` (the job stays `failed` in the queue), the lock releases, the queue
  continues with the next job on the next `drain`/`tick`, and the injected Operator `notify` is called with
  **when** (an injected ISO-8601 timestamp) and **why** (the driver's failure `code`/`message`). The failed
  Idea's ledger status is NOT advanced (no fabricated Cast/Asset).

## 8. /queue reflects all five statuses (test-first)

- [x] 8.1 Write a failing test (`queue.test.ts` or `worker.test.ts`): the `/queue` renderer shows jobs in
  each of `queued`, `running`, `awaiting_cast`, `done`, and `failed` — proving the Operator sees all five
  worker statuses. (Reuses the existing `renderQueue`; this asserts coverage of the five.)

## 9. Unattended permission path (config + docs)

- [x] 9.1 Add `.claude/permissions/producer-worker.json` — a real allowlist config granting the background
  worker non-auto permission to `spaces_edit`/`spaces_run` (the spike's blocker).
- [x] 9.2 Add `docs/producer-worker-permissions.md` documenting the permission path, the default
  periodic-tick host (`/loop`), and how it resolves `docs/producer-spikes-results.md`'s flagged blocker.
- [x] 9.3 Reference both from the worker module doc-comment so the path is discoverable from code.

## 10. Self-review

- [x] 10.1 `npx openspec validate issue-8-producer-worker-drain-tick --strict` green.
- [x] 10.2 `npm test` green; `npm run build` exit 0.
- [x] 10.3 Simplify / dead-code pass; confirm each of the 6 acceptance criteria maps to a specific named
  test.
- [x] 10.4 Write the Build Report into `handoff.md`.
