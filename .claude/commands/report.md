---
name: report
description: "Show the OrganicGrowth pipeline state at a glance: Ideas by status (including what is in production — casting / produced), this run's Fit Scores (predicted) vs measured Performance Scores, the Channel baseline, and what's feeding back."
---

# /report

A read-only snapshot of the whole loop. Optional arg: a run id to focus on. `/report` reads
`data/ledger.json` (the source of truth) and **never modifies any file**.

## Steps

1. Read `data/ledger.json`.
2. Show:
   - **In production now:** the Ideas the Producer is working — every Idea in **`casting`** (paused at
     the Cast gate, awaiting `/pick-cast`) and every Idea in **`produced`** (Asset rendered, awaiting
     publish). This is what is mid-pipeline at a glance.
   - **All Ideas this run:** id · title · status · **Fit Score (predicted)** · **Performance Score
     (measured)** · Post URL. The Fit Score and the Performance Score live in **separate, labelled
     columns** — a Fit Score is a *prediction* (pre-publication), a Performance Score is a *measurement*
     (post-publication). Never present one as the other. An Idea not yet measured shows its Performance
     Score as a placeholder (`—`), **never `0`** and **never** the Fit Score's value.
   - **Channel baseline:** what a Performance Score is measured **relative to** (and when it was last
     updated, or a "not yet measured" note). A measured score is read relative to this baseline, never as
     an absolute count.
   - **Attribution:** a Post is shown linked to its Idea **only** via the logged `post_url` — never
     inferred. An Idea with no logged URL shows no Post link.
   - **Rejections** this run with their logged reasons.
3. Keep it concise and skimmable. Do not modify any files.

## Guardrails
- **Read-only** — never change state; `/report` writes nothing.
- **Predicted vs measured stay distinct** — Fit Score (predicted) and Performance Score (measured) are
  never conflated, and a measured score is shown relative to the Channel baseline.
- If the ledger is empty, say so and point to `/run-trends`.
