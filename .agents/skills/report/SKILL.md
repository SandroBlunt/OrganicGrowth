---
name: report
description: >-
  Show the OrganicGrowth pipeline state for a named Brand at a glance:
  Ideas by status, Fit Scores vs measured Performance Scores, Channel baseline, and feedback loop.
---

# Report Workflow

Usage: `report <brand>`

A read-only snapshot of the whole loop for the named Brand. Reads `data/brands/<slug>/ledger.json` and never modifies any file.

## Output Details

1. **Brand:** `<brand>` restated at the top.
2. **In production now:** Assets currently in production (`casting` / `produced`).
3. **All Ideas this run:** Table of ID, title, status, Fit Score (predicted), and Best Performance Score (measured, 1:N).
4. **Posts per Recipe:** Breakdown with recipe, status, Performance Score, and Post URL.
5. **Channel Baseline:** Baseline metric vector and last updated timestamp.
6. **Rejections:** Any rejected ideas and verbatim reasons.
