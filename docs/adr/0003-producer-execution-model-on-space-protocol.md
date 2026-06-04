# Producer execution model: a thin runner driving an on-Space protocol, with agent fallback

**Status:** accepted — extends ADR-0002 (the Producer added there).

The Producer renders an accepted Brief into an Asset by driving a pre-defined Magnific **Space** (the
"JSON master" cast→clips Space). The Space is expected to keep evolving, and it already carries its own
**generation contract** (a system prompt in the "The Brain" panel that turns a USER THEME into the
strict Production Spec JSON). We decided to make the Space the single source of truth for *how to run*
as well, and keep the Producer thin.

**Decision**

- **Self-describing Space.** The Space holds both (a) its generation contract (the system prompt) and
  (b) an **Execution Protocol** — a `Producer Protocol` text node holding JSON: an ordered list of
  run-points `{start, mode, gate}`. The Producer reads both from the canvas at run time. The same
  Producer can therefore drive any Space that follows this convention.
- **Run-points reference nodes by name** (e.g. `"Character Variants Generator"`, `"Clip extractor"`).
  Pragmatic and readable. Discipline: a run-point must point at a *uniquely*-named node, and renaming
  that node requires updating the `Producer Protocol` node in the same edit. (The Space contains
  duplicate names elsewhere — those nodes are not valid run-points.)
- **Two phases around a human Cast gate.**
  - *Phase A — Compose & Cast:* generate the Production Spec → inject it into `JSON Master` → run the
    cast run-point (`downstream`) → return the Cast image URLs to the Operator → **pause**.
  - *Phase B — Render:* Operator picks → pin the chosen Character → run the clip run-point
    (`downstream`) → Video Combiner → Final Output = the Asset.
- **Fallback Protocol.** The two state mutations the run API can't do directly — injecting the
  Production Spec into the `JSON Master` text node and pinning the chosen `Character` creation node —
  plus recovery when a run-point is missing/stale/failing, are delegated to the Space's **in-canvas
  agent** (a natural-language edit) rather than a fixed node run.

**Why:** co-locating the protocol with the Space keeps "how to run it" versioned alongside the thing
it runs (the Operator's stated reason for choosing on-Space over an in-repo manifest); the thin runner
generalizes across Spaces; the Cast gate preserves OrganicGrowth's human-in-the-loop ethos (it is the
second human gate, after Review).

**Consequences**

- Lifecycle gains a paused state (proposed name `casting`):
  `suggested → accepted → casting → produced → posted → tracking → scored`.
- Ledger Idea record gains: `cast` (candidate variant URLs/identifiers), `character` (chosen),
  `asset_url`, `produced_at`.
- **Two feasibility spikes before building** (both mutate the board / spend credits): (i) the in-canvas
  agent can reliably set the `JSON Master` text and the `Character` creation node; (ii)
  `spaces_run(..., downstream)` cleanly stops at the Cast without spilling into clip generation.
- By-name references trade exactness for readability; the rename-in-lockstep discipline is the cost.
