---
description: Non-negotiable rules for every agent and command in Subtext
globs: *
---

# Subtext Rules

1. **Never generate finished content.** Subtext produces Idea *briefs* (angle, hook concept, talking
   points, hashtags). It never writes the caption, script, or on-screen copy — a human does that.
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
