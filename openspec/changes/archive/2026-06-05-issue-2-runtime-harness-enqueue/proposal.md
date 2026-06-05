## Why

OrganicGrowth has **no application code today** — it is `CLAUDE.md` + `.claude/agents` +
`.claude/commands` + plain data files. The Producer feature (PRD #1) needs a real code layer to live
in. This slice stands up that first layer (Node + TypeScript, per `openspec/project.md`) and delivers
the thinnest live path through it: per ADR-0004, **accepting an Idea auto-enqueues it for production**,
and a new `/queue` command shows the backlog. Every later Producer slice (Production Spec generation,
Execution Protocol, cast/render, the drain worker) builds on this harness and on the
`data/queue.json` state file introduced here.

## What Changes

- **Stand up the Node + TypeScript runtime** — `package.json`, `tsconfig.json`, and a test runner,
  with `openspec` wired in as a dev dependency. This establishes the
  orchestration-shell ⇄ deep-module ⇄ state-file pattern the rest of the feature follows.
- **Introduce the `data/queue.json` state file** — the **Production Queue**: an ordered list of jobs
  `{ idea_id, phase, status, enqueued_at }` plus a single-active-run lock, with a documented job shape
  and ISO-8601 timestamps.
- **Auto-enqueue accepted Ideas** — a pure deep module that appends a `cast`-phase, `status: queued`
  job for an accepted Idea. Re-accepting the same Idea does not duplicate its job. Only accepted Ideas
  ever enter the queue; rejected Ideas never produce a job (credits are spent only on accepted Ideas).
  The `/review-ideas` accept path is extended to call this on accept.
- **Add the `/queue` command** — lists every job with its `idea_id`, `phase`, and `status`.

This slice is the queue **plumbing** only. The `producer` agent, the Magnific Space integration, and
the readiness / single-Space-concurrency drain logic are **out of scope** and land in later slices —
the scheduler here is just `enqueue` + `list`.

## Capabilities

### New Capabilities

- `production-queue`: the serialized backlog of Space generations the Producer owns. This slice
  establishes its state file (`data/queue.json` with a single-active-run lock), the auto-enqueue
  behavior on Idea acceptance (append + no-duplicate, accepted-only), and `/queue` visibility. FIFO
  ordering, drain, and concurrency are introduced by later slices.

## Impact

- **New runtime:** `package.json`, `tsconfig.json`, test-runner config, `.gitignore` update for
  `node_modules` / build output. No change to `.env` handling.
- **New code:** a pure deep module for queue read/write/enqueue, an orchestration entry that wires
  enqueue into the accept path, and a `/queue` renderer.
- **New state:** `data/queue.json` (seeded empty: no jobs, lock free).
- **Modified command:** `.claude/commands/review-ideas.md` accept step now auto-enqueues; new
  `.claude/commands/queue.md`.
- **No external calls:** no Magnific (`spaces_*` / `creations_*`) and no Apify in this slice. The
  build stays hermetic — there is no Space interaction to fake yet.
- **Always-rules upheld:** the ledger stays canonical (queue derives from accepted Ideas, never the
  reverse); nothing is published; rejected Ideas cost nothing.
