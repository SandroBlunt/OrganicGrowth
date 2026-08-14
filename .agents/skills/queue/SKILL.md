---
name: queue
description: >-
  Show the Production Queue backlog for a named Brand: every queued job's Idea, Recipe, gate cursor, and status.
---

# Queue Workflow

Usage: `queue <brand>`

Show the **Production Queue** — the serialized backlog of Magnific Space generations the Producer owns (ADR-0008). Read-only: it lists what is queued, it does not start, advance, or publish anything.

## Steps

1. State active Brand: `Production Queue for Brand: <brand>`.
2. Run `npm run queue <brand>` (or call `queueCommand(<brand>)`).
3. Loads `data/queue.json`, filters to Brand `<brand>`'s jobs, and outputs table of `idea_id`, `recipe`, `gate` cursor, and `status`.
