---
name: track-performance
description: "Pull public metrics for logged Posts via Apify, compute Performance Scores relative to the Channel baseline, and update the feedback loop."
---

# /track-performance

Measure how logged Posts performed and feed it back. Optional arg: an `<idea-id>` (default = `all`
Ideas with status `tracking`/`scored`). Re-run anytime — Performance is a moving number.

## Steps

1. **Select** ledger Ideas with a `post_url` and status `tracking` or `scored`.
2. **Invoke performance-tracker.** It scrapes each post's public metrics via Apify
   (`apify.post_actor`), computes the **Performance Score** (shares 0.35 · comments 0.25 · reactions
   0.20 · views 0.20, normalised to `ledger.baseline`), and updates each entry (metrics,
   `performance_score`, `status: scored`, `tracked_at`, `history`).
3. **Refresh the baseline:** recompute `ledger.baseline` (rolling median of recent scored posts).
4. **Optional enrichment:** if a Meta Content export is present in `data/your-data/`, fold in Saves /
   Net-follows / watch-through by matching on Permalink.
5. **Report:** a table of Idea · Post · Performance Score · headline metrics · vs baseline; call out
   winners and misses; note how the baseline shifted (this is what sharpens next week's ideas).

## Guardrails
- **Public metrics only** via Apify (see `docs/adr/0001`). No Saves/follows/watch-through unless a
  Meta export is supplied.
- **Relative, not absolute** — always score vs the Channel baseline.
- **Never fabricate.** Report failed scrapes and missing fields honestly.
- Only score Ideas with a logged `post_url`.
