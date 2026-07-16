---
name: queue
description: "Show the Production Queue backlog for a named Brand: every queued job's Idea, Recipe, gate cursor, and status."
---

# /queue

Usage: `/queue <brand>`

Show the **Production Queue** — the serialized backlog of Magnific Space generations the Producer owns
(ADR-0008). Read-only: it lists what is queued, it does not start, advance, or publish anything.

`<brand>` is required. The global Production Queue (`data/queue.json`) is brand-agnostic (shared
across all Brands — the single attended Operator is the bottleneck, working one Space generation at a
time in their own session, ADR-0008, ADR-0006). `/queue <brand>`
filters the queue to that Brand's jobs and labels every job line with its Brand (shipped in issue
#21). The underlying command can show the full global queue when called with `--all` or no Brand,
but this command doc always names a Brand.

## Steps

1. State the active Brand: "Production Queue for Brand: `<brand>`."
2. **Run** `npm run queue <brand>` (or call `queueCommand(<brand>)` in `src/commands/queue.ts`).
3. It loads `data/queue.json` (the global queue, shared across all Brands), filters to Brand
   `<brand>`'s jobs, and renders each with its Brand label, `idea_id`, `recipe` (the chosen Recipe this
   job produces — ADR-0009/0011), its generic `gate` cursor (the gate name this leg's Space run works
   toward, or `final` when this leg renders the Asset with no further gate — issue #56), and `status`
   (`queued` | `running` | `awaiting_pick` | `done` | `failed`). An empty queue (or one with no jobs for
   this Brand) is reported as such.

   The queue is keyed on the composite `(brand, idea, recipe)` — one Idea's several chosen Recipes each
   get their own job(s), never collapsed or masked by one another (ADR-0011, issue #56).

## Guardrails
- **Brand is explicit** — `<brand>` is required; never fall back to a default Brand.
- Read-only — `/queue` never mutates the queue, the ledger, or the Magnific Space.
- The global Production Queue (`data/queue.json`) is shared across all Brands — this is intentional
  (the single attended Operator is the bottleneck, working one Space generation at a time, ADR-0008).
  Per-Brand filtering and labeling of queue jobs has shipped: `/queue <brand>` shows only that Brand's
  jobs.
- Each Brand's ledger (`data/brands/<slug>/ledger.json`) stays the source of truth for that Brand.
