---
name: track-performance
description: "Pull public metrics for a named Brand's logged Posts via Apify, compute Performance Scores relative to the Channel baseline, and update the feedback loop."
---

# /track-performance

Usage: `/track-performance <brand> [<idea-id>]`

Measure how a Brand's logged Posts performed and feed it back. `<brand>` is required — omitting it
is an error, never a silent default. Optional: an `<idea-id>` (default = `all` Ideas for this Brand
with status `tracking`/`scored`). Re-run anytime — Performance is a moving number.

## Steps

1. **Resolve the Brand.** Slugify `<brand>` and derive the Brand's paths via the resolver. State the
   active Brand: "Tracking performance for Brand: `<brand>`."
2. **Select** Brand `<brand>`'s ledger Ideas (from `data/brands/<slug>/ledger.json`) with a
   `post_url` and status `tracking` or `scored`.
3. **Invoke performance-tracker with Brand `<brand>`.** It scrapes each post's public metrics via
   Apify (`apify.post_actor`), computes the **Performance Score** (shares 0.35 · comments 0.25 ·
   reactions 0.20 · views 0.20, normalised to `ledger.baseline`), and updates each entry (metrics,
   `performance_score`, `status: scored`, `tracked_at`, `history`) in `data/brands/<slug>/ledger.json`.
4. **Refresh the baseline:** recompute `ledger.baseline` for Brand `<brand>` (rolling median of
   recent scored posts) and stamp `updated_at`.
5. **Optional enrichment:** if a Meta Content export is present in `data/brands/<slug>/your-data/`,
   fold in Saves / Net-follows / watch-through by matching on Permalink.
6. **Report:** a table (Brand: `<brand>`) of Idea · Post · Performance Score · headline metrics ·
   vs baseline; call out winners and misses; note how the baseline shifted (this is what sharpens
   next week's ideas for Brand `<brand>`).

## Guardrails
- **Brand is explicit** — `<brand>` is required; never fall back to a default Brand.
- All ledger reads/writes are scoped to `data/brands/<slug>/ledger.json`.
- **Public metrics only** via Apify (see `docs/adr/0001`). No Saves/follows/watch-through unless a
  Meta export is supplied.
- **Relative, not absolute** — always score vs the Brand's own Channel baseline.
- **Never fabricate.** Report failed scrapes and missing fields honestly.
- Only score Ideas with a logged `post_url`.
