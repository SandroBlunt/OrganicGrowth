# Producer owns a serialized, auto-enqueued background Production Queue

**Status:** accepted — extends ADR-0003 (the Producer execution model).

The Magnific Space runs **one generation at a time** (no parallelism). With several Ideas accepted in a
Run, their generations must be serialized. We decided the `producer` owns this as a **Production Queue**,
and that production starts on its own rather than via an explicit operator command.

**Decision**

- **Auto-enqueue on accept.** Accepting an Idea at Review enqueues it for production — no separate
  `/produce` kickoff. (This overrides the explicit-kickoff default considered under ADR-0003.) `/queue`
  gives the Operator visibility into the backlog.
- **Single Space concurrency.** Only **one** Space-busy operation (a cast-gen or a render) runs at a
  time. The Producer holds a lock around Space runs; everything else waits in the queue.
- **Gates do not hold the Space.** An Idea paused at its **Cast** gate (awaiting the Operator's
  Character pick) releases the Space. The Producer advances the next queued cast-gen meanwhile, and
  queues the **render** only once a Character is picked. This keeps the Space busy instead of idling on
  a human wait.
- **Worker = drain-on-trigger task.** Each trigger (an Idea accepted, or a cast picked) spawns a
  **background task** that processes every Space-ready job until the queue is empty or all remaining
  jobs are gate-blocked, then exits. There is **no always-on daemon**.
- **A periodic tick is required, not optional.** Because renders are async and can finish while the
  Operator is idle (no accept/pick to trigger a drain), a light recurring tick must reap completed runs
  and start the next queued job. Without it, throughput stalls between operator actions.
- **FIFO by acceptance order.** When several jobs are ready, the earliest-accepted goes first. (Fit
  Score priority was considered and deferred.)
- **Failure is isolated per job.** A failed generation is marked `failed` and surfaced to the Operator;
  the queue continues with the next job rather than blocking.

**Why:** the Space's single-concurrency is a hard external constraint, so serialization is mandatory;
auto-enqueue + background drain delivers "produce as soon as accepted" without the Operator babysitting
runs; drain-on-trigger fits a file-state terminal system (restartable, no daemon to keep alive) better
than a long-lived worker; FIFO is predictable for an MVP.

**Consequences**

- New state file `data/queue.json` (job = `{idea_id, phase: cast|render, status: queued|running|
  awaiting_cast|done|failed, enqueued_at, ...}`) plus a single-active-run lock.
- The periodic tick needs a host mechanism (e.g. a scheduled drain) — a build decision.
- Ledger and queue must stay consistent: `casting`/`produced` transitions are written as jobs complete.
