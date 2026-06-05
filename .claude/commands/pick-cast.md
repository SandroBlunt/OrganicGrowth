---
name: pick-cast
description: "Gate 2 — Cast pick: the Operator picks the Character (the nth Cast member) for a casting Idea; the Producer then queues the render and renders the Asset unattended when the Space is free."
---

# /pick-cast

**Gate 2 — Cast pick.** A `casting` Idea is paused at the Cast gate with its rendered **Cast** on the
ledger. The Operator picks the **Character** to render; the Producer **queues the render**, then renders
to completion *unattended* when the Space is free (pins the Character, runs the clip run-point, saves the
**Asset**). Status moves `casting → produced`. OrganicGrowth **renders the Asset but never publishes it.**

Usage: `/pick-cast <idea-id> <n>`  — `<n>` is the 1-based index of the Cast member to pick.

## Steps

1. **Run** `npm run pick-cast <idea-id> <n>` (or call `pickCastCommand()` in `src/commands/pick-cast.ts`).
2. It loads the Idea's recorded **Cast** from `data/ledger.json`, selects the **nth** (1-based) Cast
   member as the chosen **Character**, records the pick, and **enqueues the render** on the Production
   Queue. An unknown Idea, an Idea with no Cast, or an out-of-range `<n>` returns an identifiable,
   non-crashing message — it never invents a Character.

## Guardrails
- The Operator picks the Character — the Producer never picks for them (this is a human gate).
- Nothing renders past this gate until the Operator picks; the render then runs unattended.
- The ledger (`data/ledger.json`) is the source of truth; every status change is written to it.
