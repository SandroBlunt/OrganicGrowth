# CLAUDE.md

Guidance for Claude Code when operating in this repository.

## Project Overview

**OrganicGrowth** is an organic-social *intelligence + production* system for **Facebook, Instagram, or
LinkedIn** (Facebook-first today). It runs a weekly loop: discover what's trending among peer accounts → suggest brand-fit **Idea
briefs** → **render each accepted Idea into a publish-ready Asset** via a Magnific Space → (a human
publishes it) → track the posts' performance → feed it back so the next round of ideas is sharper.

**OrganicGrowth generates the Asset but never publishes it.** The `producer` renders an Idea into an
**Asset** (a Reel) by driving a pre-defined Magnific Space; a human reviews, picks the **Character**,
publishes to Facebook, and logs the URL. The human gate moved from *creation* to *publication* — it
was never removed (see [`docs/adr/0002`](./docs/adr/0002-producer-generates-asset-human-publishes.md)).

The domain language is defined in [`CONTEXT.md`](./CONTEXT.md) — read it before working here.

## Agents

| Agent | Model | Role |
|---|---|---|
| `trend-scout` | Sonnet | Scrapes peer Pages via Apify; distills over-performing posts into **Trends** |
| `idea-strategist` | Opus | Turns Trends into ranked, brand-fit **Idea briefs** with a predicted **Fit Score** |
| `producer` | Opus | Drives a Magnific Space: generates a **Production Spec** from an accepted Idea, runs the Space to a **Cast**, then (after the Operator picks the **Character**) renders the **Asset** |
| `performance-tracker` | Sonnet | Pulls posts' **public** metrics via Apify; computes **Performance Score**; updates the feedback loop |

## The OrganicGrowth pipeline (weekly loop)

Run once a week. Steps marked 👤 are the Operator. **The agent auto-advances through the mechanical
steps and pauses only at the three human gates (Review, Cast pick, Publish) — it never asks the
Operator to run a step it can run itself, and never renders past a gate before the Operator acts.**

1. `/run-trends` → `trend-scout` scrapes peer Pages (Apify) for posts beating their *own* page
   baseline → distills **Trends**; then `idea-strategist` turns the strongest into ~10 **Idea
   briefs** with **Fit Scores**, written to `ideas/<run>/`.
2. 👤 **Gate 1 — Review.** `/review-ideas` → Operator accepts/rejects conversationally; every
   **Rejection Reason** is logged verbatim (v1 does not auto-apply them). **Accepting an Idea enqueues
   it for production** — no separate kickoff.
3. **Production (background, serialized).** As soon as an Idea is accepted, the `producer` works the
   **Production Queue**: generates a **Production Spec** from the Brief + the Space's own system prompt,
   injects it, runs the **cast** run-point, returns the **Cast**, and pauses that Idea at the Cast gate
   (status `accepted → casting`). The Space runs **one generation at a time**, so the Producer
   serializes the queue; an Idea waiting at its gate does **not** hold the Space — the next queued
   cast-gen proceeds meanwhile. `/queue` shows the backlog.
4. 👤 **Gate 2 — Cast pick.** `/pick-cast <idea-id> <n>` → Operator picks the **Character**; the
   `producer` **queues the render**, then renders to completion *unattended* when the Space is free —
   pins the Character, runs the **clip** run-point, saves the finished **Asset**. Status
   `casting → produced`.
5. 👤 **Gate 3 — Publish.** Operator publishes the Asset to the Channel's platform, then `/log-post <idea-id> <post-url>`
   links the published **Post** to its **Idea** (explicit attribution — never inferred). Status
   `produced → posted`.
6. `/track-performance` → `performance-tracker` pulls public metrics (Apify), computes the
   **Performance Score** (relative to the Channel baseline), updates `data/ledger.json` and **Your
   Data**. This is the feedback.
7. `/report` → pipeline state, Fit Score vs actual Performance, what's feeding back.

**Pipeline rules:** sequential; the strategist must respect `brand-profile.yaml`; the Operator gates
**Review**, **Cast pick**, and **Publish**; OrganicGrowth **generates the Asset but never publishes** —
a human does. The `producer` drives the Space per its on-canvas **Execution Protocol** and falls back
to the Space's agent for steps the run API can't do directly (see
[`docs/adr/0003`](./docs/adr/0003-producer-execution-model-on-space-protocol.md)).

## State

All state is plain files (no database): `data/brand-profile.yaml`, `data/seeds.yaml`,
`ideas/<run>/idea-NN.md` (one Brief each), `ideas/<run>/idea-NN.spec.json` (the **Production Spec**,
written by `/produce`), and `data/ledger.json` (Idea ⇄ Cast ⇄ Asset ⇄ Post ⇄ Performance, with status).
Lifecycle: `suggested → accepted → casting → produced → posted → tracking → scored` (or `rejected`).
The Producer adds ledger fields `cast`, `character`, `asset_url`, `produced_at`. Update the ledger on
every status change.

## Data sources

- **Apify** does two jobs: peer-Page scraping (Trends) and our-own-post scraping (Performance). Both
  **public metrics only**. `APIFY_API_TOKEN` lives in `.env`.
- **Meta Content export** (in `data/your-data/`) is an *optional* enrichment for Saves / Net-follows /
  watch-through. See [`docs/adr/0001`](./docs/adr/0001-apify-public-metrics-for-performance.md).

## Rules & Standards

Always-on rules live in `.claude/rules/always/` and are loaded automatically:
- `organicgrowth-rules.md` — the non-negotiables (no content generation, public-metrics-only, relative-not-absolute, explicit attribution).
- `data-handling.md` — secrets, exports, defensive parsing.
