# The Producer drives the Space attended, in the Operator's session (supersedes ADR-0004)

**Status:** accepted (2026-07-10) — supersedes ADR-0004; extends ADR-0003. **Extended by
[ADR-0010](./0010-recipes-in-repo-space-media-only.md)** (2026-07): the attended, one-generation-at-a-time
model now spans a Brand's several Recipes/Spaces — serialization is bounded by the single Operator, not
per-Space capacity; still no background worker.

ADR-0004 had the `producer` own an **unattended, background** Production Queue: accepting an Idea spawns
a background task that drives the Magnific Space with no human present, plus a periodic tick to reap
async renders. Building that runtime was scoped as epic #39 (slices #40–43). We dropped it.

**Context**

- The pipeline already pauses at the **Cast gate** (the Operator picks the Character mid-production), so
  production was never truly hands-off — a human is present partway through every job.
- The Magnific Space is designed for a human in the loop. In Claude Code's `auto` mode the permission
  classifier re-blocks Space mutations (`spaces_edit` / `spaces_run`) as "modifying shared
  infrastructure" **even when the tool is allow-listed**; an unattended worker only clears that by
  running headless in a locked-down mode (`dontAsk` / `bypassPermissions`) — deliberately disabling the
  safety gate to spend credits and mutate a shared board with no one watching. (Verified this session:
  a headless read probe passed; a headless `spaces_edit` write probe was auto-denied.)
- The `producer` already drove the live Space **attended** in the June smoke-test run; that working
  agent had been shelved by mistake in the 2026-07-07 reset, which made the runtime look unbuilt (audit
  finding C2).

**Decision**

- The `producer` is an **interactive** agent, given the Magnific MCP tools, that drives the live Space
  **in the Operator's session**. The Operator approves the Space calls as they happen — that approval is
  the permission path (no headless bypass).
- **No headless worker host, no unattended-permission wiring, no cross-process lock.** Epic #39 and
  slices #41 / #42 / #43 were closed as not planned; #40 (the live adapter + fixtures) stays merged but
  is not on the attended path.
- **The Production Queue stays** as a simple to-do list of accepted Ideas. The producer works through it
  **one Space generation at a time** while the Operator is present, pausing at the Cast gate — nothing
  drains it in the background. `data/queue.json` and ADR-0006's global-queue layout are unchanged.
- Everything **ADR-0003** says about *how* the producer drives the Space still holds: read the on-canvas
  `Producer Protocol` node each run; use the run API for `run` steps and delegate inject/replace steps to
  the Space's in-canvas agent (the Fallback Protocol).

**Why**

- The Cast gate means a human is present partway through every job regardless, so a fully-unattended
  runtime automates only the small gaps around a step the Operator is there for anyway — a large cost
  (fighting the tool's safety model, a permission bypass, a cross-process lock) for little value.
- Attended production works *with* the tool instead of against it, and it is the model we already had
  running before the reset. Restoring it was one file plus a brand-profile pointer, versus building an
  unattended runtime from scratch.

**Consequences**

- Serialization is natural — one attended run at a time — so ADR-0004's single-active-run lock and the
  C16 cross-process race are moot (no second writer).
- `.claude/agents/producer.md` carries the Magnific MCP tools and the Phase A (cast → Cast gate) /
  Phase B (pick → render) drive loop. (Under ADR-0010/0013 the Space a Recipe drives is named on the
  **Recipe** in-repo, so a per-Brand `production.space_id` in `brand-profile.yaml` is superseded; only
  brand-specific bits — the watermark @handle, Spec content — are injected at run time.)
- The Production Queue is a convenience list, not a scheduler. Removing it (and `/queue`) would be a
  separate change if we ever decide the ledger's status field is enough.
- CLAUDE.md and `.claude/rules/always/organicgrowth-rules.md` describe the attended model; the
  "background / unattended / self-draining" phrasing was removed.
