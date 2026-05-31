# CLAUDE.md

Guidance for Claude Code when operating in this repository.

## Project Overview

**Subtext** is an organic-social *intelligence* system for **Facebook** (Pages & Reels). It runs a
weekly loop: discover what's trending among peer Pages → suggest brand-fit **Idea briefs** → (a human
makes and posts the content) → track the posts' performance → feed it back so the next round of ideas
is sharper.

**Subtext never generates finished content.** An Idea stops at a brief (angle, hook *concept*,
talking points, hashtags). The Operator writes the caption and shoots the Reel.

The domain language is defined in [`CONTEXT.md`](./CONTEXT.md) — read it before working here.

## Agents

| Agent | Model | Role |
|---|---|---|
| `trend-scout` | Sonnet | Scrapes peer Pages via Apify; distills over-performing posts into **Trends** |
| `idea-strategist` | Opus | Turns Trends into ranked, brand-fit **Idea briefs** with a predicted **Fit Score** |
| `performance-tracker` | Sonnet | Pulls posts' **public** metrics via Apify; computes **Performance Score**; updates the feedback loop |

## The Subtext pipeline (weekly loop)

Run once a week. Steps marked 👤 are the Operator.

1. `/run-trends` → `trend-scout` scrapes peer Pages (Apify) for posts beating their *own* page
   baseline → distills **Trends**; then `idea-strategist` turns the strongest into ~10 **Idea
   briefs** with **Fit Scores**, written to `ideas/<run>/`.
2. 👤 `/review-ideas` → Operator accepts/rejects conversationally; every **Rejection Reason** is
   logged verbatim (v1 does not auto-apply them).
3. 👤 (offline) Operator creates the content and posts it to Facebook.
4. 👤 `/log-post <idea-id> <fb-url>` → links the published **Post** to its **Idea** (explicit
   attribution — never inferred).
5. `/track-performance` → `performance-tracker` pulls public metrics (Apify), computes the
   **Performance Score** (relative to the Channel baseline), updates `data/ledger.json` and **Your
   Data**. This is the feedback.
6. `/report` → pipeline state, Fit Score vs actual Performance, what's feeding back.

**Pipeline rules:** sequential; the strategist must respect `brand-profile.yaml`; the Operator
reviews before any content is made; Subtext never writes the finished post.

## State

All state is plain files (no database): `data/brand-profile.yaml`, `data/seeds.yaml`,
`ideas/<run>/idea-NN.md` (one Brief each), and `data/ledger.json` (Idea ⇄ Post ⇄ Performance, with
status). Update the ledger on every status change.

## Data sources

- **Apify** does two jobs: peer-Page scraping (Trends) and our-own-post scraping (Performance). Both
  **public metrics only**. `APIFY_API_TOKEN` lives in `.env`.
- **Meta Content export** (in `data/your-data/`) is an *optional* enrichment for Saves / Net-follows /
  watch-through. See [`docs/adr/0001`](./docs/adr/0001-apify-public-metrics-for-performance.md).

## Rules & Standards

Always-on rules live in `.claude/rules/always/` and are loaded automatically:
- `subtext-rules.md` — the non-negotiables (no content generation, public-metrics-only, relative-not-absolute, explicit attribution).
- `data-handling.md` — secrets, exports, defensive parsing.
