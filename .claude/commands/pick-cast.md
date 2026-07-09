---
name: pick-cast
description: "Gate 2 — Cast pick: the Operator picks the Character (the nth Cast member) for a casting Idea of the named Brand; the Producer then queues the render and renders the Asset unattended when the Space is free."
---

# /pick-cast

**Gate 2 — Cast pick.** A `casting` Idea is paused at the Cast gate with its rendered **Cast** on the
Brand's ledger. The Operator picks the **Character** to render; the Producer **queues the render**, then
renders to completion *unattended* when the Space is free (pins the Character, runs the clip run-point,
saves the **Asset**). Status moves `casting → produced`. OrganicGrowth **renders the Asset but never
publishes it.**

Usage: `/pick-cast <brand> <idea-id> <n>`
  - `<brand>` is required — the Brand the Idea belongs to (e.g. `mundotip`).
  - `<n>` is the 1-based index of the Cast member to pick.

**Gate 2 — Brand: `<brand>`.** The Operator is picking a Character for Brand `<brand>`. The chosen
Character is written onto the Idea's enqueued **render job** in the global Production Queue
(`data/queue.json`) as a `character` field — **not** onto the ledger. The worker pins that Character
during the unattended render. The ledger still owns the Idea's status (`casting → produced`); the
pick itself lives on the queue job.

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

> **Not yet wired:** the unattended render runtime is not built yet — there is no live Magnific Space
> adapter and no running worker host, so recording the pick does not currently move the Idea to
> `produced` on its own. This command records the Character correctly; the production runtime that
> consumes it is still pending (see the audit's C2).

## Guardrails
- **Brand is explicit** — `<brand>` is required; never fall back to a default Brand.
- The Operator picks the Character — the Producer never picks for them (this is a human gate).
- Nothing renders past this gate until the Operator picks; the render then runs unattended.
- The Brand's ledger (`data/brands/<slug>/ledger.json`) is the source of truth; every status change
  is written to it. The global Production Queue (`data/queue.json`) is brand-agnostic.
