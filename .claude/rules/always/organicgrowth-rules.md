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
   pre-Format runs sit at `ideas/<run>/`; a recorded `brief_path`/`spec_path` always wins), and
   `ledger.json` (the
   global Production Queue is the one exception — `data/queue.json`). Production state lives as
   **per-Recipe Assets** on each Idea, not flat scalars. All reads/writes go through a typed store layer
   so files can later swap for a database (see `docs/adr/0011`, `docs/adr/0014`). Update the Brand's
   `ledger.json` on every status change; keep it the source of truth.
8. **Never fabricate.** If Apify returns nothing or errors, say so and stop — don't invent trends,
   ideas, or metrics.
9. **Respect the brand profile.** Banned words and brand-safety rules in `brand-profile.yaml` are hard
   filters on every Idea.
10. **Weekly cadence.** One Run per week unless the Operator explicitly asks otherwise.
11. **Human gates: Review, each Recipe's picks, Publish; the producer drives the Space attended.** The
    pipeline pauses at **Review** (accept an Idea + choose its **Recipes**, pre-filled from the Format),
    at **each Recipe's own pick-gate(s)** (zero, one, or several — the wired *Character Explainer with
    Cast* Recipe's is the **Cast** pick), and at **Publish**. Accepting enqueues **one job per chosen
    Recipe**; the `producer` works the **Production Queue** **in the Operator's session**, **one
    generation at a time** (bounded by the single attended Operator, not per-Space capacity), pausing at
    each gate. There is **no unattended background worker**. The agent never asks the Operator to run a
    mechanical step, and never renders past a gate before the Operator acts (see `docs/adr/0009`,
    `docs/adr/0010`, `docs/adr/0008`).
