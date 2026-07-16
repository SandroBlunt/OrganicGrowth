---
name: pick-cast
description: "Gate 2 — Cast pick: the Operator picks the Character (the nth Cast member) for an Idea of the named Brand whose Asset is paused at the Cast gate; the Producer then resumes the job in the Operator's session and renders the Asset one generation at a time."
---

# /pick-cast

**Gate 2 — Cast pick.** An Idea with an Asset **paused at the Cast gate** (`in_production`,
`pending_gate: "cast"` — ADR-0011; the retired flat `casting` Idea-status is gone, the Idea itself stays
`accepted`) has its rendered **Cast** on the Brand's ledger. The Operator picks the **Character** to
render; the Producer then **resumes the job in the Operator's session** and renders it to completion, one
generation at a time (pins the Character, runs the clip run-point, saves the **Asset**). A gate-paused job
does not hold the Space. That Asset moves `in_production → produced`. OrganicGrowth **renders the Asset
but never publishes it.**

> **Multi-format (ADR-0009/0010, issue #57):** the Cast pick is the *Character Explainer with Cast*
> Recipe's own local pick-gate — "Cast"/"Character" are that Recipe's vocabulary, not a universal step.
> `/pick-cast` is now a **thin, friendly alias**: it stays Cast-only for finding the Idea's gated Asset
> and turning the 1-based `<n>` into a Character, then delegates the actual queue-resume mechanics to
> the same `resumeGate` primitive the generic **`/pick <brand> <idea-id> <recipe> <gate> <pick>`**
> command uses for ANY wired Recipe's ANY declared gate — see `.claude/commands/pick.md`. The two
> commands can never drift on how a pick resumes production.

Usage: `/pick-cast <brand> <idea-id> <n>`
  - `<brand>` is required — the Brand the Idea belongs to (e.g. `mundotip`).
  - `<n>` is the 1-based index of the Cast member to pick.

**Gate 2 — Brand: `<brand>`.** The Operator is picking a Character for Brand `<brand>`. The chosen
Character is written onto the Idea's enqueued **next-leg job** in the global Production Queue
(`data/queue.json`) as a `pick` field, keyed to the RESOLVED Asset's own `(brand, idea, recipe)`
(issue #56) — **not** onto the ledger. The Producer pins that Character when it resumes the job in the
Operator's session. The ledger still owns that Asset's status (`in_production → produced`; the Idea
itself stays `accepted` throughout — ADR-0011); the pick itself lives on the queue job. If more than one
of the Idea's Assets is paused at the Cast gate at once (a
future multi-Recipe scenario), the command REFUSES rather than guessing which Recipe's gate the
Operator means (explicit attribution, always-rules #5).

## Steps

1. **Run** `npm run pick-cast <brand> <idea-id> <n>` (or call `pickCastCommand()` in `src/commands/pick-cast.ts`).
2. It resolves the Brand's ledger via the Brand resolver (`data/brands/<slug>/ledger.json`), loads the
   Idea's recorded **Cast** (from the Asset actually paused at the Cast gate), selects the **nth**
   (1-based) Cast member as the chosen **Character**, and **writes that Character onto a next-leg job**
   in the global Production Queue (`data/queue.json`), stamped with the RESOLVED Asset's own Recipe. The
   command **refuses the pick unless the Idea has exactly one Asset at the Cast gate**; an unknown Idea,
   an Idea not at the gate, an Idea with no Cast, an out-of-range `<n>`, or MULTIPLE Assets paused at
   the gate at once returns an identifiable, non-crashing message — it never invents a Character and
   never guesses which Recipe's gate the pick resolves.
   A **re-pick** on an Idea whose Character is already set reports "no change; earlier pick stands"
   rather than claiming a fresh render was queued.
3. The output restates the active Brand: "Brand: `<brand>`" so the Operator can confirm the pick is
   for the correct Brand.

> **How the render runs:** once the pick is in, the Producer resumes the job **in the Operator's
> session** and renders it one generation at a time — there is no unattended background worker
> (ADR-0008). This command only records the Character on the queue job; recording the pick does not
> move that Asset to `produced` on its own (the Idea itself stays `accepted` throughout) — the Producer
> does that when it resumes the job. A gate-paused job does not hold the Space.

## Guardrails
- **Brand is explicit** — `<brand>` is required; never fall back to a default Brand.
- The Operator picks the Character — the Producer never picks for them (this is a human gate).
- Nothing renders past this gate until the Operator picks; the Producer then resumes the render in the
  Operator's session, one generation at a time.
- The Brand's ledger (`data/brands/<slug>/ledger.json`) is the source of truth; every status change
  is written to it. The global Production Queue (`data/queue.json`) is brand-agnostic.
