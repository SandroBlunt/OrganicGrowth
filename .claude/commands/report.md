---
name: report
description: "Show the OrganicGrowth pipeline state for a named Brand at a glance: Ideas by status (including what is in production — casting / produced), this run's Fit Scores (predicted) vs measured Performance Scores, the Channel baseline, and what's feeding back."
---

# /report

Usage: `/report <brand>`

A read-only snapshot of the whole loop for the named Brand. `<brand>` is required — omitting it is
an error, never a silent default. `/report` reads the Brand's ledger at
`data/brands/<slug>/ledger.json` (the source of truth) and **never modifies any file**.

## Steps

1. Resolve the Brand: slugify `<brand>`, then use the Brand resolver to get the Brand's ledger at
   `data/brands/<slug>/ledger.json`. State the active Brand at the top of the output.
2. Read the Brand's ledger.
3. Show:
   - **Brand:** `<brand>` — restated at the top so the Operator always knows which Brand this is.
   - **In production now:** the Ideas the Producer is working — every Idea rolled up to **`casting`**
     (paused at the Cast gate, awaiting `/pick-cast <brand> ...`) and every Idea rolled up to
     **`produced`** (an Asset rendered, awaiting publish) — the roll-up is the EARLIEST stage across the
     Idea's per-Recipe Assets (ADR-0011). This is what is mid-pipeline at a glance.
   - **All Ideas this run:** id · title · status · **Fit Score (predicted)** · **Best Performance Score
     (measured, 1:N)**. Fit Score is a per-Idea *prediction* (pre-publication), one per Idea; Performance
     Score is a per-Recipe *measurement* (post-publication) — with an Idea now able to yield SEVERAL
     Assets/Posts (one per chosen Recipe, ADR-0009), the summary column shows the BEST measured score
     among that Idea's Posts, explicitly labelled as a comparison against *N* Posts — never presented as
     if the Fit Score judged one specific Post. An Idea with nothing measured yet shows a placeholder
     (`—`), **never `0`** and **never** the Fit Score's value.
   - **Posts (per Recipe):** the full per-Recipe breakdown — every Asset with a logged Post, one row per
     `(Idea, Recipe)`: recipe · status · Performance Score · Post URL. A Post is shown linked to its Idea
     **only** via the logged `post_url` on THAT Recipe's Asset — never inferred, never collapsed across
     Recipes.
   - **Channel baseline:** the ONE baseline (per Brand, never per Recipe) a Performance Score is measured
     **relative to** (and when it was last updated, or a "not yet measured" note). A measured score is
     read relative to this baseline, never as an absolute count.
   - **Rejections** this run with their logged reasons.
4. Keep it concise and skimmable. Do not modify any files.

## Guardrails
- **Read-only** — never change state; `/report` writes nothing.
- **Brand is explicit** — `<brand>` is required; never fall back to a default Brand.
- **Predicted vs measured stay distinct** — the one per-Idea Fit Score (predicted) and each per-Recipe
  Performance Score (measured) are never conflated; the "best of N Posts" summary is explicit about
  being a 1:N comparison, never a 1:1 judgement.
- **One Channel baseline** — shared across every Recipe/Asset of a Brand; never a per-Recipe baseline.
- If the ledger is empty, say so and point to `/run-trends <brand>`.
