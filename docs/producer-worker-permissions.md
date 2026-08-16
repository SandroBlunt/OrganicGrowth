# Producer worker — unattended permission path + periodic-tick host (planned, not yet wired)

This document records two intended build decisions for the Producer background worker (ADR-0004): the
**permission path** meant to let the headless worker drive the Magnific Space without per-call approval,
and the **periodic-tick host** meant to reap async runs between Operator actions.

**Read this first:** both are **plans, not shipped runtime.** As of the 2026-07 audit there is no live
Magnific adapter, no worker host actually invoking `drain`/`tick`, and no wired permission path. Anywhere
older text below reads as "this works unattended today," treat it as the target design, not current
behaviour. The permission section has been corrected to say so plainly.

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

## The permission path — NOT YET WIRED

**Honest status:** the unattended-permission path is **not built**. There is nothing today that lets
`drain` or `tick` drive the live Space without a per-call prompt. This is a deferred step, and it is
coupled to the deferred live-Magnific adapter (there is no live adapter, no worker host, and no wired
permission — see the "Expectation gaps" in the 2026-07 audit). Do not read anything below as "this works
now."

### Why the earlier config did nothing

An earlier `.claude/permissions/producer-worker.json` used a home-grown schema
(`mode: allowlist`, `auto_approve`, `scope.space`). **No tool reads that file or that schema.** Claude
Code does not load `.claude/permissions/*.json`, so it never granted anything — the worker would still
have stalled at the first Space op. That file has been replaced with a clearly-labelled **example only**
(see below); it remains inert.

### The syntax that WOULD be needed (future step)

Real Claude Code tool permissions live in **`.claude/settings.json`** under `permissions.allow`, as
`mcp__<server>__<tool>` rules. To let the worker call the Magnific Space-mutating tools without a prompt,
that file would need a block like:

```jsonc
// .claude/settings.json (fragment) — future step, not active today
{
  "permissions": {
    "allow": [
      "mcp__magnific__spaces_edit",
      "mcp__magnific__spaces_run",
      "mcp__magnific__spaces_edit_status",
      "mcp__magnific__spaces_run_status",
      "mcp__magnific__spaces_state",
      "mcp__magnific__spaces_get_nodes",
      "mcp__magnific__creations_get",
      "mcp__magnific__creations_wait",
      "mcp__magnific__creations_search"
    ]
  }
}
```

A copy-ready version of this fragment lives, inert, at
**[`.claude/permissions/producer-worker.json`](../.claude/permissions/producer-worker.json)** as an
**example, not-yet-active** template. Enabling it means deliberately merging the fragment into the live
`.claude/settings.json` — a future, opt-in step, not something wired up now.

**Known limitation of this syntax:** an `mcp__magnific__*` allow rule grants the tool **regardless of its
arguments** — it cannot be scoped to a single Space id. The single-Space guarantee therefore has to come
from the worker / live adapter, not from the permission rule.

**Hermetic build note:** none of this affects the engineering build or its tests. They never touch the
live Space — they drive the **fake** Magnific Space at the `SpaceMcpPort` / `SpaceSession` boundary, so no
permission gate, no credits, and no board mutation are involved in CI. The permission story only matters
for the deferred live adapter, which is not built.

## The periodic-tick host: `/loop`

ADR-0004 makes the periodic tick **required, not optional**: Space runs are async and can finish while the
Operator is idle (no accept/pick to trigger a drain), so a light recurring tick must reap the completed
run and start the next queued job, or throughput stalls between Operator actions.

The **intended** default host for the tick is the **`/loop`** command — a build choice, **not yet wired**:
nothing currently invokes `drain`/`tick` on a schedule (see the audit's open question on the worker host).
As designed, `/loop` calls the
worker's `tick(deps)` (reap the in-flight op, then `drain` the next ready job) on a light recurring basis
between Operator actions. `tick` is a cheap no-op when nothing has completed and nothing is ready, so
running it on a schedule is safe. There is **no always-on daemon**: `drain` and `tick` are
drain-on-trigger / reap-on-tick tasks that start at most one Space op and exit.
