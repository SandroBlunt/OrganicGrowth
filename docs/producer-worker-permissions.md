# Producer worker — unattended permission path + periodic-tick host

This document records two build decisions for the Producer background worker (ADR-0004; built in
Slice 7 / issue #8): the **permission path** that lets the headless worker drive the Magnific Space
without per-call approval, and the **periodic-tick host** that reaps async runs between Operator actions.

## The blocker (from the spike)

`docs/producer-spikes-results.md` flagged a hard constraint for any unattended Producer run:

> each `spaces_edit` (and `spaces_run`) is auto-denied by the Claude Code permission classifier as
> "modifying shared infrastructure" and needs explicit per-action operator approval — **even with blanket
> verbal consent**. … a headless queue worker will hit this gate. … the Producer needs a permission path
> (allowlist rule / non-auto permission mode) or it cannot drain the queue unattended.

The worker's whole point (ADR-0004) is to drain the Production Queue **without the Operator babysitting
runs**. Every cast-gen injects the Production Spec (a `spaces_edit`) and runs the cast run-point (a
`spaces_run`); every render pins the Character (`spaces_edit`) and runs the clip run-point (`spaces_run`).
Without a permission path, each of those would block on a manual approval — so the worker would stall at
the first Space op of every job.

## The permission path

The allowlist lives at **[`.claude/permissions/producer-worker.json`](../.claude/permissions/producer-worker.json)**.
It is a **non-auto permission mode / allowlist** that grants the background worker permission to call the
Space-mutating MCP tools (`spaces_edit` / `spaces_run`, plus the status/read/creation tools the driver
polls) **without per-call approval**, scoped to the Producer's pre-defined Space and to those tools only.
Everything outside the allowlist stays on the default classifier.

This is what lets `drain` and `tick` run the driver end to end unattended. The worker code references this
file from its module doc-comment (`src/production-queue/worker.ts`) so the path is discoverable from the
code that depends on it.

**Hermetic build note:** this permission path matters only for the **live** Magnific adapter (deferred).
The engineering build and its tests never touch the live Space — they drive the **fake** Magnific Space at
the `SpaceMcpPort` / `SpaceSession` boundary, so no permission gate, no credits, and no board mutation are
involved in CI. The config is shipped now so the deferred live adapter has the permission path ready.

## The periodic-tick host: `/loop`

ADR-0004 makes the periodic tick **required, not optional**: Space runs are async and can finish while the
Operator is idle (no accept/pick to trigger a drain), so a light recurring tick must reap the completed
run and start the next queued job, or throughput stalls between Operator actions.

The chosen default host for the tick is the **`/loop`** command — a build choice. `/loop` calls the
worker's `tick(deps)` (reap the in-flight op, then `drain` the next ready job) on a light recurring basis
between Operator actions. `tick` is a cheap no-op when nothing has completed and nothing is ready, so
running it on a schedule is safe. There is **no always-on daemon**: `drain` and `tick` are
drain-on-trigger / reap-on-tick tasks that start at most one Space op and exit.
