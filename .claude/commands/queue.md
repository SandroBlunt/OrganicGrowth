---
name: queue
description: "Show the Production Queue backlog: every job's Idea, phase, and status."
---

# /queue

Show the **Production Queue** — the serialized backlog of Magnific Space generations the Producer owns
(ADR-0004). Read-only: it lists what is queued, it does not start, advance, or publish anything.

Usage: `/queue`

## Steps

1. **Run** `npm run queue` (or call `queueCommand()` in `src/commands/queue.ts`).
2. It loads `data/queue.json` and renders each job with its `idea_id`, `phase` (`cast` | `render`),
   and `status` (`queued` | `running` | `awaiting_cast` | `done` | `failed`). An empty queue is
   reported as such.

## Guardrails
- Read-only — `/queue` never mutates the queue, the ledger, or the Magnific Space.
- The ledger (`data/ledger.json`) stays the source of truth; the queue is derived from accepted Ideas.
- In this slice the scheduler is `enqueue` + `list` only; FIFO drain and single-Space concurrency
  arrive in a later slice.
