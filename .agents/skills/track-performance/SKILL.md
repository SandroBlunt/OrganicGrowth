---
name: track-performance
description: >-
  Pull public metrics for a named Brand's logged Posts via Apify, compute Performance Scores relative to the Channel baseline, and update the feedback loop.
---

# Track Performance Workflow

Usage: `track-performance <brand> [<idea-id>]`

Measure how a Brand's logged Posts performed and feed it back. `<brand>` is required.

**The `posted → tracking → scored` transition:**
- Freshly logged Post: `posted`
- Early metrics pull (< 7 days old): `tracking`
- Matured post (7+ days old): `scored` (final for feedback loop)

## Steps

1. **Resolve Brand:** Slugify `<brand>` and load ledger `data/brands/<slug>/ledger.json`.
2. **Run:** `npm run track-performance <brand> [idea-id]` (or call `trackPerformanceCommand()`).
   - Selects Assets with `post_url` and status `posted` or `tracking`.
   - Scrapes public metrics via Apify actor per platform.
   - Computes Performance Score normalised to the Brand's Channel baseline (`shares 0.35, comments 0.25, reactions 0.20, views 0.20`).
   - Updates Asset status, metrics, `tracked_at`, and history in `ledger.json`.
   - Refreshes generated view `post.json` in output bundle.
3. **Refresh baseline:** Recompute rolling Channel baseline for Brand.
4. **Report:** Display results table comparing Fit Score (prediction) vs best Performance Score (measurement).

## Guardrails
- Public metrics only via Apify.
- Relative to Channel baseline, not absolute counts.
- Never fabricate data.
