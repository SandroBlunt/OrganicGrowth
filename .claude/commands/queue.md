---
name: queue
description: "Show the Production Queue backlog for a named Brand: every queued job's Idea, phase, and status."
---

# /queue

Usage: `/queue <brand>`

Show the **Production Queue** — the serialized backlog of Magnific Space generations the Producer owns
(ADR-0004). Read-only: it lists what is queued, it does not start, advance, or publish anything.

`<brand>` is required. The global Production Queue (`data/queue.json`) is brand-agnostic (shared
across all Brands — the Space is the shared bottleneck, ADR-0004, ADR-0006). In a future slice,
`/queue <brand>` will filter and label jobs by Brand; today it shows the full global queue and notes
the active Brand for context.

## Steps

1. State the active Brand: "Production Queue for Brand: `<brand>`."
2. **Run** `npm run queue` (or call `queueCommand()` in `src/commands/queue.ts`).
3. It loads `data/queue.json` (the global queue, shared across all Brands) and renders each job with
   its `idea_id`, `phase` (`cast` | `render`), and `status` (`queued` | `running` | `awaiting_cast`
   | `done` | `failed`). An empty queue is reported as such.

## Guardrails
- **Brand is explicit** — `<brand>` is required; never fall back to a default Brand.
- Read-only — `/queue` never mutates the queue, the ledger, or the Magnific Space.
- The global Production Queue (`data/queue.json`) is shared across all Brands — this is intentional
  (the Space is the bottleneck, ADR-0004). Per-Brand filtering of queue jobs is a future slice.
- Each Brand's ledger (`data/brands/<slug>/ledger.json`) stays the source of truth for that Brand.
