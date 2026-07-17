# Recipes are defined in-repo; the Space keeps only its media run-points

**Status:** accepted — **revises ADR-0003** (which put the whole how-to-run protocol on the Space);
**extends ADR-0008** (attended runtime). Captured in the 2026-07 grilling.

> **Extended by the 2026-07 recipe-architecture wayfinding (map #70):** ADR-0016 types the Recipe's canvas
> inputs (media slots + a prompt node) and moves `space_id` onto the Recipe; ADR-0017 adds per-phase
> contracts the Producer self-audits; ADR-0018 makes the per-Recipe procedure an interpreting **Skill**.

ADR-0003 made the Space self-describing — an on-canvas `Producer Protocol` node held the run-points.
That worked for one format. A **Recipe** (ADR-0009) now bundles media steps **plus** per-Recipe gates
**plus** a copy step (copy is not the Space's job — ADR-0012), and targets a specific Space; that plan
cannot live wholly on one canvas.

## Decision

- **A Recipe is defined in OrganicGrowth's repo** — a brand-agnostic registry entry keyed by slug. Each
  Recipe owns: its **ordered gate list** (zero..many), its **Production-Spec shape** (schema +
  validator), its **copy shape**, and **which Space it drives** (+ the node names it touches).
- **The Space keeps only its on-canvas media run-points** (the Execution Protocol) and its model
  selection (ADR-0007). The Recipe reads those run-points to drive the media; everything else lives in
  the Recipe.
- **The driver becomes a generic run-until-gate engine.** Instead of the fixed two-phase
  `composeAndCast`/`pickAndRender` split keyed on `gate==="cast"`, the producer walks a Recipe's
  run-points in order, **pauses at each declared gate** (returning the choices), and **resumes from
  where it left off** when the Operator picks. A generic "submit a pick" command covers any gate;
  `/pick-cast` stays as a friendly alias for the *Character Explainer with Cast* Recipe. `RunPointGate`
  widens beyond `"cast"`.
- **Concurrency stays serial.** Even across several Recipes and Spaces, the producer makes **one
  generation at a time**, because the limit is the single attended Operator, not per-Space capacity
  (ADR-0008). No per-Space parallelism; the abandoned background-worker code (ADR-0004's
  `worker.ts`/`scheduler.ts`) is **deleted, not revived**. The queue lock/key is re-keyed to include the
  Recipe (ADR-0011).
- The registry is **seeded with one entry — *"Character Explainer with Cast"*** — wrapping today's
  existing spec + `canonicalProtocol` + cast/clip gates **unchanged**.

## Why

Co-locating the **cross-cutting** plan (gates, copy, Space-targeting) in code puts it where it can
actually be held and versioned; the Space still owns what evolves on the canvas (its media nodes, its
models). A dumb run-until-gate driver generalizes to any Recipe.

## Consequences

- The queue's `phase: cast|render` and `awaiting_cast` become a **generic gate cursor**;
  `parse.ts`'s `VALID_GATES` opens to any Recipe-declared gate name.
- ADR-0003's fixed two-phase model is superseded for the general case; the character Recipe still
  behaves identically (the seeded entry).
- By-name node references move onto the Recipe, not repo constants.
