---
name: pick-cast
description: >-
  Gate 2 — Cast pick: the Operator picks the Character (the nth Cast member) for an Idea of the named Brand whose Asset is paused at the Cast gate;
  the Producer then resumes the job in the Operator's session and renders the Asset one generation at a time.
---

# Pick Cast Workflow

**Gate 2 — Cast pick.** An Idea with an Asset **paused at the Cast gate** (`in_production`,
`pending_gate: "cast"` — ADR-0011) has its rendered **Cast** on the Brand's ledger. The Operator picks the **Character** to
render; the Producer then **resumes the job in the Operator's session** and renders it to completion, one
generation at a time (pins the Character, runs the clip run-point, saves the **Asset**). A gate-paused job
does not hold the Space. That Asset moves `in_production → produced`. OrganicGrowth **renders the Asset
but never publishes it.**

Usage: `pick-cast <brand> <idea-id> <n>`
  - `<brand>` is required — the Brand the Idea belongs to (e.g. `mundotip`).
  - `<idea-id>` is the Idea's ledger id.
  - `<n>` is the 1-based index of the Cast member to pick.

## Steps

1. **Run** `npm run pick-cast <brand> <idea-id> <n>` (or call `pickCastCommand()` in `src/commands/pick-cast.ts`).
2. It resolves the Brand's ledger (`data/brands/<slug>/ledger.json`), loads the Idea's recorded Cast, selects the nth candidate as the chosen Character, and writes it to the queue (`data/queue.json`).
3. The command outputs the selected Character and candidate local file path.
4. **Resume render:** Producer resumes the job in the Operator's session and renders one generation at a time to produce the Asset.

## Guardrails
- **Brand is explicit** — `<brand>` is required.
- The Operator picks the Character — the Producer never picks for them.
- Nothing renders past this gate until the Operator picks.
