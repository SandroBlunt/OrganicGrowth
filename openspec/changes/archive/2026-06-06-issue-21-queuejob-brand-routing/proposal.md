## Why

Slices 1 and 2 of the multi-brand work established the Brand resolver and made every command accept
an explicit `<brand>` argument. However, **the Production Queue is still brand-blind**: every
enqueued job carries only `idea_id`, `phase`, `status`, and `enqueued_at`. When several Brands have
accepted Ideas, the single shared global queue has no way to route each completed generation back to
the correct Brand's ledger — the worker and render path would have to guess, or resort to an
"active-brand" ambient state that the design explicitly rejects (CONTEXT.md: "There is **no global
'active brand' pointer file**").

This slice closes that gap: **every job carries the Brand it belongs to**. The queue path stays a
global constant (ADR-0004, ADR-0006 — one lock, one queue, shared across all Brands); only the jobs
gain a `brand` field. The worker and render path derive the ledger path from `job.brand` via the
resolver for every status write, so draining the global queue routes correctly even with several
Brands' jobs in flight. A job with a missing or unresolvable Brand is dropped with a logged warning
rather than crashing the drain. The `/queue` command labels each job with its Brand and can filter
the global queue to one Brand.

## What Changes

### `QueueJob` type — required `brand` field

`src/production-queue/queue.ts`: `QueueJob` gains a **required** `readonly brand: string` field.
The documented job-shape comment at the top of the file is updated. `enqueue` and `enqueueRender`
each gain a `brand` parameter and stamp it on the job they create. The idempotency guards
(`hasJobFor`, `hasJobOfPhase`) are unchanged — they are still keyed by `idea_id`.

### `parseJob` — brand validation + defensive drop

`src/production-queue/store.ts`: `parseJob` validates the new `brand` field (a non-empty string)
and returns `null` (dropping the job) if it is absent or empty — matching the existing defensive
pattern for `idea_id`. The brand is NOT resolved against the filesystem here; resolution happens
at the drain/worker level, not at parse time. A logged warning accompanies every drop so the
Operator can diagnose corrupt queue entries.

### Auto-enqueue-on-accept — brand-stamped job

`src/production-queue/enqueue-on-accept.ts`: `planEnqueue` / `enqueueOnAccept` gain a `brand`
parameter and pass it to `enqueue`, so the queued cast job is stamped with the Brand on creation.
`EnqueueOnAcceptOptions` keeps its existing path overrides; `brand` is a required first argument
on the public API.

### Worker — brand-routed ledger writes

`src/production-queue/worker.ts`: The `WorkerDeps` interface's `LedgerWrites` continues to be
injected for ledger writes, but the brand-routing FACTORY is now an additional injected dependency:
a `resolveLedger(brand: string) => LedgerWrites` function. The worker reads `job.brand` off each
job and calls `resolveLedger(job.brand)` to get the brand-scoped ledger writers for that job —
never from session/ambient state. If `job.brand` is missing (defensive, belt-and-suspenders), the
job is dropped with a notification.

In practice the `LedgerWrites` interface (writeCast, writeAsset, writeStatus) is a thin boundary
that the real implementation wires to brand-scoped ledger paths via the resolver; the worker remains
unchanged in structure — it is still thin orchestration, and the ledger-write implementations are
still injected. This slice introduces a brand-aware ledger-writes factory into the injected
`WorkerDeps` so the worker can get the right ledger writers per job.

### `/pick-cast` — brand-stamped render job

`src/commands/pick-cast.ts`: `pickCastCommand` already receives `brand`; it now passes `brand` to
`enqueueRender`, so the render job is also brand-stamped. The queue path stays the global constant.

### `/queue` command + renderer — brand label + filter

`src/commands/queue.ts` and `src/production-queue/render.ts`:

- `renderQueue` gains an optional `brandFilter` parameter. When supplied, it only shows jobs for
  that Brand; otherwise it shows all jobs. Each job line now includes the Brand label.
- The `/queue <brand>` command reads the global queue and passes the `<brand>` arg as the filter
  (the Operator always operates per-Brand).
- The command also supports a `--all` flag or an omitted-brand mode to show all jobs (useful for
  the Operator to see the full global backlog).

### Tests

New and updated tests in:

- `src/production-queue/store.test.ts` — `parseJob` brand round-trip + defensive drop on missing/empty brand.
- `src/production-queue/queue.test.ts` — `enqueue` and `enqueueRender` stamp the brand; round-trip.
- `src/production-queue/enqueue-on-accept.test.ts` — `planEnqueue` carries brand to the job.
- `src/production-queue/worker.test.ts` — brand-routed ledger writes; gate-doesn't-hold-Space across Brands.
- `src/production-queue/render.test.ts` — brand label in output; brand filter.
- `src/commands/pick-cast.test.ts` — render job carries brand.

All tests use the fake Magnific Space (no live `spaces_*`/`creations_*`, no credits, no board mutation).

## Capabilities

### Modified Capabilities

- `production-queue`: `QueueJob` gains a required `brand` field. `parseJob` validates and defensively
  drops brandless jobs. `enqueue` and `enqueueRender` accept and stamp a Brand. Auto-enqueue-on-accept
  takes the Brand and stamps it. The worker reads `job.brand` and routes ledger writes via the resolver —
  never from session/active-brand state. The gate-never-holds-the-Space and single-Space lock
  invariants are preserved across Brands.

- `brand-commands`: The `/queue` command labels each job with its Brand and accepts an optional Brand
  filter, so the Operator can view the global queue or a single Brand's slice of it.
