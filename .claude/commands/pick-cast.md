---
name: pick-cast
description: "Gate 2 — Cast pick: the Operator picks the Character (the nth Cast member) for a casting Idea of the named Brand; the Producer then resumes the job in the Operator's session and renders the Asset one generation at a time."
---

# /pick-cast

**Gate 2 — Cast pick.** A `casting` Idea is paused at the Cast gate with its rendered **Cast** on the
Brand's ledger. The Operator picks the **Character** to render; the Producer then **resumes the job in
the Operator's session** and renders it to completion, one generation at a time (pins the Character, runs
the clip run-point, saves the **Asset**). A gate-paused job does not hold the Space. Status moves
`casting → produced`. OrganicGrowth **renders the Asset but never publishes it.**

> **Target (multi-format — ADR-0009/0010):** the Cast pick is the *Character Explainer with Cast*
> Recipe's local pick-gate; it generalizes to any Recipe's pick-gate, and `/pick-cast` becomes a
> friendly alias for a generic "submit a pick" command. Not built yet — today the pick is Cast-only.

Usage: `/pick-cast <brand> <idea-id> <n>`
  - `<brand>` is required — the Brand the Idea belongs to (e.g. `mundotip`).
  - `<n>` is the 1-based index of the Cast member to pick.

**Gate 2 — Brand: `<brand>`.** The Operator is picking a Character for Brand `<brand>`. The chosen
Character is written onto the Idea's enqueued **render job** in the global Production Queue
(`data/queue.json`) as a `character` field — **not** onto the ledger. The Producer pins that Character
when it resumes the job in the Operator's session. The ledger still owns the Idea's status
(`casting → produced`); the pick itself lives on the queue job.

## Steps

1. **Run** `npm run pick-cast <brand> <idea-id> <n>` (or call `pickCastCommand()` in `src/commands/pick-cast.ts`).
2. It resolves the Brand's ledger via the Brand resolver (`data/brands/<slug>/ledger.json`), loads the
   Idea's recorded **Cast**, selects the **nth** (1-based) Cast member as the chosen **Character**, and
   **writes that Character onto the Idea's render job** in the global Production Queue
   (`data/queue.json`). The command **refuses the pick unless the Idea is at the Cast gate** (ledger
   status `casting`); an unknown Idea, an Idea not in `casting`, an Idea with no Cast, or an
   out-of-range `<n>` returns an identifiable, non-crashing message — it never invents a Character.
   A **re-pick** on an Idea whose Character is already set reports "no change; earlier pick stands"
   rather than claiming a fresh render was queued.
3. The output restates the active Brand: "Brand: `<brand>`" so the Operator can confirm the pick is
   for the correct Brand.

> **How the render runs:** once the pick is in, the Producer resumes the job **in the Operator's
> session** and renders it one generation at a time — there is no unattended background worker
> (ADR-0008). This command only records the Character on the queue job; recording the pick does not
> move the Idea to `produced` on its own — the Producer does that when it resumes the job. A
> gate-paused job does not hold the Space.

## Guardrails
- **Brand is explicit** — `<brand>` is required; never fall back to a default Brand.
- The Operator picks the Character — the Producer never picks for them (this is a human gate).
- Nothing renders past this gate until the Operator picks; the Producer then resumes the render in the
  Operator's session, one generation at a time.
- The Brand's ledger (`data/brands/<slug>/ledger.json`) is the source of truth; every status change
  is written to it. The global Production Queue (`data/queue.json`) is brand-agnostic.
