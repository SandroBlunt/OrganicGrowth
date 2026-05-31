---
name: run-trends
description: "Launch the weekly Trend Research Run: scrape peer Pages for trends, then suggest brand-fit Idea briefs with Fit Scores."
---

# /run-trends

Kick off one weekly **Run**: discover Trends, then suggest Ideas. Optional arg: a run id
(default = current ISO week, e.g. `2026-W23`).

## Steps

1. **Determine the run id** (e.g. `2026-W23`) and ensure `ideas/<run>/` exists.
2. **Check parameters.** Read `data/seeds.yaml` and `data/brand-profile.yaml`. If either still has
   `TODO` placeholders (seed Pages, Channel URL), pause and ask the Operator to fill them — don't guess.
3. **Scout trends.** Invoke the **trend-scout** agent. It scrapes the seed Pages via Apify, keeps
   posts that beat their own page baseline, clusters them into Trends, and writes
   `ideas/<run>/trends.json` + `trends.md`.
4. **Suggest ideas.** Invoke the **idea-strategist** agent on `ideas/<run>/trends.json`. It writes
   ~`ideas_per_run` briefs to `ideas/<run>/idea-NN.md`, each appended to `data/ledger.json` as
   `status: suggested` with a Fit Score.
5. **Summarize.** Show a ranked table (id · title · fit_score · trend · one-line why) and tell the
   Operator: *"Run `/review-ideas <run>` to accept or reject."*

## Guardrails
- Sequential: trends first, then ideas. Don't suggest Ideas without fresh Trends.
- Never generate finished content — briefs only.
- One Run per week unless the Operator explicitly asks for another.
- If Apify fails or returns nothing, report it and stop; do not invent trends or ideas.
