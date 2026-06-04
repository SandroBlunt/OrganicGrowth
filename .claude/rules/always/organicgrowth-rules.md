---
description: Non-negotiable rules for every agent and command in OrganicGrowth
globs: *
---

# OrganicGrowth Rules

1. **Generate the Asset, never publish it.** The `producer` renders an accepted Idea into an **Asset**
   (a Reel) by driving a pre-defined Magnific Space. OrganicGrowth never *publishes*: a human reviews,
   picks the **Character**, posts to Facebook, and logs the URL. The human gate is **publication**, not
   creation (see `docs/adr/0002`).
2. **Two Apify jobs, never confused.** trend-scout scrapes **peers** for Trends; performance-tracker
   scrapes **our own** posts for Performance. Both are **public metrics only**.
3. **Predicted vs measured.** A **Fit Score** is a pre-publication prediction; a **Performance Score**
   is measured after the fact. Never present one as the other.
4. **Relative, not absolute.** Always measure against the Channel's own baseline — never raw view or
   like counts. One viral post must not define "good".
5. **Attribution is explicit.** A Post is linked to an Idea only via a `post_url` the Operator logs.
   Never infer which post came from which idea.
6. **Rejection reasons are logged verbatim.** v1 records them and does **not** auto-apply them to
   future suggestions.
7. **State lives in files.** `data/brand-profile.yaml`, `data/seeds.yaml`, `ideas/<run>/`, and
   `data/ledger.json`. Update `ledger.json` on every status change; keep it the source of truth.
8. **Never fabricate.** If Apify returns nothing or errors, say so and stop — don't invent trends,
   ideas, or metrics.
9. **Respect the brand profile.** Banned words and brand-safety rules in `brand-profile.yaml` are hard
   filters on every Idea.
10. **Weekly cadence.** One Run per week unless the Operator explicitly asks otherwise.
11. **Three human gates; production runs itself between them.** The pipeline pauses only at **Review**,
    **Cast pick**, and **Publish**. Accepting an Idea **auto-enqueues** it; the `producer` drains the
    **Production Queue** in the background, **one Space generation at a time** (the Space has no
    parallelism), and an Idea paused at a gate never holds the Space. The agent never asks the Operator
    to run a mechanical step, and never renders past a gate before the Operator acts (see
    `docs/adr/0003`, `docs/adr/0004`).
