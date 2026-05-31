# 0001 — Performance is measured from Apify public metrics, not the Meta first-party export

**Status:** accepted

## Context

Our own Facebook Page exposes rich first-party Insights via Meta's Content export — Saves,
Net-follows, watch-through (avg seconds viewed), and a Distribution Multiplier (`+0.1x` / `-3.7x`).
But OrganicGrowth drives **both** data jobs through **Apify** (one integration, one API key, fully
automatable from Claude Code), and Apify can only see a post's **public** signals: reactions,
comments, shares, and Reel view counts. Saves, per-post follows, watch-through, and the distribution
multiplier are **not** publicly scrapable.

## Decision

The automated feedback loop computes **Performance** and the **Performance Score** from Apify public
metrics only — **shares, comments, reactions, views** — each normalised to the Channel's own recent
baseline (default weights `0.35 / 0.25 / 0.20 / 0.20`, tunable). Meta's Content export is supported as
an **optional manual enrichment**: if the Operator drops a fresh export into `data/your-data/`, the
`performance-tracker` may fold in Saves / Net-follows / watch-through.

## Consequences

- The loop is fully automatable and uses a single vendor (Apify) for both agents.
- "High-performing" is defined by public engagement — which, for save-heavy content like life-hacks,
  *understates* true resonance until an export is supplied. Accepted, with enrichment as the escape hatch.
- Moving to the Meta Graph API later (for automated first-party metrics) would need a Business
  account, a Meta app, and OAuth — a larger integration, deliberately deferred.
