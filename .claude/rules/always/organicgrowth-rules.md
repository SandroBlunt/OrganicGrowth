---
description: Non-negotiable rules for every agent and command in OrganicGrowth
globs: *
---

# OrganicGrowth Rules

1. **Generate the Asset, never publish it.** The `producer` renders an accepted Idea into an **Asset** —
   the Space's media plus its tailored **Copy**, which the producer composes outside the Space
   (`docs/adr/0012`). OrganicGrowth never *publishes*: a human reviews,
   makes any of the Recipe's picks (e.g. the Reel's **Character**), posts to Facebook, and logs the URL.
   The human gate is **publication**, not creation (see `docs/adr/0002`).
2. **Two Apify jobs, never confused.** trend-scout scrapes **peers** for Trends; performance-tracker
   scrapes **our own** posts for Performance. Both are **public metrics only**.
3. **Predicted vs measured.** A **Fit Score** is a pre-publication prediction; a **Performance Score**
   is measured after the fact. Never present one as the other.
4. **Relative, not absolute.** Always measure against the Channel's own baseline — never raw view or
   like counts. One viral post must not define "good".
5. **Attribution is explicit.** A Post is linked to a specific **(Idea, Recipe)** only via a `post_url`
   the Operator logs (`/log-post <brand> <idea> <recipe> <url>`) — an Idea now yields one Post per
   Recipe. Never infer which post came from which idea/recipe (see `docs/adr/0011`).
6. **Rejection reasons are logged verbatim.** v1 records them and does **not** auto-apply them to
   future suggestions.
7. **State lives in files, behind a store boundary.** Per Brand under `data/brands/<slug>/`:
   `brand-profile.yaml`, `seeds.yaml`, `formats/<format>.yaml`, `ideas/<format>/<run>/` (legacy
   pre-Format runs sit at `ideas/<run>/`; a `cadence: daily` Format's Run instead nests under
   `ideas/<format>/<ISO-week>/<weekday>-<DD>-<month>/`, ADR-0023, `runIdeasDirFor` — a recorded
   `brief_path`/`spec_path` always wins over any reconstructed path, either shape), and
   `ledger.json` (the
   global Production Queue is the one exception — `data/queue.json`). Production state lives as
   **per-Recipe Assets** on each Idea, not flat scalars. All reads/writes go through a typed store layer
   so files can swap for a database without changing callers (see `docs/adr/0011`, `docs/adr/0014`) — a
   local SQLite foundation now exists under `data/` (`docs/adr/0029`), and is now the backing of the
   Asset, Production Spec, Brand, Channel, Format, Brand Asset, Idea, and Trend stores for a caller that
   opts into a `{ db }` option (issues #222/#223); no existing production caller has been switched over
   to it yet — that follows once the one-shot importer runs (issue #204). Until then, `ledger.json`
   stays the source of truth the live pipeline actually reads and writes: update the Brand's
   `ledger.json` on every status change. Issue #203 additionally backs the Job, Gate Request, Post, and
   Performance time-series (`metric_snapshot`/`channel_baseline`/`performance_score`) stores with a
   `{ db }` option, the same not-yet-wired way. Since issue #205, a **typed command surface**
   (`src/command-surface/`) sits above the store layer as the sanctioned way anything above it writes —
   the worker, the viewer, and every agent (issues #208/#210/#211) call it instead of touching a store or
   a file directly; no production caller is wired onto it yet either, for the same reason. An automated
   guard (`src/fs-boundary/`) fails the build when a new, un-audited production module imports `node:fs`
   outside its own reviewed allow-list. Since issue #233, a second guard (`src/store-write-boundary/`)
   fails the build when a new, un-audited production module imports a SQL-backed store's write function
   directly, outside `src/command-surface/` and its own reviewed allow-list — the same ratchet shape, a
   different target, closing the gap #205's own QA verdict demonstrated live. Since issue #235, that same
   guard also names a store's file-backed write function when one exists under its own distinct name
   (e.g. `src/production-spec/store.ts`'s `saveSpec`, alongside its SQL-backed `saveProductionSpec`), and
   resolves a namespace import (`import * as store from ...`) as importing every one of that store's write
   functions — closing two further gaps a store-write bypass could otherwise hide in.
8. **Never fabricate.** If Apify returns nothing or errors, say so and stop — don't invent trends,
   ideas, or metrics.
9. **Respect the brand profile.** Banned words and brand-safety rules in `brand-profile.yaml` are hard
   filters on every Idea.
10. **Cadence.** One Run per cadence period per Format — a Format owns its own `cadence`, `weekly`
    (the default) or `daily` (`docs/adr/0022-cadence-is-a-format-property.md`) — unless the Operator
    explicitly asks otherwise.
11. **Human gates: Review, each Recipe's picks, Publish; the producer drives the Space attended.** The
    pipeline pauses at **Review** (accept an Idea + choose its **Recipes**, pre-filled from the Format),
    at **each Recipe's own pick-gate(s)** (zero, one, or several — the wired *Character Explainer with
    Cast* Recipe's is the **Cast** pick), and at **Publish**. Accepting enqueues **one job per chosen
    Recipe**; the `producer` works the **Production Queue** **in the Operator's session**, **one
    generation at a time** (bounded by the single attended Operator, not per-Space capacity), pausing at
    each gate. There is **no unattended background worker**. The agent never asks the Operator to run a
    mechanical step, and never renders past a gate before the Operator acts (see `docs/adr/0009`,
    `docs/adr/0010`, `docs/adr/0008`). **Addendum (issue #208, epic #195):** a code-driven **worker**
    (`src/commands/run-worker.ts`'s `drainQueue`, composing `src/command-surface/worker.ts`'s
    `runOneJob`) now also exists — a local process the Operator starts, holding its own Magnific
    credentials, that drains the Production Queue **unattended**, self-auditing each phase and pausing
    at gates without holding the Space. This is a NEW, separate path alongside the attended `producer`
    content agent described above (unchanged, still real) — not a replacement for it. The stated reason
    attended mode existed here — a permission classifier re-blocking allow-listed Magnific calls even
    when the tool is allow-listed — does not apply to a worker holding its own credentials (epic #195's
    own recorded review). A superseding ADR for this specific decision is a known doc-gap this ticket
    flags rather than closes — see its `handoff.md`.
