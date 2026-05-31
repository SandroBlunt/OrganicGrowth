---
name: review-ideas
description: "Walk the Operator through this run's suggested Ideas conversationally; accept or reject each, logging a free-text reason for every rejection."
---

# /review-ideas

Curate a Run's suggested Ideas **conversationally**. Optional arg: run id (default = latest run with
`suggested` ideas).

## Steps

1. **Load** all `status: suggested` Ideas for the run from `data/ledger.json` (+ their briefs).
2. **Present them** one at a time (or as a short list, Operator's preference): title, the trend it
   rides, Fit Score, hook concept, and the one-line rationale.
3. **Take the Operator's verdict** in natural language — accept some, reject others. This is a
   conversation, not a form: let them give reasons however they like.
4. **For each ACCEPT:** set `status: accepted` in the ledger.
5. **For each REJECT:** set `status: rejected` and store their reason **verbatim** in
   `rejection_reason`. Log it as-is — do **not** argue, re-pitch, or act on it (v1 logs only).
6. **Offer replacements** (optional): if the Operator wants more, invoke **idea-strategist** for fresh
   briefs honoring what they just said, and add them as new `suggested` Ideas.
7. **Summarize:** the accepted set (ready to create) and the rejected set (with reasons logged).

## Guardrails
- Capture every **Rejection Reason** verbatim; rejection feedback is **logged only** in v1.
- Don't pressure the Operator or defend an Idea — record the decision and move on.
- Never start making content; accepted Ideas are handed to the Operator to execute.
