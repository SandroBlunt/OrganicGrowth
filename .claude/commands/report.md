---
name: report
description: "Show the OrganicGrowth pipeline state: ideas by status, this run's Fit Scores, posted ideas' Performance Scores, and what's feeding back."
---

# /report

A read-only snapshot of the loop. Optional arg: a run id to focus on.

## Steps

1. Read `data/ledger.json`.
2. Show:
   - **Pipeline counts** by status (suggested / accepted / rejected / tracking / scored).
   - **This run's Ideas:** id · title · Fit Score · status.
   - **Live & scored Posts:** id · Post URL · Fit Score (predicted) vs **Performance Score** (actual)
     — highlight where prediction and reality diverged.
   - **Top performers** feeding back into Your Data, and the current `baseline`.
   - **Rejections** this run with their logged reasons.
3. Keep it concise and skimmable. Do not modify any files.

## Guardrails
- Read-only — never change state.
- If the ledger is empty, say so and point to `/run-trends`.
