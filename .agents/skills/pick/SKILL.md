---
name: pick
description: >-
  The generic gate-resume command: submit the Operator's resolved pick for ANY wired Recipe's ANY declared gate and resume production.
---

# Pick Workflow (Generic Gate Resume)

Usage: `pick <brand> <idea-id> <recipe> <gate> <pick>`
  - `<brand>` is required — the Brand the Idea belongs to.
  - `<idea-id>` is the Idea's ledger id.
  - `<recipe>` is the chosen Recipe slug (e.g. `character-explainer-with-cast`).
  - `<gate>` is the gate name (e.g. `cast`).
  - `<pick>` is the Operator's resolved pick identifier.

## Steps

1. **Run** `npm run pick <brand> <idea-id> <recipe> <gate> <pick>` (or call `pickCommand()` in `src/commands/pick.ts`).
2. Resolves next gate from Recipe registry, enqueues next-leg job carrying `<pick>`, and clears `<gate>`.
3. Producer resumes job attended in the Operator's session and drives the next generation.
