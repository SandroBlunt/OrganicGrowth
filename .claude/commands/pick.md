---
name: pick
description: "The GENERIC pick/resume command (ADR-0010, issue #57): submit the Operator's resolved pick for ANY wired Recipe's ANY declared gate and resume production. /pick-cast is a friendly, Cast-specific alias built on top of this."
---

# /pick

**The generic gate-resume command.** A Recipe declares zero, one, or several human pick-gates
(`Recipe.gates`, `src/recipe/registry.ts`) — the *Character Explainer with Cast* Recipe's own is the
**Cast** gate (`/pick-cast`'s scope); a future Recipe might declare a differently-named gate, or several,
or none at all. `/pick` submits the Operator's ALREADY-RESOLVED pick for any one of them and resumes
production by enqueueing the Production Queue's generic **next leg**, then clearing that gate. It never
reads a Recipe's own candidate list off the ledger — mapping a friendlier selection UX (e.g. `/pick-cast`'s
1-based `<n>` → a Cast candidate identifier) to a resolved pick is each Recipe's OWN command's job.

Usage: `/pick <brand> <idea-id> <recipe> <gate> <pick>`
  - `<brand>` is required — the Brand the Idea belongs to (e.g. `mundotip`).
  - `<idea-id>` is the Idea's ledger id.
  - `<recipe>` is the chosen Recipe slug this pick resolves (e.g. `character-explainer-with-cast`).
  - `<gate>` is the gate name this pick resolves (e.g. `cast`).
  - `<pick>` is the Operator's resolved pick — a candidate identifier from that gate.

**Brand: `<brand>`.** The resolved pick is written onto the Idea's enqueued **next-leg job** in the
global Production Queue (`data/queue.json`), keyed to the composite `(brand, idea, recipe)` (issue #56)
— **not** onto the ledger. The Producer applies that pick (pinning it into the Recipe-declared node) when
it resumes the job in the Operator's session. The next leg's own `gate` cursor is resolved from the named
Recipe's OWN declared gate list (`Recipe.gates`) — the entry after `<gate>`, or `null` (the final,
Asset-rendering leg) when `<gate>` was the Recipe's last one. An unwired/unknown `<recipe>`, or a `<gate>`
absent from that Recipe's own list, defensively resolves the next leg to `null` rather than guessing.

## Steps

1. **Run** `npm run pick <brand> <idea-id> <recipe> <gate> <pick>` (or call `pickCommand()` in
   `src/commands/pick.ts`).
2. It resolves the next gate from the Recipe registry, **enqueues the next-leg job** carrying `<pick>`,
   and **clears `<gate>`** (its `awaiting_pick` job, if any, moves to `done`). A re-submit for the SAME
   `(brand, idea, recipe)` targeting the SAME resolved next gate reports "no change; the earlier pick
   stands" rather than claiming a fresh render was queued.
3. The output restates the active Brand: "Brand: `<brand>`" so the Operator can confirm the pick is for
   the correct Brand.

> **How the render runs:** once the pick is in, the Producer resumes the job **in the Operator's
> session** and renders it one generation at a time — there is no unattended background worker
> (ADR-0008). This command only records the pick on the queue job; recording it does not move that Asset
> forward on its own (the Idea itself is untouched by the pick) — the Producer does that when it resumes
> the job. A gate-paused job does not hold the Space.

## Relationship to `/pick-cast`

`/pick-cast <brand> <idea-id> <n>` is a **thin, friendly alias** for the wired *Character Explainer with
Cast* Recipe's Cast gate: it reads the Idea's ledger-recorded Cast candidates, turns the 1-based `<n>`
into a Character (a candidate identifier), refuses when the Idea isn't at the Cast gate or `<n>` is
out of range, and then calls the SAME `resumeGate` primitive `/pick` uses to actually resume production
— so the two commands can never drift on the queue-resume mechanics. Prefer `/pick-cast` for the wired
Recipe; use `/pick` directly for any other Recipe's gate, or when you already have the resolved pick in
hand.

## Guardrails
- **Brand is explicit** — `<brand>` is required; never fall back to a default Brand.
- This command never reads the ledger and never guesses which candidate the Operator means — `<pick>`
  is the resolved identifier the Operator (or a Recipe-specific wrapper command) already chose.
- Nothing renders past a gate until a pick is recorded; the Producer then resumes the render in the
  Operator's session, one generation at a time.
- The global Production Queue (`data/queue.json`) is brand-agnostic; the Brand's ledger
  (`data/brands/<slug>/ledger.json`) remains the source of truth for production status.
